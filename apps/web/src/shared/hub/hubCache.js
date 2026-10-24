import { ApiClientError, isSessionFailure } from '@bridgit/shared-client'

export const FOLDER_STALE_MS = 30 * 1000
export const ITEM_STALE_MS = 60 * 1000
export const PROVIDERS_STALE_MS = 60 * 1000
export const RECENTS_STALE_MS = 30 * 1000
export const RECENTS_LIMIT = 12
export const SHORTCUTS_STALE_MS = 60 * 1000

// GET /api/providers answers one row per provider; each row lists its accounts oldest first. The hub works on
// accounts, so this is the flat list: provider order, then oldest connection first.
export function flattenConnections(providers) {
  return (providers ?? []).flatMap((row) => (Array.isArray(row?.connections) ? row.connections : []).map((connection) => ({
    ...connection,
    provider: connection.provider ?? row.id,
    providerName: connection.providerName ?? row.name,
  })))
}

export function isRootRef(ref) {
  return ref === null || ref === undefined || ref === ''
}

// Every cache is keyed by the account (connectionId), never by the provider: two accounts of the same
// provider hold unrelated items that may even share a ref.
export function folderCacheKey(connectionId, folderRef) {
  return `${connectionId}:${isRootRef(folderRef) ? 'root' : folderRef}`
}

export function itemCacheKey(connectionId, ref) {
  return `${connectionId}:${ref}`
}

export function itemIdentity(connectionId, ref) {
  return `${connectionId}:${ref}`
}

export function withUiKey(item, uiKey) {
  return {
    ...item,
    uiKey: uiKey ?? item.uiKey ?? itemCacheKey(item.connectionId, item.ref),
  }
}

export function isTempRef(ref) {
  return typeof ref === 'string' && ref.startsWith('temp-')
}

// `uiKey` lets a caller that already shows the item (a name field being typed) hand its key over,
// so the row is kept instead of remounted when the placeholder takes its place.
export function createTempItem(fields, uiKey = null) {
  const ref = `temp-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
  return withUiKey(
    {
      mimeType: null,
      extension: null,
      size: null,
      modifiedAt: new Date().toISOString(),
      pending: true,
      ...fields,
      ref,
    },
    uiKey ?? ref,
  )
}

export function cloneFolderEntry(entry) {
  if (!entry) return entry
  return {
    ...entry,
    items: Array.isArray(entry.items) ? entry.items.map((item) => ({ ...item })) : [],
  }
}

export function cloneListEntry(entry) {
  if (!entry) return entry
  return {
    ...entry,
    entries: Array.isArray(entry.entries) ? entry.entries.map((item) => ({ ...item })) : [],
  }
}

export function findCachedItem(folderCache, itemCache, connectionId, ref) {
  const direct = itemCache[itemCacheKey(connectionId, ref)]
  if (direct?.item) return direct.item

  for (const entry of Object.values(folderCache)) {
    const match = entry?.items?.find((item) => item.connectionId === connectionId && item.ref === ref)
    if (match) return match
  }

  return null
}

export function folderKeysContaining(folderCache, connectionId, ref) {
  return Object.entries(folderCache)
    .filter(([, entry]) =>
      entry?.items?.some((item) => item.connectionId === connectionId && item.ref === ref),
    )
    .map(([key]) => key)
}

export function dedupeItemsByRef(items) {
  const seen = new Set()
  const out = []
  for (const item of items ?? []) {
    const id = itemIdentity(item.connectionId, item.ref)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(item)
  }
  return out
}

function recentOpenedAt(entry) {
  const time = Date.parse(entry?.openedAt ?? '')
  return Number.isFinite(time) ? time : 0
}

export function placeRecent(entries, entry) {
  if (!entry?.ref) return Array.isArray(entries) ? entries.slice() : []
  const key = itemIdentity(entry.connectionId, entry.ref)
  const rest = (entries ?? []).filter(
    (candidate) => itemIdentity(candidate.connectionId, candidate.ref) !== key,
  )
  return [entry, ...rest].slice(0, RECENTS_LIMIT)
}

export function mergeRecentsLists(serverEntries, localEntries) {
  const merged = new Map()
  for (const entry of serverEntries ?? []) {
    if (!entry?.ref) continue
    merged.set(itemIdentity(entry.connectionId, entry.ref), entry)
  }
  for (const entry of localEntries ?? []) {
    if (!entry?.ref) continue
    const key = itemIdentity(entry.connectionId, entry.ref)
    const current = merged.get(key)
    if (!current || recentOpenedAt(entry) > recentOpenedAt(current)) {
      merged.set(key, entry)
    }
  }
  return [...merged.values()]
    .sort((a, b) => {
      const byTime = recentOpenedAt(b) - recentOpenedAt(a)
      if (byTime !== 0) return byTime
      return itemIdentity(a.connectionId, a.ref).localeCompare(itemIdentity(b.connectionId, b.ref))
    })
    .slice(0, RECENTS_LIMIT)
}

export function mergeFolderItems(previousItems, serverItems) {
  const pending = (previousItems ?? []).filter((item) => item.pending && isTempRef(item.ref))
  const serverIds = new Set((serverItems ?? []).map((item) => itemIdentity(item.connectionId, item.ref)))
  const keptPending = pending.filter((item) => !serverIds.has(itemIdentity(item.connectionId, item.ref)))
  // An item already on screen keeps its key. A created item carries the key of its optimistic
  // placeholder; giving it a new one would remount the row and replay its entry animation.
  const shownKeys = new Map((previousItems ?? []).filter((item) => item.uiKey)
    .map((item) => [itemIdentity(item.connectionId, item.ref), item.uiKey]))
  const merged = (serverItems ?? []).map((item) => {
    const shown = shownKeys.get(itemIdentity(item.connectionId, item.ref))
    return shown && shown !== item.uiKey ? { ...item, uiKey: shown } : item
  })
  return [...keptPending, ...merged]
}

export function isStaleEntry(entry, staleMs, now = Date.now()) {
  if (!entry?.fetchedAt) return true
  return now - entry.fetchedAt > staleMs
}

export function isApiClientError(error) {
  if (!error) return false
  if (error instanceof ApiClientError) return true
  return error?.name === 'ApiClientError' && typeof error?.status === 'number'
}

export function isExplicitRejection(error) {
  if (isApiClientError(error)) {
    // A full provider account (507) is a definite refusal, not an unknown outcome.
    return (error.status >= 400 && error.status < 500) || error.code === 'PROVEDOR_SEM_ESPACO'
  }
  return false
}

// The provider says the item no longer exists: a definite answer, unlike a network or server failure,
// so the item can leave the screen at once.
export function isGoneError(error) {
  return isApiClientError(error) && error.code === 'ITEM_NAO_ENCONTRADO'
}

export function isAmbiguousError(error) {
  return !isExplicitRejection(error)
}

export function isHubSessionFailure(error) {
  return isApiClientError(error) && isSessionFailure(error)
}
