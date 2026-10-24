// The account an entry of the hub belongs to is a connection; its provider is only how it is shown.
export function accountLabel(account) {
  return account?.email ?? account?.name ?? ''
}

// How many accounts of the connection's provider are connected.
export function providerAccountCount(connection, connections = []) {
  if (!connection) return 0
  return connections.filter((item) => item.provider === connection.provider).length
}

// "OneDrive", or "OneDrive · ana@mail.com" when that provider has more than one account and the name alone
// would not tell them apart.
export function connectionLabel(connection, connections = []) {
  if (!connection) return ''
  const name = connection.providerName ?? ''
  const account = accountLabel(connection.account)
  return providerAccountCount(connection, connections) > 1 && account ? `${name} · ${account}` : name
}

// The oldest account of a provider: where the legacy provider-keyed data (folder colors, old links) belongs.
export function oldestConnectionOf(provider, connections = []) {
  return connections.find((connection) => connection.provider === provider) ?? null
}
