import { getContent, putContent, withContentLock } from '../storage/index.js'

export const MAX_CACHED_READ_BYTES = 50 * 1024 * 1024
export const MAX_PREFETCH_BYTES = 5 * 1024 * 1024
const PREFETCH_WINDOW_MS = 60 * 1000
const PREFETCH_WINDOW_BYTES = 10 * 1024 * 1024

const prefetches = new Map()
const prefetchWindows = new Map()

function isStrongRevision(revision) {
  return typeof revision === 'string' && revision.length > 0 && !revision.startsWith('W/')
}

function hasDescriptorIdentity(descriptor) {
  return Boolean(
      descriptor?.userId &&
      descriptor?.connectionId &&
      descriptor?.generation !== null &&
      descriptor?.generation !== undefined &&
      descriptor?.ref &&
      isStrongRevision(descriptor?.revision) &&
      descriptor?.authorizedUntil &&
      descriptor?.size !== null &&
      descriptor?.size !== undefined &&
      Number.isInteger(Number(descriptor.size)),
  )
}

function isAuthorized(descriptor) {
  const authorizedUntil = Date.parse(descriptor?.authorizedUntil)
  return Number.isFinite(authorizedUntil) && authorizedUntil > Date.now()
}

function canReadMode(mode) {
  return mode === 'pdf' || mode === 'image' || mode === 'text'
}

export function isCacheableContent(descriptor, maxBytes = MAX_CACHED_READ_BYTES) {
  const size = Number(descriptor?.size)
  return (
    hasDescriptorIdentity(descriptor) &&
    isAuthorized(descriptor) &&
    canReadMode(descriptor.mode) &&
    Number.isInteger(size) &&
    size >= 0 &&
    size <= maxBytes
  )
}

function supportsProxyFallback(descriptor) {
  return descriptor?.providerId === 'onedrive' && Boolean(descriptor?.proxyUrl)
}

async function responseBlob(url, signal) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error('Não foi possível carregar o arquivo.')
  }
  return response.blob()
}

export async function downloadContent(descriptor, { signal } = {}) {
  if (!descriptor?.url) throw new Error('Não foi possível carregar o arquivo.')

  try {
    return await responseBlob(descriptor.url, signal)
  } catch (error) {
    if (signal?.aborted || !supportsProxyFallback(descriptor)) throw error
    return responseBlob(descriptor.proxyUrl, signal)
  }
}

export async function verifyContentRevision(descriptor) {
  if (typeof descriptor?.verifyRevision !== 'function') return false
  try {
    return (await descriptor.verifyRevision(descriptor)) === true
  } catch {
    return false
  }
}

export async function loadContent(descriptor, { signal } = {}) {
  if (!isCacheableContent(descriptor)) return null

  const cached = await getContent(descriptor)
  if (cached) return cached

  return withContentLock(
    descriptor,
    async () => {
      const shared = await getContent(descriptor)
      if (shared) return shared

      const blob = await downloadContent(descriptor, { signal })
      if (blob.size > MAX_CACHED_READ_BYTES || blob.size !== Number(descriptor.size)) return blob
      if (await verifyContentRevision(descriptor)) {
        await putContent(descriptor, blob)
      }
      return blob
    },
    { signal },
  )
}

export async function getCachedContent(descriptor) {
  if (!isCacheableContent(descriptor)) return null
  return getContent(descriptor)
}

function connectionKey(descriptor) {
  return `${descriptor.userId}:${descriptor.connectionId}:${descriptor.generation}`
}

function reservePrefetch(descriptor) {
  const key = connectionKey(descriptor)
  const now = Date.now()
  const previous = prefetchWindows.get(key)
  const window = !previous || now - previous.startedAt >= PREFETCH_WINDOW_MS
    ? { startedAt: now, bytes: 0 }
    : previous

  const size = Number(descriptor.size)
  if (window.bytes + size > PREFETCH_WINDOW_BYTES) return false
  window.bytes += size
  prefetchWindows.set(key, window)
  return true
}

export async function prefetchContent(descriptor) {
  if (globalThis.navigator?.connection?.saveData) return false
  if (!isCacheableContent(descriptor, MAX_PREFETCH_BYTES)) return false

  const key = connectionKey(descriptor)
  if (prefetches.has(key) || !reservePrefetch(descriptor)) return false

  const task = loadContent(descriptor)
    .then((blob) => Boolean(blob))
    .catch(() => false)
    .finally(() => prefetches.delete(key))
  prefetches.set(key, task)
  return task
}
