const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// The connection still exists, but the provider rejected its refresh token (e.g. it expired).
// Takes a connection or a provider row (which also says `connected`).
export function needsReconnect(connection) {
  return connection?.connected !== false && connection?.lastError === 'RECONEXAO_NECESSARIA'
}

// Warning for a folder listing whose catalog is out of date, or null when there is nothing to say.
// `reconnectShown` says the screen already tells the user to reconnect, so that case is not repeated.
export function staleCatalogNotice(catalog, { reconnectShown = false, now = Date.now() } = {}) {
  if (catalog?.freshness !== 'stale') return null
  if (reconnectShown && catalog.staleReason === 'RECONEXAO_NECESSARIA') return null

  const since = catalog.syncedAt ? formatWhen(catalog.syncedAt, now) : ''
  return since
    ? `Pode estar desatualizado. Última sincronização: ${since.toLowerCase()}.`
    : 'Pode estar desatualizado.'
}

// "Relatório.final.docx" -> { stem: "Relatório.final", extension: ".docx" }. Dotfiles and names
// ending in a dot have no extension.
export function splitExtension(name) {
  const value = String(name ?? '')
  const dot = value.lastIndexOf('.')
  if (dot <= 0 || dot === value.length - 1) return { stem: value, extension: '' }
  return { stem: value.slice(0, dot), extension: value.slice(dot) }
}

// Renaming edits only the stem; the extension stays unless the user typed it again.
export function withExtension(stem, extension) {
  if (!extension || stem.toLowerCase().endsWith(extension.toLowerCase())) return stem
  return `${stem}${extension}`
}

export function kindLabel(item) {
  if (item.kind === 'folder') return 'Pasta'
  const extension = String(item.extension ?? '').replace(/^\./, '')
  return extension ? extension.toUpperCase() : 'Arquivo'
}

// `connectionId` identifies the account the item lives in; `providerId` is only for display.
export function toEntry(item, connectionId = item.connectionId) {
  return {
    ref: item.ref,
    name: item.name,
    kind: kindLabel(item),
    connectionId,
    providerId: item.provider ?? null,
    isFolder: item.kind === 'folder',
    mimeType: item.mimeType ?? null,
    // Lower case, no dot ("pdf"): what the thumbnail and file-type icon rules read.
    extension: String(item.extension || splitExtension(item.name).extension).replace(/^\./, '').toLowerCase(),
    size: item.size ?? null,
    version: item.remoteVersion ?? null,
    // Keys a cached thumbnail; native Google files have no content revision, only their version.
    revision: item.contentRevision ?? item.remoteVersion ?? null,
    modifiedAt: item.modifiedAt ?? null,
    pinned: Boolean(item.pinnedAt),
    when: item.openedAt ? formatWhen(item.openedAt) : null,
    modified: formatItemDate(item.modifiedAt),
  }
}

// Caption under a file or folder, as on the web: weekday and time within the last week, day and
// month this year, the full date before that.
export function formatItemDate(value, now = new Date()) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const age = now.getTime() - date.getTime()
  if (age >= 0 && age < 6 * DAY) {
    const weekday = date.toLocaleDateString('pt-BR', { weekday: 'long' })
    const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return `${weekday} às ${time}`
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
  }
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatWhen(value, now = Date.now()) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return ''
  const elapsed = Math.max(0, now - time)

  if (elapsed < HOUR) return `Há ${Math.max(1, Math.round(elapsed / MINUTE))} min`
  if (elapsed < DAY) return `Há ${Math.round(elapsed / HOUR)} h`
  if (elapsed < 2 * DAY) return 'Ontem'
  if (elapsed < 7 * DAY) return `Há ${Math.floor(elapsed / DAY)} dias`
  return `Há ${Math.floor(elapsed / (7 * DAY))} sem`
}
