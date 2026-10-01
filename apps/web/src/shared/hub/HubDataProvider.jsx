import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../auth/SessionContext.jsx'
import { createHubApi } from './hubApi.js'
import { loadCatalog, saveCatalog, clearConnectionStorage, putContent } from './storage/index.js'
import { projectOperations } from './operationProjection.js'
import { subscribeServerEvents } from './hubEvents.js'
import { prefetchContent } from './content/index.js'
import { HubUploadError, buildUploadErrorMessage } from './hubErrors.js'
import { broadcastHubEvent, subscribeHubEvents } from './hubChannel.js'
import {
  FOLDER_STALE_MS,
  PROVIDERS_STALE_MS,
  RECENTS_STALE_MS,
  SHORTCUTS_STALE_MS,
  createTempItem,
  dedupeItemsByRef,
  findCachedItem,
  folderCacheKey,
  folderKeysContaining,
  isAmbiguousError,
  isStaleEntry,
  isTempRef,
  itemCacheKey,
  mergeFolderItems,
  mergeRecentsLists,
  placeRecent,
  withUiKey,
} from './hubCache.js'

const HubDataContext = createContext(null)

const emptyListState = { status: 'idle', entries: [], error: null, fetchedAt: 0 }
const emptyRecentsState = { ...emptyListState, authoritative: false }
const emptyProvidersState = { status: 'idle', providers: [], error: null, fetchedAt: 0 }
const emptySearchState = {
  status: 'idle',
  results: [],
  providers: [],
  error: null,
  requestId: 0,
}

function mapFolderItems(items) {
  return Array.isArray(items) ? items.map((item) => withUiKey(item)) : []
}

function splitFolderKey(key) {
  const index = key.indexOf(':')
  if (index < 0) return null
  return { providerId: key.slice(0, index), folderRef: key.slice(index + 1) === 'root' ? null : key.slice(index + 1) }
}

export function HubDataProvider({ children }) {
  const { session, logout } = useSession()
  const userId = session?.user?.id ?? null
  const sessionRef = useRef(session)
  sessionRef.current = session
  const lifecycleRef = useRef(0)
  const [hydrated, setHydrated] = useState(!userId)
  const [durableOperations, setDurableOperations] = useState({})
  const operationCallbackRef = useRef(null)
  const readDescriptorsRef = useRef(new Map())
  const searchResultsRef = useRef(new Map())
  const observedOperationsRef = useRef(new Map())
  const tokenRef = useRef(session?.accessToken ?? null)
  tokenRef.current = session?.accessToken ?? null

  const [providersState, setProvidersState] = useState(emptyProvidersState)
  const [folderCache, setFolderCache] = useState({})
  const [itemCache, setItemCache] = useState({})
  const [recentsState, setRecentsState] = useState(emptyRecentsState)
  const [shortcutsState, setShortcutsState] = useState(emptyListState)
  const [searchState, setSearchState] = useState(emptySearchState)

  const folderCacheRef = useRef({})
  folderCacheRef.current = folderCache
  const itemCacheRef = useRef({})
  itemCacheRef.current = itemCache
  const recentsRef = useRef(recentsState)
  recentsRef.current = recentsState
  const shortcutsRef = useRef(shortcutsState)
  shortcutsRef.current = shortcutsState
  const providersRef = useRef(providersState)
  providersRef.current = providersState

  const folderGenerationsRef = useRef({})
  const recentsRequestRef = useRef(0)
  const recentsGenerationRef = useRef(0)
  const itemGenerationsRef = useRef({})
  const keyMetaRef = useRef({})
  const inFlightFolderRef = useRef(new Map())
  const inFlightNextRef = useRef(new Map())
  const inFlightItemRef = useRef(new Map())
  const opSeqRef = useRef(0)
  const instanceIdRef = useRef(null)
  if (!instanceIdRef.current) {
    instanceIdRef.current =
      globalThis.crypto?.randomUUID?.() ?? `hub-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  const postHubEvent = useCallback((event) => {
    broadcastHubEvent({ ...event, userId: sessionRef.current?.user?.id, source: instanceIdRef.current })
  }, [])

  const onUnauthorized = useCallback(() => {
    void logout()
  }, [logout])

  const hubApi = useMemo(
    () => createHubApi(() => tokenRef.current, onUnauthorized, {
      getIdentity: () => `${sessionRef.current?.user?.id ?? ''}:${lifecycleRef.current}`,
      getConnection: (provider) => providersRef.current.providers.find((item) => item.id === provider),
      getItemVersion: (provider, ref) => {
        const pending = [...observedOperationsRef.current.values()].some((operation) => operation.request?.provider === provider && operation.request?.ref === ref && !['SUCCEEDED', 'REJECTED'].includes(operation.status))
        return pending ? null : findCachedItem(folderCacheRef.current, itemCacheRef.current, provider, ref)?.remoteVersion
      },
      getUncertainOperation: (provider, kind, fields) => [...observedOperationsRef.current.values()].find((operation) => {
        const request = operation.request
        return ['NEEDS_ATTENTION', 'VERIFYING', 'WAITING_RECONNECT'].includes(operation.status)
          && !operation.id.startsWith('client:') && request?.provider === provider && request.kind === kind
          && (request.ref ?? null) === (fields.ref ?? null) && (request.parentRef ?? null) === (fields.parentRef ?? null)
          && (request.name ?? null) === (fields.name ?? null)
      }),
      onOperation: (operation) => operationCallbackRef.current?.(operation),
      onIntent: (request, file) => operationCallbackRef.current?.({
        id: `client:${request.clientKey}`, request, status: 'SUBMITTING', updatedAt: new Date().toISOString(),
        localItem: file ? { size: file.size, mimeType: file.type, extension: file.name.includes('.') ? file.name.split('.').pop() : null } : null,
      }),
    }),
    [onUnauthorized],
  )
  const hubApiRef = useRef(hubApi)
  hubApiRef.current = hubApi

  useEffect(() => {
    let active = true
    if (!userId) { setHydrated(true); return undefined }
    void loadCatalog(userId).then((snapshot) => {
      if (!active) return
      if (snapshot) {
        setProvidersState(snapshot.providersState ? { ...snapshot.providersState, fetchedAt: 0 } : emptyProvidersState)
        setFolderCache(snapshot.folderCache ?? {})
        setItemCache(snapshot.itemCache ?? {})
        setRecentsState(snapshot.recentsState ?? emptyRecentsState)
        setShortcutsState(snapshot.shortcutsState ?? emptyListState)
      }
    }).catch(() => {}).finally(() => { if (active) setHydrated(true) })
    return () => { active = false; lifecycleRef.current += 1; readDescriptorsRef.current.clear() }
  }, [userId])

  useEffect(() => {
    if (!userId || !hydrated) return undefined
    const timer = setTimeout(() => {
      void saveCatalog(userId, { providersState, folderCache, itemCache, recentsState, shortcutsState }).catch(() => {})
    }, 250)
    return () => clearTimeout(timer)
  }, [userId, hydrated, providersState, folderCache, itemCache, recentsState, shortcutsState])

  function nextOpId() {
    opSeqRef.current += 1
    return `op-${opSeqRef.current}`
  }

  const bumpFolderGeneration = useCallback((key) => {
    folderGenerationsRef.current[key] = (folderGenerationsRef.current[key] ?? 0) + 1
    return folderGenerationsRef.current[key]
  }, [])

  const markFolderStale = useCallback((key, providerId = null) => {
    bumpFolderGeneration(key)
    setFolderCache((prev) => {
      const entry = prev[key]
      if (!entry) return prev
      return { ...prev, [key]: { ...entry, fetchedAt: 0, revalidating: false } }
    })
    if (providerId) {
      postHubEvent({ type: 'invalidate', scope: 'folder', providerId, keys: [key] })
    }
  }, [bumpFolderGeneration, postHubEvent])

  const upsertItemsCache = useCallback((items) => {
    if (!items?.length) return
    setItemCache((prev) => {
      const next = { ...prev }
      items.forEach((item) => {
        const key = itemCacheKey(item.provider, item.ref)
        const existing = next[key]
        if (existing?.complete && existing?.item) return
        next[key] = {
          status: 'ready',
          item,
          error: null,
          complete: false,
          fetchedAt: 0,
          generation: itemGenerationsRef.current[key] ?? 0,
        }
      })
      return next
    })
  }, [])

  const loadFolderNext = useCallback(async (providerId, folderRef, cursor) => {
    const key = folderCacheKey(providerId, folderRef)
    const flightKey = `${key}|${cursor}`
    const shared = inFlightNextRef.current.get(flightKey)
    if (shared) return shared
    const captured = folderGenerationsRef.current[key] ?? 0
    const promise = (async () => {
      setFolderCache((prev) => {
        const entry = prev[key]
        if (!entry) return prev
        return { ...prev, [key]: { ...entry, isFetchingNextPage: true, error: null } }
      })
      try {
        const data = await hubApiRef.current.listFolder(providerId, folderRef, cursor)
        if ((folderGenerationsRef.current[key] ?? 0) !== captured) return
        const mappedItems = mapFolderItems(data.items)
        setFolderCache((prev) => {
          if ((folderGenerationsRef.current[key] ?? 0) !== captured) return prev
          const previous = prev[key]
          if (!previous) return prev
          return {
            ...prev,
            [key]: {
              ...previous,
              status: 'ready',
              items: dedupeItemsByRef([...(previous.items ?? []), ...mappedItems]),
              nextCursor: data.nextCursor ?? null,
              error: null,
              loaded: true,
              fetchedAt: Date.now(),
              isFetchingNextPage: false,
              revalidating: false,
            },
          }
        })
        upsertItemsCache(mappedItems)
      } catch (error) {
        if ((folderGenerationsRef.current[key] ?? 0) !== captured) return
        if (error?.code === 'CURSOR_INVALIDO' || error?.code === 'CATALOGO_ALTERADO') {
          inFlightNextRef.current.delete(flightKey)
          await loadFolderRef.current(providerId, folderRef, null, { force: true })
          return
        }
        setFolderCache((prev) => {
          const entry = prev[key]
          if (!entry) return prev
          return { ...prev, [key]: { ...entry, isFetchingNextPage: false, error } }
        })
      } finally {
        inFlightNextRef.current.delete(flightKey)
      }
    })()
    inFlightNextRef.current.set(flightKey, promise)
    return promise
  }, [upsertItemsCache])

  const loadFolder = useCallback(async (providerId, folderRef, cursor = null, opts = {}) => {
    if (cursor) return loadFolderNext(providerId, folderRef, cursor)
    const key = folderCacheKey(providerId, folderRef)
    keyMetaRef.current[key] = { providerId, folderRef }
    const shared = inFlightFolderRef.current.get(key)
    if (shared && !opts.force) return shared
    const promise = (async () => {
      if (opts.force) bumpFolderGeneration(key)
      if (folderGenerationsRef.current[key] === undefined) folderGenerationsRef.current[key] = 0
      const captured = folderGenerationsRef.current[key]
      const prev = folderCacheRef.current[key]
      const hasData = Boolean(prev?.loaded && prev?.items)
      setFolderCache((prevCache) => {
        const entry = prevCache[key] ?? { folder: null, items: [], nextCursor: null }
        return {
          ...prevCache,
          [key]: {
            ...entry,
            status: hasData ? 'ready' : 'loading',
            error: null,
            loaded: entry.loaded ?? false,
            fetchedAt: entry.fetchedAt ?? 0,
            generation: captured,
            isFetchingNextPage: false,
            revalidating: hasData,
          },
        }
      })
      try {
        let data = await hubApiRef.current.listFolder(providerId, folderRef, null)
        const visibleCount = (prev?.items ?? []).filter((item) => !isTempRef(item.ref)).length
        while (data.catalog && data.nextCursor && (data.items?.length ?? 0) < visibleCount) {
          if ((folderGenerationsRef.current[key] ?? 0) !== captured) return
          const continuation = await hubApiRef.current.listFolder(providerId, folderRef, data.nextCursor)
          data = { ...continuation, items: dedupeItemsByRef([...(data.items ?? []), ...(continuation.items ?? [])]) }
        }
        if ((folderGenerationsRef.current[key] ?? 0) !== captured) return
        const mappedItems = mapFolderItems(data.items)
        setFolderCache((prevCache) => {
          if ((folderGenerationsRef.current[key] ?? 0) !== captured) return prevCache
          const previous = prevCache[key]
          const items = dedupeItemsByRef(mergeFolderItems(previous?.items, mappedItems))
          return {
            ...prevCache,
            [key]: {
              status: 'ready',
              folder: data.folder ?? previous?.folder ?? null,
              items,
              nextCursor: data.nextCursor ?? null,
              catalog: data.catalog,
              error: null,
              loaded: true,
              fetchedAt: Date.now(),
              generation: captured,
              isFetchingNextPage: false,
              revalidating: false,
            },
          }
        })
        upsertItemsCache(mappedItems)
      } catch (error) {
        if ((folderGenerationsRef.current[key] ?? 0) !== captured) return
        setFolderCache((prevCache) => {
          const entry = prevCache[key]
          if (!entry) return prevCache
          if (entry.loaded) {
            return { ...prevCache, [key]: { ...entry, status: 'ready', revalidating: false, isFetchingNextPage: false, error, fetchedAt: Date.now() } }
          }
          return { ...prevCache, [key]: { ...entry, status: 'error', revalidating: false, isFetchingNextPage: false, error } }
        })
      } finally {
        inFlightFolderRef.current.delete(key)
      }
    })()
    inFlightFolderRef.current.set(key, promise)
    return promise
  }, [bumpFolderGeneration, loadFolderNext, upsertItemsCache])
  const loadFolderRef = useRef(loadFolder)
  loadFolderRef.current = loadFolder

  const loadItem = useCallback(async (providerId, ref) => {
    const key = itemCacheKey(providerId, ref)
    const shared = inFlightItemRef.current.get(key)
    if (shared) return shared
    const promise = (async () => {
      if (itemGenerationsRef.current[key] === undefined) itemGenerationsRef.current[key] = 0
      const captured = itemGenerationsRef.current[key]
      setItemCache((prev) => ({
        ...prev,
        [key]: prev[key]?.item
          ? { ...prev[key], status: 'ready', revalidating: true, error: null }
          : { ...(prev[key] ?? {}), status: 'loading', error: null },
      }))
      try {
        const item = withUiKey(await hubApiRef.current.getItem(providerId, ref))
        if ((itemGenerationsRef.current[key] ?? 0) !== captured) return
        setItemCache((prev) => ({
          ...prev,
          [key]: { status: 'ready', item, error: null, complete: true, fetchedAt: Date.now(), generation: captured },
        }))
      } catch (error) {
        if ((itemGenerationsRef.current[key] ?? 0) !== captured) return
        setItemCache((prev) => ({
          ...prev,
          [key]: { ...(prev[key] ?? {}), status: prev[key]?.item ? 'ready' : 'error', revalidating: false, error, fetchedAt: Date.now() },
        }))
      } finally {
        inFlightItemRef.current.delete(key)
      }
    })()
    inFlightItemRef.current.set(key, promise)
    return promise
  }, [])

  const loadProviders = useCallback(async (opts = {}) => {
    const prev = providersRef.current
    const background = prev.status === 'ready' && !opts.force
    if (!background) {
      setProvidersState((current) => ({ ...current, status: 'loading', error: null }))
    }
    try {
      const providers = await hubApiRef.current.listProviders()
      for (const previous of providersRef.current.providers) {
        const current = providers.find((provider) => provider.id === previous.id)
        if (previous.connectionId && (!current?.connected || current.connectionId !== previous.connectionId || current.generation !== previous.generation)) {
          lifecycleRef.current += 1
          purgeProviderData(previous.id)
          readDescriptorsRef.current.clear()
          void clearConnectionStorage(sessionRef.current?.user?.id, previous.connectionId)
        }
      }
      setProvidersState({ status: 'ready', providers, error: null, fetchedAt: Date.now() })
    } catch (error) {
      setProvidersState((current) => ({
        ...current,
        status: current.status === 'ready' ? 'ready' : 'error',
        error,
        fetchedAt: Date.now(),
      }))
    }
  }, [])

  const loadRecents = useCallback(async (opts = {}) => {
    const requestId = (recentsRequestRef.current += 1)
    const generationAtStart = recentsGenerationRef.current
    const prev = recentsRef.current
    const background = prev.status === 'ready' && !opts.force
    if (!background) {
      setRecentsState((current) => ({ ...current, status: 'loading', error: null }))
    }
    try {
      const entries = await hubApiRef.current.listRecents()
      if (requestId !== recentsRequestRef.current) return
      const serverEntries = Array.isArray(entries) ? entries : []
      setRecentsState((current) => {
        const nextEntries = recentsGenerationRef.current === generationAtStart
          ? serverEntries
          : mergeRecentsLists(serverEntries, current.entries)
        return {
          status: 'ready',
          entries: nextEntries,
          error: null,
          fetchedAt: Date.now(),
          authoritative: true,
        }
      })
    } catch (error) {
      if (requestId !== recentsRequestRef.current) return
      setRecentsState((current) => ({
        ...current,
        status: current.authoritative ? 'ready' : 'error',
        error,
        fetchedAt: Date.now(),
      }))
    }
  }, [])

  const loadShortcuts = useCallback(async (opts = {}) => {
    const prev = shortcutsRef.current
    const background = prev.status === 'ready' && !opts.force
    if (!background) {
      setShortcutsState((current) => ({ ...current, status: 'loading', error: null }))
    }
    try {
      const entries = await hubApiRef.current.listShortcuts()
      setShortcutsState({ status: 'ready', entries, error: null, fetchedAt: Date.now() })
    } catch (error) {
      setShortcutsState((current) => ({
        ...current,
        status: current.status === 'ready' ? 'ready' : 'error',
        error,
        fetchedAt: Date.now(),
      }))
    }
  }, [])

  const runSearch = useCallback(
    async (query, requestId) => {
      const local = dedupeItemsByRef([
        ...Object.values(itemCacheRef.current).map((entry) => entry?.item).filter(Boolean),
        ...Object.values(folderCacheRef.current).flatMap((entry) => entry?.items ?? []),
      ]).filter((item) => item.name?.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
      setSearchState((prev) => ({
        ...prev,
        status: local.length ? 'ready' : 'loading',
        results: local,
        error: null,
        requestId,
      }))

      try {
        const cached = searchResultsRef.current.get(query)
        const data = cached && cached.until > Date.now() ? cached.data : await hubApiRef.current.search(query)
        searchResultsRef.current.set(query, { data, until: Date.now() + 60000 })
        setSearchState((prev) => {
          if (prev.requestId !== requestId) return prev
          return {
            status: 'ready',
            results: dedupeItemsByRef([...mapFolderItems(data.results ?? []), ...local]),
            providers: data.providers ?? [],
            error: null,
            requestId,
          }
        })
        upsertItemsCache(mapFolderItems(data.results ?? []))
      } catch (error) {
        setSearchState((prev) => {
          if (prev.requestId !== requestId) return prev
          return {
            ...prev,
            status: 'error',
            error,
            requestId,
          }
        })
      }
    },
    [upsertItemsCache],
  )

  const connectProvider = useCallback(
    async (providerId, redirectTo) => {
      const { authorizationUrl } = await hubApiRef.current.connectProvider(providerId, redirectTo)
      window.location.assign(authorizationUrl)
    },
    [],
  )

  const purgeProviderData = useCallback((providerId) => {
    const prefix = `${providerId}:`
    setFolderCache((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((key) => {
        if (key === prefix + 'root' || key.startsWith(prefix)) delete next[key]
      })
      return next
    })
    Object.keys(folderGenerationsRef.current).forEach((key) => {
      if (key === prefix + 'root' || key.startsWith(prefix)) delete folderGenerationsRef.current[key]
    })
    setItemCache((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((key) => {
        if (key.startsWith(prefix)) delete next[key]
      })
      return next
    })
    setRecentsState((prev) => ({
      ...prev,
      entries: (prev.entries ?? []).filter((entry) => entry.provider !== providerId),
      fetchedAt: 0,
    }))
    setShortcutsState((prev) => ({
      ...prev,
      entries: (prev.entries ?? []).filter((entry) => entry.provider !== providerId),
      fetchedAt: 0,
    }))
    setSearchState((prev) => ({
      ...prev,
      results: (prev.results ?? []).filter((item) => item.provider !== providerId),
    }))
  }, [])

  const disconnectProvider = useCallback(
    async (providerId) => {
      const connection = providersRef.current.providers.find((provider) => provider.id === providerId)
      const providers = await hubApiRef.current.disconnectProvider(providerId)
      lifecycleRef.current += 1
      readDescriptorsRef.current.clear()
      if (connection?.connectionId) void clearConnectionStorage(sessionRef.current?.user?.id, connection.connectionId)
      setProvidersState({ status: 'ready', providers, error: null, fetchedAt: Date.now() })
      purgeProviderData(providerId)
      postHubEvent({ type: 'invalidate', scope: 'provider', providerId, keys: [] })
      void loadRecents({ force: true }).catch(() => {})
      void loadShortcuts({ force: true }).catch(() => {})
      return providers
    },
    [loadRecents, loadShortcuts, purgeProviderData],
  )

  const renameItemNameInCaches = useCallback((providerId, ref, name, opId = null) => {
    setFolderCache((prev) => {
      const next = { ...prev }
      Object.entries(next).forEach(([key, entry]) => {
        if (!entry?.items?.length) return
        next[key] = {
          ...entry,
          items: entry.items.map((item) =>
            item.provider === providerId && item.ref === ref
              ? { ...item, name, ...(opId ? { _op: opId } : {}) }
              : item,
          ),
        }
      })
      return next
    })

    setItemCache((prev) => {
      const key = itemCacheKey(providerId, ref)
      const entry = prev[key]
      if (!entry?.item) return prev
      return {
        ...prev,
        [key]: { ...entry, item: { ...entry.item, name, ...(opId ? { _op: opId } : {}) } },
      }
    })

    setRecentsState((prev) => ({
      ...prev,
      entries: prev.entries.map((entry) =>
        entry.provider === providerId && entry.ref === ref ? { ...entry, name } : entry,
      ),
    }))

    setShortcutsState((prev) => ({
      ...prev,
      entries: prev.entries.map((entry) =>
        entry.provider === providerId && entry.ref === ref ? { ...entry, name } : entry,
      ),
    }))
  }, [])

  const removeItemFromCaches = useCallback((providerId, ref) => {
    setFolderCache((prev) => {
      const next = { ...prev }
      Object.entries(next).forEach(([key, entry]) => {
        if (!entry?.items?.length) return
        const filtered = entry.items.filter(
          (item) => !(item.provider === providerId && item.ref === ref),
        )
        if (filtered.length !== entry.items.length) {
          next[key] = { ...entry, items: filtered }
        }
      })
      return next
    })

    setItemCache((prev) => {
      const key = itemCacheKey(providerId, ref)
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

    setRecentsState((prev) => ({
      ...prev,
      entries: prev.entries.filter((entry) => !(entry.provider === providerId && entry.ref === ref)),
    }))

    setShortcutsState((prev) => ({
      ...prev,
      entries: prev.entries.filter((entry) => !(entry.provider === providerId && entry.ref === ref)),
    }))

    setSearchState((prev) => ({
      ...prev,
      results: (prev.results ?? []).filter((item) => !(item.provider === providerId && item.ref === ref)),
    }))
  }, [])

  const replaceOptimisticItem = useCallback((folderKey, uiKey, serverItem) => {
    const nextItem = withUiKey(serverItem, uiKey)
    delete nextItem.pending
    delete nextItem.unconfirmed
    setFolderCache((prev) => {
      const entry = prev[folderKey]
      if (!entry?.items) return prev
      return {
        ...prev,
        [folderKey]: {
          ...entry,
          items: entry.items.map((item) => (item.uiKey === uiKey ? nextItem : item)),
        },
      }
    })

    setItemCache((prev) => {
      const next = { ...prev }
      delete next[itemCacheKey(serverItem.provider, uiKey)]
      next[itemCacheKey(serverItem.provider, serverItem.ref)] = {
        status: 'ready',
        item: nextItem,
        error: null,
        complete: false,
        fetchedAt: Date.now(),
        generation: itemGenerationsRef.current[itemCacheKey(serverItem.provider, serverItem.ref)] ?? 0,
      }
      return next
    })
  }, [])

  function refetchFolderKeys(keys) {
    keys.forEach((key) => {
      const meta = keyMetaRef.current[key] ?? splitFolderKey(key)
      if (!meta?.providerId) return
      const folderRef = meta.folderRef ?? null
      void loadFolderRef.current(meta.providerId, folderRef, null, { force: true }).catch(() => {})
    })
  }

  function durableEnabled(providerId) {
    const connection = providersRef.current.providers.find((provider) => provider.id === providerId)
    return Boolean(connection?.connectionId && connection.operationsEnabled !== false)
  }

  async function seedUploadedContent(providerId, item, file) {
    try {
      const descriptor = await hubApiRef.current.getReadSource(providerId, item.ref)
      if (descriptor?.variant !== 'ORIGINAL' || descriptor.revision !== item.contentRevision || descriptor.size !== file.size) return
      await putContent({ ...descriptor, userId: sessionRef.current?.user?.id, providerId }, file)
    } catch { /* Upload success is independent of optional local caching. */ }
  }

  const actions = useMemo(
    () => ({
      getOperationError(providerId) {
        const errors = [...observedOperationsRef.current.values()].filter((operation) => {
          const request = operation.request
          const connection = providersRef.current.providers.find((provider) => provider.connectionId === request?.connectionId)
          return connection && connection.generation === request.generation && (!providerId || request.provider === providerId)
            && ['NEEDS_ATTENTION', 'WAITING_RECONNECT'].includes(operation.status)
        }).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        return errors[0]?.errorMessage ?? null
      },
      async createFolder({ providerId, parentRef, name }) {
        if (durableEnabled(providerId)) return hubApiRef.current.createFolder(providerId, parentRef, name)
        const folderKey = folderCacheKey(providerId, parentRef)
        keyMetaRef.current[folderKey] = { providerId, folderRef: parentRef ?? null }
        const opId = nextOpId()
        const placeholder = { ...createTempItem({ provider: providerId, name, kind: 'folder', parentRef }), _op: opId }

        setFolderCache((prev) => {
          const entry = prev[folderKey]
          if (!entry) {
            return {
              ...prev,
              [folderKey]: {
                status: 'idle',
                folder: null,
                items: [placeholder],
                nextCursor: null,
                error: null,
                loaded: false,
                fetchedAt: 0,
                generation: folderGenerationsRef.current[folderKey] ?? 0,
                isFetchingNextPage: false,
                revalidating: false,
              },
            }
          }
          return {
            ...prev,
            [folderKey]: { ...entry, items: [placeholder, ...(entry.items ?? [])] },
          }
        })

        try {
          const created = await hubApiRef.current.createFolder(providerId, parentRef, name)
          replaceOptimisticItem(folderKey, placeholder.uiKey, created)
          setFolderCache((prev) => {
            const entry = prev[folderKey]
            if (!entry) return prev
            return { ...prev, [folderKey]: { ...entry, fetchedAt: Date.now() } }
          })
          postHubEvent({ type: 'invalidate', scope: 'folder', providerId, keys: [folderKey] })
          return withUiKey(created, placeholder.uiKey)
        } catch (error) {
          if (isAmbiguousError(error)) {
            setFolderCache((prev) => {
              const entry = prev[folderKey]
              if (!entry?.items) return prev
              return {
                ...prev,
                [folderKey]: {
                  ...entry,
                  items: entry.items.map((item) =>
                    item.uiKey === placeholder.uiKey ? { ...item, unconfirmed: true } : item,
                  ),
                },
              }
            })
            markFolderStale(folderKey, providerId)
            refetchFolderKeys([folderKey])
          } else {
            setFolderCache((prev) => {
              const entry = prev[folderKey]
              if (!entry?.items) return prev
              const current = entry.items.find((item) => item.uiKey === placeholder.uiKey)
              if (current && current._op && current._op !== opId) return prev
              return {
                ...prev,
                [folderKey]: {
                  ...entry,
                  items: entry.items.filter((item) => item.uiKey !== placeholder.uiKey),
                },
              }
            })
          }
          throw error
        }
      },

      async uploadFiles({ providerId, parentRef, files }) {
        if (durableEnabled(providerId)) {
          const uploaded = []
          const failed = []
          for (const file of Array.from(files ?? [])) {
            try {
              const item = await hubApiRef.current.uploadFile(providerId, parentRef, file)
              uploaded.push(item)
              if (item?.contentRevision) void seedUploadedContent(providerId, item, file)
            }
            catch (error) { failed.push({ file, error, ambiguous: isAmbiguousError(error) }) }
          }
          if (failed.length) throw new HubUploadError(buildUploadErrorMessage(uploaded.length, uploaded.length + failed.length, failed), { uploaded, failed })
          return uploaded
        }
        const folderKey = folderCacheKey(providerId, parentRef)
        keyMetaRef.current[folderKey] = { providerId, folderRef: parentRef ?? null }
        const list = Array.from(files ?? [])
        const placeholders = list.map((file) => ({
          ...createTempItem({
            provider: providerId,
            name: file.name,
            kind: 'file',
            parentRef,
            mimeType: file.type || null,
            extension: file.name.includes('.') ? file.name.split('.').pop() : null,
            size: file.size,
          }),
          _op: nextOpId(),
        }))

        setFolderCache((prev) => {
          const entry = prev[folderKey]
          if (!entry) {
            return {
              ...prev,
              [folderKey]: {
                status: 'idle',
                folder: null,
                items: [...placeholders],
                nextCursor: null,
                error: null,
                loaded: false,
                fetchedAt: 0,
                generation: folderGenerationsRef.current[folderKey] ?? 0,
                isFetchingNextPage: false,
                revalidating: false,
              },
            }
          }
          return {
            ...prev,
            [folderKey]: { ...entry, items: [...placeholders, ...(entry.items ?? [])] },
          }
        })

        const uploaded = []
        const failed = []
        let sawAmbiguous = false

        for (let index = 0; index < list.length; index += 1) {
          const file = list[index]
          const placeholder = placeholders[index]
          try {
            const created = await hubApiRef.current.uploadFile(providerId, parentRef, file)
            replaceOptimisticItem(folderKey, placeholder.uiKey, created)
            uploaded.push(withUiKey(created, placeholder.uiKey))
          } catch (error) {
            const ambiguous = isAmbiguousError(error)
            failed.push({ file, error, ambiguous })
            if (ambiguous) {
              sawAmbiguous = true
              setFolderCache((prev) => {
                const entry = prev[folderKey]
                if (!entry?.items) return prev
                return {
                  ...prev,
                  [folderKey]: {
                    ...entry,
                    items: entry.items.map((item) =>
                      item.uiKey === placeholder.uiKey ? { ...item, unconfirmed: true } : item,
                    ),
                  },
                }
              })
            } else {
              setFolderCache((prev) => {
                const entry = prev[folderKey]
                if (!entry?.items) return prev
                const current = entry.items.find((item) => item.uiKey === placeholder.uiKey)
                if (current && current._op && current._op !== placeholder._op) return prev
                if (current && !current.pending) return prev
                return {
                  ...prev,
                  [folderKey]: {
                    ...entry,
                    items: entry.items.filter((item) => item.uiKey !== placeholder.uiKey),
                  },
                }
              })
            }
          }
        }

        if (failed.length > 0) {
          if (sawAmbiguous) {
            markFolderStale(folderKey, providerId)
            refetchFolderKeys([folderKey])
          } else {
            postHubEvent({ type: 'invalidate', scope: 'folder', providerId, keys: [folderKey] })
          }
          throw new HubUploadError(
            buildUploadErrorMessage(uploaded.length, list.length, failed),
            { uploaded, failed },
          )
        }

        setFolderCache((prev) => {
          const entry = prev[folderKey]
          if (!entry) return prev
          return { ...prev, [folderKey]: { ...entry, fetchedAt: Date.now() } }
        })
        postHubEvent({ type: 'invalidate', scope: 'folder', providerId, keys: [folderKey] })
        return uploaded
      },

      async renameItem({ providerId, ref, name }) {
        if (durableEnabled(providerId)) return hubApiRef.current.updateItem(providerId, ref, { name })
        const opId = nextOpId()
        const previousName =
          itemCacheRef.current[itemCacheKey(providerId, ref)]?.item?.name ??
          findCachedItem(folderCacheRef.current, itemCacheRef.current, providerId, ref)?.name ??
          name

        renameItemNameInCaches(providerId, ref, name, opId)

        try {
          const updated = await hubApiRef.current.updateItem(providerId, ref, { name })
          setFolderCache((prev) => {
            const next = { ...prev }
            Object.entries(next).forEach(([key, entry]) => {
              if (!entry?.items) return
              next[key] = {
                ...entry,
                items: entry.items.map((item) => {
                  if (!(item.provider === providerId && item.ref === ref)) return item
                  const clean = { ...item, ...withUiKey(updated, item.uiKey) }
                  delete clean._op
                  return clean
                }),
              }
            })
            return next
          })
          setItemCache((prev) => {
            const key = itemCacheKey(providerId, ref)
            const current = prev[key]?.item
            const clean = { ...current, ...withUiKey(updated, current?.uiKey ?? itemCacheKey(providerId, ref)) }
            delete clean._op
            return {
              ...prev,
              [key]: { status: 'ready', item: clean, error: null, complete: prev[key]?.complete === true, fetchedAt: Date.now(), generation: itemGenerationsRef.current[key] ?? 0 },
            }
          })
          postHubEvent({ type: 'invalidate', scope: 'item', providerId, keys: [itemCacheKey(providerId, ref)] })
          return withUiKey(updated)
        } catch (error) {
          if (isAmbiguousError(error)) {
            setFolderCache((prev) => {
              const next = { ...prev }
              Object.entries(next).forEach(([key, entry]) => {
                if (!entry?.items?.length) return
                next[key] = {
                  ...entry,
                  items: entry.items.map((item) =>
                    item.provider === providerId && item.ref === ref
                      ? { ...item, unconfirmed: true }
                      : item,
                  ),
                }
              })
              return next
            })
            const keys = folderKeysContaining(folderCacheRef.current, providerId, ref)
            keys.forEach((key) => markFolderStale(key, providerId))
            const itemKey = itemCacheKey(providerId, ref)
            itemGenerationsRef.current[itemKey] = (itemGenerationsRef.current[itemKey] ?? 0) + 1
            refetchFolderKeys(keys)
            void loadItem(providerId, ref).catch(() => {})
          } else {
            setFolderCache((prev) => {
              const next = { ...prev }
              Object.entries(next).forEach(([key, entry]) => {
                if (!entry?.items?.length) return
                next[key] = {
                  ...entry,
                  items: entry.items.map((item) => {
                    if (!(item.provider === providerId && item.ref === ref)) return item
                    if (item._op && item._op !== opId) return item
                    if (item.name !== name) return item
                    const clean = { ...item, name: previousName }
                    delete clean._op
                    delete clean.unconfirmed
                    return clean
                  }),
                }
              })
              return next
            })
            setItemCache((prev) => {
              const key = itemCacheKey(providerId, ref)
              const entry = prev[key]
              if (!entry?.item) return prev
              if (entry.item._op && entry.item._op !== opId) return prev
              if (entry.item.name !== name) return prev
              const clean = { ...entry.item, name: previousName }
              delete clean._op
              delete clean.unconfirmed
              return { ...prev, [key]: { ...entry, item: clean } }
            })
            setRecentsState((prev) => ({
              ...prev,
              entries: prev.entries.map((entry) =>
                entry.provider === providerId && entry.ref === ref ? { ...entry, name: previousName } : entry,
              ),
            }))
            setShortcutsState((prev) => ({
              ...prev,
              entries: prev.entries.map((entry) =>
                entry.provider === providerId && entry.ref === ref ? { ...entry, name: previousName } : entry,
              ),
            }))
          }
          throw error
        }
      },

      async moveItem({ providerId, ref, fromParentRef, parentRef }) {
        if (durableEnabled(providerId)) return hubApiRef.current.updateItem(providerId, ref, { parentRef })
        const opId = nextOpId()
        const destKey = parentRef === undefined ? null : folderCacheKey(providerId, parentRef)
        if (destKey) keyMetaRef.current[destKey] = { providerId, folderRef: parentRef ?? null }
        const movingItem =
          itemCacheRef.current[itemCacheKey(providerId, ref)]?.item ??
          findCachedItem(folderCacheRef.current, itemCacheRef.current, providerId, ref)

        if (!movingItem) {
          const updated = await hubApiRef.current.updateItem(providerId, ref, { parentRef })
          return withUiKey(updated)
        }

        const sourceKeys = folderKeysContaining(folderCacheRef.current, providerId, ref)
        const removedByKey = {}
        sourceKeys.forEach((key) => {
          const entry = folderCacheRef.current[key]
          const index = (entry?.items ?? []).findIndex(
            (item) => item.provider === providerId && item.ref === ref,
          )
          if (index >= 0) removedByKey[key] = { item: entry.items[index], index }
        })

        setFolderCache((prev) => {
          const next = { ...prev }
          Object.keys(removedByKey).forEach((key) => {
            const source = next[key]
            if (!source?.items) return
            next[key] = {
              ...source,
              items: source.items.filter((item) => !(item.provider === providerId && item.ref === ref)),
            }
          })
          if (destKey) {
            const dest = next[destKey]
            if (dest?.loaded) {
              next[destKey] = {
                ...dest,
                items: [{ ...movingItem, parentRef, _op: opId }, ...(dest.items ?? [])],
              }
            }
          }
          return next
        })
        if (destKey && !folderCacheRef.current[destKey]?.loaded) {
          setFolderCache((prev) => {
            const dest = prev[destKey]
            if (!dest) return prev
            return { ...prev, [destKey]: { ...dest, fetchedAt: 0 } }
          })
        }

        try {
          const updated = await hubApiRef.current.updateItem(providerId, ref, { parentRef })
          if (destKey) {
            setFolderCache((prev) => {
              const dest = prev[destKey]
              if (!dest?.items) return prev
              return {
                ...prev,
                [destKey]: {
                  ...dest,
                  items: dest.items.map((item) => {
                    if (!(item.provider === providerId && item.ref === ref)) return item
                    const clean = { ...withUiKey(updated, item.uiKey ?? movingItem.uiKey) }
                    delete clean._op
                    delete clean.pending
                    return clean
                  }),
                  fetchedAt: Date.now(),
                },
              }
            })
          }
          setItemCache((prev) => {
            const key = itemCacheKey(providerId, ref)
            const current = prev[key]?.item
            return {
              ...prev,
              [key]: {
                status: 'ready',
                item: withUiKey(updated, current?.uiKey ?? movingItem.uiKey),
                error: null,
                complete: prev[key]?.complete ?? false,
                fetchedAt: Date.now(),
                generation: itemGenerationsRef.current[key] ?? 0,
              },
            }
          })
          postHubEvent({ type: 'invalidate', scope: 'folder', providerId, keys: [...sourceKeys, ...(destKey ? [destKey] : [])] })
          return withUiKey(updated, movingItem.uiKey)
        } catch (error) {
          if (isAmbiguousError(error)) {
            setFolderCache((prev) => {
              const next = { ...prev }
              Object.entries(next).forEach(([key, entry]) => {
                if (!entry?.items) return
                next[key] = {
                  ...entry,
                  items: entry.items.map((item) =>
                    item.provider === providerId && item.ref === ref
                      ? { ...item, unconfirmed: true }
                      : item,
                  ),
                }
              })
              return next
            })
            const affected = [...new Set([...sourceKeys, ...(destKey ? [destKey] : [])])]
            affected.forEach((key) => {
              folderGenerationsRef.current[key] = (folderGenerationsRef.current[key] ?? 0) + 1
              setFolderCache((prev) => {
                const entry = prev[key]
                if (!entry) return prev
                return { ...prev, [key]: { ...entry, fetchedAt: 0 } }
              })
            })
            refetchFolderKeys(affected.filter((key) => keyMetaRef.current[key] || splitFolderKey(key)))
          } else {
            setFolderCache((prev) => {
              const next = { ...prev }
              if (destKey && next[destKey]?.items) {
                const dest = next[destKey]
                const current = dest.items.find((item) => item.provider === providerId && item.ref === ref)
                if (current && (!current._op || current._op === opId)) {
                  next[destKey] = {
                    ...dest,
                    items: dest.items.filter((item) => !(item.provider === providerId && item.ref === ref)),
                  }
                }
              }
              Object.entries(removedByKey).forEach(([key, { item, index }]) => {
                const entry = next[key]
                if (!entry) return
                const stillThere = (entry.items ?? []).some(
                  (candidate) => candidate.provider === providerId && candidate.ref === ref,
                )
                if (stillThere) return
                const items = [...(entry.items ?? [])]
                items.splice(Math.min(index, items.length), 0, item)
                next[key] = { ...entry, items }
              })
              return next
            })
          }
          throw error
        }
      },

      async deleteItem({ providerId, ref, parentRef }) {
        if (durableEnabled(providerId)) return hubApiRef.current.deleteItem(providerId, ref)
        void parentRef
        const sourceKeys = folderKeysContaining(folderCacheRef.current, providerId, ref)
        const removedByKey = {}
        sourceKeys.forEach((key) => {
          const entry = folderCacheRef.current[key]
          const index = (entry?.items ?? []).findIndex(
            (item) => item.provider === providerId && item.ref === ref,
          )
          if (index >= 0) removedByKey[key] = { item: entry.items[index], index }
        })
        const itemSnapshot = itemCacheRef.current[itemCacheKey(providerId, ref)]
        const recentsRemoved = (recentsRef.current.entries ?? []).find(
          (entry) => entry.provider === providerId && entry.ref === ref,
        )
        const shortcutsRemoved = (shortcutsRef.current.entries ?? []).find(
          (entry) => entry.provider === providerId && entry.ref === ref,
        )

        removeItemFromCaches(providerId, ref)

        try {
          await hubApiRef.current.deleteItem(providerId, ref)
          postHubEvent({ type: 'invalidate', scope: 'folder', providerId, keys: sourceKeys })
        } catch (error) {
          if (isAmbiguousError(error)) {
            const affected = [...new Set(sourceKeys)]
            affected.forEach((key) => {
              folderGenerationsRef.current[key] = (folderGenerationsRef.current[key] ?? 0) + 1
              setFolderCache((prev) => {
                const entry = prev[key]
                if (!entry) return prev
                return { ...prev, [key]: { ...entry, fetchedAt: 0 } }
              })
            })
            const itemKey = itemCacheKey(providerId, ref)
            itemGenerationsRef.current[itemKey] = (itemGenerationsRef.current[itemKey] ?? 0) + 1
            refetchFolderKeys(affected.filter((key) => keyMetaRef.current[key] || splitFolderKey(key)))
          } else {
            setFolderCache((prev) => {
              const next = { ...prev }
              Object.entries(removedByKey).forEach(([key, { item, index }]) => {
                const entry = next[key] ?? { items: [] }
                const stillThere = (entry.items ?? []).some(
                  (candidate) => candidate.provider === providerId && candidate.ref === ref,
                )
                if (stillThere) return
                const items = [...(entry.items ?? [])]
                items.splice(Math.min(index, items.length), 0, item)
                next[key] = { ...entry, items }
              })
              return next
            })
            if (itemSnapshot) {
              setItemCache((prev) => ({ ...prev, [itemCacheKey(providerId, ref)]: itemSnapshot }))
            }
            if (recentsRemoved) {
              setRecentsState((prev) => {
                const stillThere = (prev.entries ?? []).some(
                  (entry) => entry.provider === providerId && entry.ref === ref,
                )
                if (stillThere) return prev
                return { ...prev, entries: [recentsRemoved, ...(prev.entries ?? [])] }
              })
            }
            if (shortcutsRemoved) {
              setShortcutsState((prev) => {
                const stillThere = (prev.entries ?? []).some(
                  (entry) => entry.provider === providerId && entry.ref === ref,
                )
                if (stillThere) return prev
                return { ...prev, entries: [shortcutsRemoved, ...(prev.entries ?? [])] }
              })
            }
          }
          throw error
        }
      },

      async toggleShortcut(item) {
        const exists = (shortcutsRef.current.entries ?? []).some(
          (entry) => entry.provider === item.provider && entry.ref === item.ref,
        )
        const removedEntry = (shortcutsRef.current.entries ?? []).find(
          (entry) => entry.provider === item.provider && entry.ref === item.ref,
        )

        if (exists) {
          setShortcutsState((prev) => ({
            ...prev,
            entries: prev.entries.filter(
              (entry) => !(entry.provider === item.provider && entry.ref === item.ref),
            ),
          }))
          try {
            await hubApiRef.current.removeShortcut(item.provider, item.ref)
            postHubEvent({ type: 'invalidate', scope: 'shortcuts', providerId: item.provider, keys: [] })
          } catch (error) {
            if (isAmbiguousError(error)) {
              setShortcutsState((prev) => ({ ...prev, fetchedAt: 0 }))
              void loadShortcuts({ force: true }).catch(() => {})
            } else if (removedEntry) {
              setShortcutsState((prev) => {
                const stillThere = prev.entries.some(
                  (entry) => entry.provider === item.provider && entry.ref === item.ref,
                )
                if (stillThere) return prev
                return { ...prev, entries: [removedEntry, ...prev.entries] }
              })
            }
            throw error
          }
          return null
        }

        const optimistic = {
          provider: item.provider,
          ref: item.ref,
          name: item.name,
          mimeType: item.mimeType ?? null,
          extension: item.extension ?? null,
          pinnedAt: new Date().toISOString(),
        }
        setShortcutsState((prev) => ({
          ...prev,
          entries: [optimistic, ...prev.entries],
        }))

        try {
          const created = await hubApiRef.current.addShortcut(item.provider, item.ref)
          setShortcutsState((prev) => ({
            ...prev,
            entries: prev.entries.map((entry) =>
              entry.provider === item.provider && entry.ref === item.ref ? created : entry,
            ),
            fetchedAt: Date.now(),
          }))
          postHubEvent({ type: 'invalidate', scope: 'shortcuts', providerId: item.provider, keys: [] })
          return created
        } catch (error) {
          if (isAmbiguousError(error)) {
            setShortcutsState((prev) => ({ ...prev, fetchedAt: 0 }))
            void loadShortcuts({ force: true }).catch(() => {})
          } else {
            setShortcutsState((prev) => ({
              ...prev,
              entries: prev.entries.filter(
                (entry) => !(entry.provider === item.provider && entry.ref === item.ref),
              ),
            }))
          }
          throw error
        }
      },

      getPublicLink: ({ providerId, ref }) => hubApiRef.current.getPublicLink(providerId, ref),
      enablePublicLink: ({ providerId, ref }) => hubApiRef.current.enablePublicLink(providerId, ref),
      disablePublicLink: ({ providerId, ref }) => hubApiRef.current.disablePublicLink(providerId, ref),
      async recordRecent({ providerId, ref }) {
        try {
          const entry = await hubApiRef.current.recordRecent(providerId, ref)
          if (entry && entry.ref) {
            recentsGenerationRef.current += 1
            const recorded = {
              ...entry,
              provider: entry.provider ?? providerId,
              ref: entry.ref ?? ref,
            }
            setRecentsState((prev) => ({
              ...prev,
              status: 'ready',
              entries: placeRecent(prev.entries, recorded),
              error: null,
              // One recorded file is not a synced list. Keep the last full fetch
              // time so an empty cache stays stale and home still loads the rest.
              fetchedAt: prev.authoritative ? prev.fetchedAt : 0,
              authoritative: prev.authoritative === true,
            }))
            return entry
          }
          setRecentsState((prev) => ({ ...prev, fetchedAt: 0 }))
          return entry
        } catch (error) {
          setRecentsState((prev) => ({ ...prev, fetchedAt: 0 }))
          throw error
        }
      },
      async getReadSource({ providerId, ref, refresh = false }) {
        const key = itemCacheKey(providerId, ref)
        const cached = readDescriptorsRef.current.get(key)
        const known = itemCacheRef.current[key]?.item
        if (!refresh && cached && Date.parse(cached.authorizedUntil) > Date.now()
            && Date.parse(cached.expiresAt) > Date.now() + 5000
            && (!known?.contentRevision || known.contentRevision === cached.revision)) return cached
        const source = refresh
          ? await hubApiRef.current.getReadSource(providerId, ref, true)
          : await hubApiRef.current.getReadSource(providerId, ref)
        const descriptor = { ...source, userId: sessionRef.current?.user?.id, providerId,
          verifyRevision: async (target) => {
            const verified = await hubApiRef.current.getReadSource(providerId, ref, true)
            const matches = verified.revision === source.revision && verified.generation === source.generation && verified.connectionId === source.connectionId
            if (matches && target) target.authorizedUntil = verified.authorizedUntil
            return matches
          },
        }
        if (source.authorizedUntil) readDescriptorsRef.current.set(key, descriptor)
        return descriptor
      },
      async getDownloadUrl({ providerId, ref }) {
        const ticket = await hubApiRef.current.createContentTicket(providerId, ref, 'attachment')
        return ticket.url
      },
    }),
    [
      loadItem,
      loadShortcuts,
      markFolderStale,
      postHubEvent,
      removeItemFromCaches,
      renameItemNameInCaches,
      replaceOptimisticItem,
    ],
  )

  useEffect(() => {
    const unsubscribe = subscribeHubEvents((event) => {
      if (!event || event.type !== 'invalidate') return
      if (event.userId && event.userId !== sessionRef.current?.user?.id) return
      if (event.source && event.source === instanceIdRef.current) return
      if (event.scope === 'folder') {
        const keys = Array.isArray(event.keys) && event.keys.length > 0
          ? event.keys
          : Object.keys(folderCacheRef.current).filter((key) =>
            event.providerId ? key.startsWith(`${event.providerId}:`) : true,
          )
        keys.forEach((key) => {
          folderGenerationsRef.current[key] = (folderGenerationsRef.current[key] ?? 0) + 1
          setFolderCache((prev) => {
            const entry = prev[key]
            if (!entry) return prev
            return { ...prev, [key]: { ...entry, fetchedAt: 0, revalidating: false } }
          })
        })
      } else if (event.scope === 'item') {
        const keys = Array.isArray(event.keys) ? event.keys : []
        keys.forEach((key) => {
          itemGenerationsRef.current[key] = (itemGenerationsRef.current[key] ?? 0) + 1
          setItemCache((prev) => {
            const entry = prev[key]
            if (!entry) return prev
            return { ...prev, [key]: { ...entry, fetchedAt: 0 } }
          })
        })
      } else if (event.scope === 'recents') {
        setRecentsState((prev) => ({ ...prev, fetchedAt: 0 }))
      } else if (event.scope === 'shortcuts') {
        setShortcutsState((prev) => ({ ...prev, fetchedAt: 0 }))
      } else if (event.scope === 'provider' && event.providerId) {
        purgeProviderData(event.providerId)
      }
    })
    return unsubscribe
  }, [purgeProviderData])

  const refreshProvider = useCallback((providerId) => {
    readDescriptorsRef.current.clear()
    searchResultsRef.current.clear()
    for (const [key, entry] of Object.entries(folderCacheRef.current)) {
      if (!key.startsWith(`${providerId}:`) || !entry.loaded) continue
      const meta = keyMetaRef.current[key] ?? splitFolderKey(key)
      void loadFolderRef.current(providerId, meta.folderRef, null, { force: true }).catch(() => {})
    }
    setItemCache((previous) => Object.fromEntries(Object.entries(previous).map(([key, entry]) => [key,
      key.startsWith(`${providerId}:`) ? { ...entry, fetchedAt: 0 } : entry])))
    void loadRecents().catch(() => {})
    void loadShortcuts().catch(() => {})
  }, [loadRecents, loadShortcuts])

  operationCallbackRef.current = (operation) => {
    if (!operation?.id || !operation.request) return
    const request = operation.request
    const connection = providersRef.current.providers.find((provider) => provider.connectionId === request.connectionId)
    if (!connection || String(connection.generation) !== String(request.generation)) return
    const previous = observedOperationsRef.current.get(operation.id)
    if (previous && ['SUCCEEDED', 'REJECTED'].includes(previous.status) && previous.status !== operation.status) return
    if (previous && Date.parse(previous.updatedAt) > Date.parse(operation.updatedAt)) return
    const localId = `client:${request.clientKey}`
    const localIntent = observedOperationsRef.current.get(localId)
    const mergedOperation = { ...operation, localItem: operation.localItem ?? previous?.localItem ?? localIntent?.localItem }
    observedOperationsRef.current.set(operation.id, mergedOperation)
    if (operation.id !== localId) observedOperationsRef.current.delete(localId)
    setDurableOperations((current) => {
      const next = { ...current, [operation.id]: mergedOperation }
      if (operation.id !== localId) delete next[localId]
      return next
    })
    const creation = request.kind === 'CREATE_FOLDER' || request.kind === 'UPLOAD'
    if (creation) setFolderCache((previousFolders) => {
      const key = folderCacheKey(request.provider, request.parentRef || null)
      const entry = previousFolders[key]
      if (!entry?.items) return previousFolders
      let matched = false
      const next = entry.items.flatMap((item) => {
        const own = item._operationId === operation.id || !matched && !item._operationId && item.pending && item.provider === request.provider && item.name === request.name
        if (!own) return [item]
        matched = true
        if (operation.status === 'REJECTED') return []
        if (operation.status === 'SUCCEEDED' && operation.item) return [{ ...withUiKey(operation.item, item.uiKey), _operationId: operation.id }]
        return [{ ...item, _operationId: operation.id, unconfirmed: operation.status === 'NEEDS_ATTENTION' }]
      })
      if (!matched && operation.status === 'SUCCEEDED' && operation.item && !next.some((item) => item.ref === operation.item.ref)) {
        next.push(withUiKey(operation.item, `operation-${request.clientKey ?? operation.id}`))
      }
      return { ...previousFolders, [key]: { ...entry, items: dedupeItemsByRef(next) } }
    })
    if (operation.status === 'SUCCEEDED' && !creation && (previous || localIntent)) {
      if (request.kind === 'DELETE') removeItemFromCaches(request.provider, request.ref)
      else if (operation.item) {
        const updated = operation.item
        setItemCache((current) => {
          const key = itemCacheKey(request.provider, request.ref)
          const old = current[key]
          const moved = old?.item?.parentKnown && updated.parentKnown && old.item.parentRef !== updated.parentRef
          return { ...current, [key]: { ...old, item: { ...old?.item, ...withUiKey(updated, old?.item?.uiKey),
            ...(moved ? { ancestry: undefined } : {}), pending: false }, status: 'ready', complete: !moved && old?.complete === true, fetchedAt: moved ? 0 : Date.now() } }
        })
        setFolderCache((current) => Object.fromEntries(Object.entries(current).map(([key, entry]) => {
          if (!entry?.items) return [key, entry]
          const old = entry.items.find((item) => item.provider === request.provider && item.ref === request.ref)
          const remaining = entry.items.filter((item) => item.provider !== request.provider || item.ref !== request.ref)
          if (key === folderCacheKey(request.provider, updated.parentRef)) remaining.push(withUiKey(updated, old?.uiKey))
          return [key, { ...entry, items: remaining }]
        })))
      }
    }
    if (['SUCCEEDED', 'REJECTED'].includes(operation.status) && previous?.status !== operation.status) refreshProvider(request.provider)
  }

  const connectionsSignature = providersState.providers.filter((provider) => provider.connected && provider.connectionId)
    .map((provider) => `${provider.connectionId}:${provider.generation}`).join('|')
  useEffect(() => {
    if (!hydrated || !userId || !connectionsSignature || !hubApiRef.current.listOperations) return undefined
    let active = true
    let refreshTimer
    const pendingProviders = new Set()
    void hubApiRef.current.listOperations().then((operations) => {
      if (active) {
        for (const operation of operations ?? []) {
          if (!['SUCCEEDED', 'REJECTED'].includes(operation.status)) operationCallbackRef.current?.(operation)
          else {
            observedOperationsRef.current.set(operation.id, operation)
            setDurableOperations((current) => ({ ...current, [operation.id]: operation }))
          }
        }
        for (const provider of providersRef.current.providers) if (provider.connected) refreshProvider(provider.id)
      }
    }).catch(() => {})
    const stop = subscribeServerEvents(() => tokenRef.current, (event) => {
      if (event.type === 'reset') {
        for (const provider of providersRef.current.providers) if (provider.connected) refreshProvider(provider.id)
        return
      }
      const connection = providersRef.current.providers.find((provider) => provider.connectionId === event.connectionId)
      if (!connection || String(connection.generation) !== String(event.generation)) return
      if (event.type === 'operation') operationCallbackRef.current?.(event.payload)
      else {
        pendingProviders.add(connection.id)
        clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
          for (const id of pendingProviders) refreshProvider(id)
          pendingProviders.clear()
        }, 200)
      }
    })
    return () => { active = false; clearTimeout(refreshTimer); stop() }
  }, [hydrated, userId, connectionsSignature, refreshProvider])

  useEffect(() => {
    if (!hydrated || !userId || !connectionsSignature) return undefined
    let active = true
    let hoverTimer
    const prefetch = async (providerId, ref) => {
      const item = findCachedItem(folderCacheRef.current, itemCacheRef.current, providerId, ref)
      if (!active || !item || item.kind === 'folder' || item.size == null || item.size > 5 * 1024 * 1024 || navigator.connection?.saveData) return
      try {
        const descriptor = await actions.getReadSource({ providerId, ref })
        if (active) await prefetchContent(descriptor)
      } catch { /* Speculative work must not affect the current interaction. */ }
    }
    const consider = (event) => {
      const anchor = event.target?.closest?.('a[href]')
      if (!anchor) return
      const match = anchor.pathname.match(/\/providers\/([^/]+)\/file\/([^/]+)$/)
      if (!match) return
      clearTimeout(hoverTimer)
      hoverTimer = setTimeout(() => void prefetch(decodeURIComponent(match[1]), decodeURIComponent(match[2])), 200)
    }
    const cancel = () => clearTimeout(hoverTimer)
    const recentTimer = setTimeout(() => {
      for (const recent of recentsRef.current.entries.slice(0, 2)) void prefetch(recent.provider, recent.ref)
    }, 1500)
    document.addEventListener('pointerover', consider)
    document.addEventListener('focusin', consider)
    document.addEventListener('pointerout', cancel)
    document.addEventListener('focusout', cancel)
    return () => {
      active = false; clearTimeout(recentTimer); clearTimeout(hoverTimer)
      document.removeEventListener('pointerover', consider); document.removeEventListener('focusin', consider)
      document.removeEventListener('pointerout', cancel); document.removeEventListener('focusout', cancel)
    }
  }, [hydrated, userId, connectionsSignature])

  useEffect(() => {
    function revalidateStale() {
      const now = Date.now()
      Object.entries(folderCacheRef.current).forEach(([key, entry]) => {
        if (!entry?.loaded || entry.isFetchingNextPage) return
        if (!isStaleEntry(entry, FOLDER_STALE_MS, now)) return
        const meta = keyMetaRef.current[key] ?? splitFolderKey(key)
        if (!meta?.providerId) return
        if (isTempRef(meta.folderRef)) return
        void loadFolderRef.current(meta.providerId, meta.folderRef ?? null).catch(() => {})
      })
      if (isStaleEntry(providersRef.current, PROVIDERS_STALE_MS, now) && providersRef.current.status === 'ready') {
        void loadProviders().catch(() => {})
      }
      if (isStaleEntry(recentsRef.current, RECENTS_STALE_MS, now) && recentsRef.current.status === 'ready') {
        void loadRecents().catch(() => {})
      }
      if (isStaleEntry(shortcutsRef.current, SHORTCUTS_STALE_MS, now) && shortcutsRef.current.status === 'ready') {
        void loadShortcuts().catch(() => {})
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') revalidateStale()
    }
    window.addEventListener('focus', revalidateStale)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', revalidateStale)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [loadProviders, loadRecents, loadShortcuts])

  const projection = useMemo(() => projectOperations(folderCache, itemCache, durableOperations, providersState.providers), [folderCache, itemCache, durableOperations, providersState.providers])
  const value = useMemo(
    () => ({
      providersState,
      folderCache: projection.folderCache,
      itemCache: projection.itemCache,
      hydrated,
      recentsState,
      shortcutsState,
      searchState,
      setSearchState,
      loadProviders,
      loadFolder,
      loadItem,
      loadRecents,
      loadShortcuts,
      runSearch,
      connectProvider,
      disconnectProvider,
      actions,
      durableOperations,
    }),
    [
      actions,
      projection,
      hydrated,
      durableOperations,
      connectProvider,
      disconnectProvider,
      folderCache,
      itemCache,
      loadFolder,
      loadItem,
      loadProviders,
      loadRecents,
      loadShortcuts,
      providersState,
      recentsState,
      runSearch,
      searchState,
      shortcutsState,
    ],
  )

  return <HubDataContext.Provider value={value}>{children}</HubDataContext.Provider>
}

export function useHubDataContext() {
  const value = useContext(HubDataContext)
  if (!value) {
    throw new Error('Hub data hooks must be used within HubDataProvider')
  }
  return value
}
