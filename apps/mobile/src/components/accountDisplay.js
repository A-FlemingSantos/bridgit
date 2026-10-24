// Text shown for a connected account (a connection row from useConnections).

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// Up to two letters for the avatar tile: the first letters of the first two words of the name,
// else the first letter of the email, else the provider's.
export function accountInitials({ name, email, providerName } = {}) {
  const words = clean(name).split(/\s+/).filter(Boolean)
  if (words.length > 0) {
    return words.slice(0, 2).map((word) => Array.from(word)[0]).join('').toUpperCase()
  }
  const fallback = clean(email) || clean(providerName)
  return fallback ? Array.from(fallback)[0].toUpperCase() : '?'
}

// Title and subtitle of an account row: the name over the email; without a name the email
// (or the provider) is the title and the provider sits underneath.
export function accountLabels(connection) {
  const name = clean(connection?.account?.name)
  const email = clean(connection?.account?.email)
  const providerName = clean(connection?.providerName)
  const title = name || email || providerName || 'Conta'
  const subtitle = email && email !== title ? email : providerName && providerName !== title ? providerName : ''
  return { title, subtitle }
}

// Same account as one line, for pickers that list accounts of several providers.
export function accountLine(connection) {
  const email = clean(connection?.account?.email)
  return email || clean(connection?.account?.name) || 'Conectado'
}
