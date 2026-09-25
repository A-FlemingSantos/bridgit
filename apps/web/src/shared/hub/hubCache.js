export function folderCacheKey(providerId, folderRef) {
  return `${providerId}:${folderRef ?? 'root'}`
}

export function itemCacheKey(providerId, ref) {
  return `${providerId}:${ref}`
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
