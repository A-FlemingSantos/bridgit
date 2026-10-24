// The account a route points at. Routes carry { connectionId, providerId }; one that names only the
// provider (an older or restored route) means that provider's oldest account, which is the first of
// the flattened connections list for it.
export function resolveConnectionId(connections, { connectionId = null, providerId = null } = {}) {
  if (connectionId) return connectionId
  if (!providerId) return null
  return (connections ?? []).find((connection) => connection.providerId === providerId)?.connectionId ?? null
}
