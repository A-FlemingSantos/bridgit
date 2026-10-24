// Colors are stored per folder under `${connectionId}:${ref}`. Before accounts could be added, the key
// was `${providerId}:${ref}`; those colors still belong to the provider's oldest connection.
export const colorKey = (connectionId, ref) => `${connectionId}:${ref}`

// `legacyProviderId` is the provider id only when `connectionId` is that provider's oldest connection,
// otherwise null (no fallback).
export function colorIdOf(colors, connectionId, ref, legacyProviderId = null) {
  const own = colors[colorKey(connectionId, ref)]
  if (own !== undefined) return own
  return legacyProviderId ? colors[colorKey(legacyProviderId, ref)] : undefined
}

const LEGACY_PROVIDERS = new Set(['onedrive', 'google-drive', 'dropbox'])

// Moves colors still kept under `${providerId}:${ref}` to the key of that provider's oldest connection, so
// later reads find them without waiting for the connections to load. `oldestOf(providerId)` returns that
// connection id, or null when the provider has none yet (its colors wait for it). Returns null when there is
// nothing to move.
export function migrateLegacyColors(colors, oldestOf) {
  let next = null
  for (const [key, id] of Object.entries(colors)) {
    const split = key.indexOf(':')
    const provider = split > 0 ? key.slice(0, split) : null
    if (!LEGACY_PROVIDERS.has(provider)) continue
    const connectionId = oldestOf(provider)
    if (!connectionId) continue
    next ??= { ...colors }
    const target = colorKey(connectionId, key.slice(split + 1))
    if (next[target] === undefined) next[target] = id
    delete next[key]
  }
  return next
}

// Returns the next colors map with `id` set for the folder (or cleared when `id` is the default).
// A legacy key of the oldest connection is dropped so the new key is the only one left.
export function withColor(colors, connectionId, ref, id, defaultId, legacyProviderId = null) {
  const next = { ...colors }
  if (legacyProviderId) delete next[colorKey(legacyProviderId, ref)]
  if (id === defaultId) delete next[colorKey(connectionId, ref)]
  else next[colorKey(connectionId, ref)] = id
  return next
}
