const MAX_IN_FLIGHT = 4
const MISS_TTL_MS = 60 * 60 * 1000

let active = 0
let waiters = []
let epoch = 0
const cache = new Map()

function acquire() {
  const slot = epoch
  if (active < MAX_IN_FLIGHT) {
    active += 1
    return Promise.resolve(slot)
  }
  return new Promise((resolve) => {
    waiters.push(() => resolve(slot))
  })
}

function release(slot) {
  if (slot !== epoch) return
  active -= 1
  const next = waiters.shift()
  if (next) {
    active += 1
    next()
  }
}

function cachedUrl(key) {
  const entry = cache.get(key)
  if (entry?.status === 'ok') return entry.url
  if (entry?.status === 'miss') {
    if (Date.now() - entry.at < MISS_TTL_MS) return null
    cache.delete(key)
  }
  return undefined
}

function remember(key, blob) {
  if (!blob || blob.size === 0) {
    cache.set(key, { status: 'miss', at: Date.now() })
    return null
  }
  // Another tile of the same file may be showing this URL already; it is never revoked under it.
  const previous = cache.get(key)
  if (previous?.status === 'ok') return previous.url
  const url = URL.createObjectURL(blob)
  cache.set(key, { status: 'ok', url })
  return url
}

export function clearThumbnailCache() {
  for (const entry of cache.values()) {
    if (entry.url) URL.revokeObjectURL(entry.url)
  }
  cache.clear()
  // Requests still running belong to the old epoch and give back no slot of the new one.
  epoch += 1
  active = 0
  waiters = []
}

/**
 * Resolves the object URL of a preview, or null without one. What the browser kept (`readStored`)
 * is read right away; only the trip to the cloud (`fetchBlob`) waits for a free slot. `transform` reshapes
 * the bytes for display only; what is kept stays the cloud's own image.
 */
export async function loadThumbnail(key, fetchBlob, readStored, transform) {
  const known = cachedUrl(key)
  if (known !== undefined) return known

  const shape = async (blob) => (blob && typeof transform === 'function' ? transform(blob).catch(() => blob) : blob)
  const stored = typeof readStored === 'function' ? await readStored().catch(() => null) : null
  if (stored?.missing) return remember(key, null)
  if (stored?.blob) return remember(key, await shape(stored.blob))

  const slot = await acquire()
  try {
    const again = cachedUrl(key)
    if (again !== undefined) return again
    try {
      return remember(key, await shape(await fetchBlob()))
    } catch (error) {
      if (error?.status === 404) remember(key, null)
      return null
    }
  } finally {
    release(slot)
  }
}
