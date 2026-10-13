const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// The connection row still exists, but the provider rejected its refresh token (e.g. it expired).
export function needsReconnect(provider) {
  return Boolean(provider?.connected) && provider?.lastError === 'RECONEXAO_NECESSARIA'
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

export function toEntry(item, providerId = item.provider) {
  return {
    ref: item.ref,
    name: item.name,
    kind: kindLabel(item),
    providerId,
    isFolder: item.kind === 'folder',
    mimeType: item.mimeType ?? null,
    size: item.size ?? null,
    version: item.remoteVersion ?? null,
    pinned: Boolean(item.pinnedAt),
    when: item.openedAt ? formatWhen(item.openedAt) : null,
  }
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
