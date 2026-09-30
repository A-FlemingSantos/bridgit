import { readRecord, requestAsPromise, transactionDone, writeRecords, openHubDatabase } from './idb.js'

const FORBIDDEN_FIELD = /(?:token|authorization|password|secret|url)/i

export function userEpochKey(userId) {
  return `user:${userId}`
}

export function connectionEpochKey(userId, connectionId, generation = null) {
  return `connection:${userId}:${connectionId}:${generation ?? '*'}`
}

function providerId(status) {
  return status?.provider ?? status?.id ?? null
}

function statusConnectionId(status) {
  return status?.connectionId ?? status?.connection?.id ?? null
}

function statusGeneration(status) {
  return status?.generation ?? status?.connectionGeneration ?? status?.connection?.generation ?? null
}

function scopeForStatus(status) {
  const provider = providerId(status)
  const connection = statusConnectionId(status)
  const version = statusGeneration(status)
  if (!provider || !connection || version === null || version === undefined || status?.connected === false) return null
  return { provider, connectionId: String(connection), generation: String(version) }
}

function safeCopy(value) {
  if (Array.isArray(value)) return value.map(safeCopy)
  if (!value || typeof value !== 'object') return value
  const out = {}
  Object.entries(value).forEach(([key, child]) => {
    if (FORBIDDEN_FIELD.test(key)) return
    if (typeof child === 'string' && /^(?:https?|blob):/i.test(child.trim())) return
    out[key] = safeCopy(child)
  })
  return out
}

function scopesForProviders(providersState) {
  const scopes = new Map()
  for (const status of providersState?.providers ?? []) {
    const scope = scopeForStatus(status)
    if (scope) scopes.set(scope.provider, scope)
  }
  return scopes
}

function providerFromKey(key) {
  if (typeof key !== 'string') return null
  const separator = key.indexOf(':')
  return separator > 0 ? key.slice(0, separator) : null
}

function folderRefFromKey(key) {
  if (typeof key !== 'string') return null
  const separator = key.indexOf(':')
  if (separator < 0) return null
  const ref = key.slice(separator + 1)
  return ref === 'root' ? null : ref
}

function sameScope(value, scope) {
  const storedConnection = value?.catalog?.connectionId ?? value?.connectionId ?? value?.connection?.id
  const storedGeneration = value?.catalog?.generation ?? value?.connectionGeneration ?? value?.connection?.generation
  return (storedConnection === undefined || String(storedConnection) === scope.connectionId) &&
    (storedGeneration === undefined || String(storedGeneration) === scope.generation)
}

function catalogScope(value, scope) {
  return {
    ...safeCopy(value?.catalog ?? {}),
    connectionId: scope.connectionId,
    generation: scope.generation,
  }
}

function scopedItem(item, scope) {
  if (!item?.ref || !sameScope(item, scope)) return null
  return { ...safeCopy(item), catalog: catalogScope(item, scope) }
}

function dedupeScopedItems(items, scope, provider) {
  const seen = new Set()
  const result = []
  for (const item of items ?? []) {
    if (item?.provider !== provider) continue
    const normalized = scopedItem(item, scope)
    if (!normalized) continue
    const identity = `${scope.connectionId}:${scope.generation}:${normalized.ref}`
    if (seen.has(identity)) continue
    seen.add(identity)
    result.push(normalized)
  }
  return result
}

function normalizeFolderCache(cache, scopes) {
  const output = {}
  for (const [legacyKey, original] of Object.entries(cache ?? {})) {
    const provider = original?.provider ?? original?.providerId ?? providerFromKey(legacyKey)
    const scope = scopes.get(provider)
    if (!scope || !sameScope(original, scope)) continue
    const ref = original?.folderRef ?? original?.parentRef ?? folderRefFromKey(legacyKey)
    const key = `${provider}:${ref == null || ref === '' ? 'root' : ref}`
    output[key] = {
      ...safeCopy(original),
      status: original?.loaded ? 'ready' : 'idle',
      revalidating: false,
      isFetchingNextPage: false,
      error: null,
      fetchedAt: original?.revalidating || original?.isFetchingNextPage || original?.status === 'loading' ? 0 : original?.fetchedAt ?? 0,
      catalog: catalogScope(original, scope),
      items: dedupeScopedItems(original?.items, scope, provider),
    }
  }
  return output
}

function normalizeItemCache(cache, scopes) {
  const output = {}
  for (const [legacyKey, original] of Object.entries(cache ?? {})) {
    const item = original?.item
    const provider = item?.provider ?? original?.provider ?? providerFromKey(legacyKey)
    const scope = scopes.get(provider)
    if (!scope || !sameScope(original, scope)) continue
    const normalized = scopedItem(item, scope)
    if (!normalized) continue
    output[`${provider}:${normalized.ref}`] = {
      ...safeCopy(original),
      status: 'ready',
      revalidating: false,
      error: null,
      fetchedAt: original?.revalidating || original?.status === 'loading' ? 0 : original?.fetchedAt ?? 0,
      catalog: catalogScope(original, scope),
      item: normalized,
    }
  }
  return output
}

function normalizeListState(state, scopes) {
  const entries = []
  const seen = new Set()
  for (const entry of state?.entries ?? []) {
    const scope = scopes.get(entry?.provider)
    const normalized = scope && scopedItem(entry, scope)
    if (!normalized) continue
    const identity = `${scope.connectionId}:${scope.generation}:${normalized.ref}`
    if (seen.has(identity)) continue
    seen.add(identity)
    entries.push(normalized)
  }
  return { ...safeCopy(state ?? {}), entries,
    status: state?.status === 'ready' || entries.length ? 'ready' : 'idle',
    fetchedAt: state?.status === 'loading' || state?.status === 'error' ? 0 : state?.fetchedAt ?? 0,
    error: null,
  }
}

function entityKey(item) {
  const scope = item?.catalog
  if (!scope?.connectionId || scope?.generation === undefined || !item?.ref) return null
  return `${scope.connectionId}:${scope.generation}:${item.ref}`
}

function addEntity(entities, item) {
  const key = entityKey(item)
  if (!key) return null
  const existing = entities[key]
  entities[key] = existing
    ? { ...existing, ...safeCopy(item), catalog: { ...existing.catalog, ...safeCopy(item.catalog) } }
    : safeCopy(item)
  return key
}

export function compactCatalogSnapshot(snapshot) {
  const normalized = normalizeCatalogSnapshot(snapshot)
  if (!normalized) return null
  const entities = {}
  const folderQueries = {}
  Object.entries(normalized.folderCache).forEach(([key, entry]) => {
    const { items, ...query } = entry
    folderQueries[key] = {
      ...query,
      itemRefs: (items ?? []).map((item) => addEntity(entities, item)).filter(Boolean),
    }
  })
  const itemQueries = {}
  Object.entries(normalized.itemCache).forEach(([key, entry]) => {
    const { item, ...query } = entry
    const itemRef = addEntity(entities, item)
    if (itemRef) itemQueries[key] = { ...query, itemRef }
  })
  const compactList = (state) => {
    const { entries, ...list } = state
    return { ...list, entryRefs: (entries ?? []).map((item) => addEntity(entities, item)).filter(Boolean) }
  }
  return {
    format: 2,
    providersState: normalized.providersState,
    entities,
    folderQueries,
    itemQueries,
    recentsState: compactList(normalized.recentsState),
    shortcutsState: compactList(normalized.shortcutsState),
  }
}

export function expandCatalogSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  if (snapshot.format !== 2) return normalizeCatalogSnapshot(snapshot)
  const entity = (key) => key && snapshot.entities?.[key] ? safeCopy(snapshot.entities[key]) : null
  const folderCache = Object.fromEntries(Object.entries(snapshot.folderQueries ?? {}).map(([key, query]) => {
    const { itemRefs, ...entry } = query
    return [key, { ...safeCopy(entry), items: (itemRefs ?? []).map(entity).filter(Boolean) }]
  }))
  const itemCache = Object.fromEntries(Object.entries(snapshot.itemQueries ?? {}).map(([key, query]) => {
    const { itemRef, ...entry } = query
    const item = entity(itemRef)
    return item ? [key, { ...safeCopy(entry), item }] : null
  }).filter(Boolean))
  const expandList = (state) => {
    const { entryRefs, ...list } = state ?? {}
    return { ...safeCopy(list), entries: (entryRefs ?? []).map(entity).filter(Boolean) }
  }
  return normalizeCatalogSnapshot({
    providersState: snapshot.providersState,
    folderCache,
    itemCache,
    recentsState: expandList(snapshot.recentsState),
    shortcutsState: expandList(snapshot.shortcutsState),
  })
}

export function normalizeCatalogSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null
  const providersState = safeCopy(snapshot.providersState ?? {})
  providersState.status = providersState.status === 'ready' || providersState.providers?.length ? 'ready' : 'idle'
  providersState.error = null
  const scopes = scopesForProviders(providersState)
  return {
    providersState,
    folderCache: normalizeFolderCache(snapshot.folderCache, scopes),
    itemCache: normalizeItemCache(snapshot.itemCache, scopes),
    recentsState: normalizeListState(snapshot.recentsState, scopes),
    shortcutsState: normalizeListState(snapshot.shortcutsState, scopes),
  }
}

function epochKeys(userId, scopes) {
  const keys = new Set([userEpochKey(userId)])
  for (const scope of scopes) {
    keys.add(connectionEpochKey(userId, scope.connectionId))
    keys.add(connectionEpochKey(userId, scope.connectionId, scope.generation))
  }
  return [...keys]
}

async function epochsFor(userId, scopes) {
  const keys = epochKeys(userId, scopes)
  const records = await Promise.all(keys.map((key) => readRecord('epochs', key)))
  return new Map(keys.map((key, index) => [key, records[index]?.value ?? 0]))
}

function scopeEpochs(userId, snapshot, values) {
  const scopes = [...scopesForProviders(snapshot.providersState).values()]
  return scopes.map((scope) => ({
    connectionId: scope.connectionId,
    generation: scope.generation,
    connectionEpoch: values.get(connectionEpochKey(userId, scope.connectionId)) ?? 0,
    generationEpoch: values.get(connectionEpochKey(userId, scope.connectionId, scope.generation)) ?? 0,
  }))
}

async function catalogEpochsMatch(record) {
  const currentUserEpoch = (await readRecord('epochs', userEpochKey(record.userId)))?.value ?? 0
  if (currentUserEpoch !== (record.userEpoch ?? 0)) return false
  for (const scope of record.scopes ?? []) {
    const connectionEpoch = (await readRecord('epochs', connectionEpochKey(record.userId, scope.connectionId)))?.value ?? 0
    const generationEpoch = (await readRecord('epochs', connectionEpochKey(record.userId, scope.connectionId, scope.generation)))?.value ?? 0
    if (connectionEpoch !== (scope.connectionEpoch ?? 0) || generationEpoch !== (scope.generationEpoch ?? 0)) return false
  }
  return true
}

export async function loadCatalog(userId) {
  if (!userId) return null
  const record = await readRecord('catalog', String(userId))
  if (!record || !(await catalogEpochsMatch(record))) return null
  return expandCatalogSnapshot(record.snapshot)
}

export async function saveCatalog(userId, snapshot) {
  if (!userId) return
  const compact = compactCatalogSnapshot(snapshot)
  if (!compact) return
  const scopes = [...scopesForProviders(compact.providersState).values()]
  const initialEpochs = await epochsFor(String(userId), scopes)
  const record = {
    userId: String(userId),
    snapshot: compact,
    userEpoch: initialEpochs.get(userEpochKey(String(userId))) ?? 0,
    scopes: scopeEpochs(String(userId), compact, initialEpochs),
    savedAt: Date.now(),
  }
  const keys = epochKeys(String(userId), scopes)
  await writeRecords(['catalog', 'epochs'], async (transaction) => {
    const epochStore = transaction.objectStore('epochs')
    const current = await Promise.all(keys.map((key) => requestAsPromise(epochStore.get(key))))
    if (current.some((value, index) => (value?.value ?? 0) !== initialEpochs.get(keys[index]))) return false
    transaction.objectStore('catalog').put(record)
    return true
  })
}

async function incrementEpoch(transaction, key) {
  const store = transaction.objectStore('epochs')
  const current = await requestAsPromise(store.get(key))
  store.put({ key, value: (current?.value ?? 0) + 1 })
}

function matchesConnection(record, userId, connectionId, generation) {
  return record.userId === String(userId) && record.connectionId === String(connectionId) &&
    (generation === undefined || generation === null || record.generation === String(generation))
}

async function deleteMatchingContent(transaction, predicate) {
  const store = transaction.objectStore('content')
  const records = await requestAsPromise(store.getAll())
  records.filter(predicate).forEach((record) => store.delete(record.key))
  return records.filter(predicate)
}

export async function clearUserStorage(userId) {
  if (!userId) return
  const db = await openHubDatabase()
  if (!db) return
  let removed = []
  try {
    const transaction = db.transaction(['catalog', 'content', 'epochs'], 'readwrite')
    await incrementEpoch(transaction, userEpochKey(String(userId)))
    transaction.objectStore('catalog').delete(String(userId))
    removed = await deleteMatchingContent(transaction, (record) => record.userId === String(userId))
    await transactionDone(transaction)
  } catch {
    return
  }
  return removed
}

export async function clearConnectionStorage(userId, connectionId, generation) {
  if (!userId || !connectionId) return
  const db = await openHubDatabase()
  if (!db) return
  let removed = []
  try {
    const transaction = db.transaction(['catalog', 'content', 'epochs'], 'readwrite')
    await incrementEpoch(transaction, connectionEpochKey(String(userId), String(connectionId), generation))
    removed = await deleteMatchingContent(transaction, (record) => matchesConnection(record, userId, connectionId, generation))
    const catalogStore = transaction.objectStore('catalog')
    const catalog = await requestAsPromise(catalogStore.get(String(userId)))
    if (catalog) {
      const expanded = expandCatalogSnapshot(catalog.snapshot) ?? {
        providersState: { providers: [] }, folderCache: {}, itemCache: {}, recentsState: {}, shortcutsState: {},
      }
      const scopeMatches = (scope) => scope.connectionId === String(connectionId) &&
        (generation === undefined || generation === null || scope.generation === String(generation))
      const providers = expanded.providersState?.providers ?? []
      const providerIds = new Set(providers
        .filter((provider) => String(statusConnectionId(provider)) === String(connectionId) &&
          (generation === undefined || generation === null || String(statusGeneration(provider)) === String(generation)))
        .map(providerId))
      const shouldRemove = (value, key) => providerIds.has(value?.provider ?? value?.providerId ?? providerFromKey(key)) &&
        (generation === undefined || generation === null || String(value?.catalog?.generation ?? value?.connectionGeneration) === String(generation))
      const filteredSnapshot = {
        ...expanded,
        folderCache: Object.fromEntries(Object.entries(expanded.folderCache ?? {}).filter(([key, value]) => !shouldRemove(value, key))),
        itemCache: Object.fromEntries(Object.entries(expanded.itemCache ?? {}).filter(([key, value]) => !shouldRemove(value, key))),
        recentsState: {
          ...expanded.recentsState,
          entries: (expanded.recentsState?.entries ?? []).filter((entry) => !shouldRemove(entry)),
        },
        shortcutsState: {
          ...expanded.shortcutsState,
          entries: (expanded.shortcutsState?.entries ?? []).filter((entry) => !shouldRemove(entry)),
        },
      }
      const changedScopes = (catalog.scopes ?? []).map((scope) => scopeMatches(scope)
        ? { ...scope, ...(generation === undefined || generation === null ? { connectionEpoch: (scope.connectionEpoch ?? 0) + 1 } : { generationEpoch: (scope.generationEpoch ?? 0) + 1 }) }
        : scope)
      catalogStore.put({ ...catalog, snapshot: compactCatalogSnapshot(filteredSnapshot), scopes: changedScopes, savedAt: Date.now() })
    }
    await transactionDone(transaction)
  } catch {
    return
  }
  return removed
}
