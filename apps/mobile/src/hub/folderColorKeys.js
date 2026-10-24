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

// Returns the next colors map with `id` set for the folder (or cleared when `id` is the default).
// A legacy key of the oldest connection is dropped so the new key is the only one left.
export function withColor(colors, connectionId, ref, id, defaultId, legacyProviderId = null) {
  const next = { ...colors }
  if (legacyProviderId) delete next[colorKey(legacyProviderId, ref)]
  if (id === defaultId) delete next[colorKey(connectionId, ref)]
  else next[colorKey(connectionId, ref)] = id
  return next
}
