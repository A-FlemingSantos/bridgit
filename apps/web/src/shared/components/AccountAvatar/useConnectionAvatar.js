import { useEffect, useRef, useState } from 'react'
import { useHubActions } from '../../hub/index.js'

// `${connectionId}:${generation}` -> object URL of a loaded photo.
// A new generation means the provider photo may have changed, so it is a new key.
const MAX_ENTRIES = 100
const cache = new Map()
const inflight = new Map()

function revoke(url) {
  if (url) URL.revokeObjectURL(url)
}

function evict(key) {
  revoke(cache.get(key))
  cache.delete(key)
}

function remember(connectionId, key, url) {
  // Older generations of the same account are dead weight.
  const prefix = `${connectionId}:`
  for (const stored of [...cache.keys()]) {
    if (stored !== key && stored.startsWith(prefix)) evict(stored)
  }
  cache.set(key, url)
  while (cache.size > MAX_ENTRIES) evict(cache.keys().next().value)
}

function loadAvatar(connectionId, generation, getConnectionAvatar) {
  const key = `${connectionId}:${generation}`
  if (cache.has(key)) return Promise.resolve(cache.get(key))
  const pending = inflight.get(key)
  if (pending) return pending

  // A failed request is not remembered: the API answers 404 both for "no photo" and for a
  // transient failure, and the browser's HTTP cache already holds the cacheable "no photo".
  const request = Promise.resolve()
    .then(() => getConnectionAvatar(connectionId, generation))
    .then((blob) => {
      const url = blob ? URL.createObjectURL(blob) : null
      remember(connectionId, key, url)
      return url
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, request)
  return request
}

// Test helper: drops every cached photo and revokes its object URL.
export function clearConnectionAvatarCache() {
  for (const key of [...cache.keys()]) evict(key)
  inflight.clear()
}

// The photo of a connected account as an object URL, or null while loading / without a photo.
export function useConnectionAvatar(connection) {
  const actions = useHubActions()
  const actionsRef = useRef(actions)
  actionsRef.current = actions
  const connectionId = connection?.connectionId ?? null
  const generation = connection?.generation ?? 0
  const key = connectionId ? `${connectionId}:${generation}` : null
  const [src, setSrc] = useState(() => (key && cache.has(key) ? cache.get(key) : null))

  useEffect(() => {
    if (!key) {
      setSrc(null)
      return undefined
    }
    if (cache.has(key)) {
      setSrc(cache.get(key))
      return undefined
    }
    setSrc(null)
    let active = true
    loadAvatar(connectionId, generation, (id, gen) => actionsRef.current.getConnectionAvatar(id, gen)).then((url) => {
      if (active) setSrc(url)
    })
    return () => {
      active = false
    }
  }, [key, connectionId, generation])

  return src
}
