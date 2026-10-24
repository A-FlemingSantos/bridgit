const timeOf = (connection) => {
  const time = Date.parse(connection.connectedAt ?? connection.createdAt ?? '')
  return Number.isFinite(time) ? time : Infinity
}

// Flattens the provider rows into one list of connected accounts: provider order, then oldest first.
// `providerId` is the provider the account belongs to (display only); `connectionId` is its identity.
// A provider row without accounts (not connected) contributes nothing.
export function flattenConnections(providers) {
  return (providers ?? []).flatMap((provider) => (
    (provider.connections ?? [])
      .map((connection, index) => ({ connection, index }))
      .sort((a, b) => timeOf(a.connection) - timeOf(b.connection) || a.index - b.index)
      .map(({ connection }) => ({
        ...connection,
        providerId: connection.provider ?? provider.id,
        providerName: connection.providerName ?? provider.name,
      }))
  ))
}

const sameId = (a, b) => a != null && b != null && String(a).toLowerCase() === String(b).toLowerCase()

export function findConnection(connections, connectionId) {
  return (connections ?? []).find((connection) => sameId(connection.connectionId, connectionId)) ?? null
}

// The first (oldest) account of a provider: the one old per-provider data belongs to.
export function oldestConnectionOf(connections, providerId) {
  return (connections ?? []).find((connection) => connection.providerId === providerId) ?? null
}
