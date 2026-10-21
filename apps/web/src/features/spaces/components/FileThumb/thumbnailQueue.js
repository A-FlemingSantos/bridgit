const MAX_IN_FLIGHT = 4

let active = 0
const waiters = []
const cache = new Map()

function acquire() {
  if (active < MAX_IN_FLIGHT) {
    active += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waiters.push(resolve)
  })
}

function release() {
  active -= 1
  const next = waiters.shift()
  if (next) {
    active += 1
    next()
  }
}

export function clearThumbnailCache() {
  for (const entry of cache.values()) {
    if (entry.url) URL.revokeObjectURL(entry.url)
  }
  cache.clear()
  active = 0
  waiters.length = 0
}

export async function loadThumbnail(key, fetchBlob) {
  const cached = cache.get(key)
  if (cached?.status === 'ok') return cached.url
  if (cached?.status === 'miss') return null

  await acquire()
  try {
    const again = cache.get(key)
    if (again?.status === 'ok') return again.url
    if (again?.status === 'miss') return null
    try {
      const blob = await fetchBlob()
      if (!blob || blob.size === 0) {
        cache.set(key, { status: 'miss' })
        return null
      }
      const url = URL.createObjectURL(blob)
      const previous = cache.get(key)
      if (previous?.url) URL.revokeObjectURL(previous.url)
      cache.set(key, { status: 'ok', url })
      return url
    } catch (error) {
      if (error?.status === 404) cache.set(key, { status: 'miss' })
      return null
    }
  } finally {
    release()
  }
}
