import { ApiClientError } from '@bridgit/shared-client'

export const FOLDER_STALE_MS = 30 * 1000
export const ITEM_STALE_MS = 60 * 1000
export const PROVIDERS_STALE_MS = 60 * 1000
export const RECENTS_STALE_MS = 30 * 1000
export const SHORTCUTS_STALE_MS = 60 * 1000

export const HUB_SESSION_FAILURE_CODES = ['TOKEN_INVALIDO', 'SESSAO_INVALIDA', 'AUTENTICACAO_OBRIGATORIA']

export function isRootRef(ref) {
  return ref === null || ref === undefined || ref === ''
}

export function folderCacheKey(providerId, folderRef) {
  return `${providerId}:${isRootRef(folderRef) ? 'root' : folderRef}`
}

export function itemCacheKey(providerId, ref) {
  return `${providerId}:${ref}`
}

export function itemIdentity(provider, ref) {
  return `${provider}:${ref}`
}

export function withUiKey(item, uiKey) {
  return {
    ...item,
    uiKey: uiKey ?? item.uiKey ?? itemCacheKey(item.provider, item.ref),
  }
}

export function isTempRef(ref) {
  return typeof ref === 'string' && ref.startsWith('temp-')
}

export function createTempItem(fields) {
  const uiKey = `temp-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
  return withUiKey(
    {
      mimeType: null,
      extension: null,
      size: null,
      modifiedAt: new Date().toISOString(),
      pending: true,
      ...fields,
      ref: uiKey,
    },
    uiKey,
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

export function findCachedItem(folderCache, itemCache, providerId, ref) {
  const direct = itemCache[itemCacheKey(providerId, ref)]
  if (direct?.item) return direct.item

  for (const entry of Object.values(folderCache)) {
    const match = entry?.items?.find((item) => item.provider === providerId && item.ref === ref)
    if (match) return match
  }

  return null
}

export function folderKeysContaining(folderCache, providerId, ref) {
  return Object.entries(folderCache)
    .filter(([, entry]) =>
      entry?.items?.some((item) => item.provider === providerId && item.ref === ref),
    )
    .map(([key]) => key)
}

export function dedupeItemsByRef(items) {
  const seen = new Set()
  const out = []
  for (const item of items ?? []) {
    const id = itemIdentity(item.provider, item.ref)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(item)
  }
  return out
}

export function mergeFolderItems(previousItems, serverItems) {
  const pending = (previousItems ?? []).filter((item) => item.pending && isTempRef(item.ref))
  const serverIds = new Set((serverItems ?? []).map((item) => itemIdentity(item.provider, item.ref)))
  const keptPending = pending.filter((item) => !serverIds.has(itemIdentity(item.provider, item.ref)))
  return [...keptPending, ...(serverItems ?? [])]
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
    return error.status >= 400 && error.status < 500
  }
  return false
}

export function isAmbiguousError(error) {
  return !isExplicitRejection(error)
}

export function isHubSessionFailure(error) {
  if (!isApiClientError(error)) return false
  if (error.status !== 401) return false
  const code = error.code ?? 'ERRO_API'
  if (HUB_SESSION_FAILURE_CODES.includes(code)) return true
  return code === 'ERRO_API'
}
