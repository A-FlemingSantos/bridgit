const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

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
