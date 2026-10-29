import { ApiClientError, MAX_EDITABLE_TEXT_BYTES, editableTextTooLargeError } from '@bridgit/shared-client'
import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../auth/SessionContext.jsx'
import { createHubApi } from './hubApi.js'
import { loadCatalog, saveCatalog, clearConnectionStorage, putContent, getThumbnail as getStoredThumbnail, putThumbnail } from './storage/index.js'
import { clearThumbnailCache } from './thumbnailQueue.js'
import { insertSorted, projectOperations } from './operationProjection.js'
import { mergeRefreshPlans, planEventRefresh } from './hubEventPlan.js'
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
  flattenConnections,
  folderCacheKey,
  folderKeysContaining,
  isAmbiguousError,
  isGoneError,
  isStaleEntry,
  isTempRef,
  itemCacheKey,
  mergeFolderItems,
  mergeRecentsLists,
  placeRecent,
  withUiKey,
} from './hubCache.js'

const HubDataContext = createContext(null)

// How long an editor save stays recognised after it settles: a refusal can still arrive from the server.
const ATTENDED_SAVE_MS = 60_000

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
  return { connectionId: key.slice(0, index), folderRef: key.slice(index + 1) === 'root' ? null : key.slice(index + 1) }
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
  // Content saves an open editor reports on itself, by clientKey: the notices skip their refusals.
  const attendedSavesRef = useRef(new Map())
  const searchResultsRef = useRef(new Map())
  const observedOperationsRef = useRef(new Map())
  const tokenRef = useRef(session?.accessToken ?? null)
  tokenRef.current = session?.accessToken ?? null

  const [providersState, setProvidersState] = useState(emptyProvidersState)
  const [folderCache, setFolderCache] = useState({})
  const [itemCache, setItemCache] = useState({})
  const [recentsState, setRecentsState] = useState(emptyRecentsState)
  const [shortcutsState, setShortcutsState] = useState(emptyListState)
  const [publicLinksState, setPublicLinksState] = useState(emptyListState)
  const [searchState, setSearchState] = useState(emptySearchState)

  const folderCacheRef = useRef({})
  folderCacheRef.current = folderCache
  const itemCacheRef = useRef({})
  itemCacheRef.current = itemCache
  const recentsRef = useRef(recentsState)
  recentsRef.current = recentsState
  const shortcutsRef = useRef(shortcutsState)
  shortcutsRef.current = shortcutsState
  const publicLinksRef = useRef(publicLinksState)
  publicLinksRef.current = publicLinksState
  const providersRef = useRef(providersState)
  providersRef.current = providersState
  // The accounts, flat: everything below identifies an account by its connectionId, never by its provider.
  const connections = useMemo(() => flattenConnections(providersState.providers), [providersState.providers])
  const connectionsRef = useRef(connections)
  connectionsRef.current = connections

  const folderGenerationsRef = useRef({})
  const recentsRequestRef = useRef(0)
  const recentsGenerationRef = useRef(0)
  const itemGenerationsRef = useRef({})
  const keyMetaRef = useRef({})
  const inFlightFolderRef = useRef(new Map())
  const inFlightNextRef = useRef(new Map())
  const inFlightItemRef = useRef(new Map())
  const removeItemFromCachesRef = useRef(null)
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
      getConnection: (connectionId) => connectionsRef.current.find((item) => item.connectionId === connectionId),
      getItemVersion: (connectionId, ref) => {
        const pending = [...observedOperationsRef.current.values()].some((operation) => operation.request?.connectionId === connectionId && operation.request?.ref === ref && !['SUCCEEDED', 'REJECTED'].includes(operation.status))
        if (pending) return null
        const cached = findCachedItem(folderCacheRef.current, itemCacheRef.current, connectionId, ref)
        // A folder's version moves with its own contents and right after creation, so the cached one
        // goes stale at once and would reject the user's own rename or delete as "changed".
        return cached?.kind === 'folder' ? null : cached?.remoteVersion
      },
      // A save never adopts an older one that is still being verified: it carries its own revision.
      getUncertainOperation: (connectionId, kind, fields) => kind === 'REPLACE_CONTENT' ? undefined : [...observedOperationsRef.current.values()].find((operation) => {
        const request = operation.request
        return ['NEEDS_ATTENTION', 'VERIFYING', 'WAITING_RECONNECT'].includes(operation.status)
          && !operation.id.startsWith('client:') && request?.connectionId === connectionId && request.kind === kind
          && (request.ref ?? null) === (fields.ref ?? null) && (request.parentRef ?? null) === (fields.parentRef ?? null)
          && (request.name ?? null) === (fields.name ?? null)
      }),
      onOperation: (operation) => operationCallbackRef.current?.(operation),
      onIntent: (request, file) => operationCallbackRef.current?.({
        id: `client:${request.clientKey}`, request, status: 'SUBMITTING', updatedAt: new Date().toISOString(),
        localItem: file ? { name: file.name, size: file.size, mimeType: file.type, extension: file.name.includes('.') ? file.name.split('.').pop() : null } : null,
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
    // Previews shown this page session leave with the user too, not only the ones kept in IndexedDB.
    return () => { active = false; lifecycleRef.current += 1; readDescriptorsRef.current.clear(); clearThumbnailCache() }
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

  const markFolderStale = useCallback((key, connectionId = null) => {
    bumpFolderGeneration(key)
    setFolderCache((prev) => {
      const entry = prev[key]
      if (!entry) return prev
      return { ...prev, [key]: { ...entry, fetchedAt: 0, revalidating: false } }
    })
    if (connectionId) {
      postHubEvent({ type: 'invalidate', scope: 'folder', connectionId, keys: [key] })
    }
  }, [bumpFolderGeneration, postHubEvent])

  const upsertItemsCache = useCallback((items) => {
    if (!items?.length) return
    setItemCache((prev) => {
      const next = { ...prev }
      items.forEach((item) => {
        const key = itemCacheKey(item.connectionId, item.ref)
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

  const loadFolderNext = useCallback(async (connectionId, folderRef, cursor) => {
    const key = folderCacheKey(connectionId, folderRef)
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
        const data = await hubApiRef.current.listFolder(connectionId, folderRef, cursor)
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
          await loadFolderRef.current(connectionId, folderRef, null, { force: true })
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

  // Where an open item that turned out to be gone sends the user: its folder if any screen knows it,
  // otherwise the account root.
  const knownParentRef = (connectionId, ref) => {
    const item = itemCacheRef.current[itemCacheKey(connectionId, ref)]?.item
    if (item?.parentKnown) return item.parentRef ?? null
    const folder = folderCacheRef.current[folderCacheKey(connectionId, ref)]?.folder
    if (Array.isArray(folder?.ancestry)) return folder.ancestry.at(-1)?.ref ?? null
    for (const [key, entry] of Object.entries(folderCacheRef.current)) {
      if (entry?.items?.some((candidate) => candidate.connectionId === connectionId && candidate.ref === ref)) {
        return (keyMetaRef.current[key] ?? splitFolderKey(key))?.folderRef ?? null
      }
    }
    return null
  }

  // The provider confirmed the item no longer exists: it leaves every list now, without waiting for the
  // server's event, and the page showing it learns where to go.
  const markItemGone = (connectionId, ref, error) => {
    const parentRef = knownParentRef(connectionId, ref)
    removeItemFromCachesRef.current?.(connectionId, ref)
    setItemCache((prev) => ({ ...prev, [itemCacheKey(connectionId, ref)]: { status: 'gone', item: null, parentRef, error } }))
  }

  const loadFolder = useCallback(async (connectionId, folderRef, cursor = null, opts = {}) => {
    if (cursor) return loadFolderNext(connectionId, folderRef, cursor)
    const key = folderCacheKey(connectionId, folderRef)
    keyMetaRef.current[key] = { connectionId, folderRef }
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
        let data = await hubApiRef.current.listFolder(connectionId, folderRef, null)
        const visibleCount = (prev?.items ?? []).filter((item) => !isTempRef(item.ref)).length
        while (data.catalog && data.nextCursor && (data.items?.length ?? 0) < visibleCount) {
          if ((folderGenerationsRef.current[key] ?? 0) !== captured) return
          const continuation = await hubApiRef.current.listFolder(connectionId, folderRef, data.nextCursor)
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
        if (folderRef && isGoneError(error)) {
          const parentRef = knownParentRef(connectionId, folderRef)
          removeItemFromCachesRef.current?.(connectionId, folderRef)
          setFolderCache((prevCache) => ({
            ...prevCache,
            [key]: { ...(prevCache[key] ?? {}), status: 'gone', items: [], nextCursor: null, parentRef, error, revalidating: false, isFetchingNextPage: false },
          }))
          return
        }
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

  const loadItem = useCallback(async (connectionId, ref) => {
    const key = itemCacheKey(connectionId, ref)
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
        const item = withUiKey(await hubApiRef.current.getItem(connectionId, ref))
        if ((itemGenerationsRef.current[key] ?? 0) !== captured) return
        setItemCache((prev) => ({
          ...prev,
          [key]: { status: 'ready', item, error: null, complete: true, fetchedAt: Date.now(), generation: captured },
        }))
      } catch (error) {
        if ((itemGenerationsRef.current[key] ?? 0) !== captured) return
        if (isGoneError(error)) {
          markItemGone(connectionId, ref, error)
          return
        }
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
      // An account that left, or came back under a new generation, takes its own data with it; the other
      // accounts (even of the same provider) keep theirs.
      const nextConnections = flattenConnections(providers)
      for (const previous of connectionsRef.current) {
        const current = nextConnections.find((connection) => connection.connectionId === previous.connectionId)
        if (!current || current.generation !== previous.generation) {
          lifecycleRef.current += 1
          purgeConnectionData(previous.connectionId)
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

  const loadPublicLinks = useCallback(async (opts = {}) => {
    const prev = publicLinksRef.current
    const background = prev.status === 'ready' && !opts.force
    if (!background) {
      setPublicLinksState((current) => ({ ...current, status: 'loading', error: null }))
    }
    try {
      const entries = await hubApiRef.current.listPublicLinks()
      setPublicLinksState({ status: 'ready', entries: entries ?? [], error: null, fetchedAt: Date.now() })
    } catch (error) {
      setPublicLinksState((current) => ({
        ...current,
        status: current.status === 'ready' ? 'ready' : 'error',
        error,
        fetchedAt: Date.now(),
      }))
    }
  }, [])

  const runSearch = useCallback(
    // The catalog answers in a few dozen milliseconds, so the answer is published once: no first pass with
    // what the local caches hold, which drew the list twice and reordered it. It goes out as a transition,
    // rendered in slices, so the screen keeps animating (Início folds its actions while a search starts).
    async (query, requestId) => {
      try {
        const cached = searchResultsRef.current.get(query)
        const data = cached && cached.until > Date.now() ? cached.data : await hubApiRef.current.search(query)
        searchResultsRef.current.set(query, { data, until: Date.now() + 60000 })
        const results = mapFolderItems(data.results ?? [])
        // An answer to an older query that arrives late never replaces a newer one.
        startTransition(() => {
          setSearchState((prev) => (prev.requestId > requestId ? prev : {
            status: 'ready',
            results,
            providers: data.providers ?? [],
            error: null,
            requestId,
          }))
          upsertItemsCache(results)
        })
      } catch (error) {
        setSearchState((prev) => (prev.requestId > requestId ? prev : {
          ...prev,
          status: 'error',
          error,
          requestId,
        }))
      }
    },
    [upsertItemsCache],
  )

  const connectProvider = useCallback(
    async (provider, redirectTo, options) => {
      const { authorizationUrl } = await hubApiRef.current.connectProvider(provider, redirectTo, options)
      window.location.assign(authorizationUrl)
    },
    [],
  )

  const purgeConnectionData = useCallback((connectionId) => {
    const prefix = `${connectionId}:`
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
      entries: (prev.entries ?? []).filter((entry) => entry.connectionId !== connectionId),
      fetchedAt: 0,
    }))
    setShortcutsState((prev) => ({
      ...prev,
      entries: (prev.entries ?? []).filter((entry) => entry.connectionId !== connectionId),
      fetchedAt: 0,
    }))
    setPublicLinksState((prev) => ({
      ...prev,
      entries: (prev.entries ?? []).filter((entry) => entry.connectionId !== connectionId),
      fetchedAt: 0,
    }))
    setSearchState((prev) => ({
      ...prev,
      results: (prev.results ?? []).filter((item) => item.connectionId !== connectionId),
    }))
    searchResultsRef.current.clear()
  }, [])

  // The accounts are gone for good: their data leaves memory and the kept storage, and the other tabs are told.
  const forgetConnections = useCallback((connectionIds, providers) => {
    lifecycleRef.current += 1
    readDescriptorsRef.current.clear()
    setProvidersState({ status: 'ready', providers, error: null, fetchedAt: Date.now() })
    for (const connectionId of connectionIds) {
      void clearConnectionStorage(sessionRef.current?.user?.id, connectionId)
      purgeConnectionData(connectionId)
      postHubEvent({ type: 'invalidate', scope: 'connection', connectionId, keys: [] })
    }
    void loadRecents({ force: true }).catch(() => {})
    void loadShortcuts({ force: true }).catch(() => {})
    void loadPublicLinks({ force: true }).catch(() => {})
  }, [loadPublicLinks, loadRecents, loadShortcuts, postHubEvent, purgeConnectionData])

  // Disconnects every account of the provider. The ids are captured before the request: its answer no
  // longer lists them.
  const disconnectProvider = useCallback(
    async (provider) => {
      const connectionIds = connectionsRef.current
        .filter((connection) => connection.provider === provider)
        .map((connection) => connection.connectionId)
      const providers = await hubApiRef.current.disconnectProvider(provider)
      forgetConnections(connectionIds, providers)
      return providers
    },
    [forgetConnections],
  )

  const disconnectConnection = useCallback(
    async (connectionId) => {
      const providers = await hubApiRef.current.disconnectConnection(connectionId)
      forgetConnections([connectionId], providers)
      return providers
    },
    [forgetConnections],
  )

  const renameItemNameInCaches = useCallback((connectionId, ref, name, opId = null) => {
    setFolderCache((prev) => {
      const next = { ...prev }
      Object.entries(next).forEach(([key, entry]) => {
        if (!entry?.items?.length) return
        next[key] = {
          ...entry,
          items: entry.items.map((item) =>
            item.connectionId === connectionId && item.ref === ref
              ? { ...item, name, ...(opId ? { _op: opId } : {}) }
              : item,
          ),
        }
      })
      return next
    })

    setItemCache((prev) => {
      const key = itemCacheKey(connectionId, ref)
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
        entry.connectionId === connectionId && entry.ref === ref ? { ...entry, name } : entry,
      ),
    }))

    setShortcutsState((prev) => ({
      ...prev,
      entries: prev.entries.map((entry) =>
        entry.connectionId === connectionId && entry.ref === ref ? { ...entry, name } : entry,
      ),
    }))
  }, [])

  const removeItemFromCaches = useCallback((connectionId, ref) => {
    setFolderCache((prev) => {
      const next = { ...prev }
      Object.entries(next).forEach(([key, entry]) => {
        if (!entry?.items?.length) return
        const filtered = entry.items.filter(
          (item) => !(item.connectionId === connectionId && item.ref === ref),
        )
        if (filtered.length !== entry.items.length) {
          next[key] = { ...entry, items: filtered }
        }
      })
      return next
    })

    setItemCache((prev) => {
      const key = itemCacheKey(connectionId, ref)
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

    setRecentsState((prev) => ({
      ...prev,
      entries: prev.entries.filter((entry) => !(entry.connectionId === connectionId && entry.ref === ref)),
    }))

    setShortcutsState((prev) => ({
      ...prev,
      entries: prev.entries.filter((entry) => !(entry.connectionId === connectionId && entry.ref === ref)),
    }))

    setSearchState((prev) => ({
      ...prev,
      results: (prev.results ?? []).filter((item) => !(item.connectionId === connectionId && item.ref === ref)),
    }))
  }, [])
  removeItemFromCachesRef.current = removeItemFromCaches

  // A saved text keeps its place everywhere: only size, dates and revisions change, never the order or the parent.
  const applyContentSaved = useCallback((connectionId, ref, saved) => {
    if (!saved) return
    const patch = {}
    for (const field of ['size', 'modifiedAt', 'remoteVersion', 'contentRevision']) {
      if (saved[field] !== undefined) patch[field] = saved[field]
    }
    const matches = (item) => item.connectionId === connectionId && item.ref === ref
    readDescriptorsRef.current.delete(itemCacheKey(connectionId, ref))
    setItemCache((prev) => {
      const key = itemCacheKey(connectionId, ref)
      const entry = prev[key]
      if (!entry?.item) return prev
      return { ...prev, [key]: { ...entry, item: { ...entry.item, ...patch } } }
    })
    setFolderCache((prev) => {
      let next = prev
      for (const [key, entry] of Object.entries(prev)) {
        if (!entry?.items?.some(matches)) continue
        if (next === prev) next = { ...prev }
        next[key] = { ...entry, items: entry.items.map((item) => (matches(item) ? { ...item, ...patch } : item)) }
      }
      return next
    })
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
      delete next[itemCacheKey(serverItem.connectionId, uiKey)]
      next[itemCacheKey(serverItem.connectionId, serverItem.ref)] = {
        status: 'ready',
        item: nextItem,
        error: null,
        complete: false,
        fetchedAt: Date.now(),
        generation: itemGenerationsRef.current[itemCacheKey(serverItem.connectionId, serverItem.ref)] ?? 0,
      }
      return next
    })
  }, [])

  function refetchFolderKeys(keys) {
    keys.forEach((key) => {
      const meta = keyMetaRef.current[key] ?? splitFolderKey(key)
      if (!meta?.connectionId) return
      const folderRef = meta.folderRef ?? null
      void loadFolderRef.current(meta.connectionId, folderRef, null, { force: true }).catch(() => {})
    })
  }

  function providerOf(connectionId) {
    return connectionsRef.current.find((item) => item.connectionId === connectionId)?.provider ?? null
  }

  function durableEnabled(connectionId) {
    const connection = connectionsRef.current.find((item) => item.connectionId === connectionId)
    return Boolean(connection?.connectionId && connection.operationsEnabled !== false)
  }

  // Keys a kept preview to the user, the connection and the file revision, so a sign-out,
  // a reconnect or an edit never shows a stale one. Null when nothing durable can be keyed.
  function thumbnailDescriptor(connectionId, ref, revision) {
    const connection = connectionsRef.current.find((item) => item.connectionId === connectionId)
    const userId = sessionRef.current?.user?.id
    if (!userId || !connection?.connectionId || connection.generation == null || !ref || !revision) return null
    return { userId, connectionId: connection.connectionId, provider: connection.provider, generation: connection.generation, ref, revision }
  }

  async function seedUploadedContent(connectionId, item, file) {
    try {
      const descriptor = await hubApiRef.current.getReadSource(connectionId, item.ref)
      if (descriptor?.variant !== 'ORIGINAL' || descriptor.revision !== item.contentRevision || descriptor.size !== file.size) return
      await putContent({ ...descriptor, userId: sessionRef.current?.user?.id }, file)
    } catch { /* Upload success is independent of optional local caching. */ }
  }

  const actions = useMemo(
    () => ({
      // The account's picture (bytes change with its generation).
      getConnectionAvatar: (connectionId, generation) => hubApiRef.current.getConnectionAvatar(connectionId, generation),
      getOperationError(connectionId) {
        const errors = [...observedOperationsRef.current.values()].filter((operation) => {
          const request = operation.request
          // The editor shows its own save errors.
          if (request?.kind === 'REPLACE_CONTENT') return false
          const connection = connectionsRef.current.find((item) => item.connectionId === request?.connectionId)
          return connection && connection.generation === request.generation && (!connectionId || request.connectionId === connectionId)
            && ['NEEDS_ATTENTION', 'WAITING_RECONNECT'].includes(operation.status)
        }).sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        return errors[0]?.errorMessage ?? null
      },
      async createFolder({ connectionId, parentRef, name, onAccepted, clientKey }) {
        if (durableEnabled(connectionId)) return hubApiRef.current.createFolder(connectionId, parentRef, name, { onAccepted, clientKey })
        const folderKey = folderCacheKey(connectionId, parentRef)
        keyMetaRef.current[folderKey] = { connectionId, folderRef: parentRef ?? null }
        const opId = nextOpId()
        const placeholder = {
          ...createTempItem({ connectionId, provider: providerOf(connectionId), name, kind: 'folder', parentRef }, clientKey ? `operation-${clientKey}` : null),
          _op: opId,
        }

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
          const created = await hubApiRef.current.createFolder(connectionId, parentRef, name)
          replaceOptimisticItem(folderKey, placeholder.uiKey, created)
          setFolderCache((prev) => {
            const entry = prev[folderKey]
            if (!entry) return prev
            return { ...prev, [folderKey]: { ...entry, fetchedAt: Date.now() } }
          })
          postHubEvent({ type: 'invalidate', scope: 'folder', connectionId, keys: [folderKey] })
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
            markFolderStale(folderKey, connectionId)
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

      async uploadFiles({ connectionId, parentRef, files }) {
        if (durableEnabled(connectionId)) {
          const uploaded = []
          const failed = []
          for (const file of Array.from(files ?? [])) {
            try {
              const item = await hubApiRef.current.uploadFile(connectionId, parentRef, file)
              uploaded.push(item)
              if (item?.contentRevision) void seedUploadedContent(connectionId, item, file)
            }
            catch (error) { failed.push({ file, error, ambiguous: isAmbiguousError(error) }) }
          }
          if (failed.length) throw new HubUploadError(buildUploadErrorMessage(uploaded.length, uploaded.length + failed.length, failed), { uploaded, failed })
          return uploaded
        }
        const folderKey = folderCacheKey(connectionId, parentRef)
        keyMetaRef.current[folderKey] = { connectionId, folderRef: parentRef ?? null }
        const list = Array.from(files ?? [])
        const placeholders = list.map((file) => ({
          ...createTempItem({
            connectionId,
            provider: providerOf(connectionId),
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
            const created = await hubApiRef.current.uploadFile(connectionId, parentRef, file)
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
            markFolderStale(folderKey, connectionId)
            refetchFolderKeys([folderKey])
          } else {
            postHubEvent({ type: 'invalidate', scope: 'folder', connectionId, keys: [folderKey] })
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
        postHubEvent({ type: 'invalidate', scope: 'folder', connectionId, keys: [folderKey] })
        return uploaded
      },

      // Saves the edited text of an existing file. baseRevision is the content revision the editor opened;
      // overwrite adopts the cloud's current one instead, after the user chose to replace what changed there.
      async saveFileContent({ connectionId, ref, file, baseRevision, overwrite = false, isAttended }) {
        if (file?.size > MAX_EDITABLE_TEXT_BYTES) throw editableTextTooLargeError()
        const expected = overwrite
          ? (await actions.getReadSource({ connectionId, ref, refresh: true }))?.revision
          : baseRevision
        if (!expected) throw new ApiClientError('Este arquivo não pode ser editado aqui.', { code: 'EDICAO_INDISPONIVEL', status: 409 })
        const registered = new Map()
        // A refusal can reach the notices after the save settled, so the entries outlive it for a while.
        const pruneLater = () => setTimeout(() => {
          for (const [key, entry] of registered) if (attendedSavesRef.current.get(key) === entry) attendedSavesRef.current.delete(key)
        }, ATTENDED_SAVE_MS)
        let item
        try {
          item = await hubApiRef.current.replaceFileContent(connectionId, ref, file, expected, {
            onRequest: (request) => {
              const entry = { isAttended }
              registered.set(request.clientKey, entry)
              attendedSavesRef.current.set(request.clientKey, entry)
            },
          })
        } catch (error) {
          pruneLater()
          throw error
        }
        pruneLater()
        applyContentSaved(connectionId, ref, item)
        if (item?.contentRevision) void seedUploadedContent(connectionId, item, file)
        return { item, revision: item?.contentRevision }
      },

      isOperationAttended(operation) {
        return Boolean(attendedSavesRef.current.get(operation?.request?.clientKey)?.isAttended?.())
      },

      async renameItem({ connectionId, ref, name }) {
        if (durableEnabled(connectionId)) return hubApiRef.current.updateItem(connectionId, ref, { name })
        const opId = nextOpId()
        const previousName =
          itemCacheRef.current[itemCacheKey(connectionId, ref)]?.item?.name ??
          findCachedItem(folderCacheRef.current, itemCacheRef.current, connectionId, ref)?.name ??
          name

        renameItemNameInCaches(connectionId, ref, name, opId)

        try {
          const updated = await hubApiRef.current.updateItem(connectionId, ref, { name })
          setFolderCache((prev) => {
            const next = { ...prev }
            Object.entries(next).forEach(([key, entry]) => {
              if (!entry?.items) return
              next[key] = {
                ...entry,
                items: entry.items.map((item) => {
                  if (!(item.connectionId === connectionId && item.ref === ref)) return item
                  const clean = { ...item, ...withUiKey(updated, item.uiKey) }
                  delete clean._op
                  return clean
                }),
              }
            })
            return next
          })
          setItemCache((prev) => {
            const key = itemCacheKey(connectionId, ref)
            const current = prev[key]?.item
            const clean = { ...current, ...withUiKey(updated, current?.uiKey ?? itemCacheKey(connectionId, ref)) }
            delete clean._op
            return {
              ...prev,
              [key]: { status: 'ready', item: clean, error: null, complete: prev[key]?.complete === true, fetchedAt: Date.now(), generation: itemGenerationsRef.current[key] ?? 0 },
            }
          })
          postHubEvent({ type: 'invalidate', scope: 'item', connectionId, keys: [itemCacheKey(connectionId, ref)] })
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
                    item.connectionId === connectionId && item.ref === ref
                      ? { ...item, unconfirmed: true }
                      : item,
                  ),
                }
              })
              return next
            })
            const keys = folderKeysContaining(folderCacheRef.current, connectionId, ref)
            keys.forEach((key) => markFolderStale(key, connectionId))
            const itemKey = itemCacheKey(connectionId, ref)
            itemGenerationsRef.current[itemKey] = (itemGenerationsRef.current[itemKey] ?? 0) + 1
            refetchFolderKeys(keys)
            void loadItem(connectionId, ref).catch(() => {})
          } else {
            setFolderCache((prev) => {
              const next = { ...prev }
              Object.entries(next).forEach(([key, entry]) => {
                if (!entry?.items?.length) return
                next[key] = {
                  ...entry,
                  items: entry.items.map((item) => {
                    if (!(item.connectionId === connectionId && item.ref === ref)) return item
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
              const key = itemCacheKey(connectionId, ref)
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
                entry.connectionId === connectionId && entry.ref === ref ? { ...entry, name: previousName } : entry,
              ),
            }))
            setShortcutsState((prev) => ({
              ...prev,
              entries: prev.entries.map((entry) =>
                entry.connectionId === connectionId && entry.ref === ref ? { ...entry, name: previousName } : entry,
              ),
            }))
          }
          throw error
        }
      },

      async moveItem({ connectionId, ref, parentRef }) {
        if (durableEnabled(connectionId)) return hubApiRef.current.updateItem(connectionId, ref, { parentRef })
        const opId = nextOpId()
        const destKey = parentRef === undefined ? null : folderCacheKey(connectionId, parentRef)
        if (destKey) keyMetaRef.current[destKey] = { connectionId, folderRef: parentRef ?? null }
        const movingItem =
          itemCacheRef.current[itemCacheKey(connectionId, ref)]?.item ??
          findCachedItem(folderCacheRef.current, itemCacheRef.current, connectionId, ref)

        if (!movingItem) {
          const updated = await hubApiRef.current.updateItem(connectionId, ref, { parentRef })
          return withUiKey(updated)
        }

        const sourceKeys = folderKeysContaining(folderCacheRef.current, connectionId, ref)
        const removedByKey = {}
        sourceKeys.forEach((key) => {
          const entry = folderCacheRef.current[key]
          const index = (entry?.items ?? []).findIndex(
            (item) => item.connectionId === connectionId && item.ref === ref,
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
              items: source.items.filter((item) => !(item.connectionId === connectionId && item.ref === ref)),
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
          const updated = await hubApiRef.current.updateItem(connectionId, ref, { parentRef })
          if (destKey) {
            setFolderCache((prev) => {
              const dest = prev[destKey]
              if (!dest?.items) return prev
              return {
                ...prev,
                [destKey]: {
                  ...dest,
                  items: dest.items.map((item) => {
                    if (!(item.connectionId === connectionId && item.ref === ref)) return item
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
            const key = itemCacheKey(connectionId, ref)
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
          postHubEvent({ type: 'invalidate', scope: 'folder', connectionId, keys: [...sourceKeys, ...(destKey ? [destKey] : [])] })
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
                    item.connectionId === connectionId && item.ref === ref
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
                const current = dest.items.find((item) => item.connectionId === connectionId && item.ref === ref)
                if (current && (!current._op || current._op === opId)) {
                  next[destKey] = {
                    ...dest,
                    items: dest.items.filter((item) => !(item.connectionId === connectionId && item.ref === ref)),
                  }
                }
              }
              Object.entries(removedByKey).forEach(([key, { item, index }]) => {
                const entry = next[key]
                if (!entry) return
                const stillThere = (entry.items ?? []).some(
                  (candidate) => candidate.connectionId === connectionId && candidate.ref === ref,
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

      async deleteItem({ connectionId, ref, onAccepted }) {
        if (durableEnabled(connectionId)) return hubApiRef.current.deleteItem(connectionId, ref, { onAccepted })
        const sourceKeys = folderKeysContaining(folderCacheRef.current, connectionId, ref)
        const removedByKey = {}
        sourceKeys.forEach((key) => {
          const entry = folderCacheRef.current[key]
          const index = (entry?.items ?? []).findIndex(
            (item) => item.connectionId === connectionId && item.ref === ref,
          )
          if (index >= 0) removedByKey[key] = { item: entry.items[index], index }
        })
        const itemSnapshot = itemCacheRef.current[itemCacheKey(connectionId, ref)]
        const recentsRemoved = (recentsRef.current.entries ?? []).find(
          (entry) => entry.connectionId === connectionId && entry.ref === ref,
        )
        const shortcutsRemoved = (shortcutsRef.current.entries ?? []).find(
          (entry) => entry.connectionId === connectionId && entry.ref === ref,
        )

        removeItemFromCaches(connectionId, ref)

        try {
          await hubApiRef.current.deleteItem(connectionId, ref)
          postHubEvent({ type: 'invalidate', scope: 'folder', connectionId, keys: sourceKeys })
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
            const itemKey = itemCacheKey(connectionId, ref)
            itemGenerationsRef.current[itemKey] = (itemGenerationsRef.current[itemKey] ?? 0) + 1
            refetchFolderKeys(affected.filter((key) => keyMetaRef.current[key] || splitFolderKey(key)))
          } else {
            setFolderCache((prev) => {
              const next = { ...prev }
              Object.entries(removedByKey).forEach(([key, { item, index }]) => {
                const entry = next[key] ?? { items: [] }
                const stillThere = (entry.items ?? []).some(
                  (candidate) => candidate.connectionId === connectionId && candidate.ref === ref,
                )
                if (stillThere) return
                const items = [...(entry.items ?? [])]
                items.splice(Math.min(index, items.length), 0, item)
                next[key] = { ...entry, items }
              })
              return next
            })
            if (itemSnapshot) {
              setItemCache((prev) => ({ ...prev, [itemCacheKey(connectionId, ref)]: itemSnapshot }))
            }
            if (recentsRemoved) {
              setRecentsState((prev) => {
                const stillThere = (prev.entries ?? []).some(
                  (entry) => entry.connectionId === connectionId && entry.ref === ref,
                )
                if (stillThere) return prev
                return { ...prev, entries: [recentsRemoved, ...(prev.entries ?? [])] }
              })
            }
            if (shortcutsRemoved) {
              setShortcutsState((prev) => {
                const stillThere = (prev.entries ?? []).some(
                  (entry) => entry.connectionId === connectionId && entry.ref === ref,
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
          (entry) => entry.connectionId === item.connectionId && entry.ref === item.ref,
        )
        const removedEntry = (shortcutsRef.current.entries ?? []).find(
          (entry) => entry.connectionId === item.connectionId && entry.ref === item.ref,
        )

        if (exists) {
          setShortcutsState((prev) => ({
            ...prev,
            entries: prev.entries.filter(
              (entry) => !(entry.connectionId === item.connectionId && entry.ref === item.ref),
            ),
          }))
          try {
            await hubApiRef.current.removeShortcut(item.connectionId, item.ref)
            postHubEvent({ type: 'invalidate', scope: 'shortcuts', connectionId: item.connectionId, keys: [] })
          } catch (error) {
            if (isAmbiguousError(error)) {
              setShortcutsState((prev) => ({ ...prev, fetchedAt: 0 }))
              void loadShortcuts({ force: true }).catch(() => {})
            } else if (removedEntry) {
              setShortcutsState((prev) => {
                const stillThere = prev.entries.some(
                  (entry) => entry.connectionId === item.connectionId && entry.ref === item.ref,
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
          connectionId: item.connectionId,
          provider: item.provider ?? providerOf(item.connectionId),
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
          const created = await hubApiRef.current.addShortcut(item.connectionId, item.ref)
          setShortcutsState((prev) => ({
            ...prev,
            entries: prev.entries.map((entry) =>
              entry.connectionId === item.connectionId && entry.ref === item.ref ? created : entry,
            ),
            fetchedAt: Date.now(),
          }))
          postHubEvent({ type: 'invalidate', scope: 'shortcuts', connectionId: item.connectionId, keys: [] })
          return created
        } catch (error) {
          if (isAmbiguousError(error)) {
            setShortcutsState((prev) => ({ ...prev, fetchedAt: 0 }))
            void loadShortcuts({ force: true }).catch(() => {})
          } else {
            setShortcutsState((prev) => ({
              ...prev,
              entries: prev.entries.filter(
                (entry) => !(entry.connectionId === item.connectionId && entry.ref === item.ref),
              ),
            }))
          }
          throw error
        }
      },

      getPublicLink: ({ connectionId, ref }) => hubApiRef.current.getPublicLink(connectionId, ref),
      async enablePublicLink({ connectionId, ref }) {
        const link = await hubApiRef.current.enablePublicLink(connectionId, ref)
        void loadPublicLinks({ force: true }).catch(() => {})
        postHubEvent({ type: 'invalidate', scope: 'publicLinks', connectionId, keys: [] })
        return link
      },
      async disablePublicLink({ connectionId, ref }) {
        const result = await hubApiRef.current.disablePublicLink(connectionId, ref)
        setPublicLinksState((prev) => ({
          ...prev,
          entries: prev.entries.filter((entry) => !(entry.connectionId === connectionId && entry.ref === ref)),
        }))
        postHubEvent({ type: 'invalidate', scope: 'publicLinks', connectionId, keys: [] })
        return result
      },
      async recordRecent({ connectionId, ref }) {
        try {
          const entry = await hubApiRef.current.recordRecent(connectionId, ref)
          if (entry && entry.ref) {
            recentsGenerationRef.current += 1
            const recorded = {
              ...entry,
              connectionId: entry.connectionId ?? connectionId,
              provider: entry.provider ?? providerOf(connectionId),
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
      // The preview this browser kept for that revision: { blob }, { missing: true } or null.
      async getStoredThumbnail(connectionId, ref, revision) {
        const descriptor = thumbnailDescriptor(connectionId, ref, revision)
        return descriptor ? getStoredThumbnail(descriptor) : null
      },
      // keep: false shows a preview the cloud may still be redrawing without storing it under this revision.
      async getThumbnail(connectionId, ref, revision, { keep = true } = {}) {
        const descriptor = keep ? thumbnailDescriptor(connectionId, ref, revision) : null
        try {
          const blob = await hubApiRef.current.getThumbnail(connectionId, ref)
          if (descriptor) void putThumbnail(descriptor, blob)
          return blob
        } catch (error) {
          if (descriptor && error?.status === 404) void putThumbnail(descriptor, null)
          throw error
        }
      },
      async getReadSource({ connectionId, ref, refresh = false }) {
        const key = itemCacheKey(connectionId, ref)
        const cached = readDescriptorsRef.current.get(key)
        const known = itemCacheRef.current[key]?.item
        if (!refresh && cached && Date.parse(cached.authorizedUntil) > Date.now()
            && Date.parse(cached.expiresAt) > Date.now() + 5000
            && (!known?.contentRevision || known.contentRevision === cached.revision)) return cached
        let source
        try {
          source = refresh
            ? await hubApiRef.current.getReadSource(connectionId, ref, true)
            : await hubApiRef.current.getReadSource(connectionId, ref)
        } catch (error) {
          if (isGoneError(error)) markItemGone(connectionId, ref, error)
          throw error
        }
        // The descriptor names the real provider (the connection key says nothing about it): readers decide
        // provider-specific fallbacks from it.
        const provider = source.provider ?? providerOf(connectionId)
        const descriptor = { ...source, userId: sessionRef.current?.user?.id, provider, providerId: provider,
          verifyRevision: async (target) => {
            const verified = await hubApiRef.current.getReadSource(connectionId, ref, true)
            const matches = verified.revision === source.revision && verified.generation === source.generation && verified.connectionId === source.connectionId
            if (matches && target) target.authorizedUntil = verified.authorizedUntil
            return matches
          },
        }
        if (source.authorizedUntil) readDescriptorsRef.current.set(key, descriptor)
        return descriptor
      },
      async getDownloadUrl({ connectionId, ref }) {
        const ticket = await hubApiRef.current.createContentTicket(connectionId, ref, 'attachment')
        return ticket.url
      },
      // A folder downloads packed as .zip, assembled by the API while it streams.
      async getFolderDownloadUrl({ connectionId, ref }) {
        const ticket = await hubApiRef.current.createContentTicket(connectionId, ref, 'archive')
        return ticket.url
      },
    }),
    [
      applyContentSaved,
      loadItem,
      loadPublicLinks,
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
            event.connectionId ? key.startsWith(`${event.connectionId}:`) : true,
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
      } else if (event.scope === 'publicLinks') {
        setPublicLinksState((prev) => ({ ...prev, fetchedAt: 0 }))
      } else if (event.scope === 'connection' && event.connectionId) {
        purgeConnectionData(event.connectionId)
      }
    })
    return unsubscribe
  }, [purgeConnectionData])

  const refreshConnection = useCallback((connectionId) => {
    readDescriptorsRef.current.clear()
    searchResultsRef.current.clear()
    for (const [key, entry] of Object.entries(folderCacheRef.current)) {
      if (!key.startsWith(`${connectionId}:`) || !entry.loaded) continue
      const meta = keyMetaRef.current[key] ?? splitFolderKey(key)
      void loadFolderRef.current(connectionId, meta.folderRef, null, { force: true }).catch(() => {})
    }
    setItemCache((previous) => Object.fromEntries(Object.entries(previous).map(([key, entry]) => [key,
      key.startsWith(`${connectionId}:`) ? { ...entry, fetchedAt: 0 } : entry])))
    void loadRecents().catch(() => {})
    void loadShortcuts().catch(() => {})
    void loadPublicLinks().catch(() => {})
  }, [loadPublicLinks, loadRecents, loadShortcuts])

  // Applies a refresh plan to one account: only the folders it names (if they are open) and the home lists.
  const applyRefreshPlan = useCallback((connectionId, plan) => {
    if (plan.all) {
      refreshConnection(connectionId)
      return
    }
    const keys = new Set()
    for (const folderRef of plan.folders) keys.add(folderCacheKey(connectionId, folderRef))
    for (const ref of plan.containing) for (const key of folderKeysContaining(folderCacheRef.current, connectionId, ref)) keys.add(key)
    for (const key of keys) {
      if (!folderCacheRef.current[key]?.loaded) continue
      const meta = keyMetaRef.current[key] ?? splitFolderKey(key)
      void loadFolderRef.current(connectionId, meta.folderRef, null, { force: true }).catch(() => {})
    }
    if (plan.containing.size > 0) {
      setItemCache((previous) => {
        let next = previous
        for (const ref of plan.containing) {
          const key = itemCacheKey(connectionId, ref)
          if (!previous[key]) continue
          if (next === previous) next = { ...previous }
          next[key] = { ...previous[key], fetchedAt: 0 }
        }
        return next
      })
    }
    if (plan.home) {
      void loadRecents().catch(() => {})
      void loadShortcuts().catch(() => {})
      void loadPublicLinks().catch(() => {})
    }
  }, [refreshConnection, loadPublicLinks, loadRecents, loadShortcuts])

  operationCallbackRef.current = (operation) => {
    if (!operation?.id || !operation.request) return
    const request = operation.request
    // The finished item arrives without the account it belongs to; the request knows it.
    const finishedItem = operation.item ? { ...operation.item, connectionId: request.connectionId } : operation.item
    const connection = connectionsRef.current.find((item) => item.connectionId === request.connectionId)
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
      const key = folderCacheKey(request.connectionId, request.parentRef || null)
      const entry = previousFolders[key]
      if (!entry?.items) return previousFolders
      let matched = false
      let next = entry.items.flatMap((item) => {
        const own = item._operationId === operation.id || !matched && !item._operationId && item.pending && item.connectionId === request.connectionId && item.name === request.name
        if (!own) return [item]
        matched = true
        if (operation.status === 'REJECTED') return []
        if (operation.status === 'SUCCEEDED' && operation.item) return [{ ...withUiKey(finishedItem, item.uiKey), _operationId: operation.id }]
        return [{ ...item, _operationId: operation.id, unconfirmed: operation.status === 'NEEDS_ATTENTION' }]
      })
      if (!matched && operation.status === 'SUCCEEDED' && finishedItem && !next.some((item) => item.ref === finishedItem.ref)) {
        next = insertSorted(next, withUiKey(finishedItem, `operation-${request.clientKey ?? operation.id}`))
      }
      return { ...previousFolders, [key]: { ...entry, items: dedupeItemsByRef(next) } }
    })
    if (operation.status === 'SUCCEEDED' && !creation && (previous || localIntent)) {
      if (request.kind === 'DELETE') removeItemFromCaches(request.connectionId, request.ref)
      else if (request.kind === 'REPLACE_CONTENT') applyContentSaved(request.connectionId, request.ref, finishedItem)
      else if (finishedItem) {
        const updated = finishedItem
        setItemCache((current) => {
          const key = itemCacheKey(request.connectionId, request.ref)
          const old = current[key]
          const moved = old?.item?.parentKnown && updated.parentKnown && old.item.parentRef !== updated.parentRef
          return { ...current, [key]: { ...old, item: { ...old?.item, ...withUiKey(updated, old?.item?.uiKey),
            ...(moved ? { ancestry: undefined } : {}), pending: false }, status: 'ready', complete: !moved && old?.complete === true, fetchedAt: moved ? 0 : Date.now() } }
        })
        setFolderCache((current) => Object.fromEntries(Object.entries(current).map(([key, entry]) => {
          if (!entry?.items) return [key, entry]
          const old = entry.items.find((item) => item.connectionId === request.connectionId && item.ref === request.ref)
          const remaining = entry.items.filter((item) => item.connectionId !== request.connectionId || item.ref !== request.ref)
          // The renamed or moved item takes its sorted place once the change is real, not the end of the list.
          const placed = key === folderCacheKey(request.connectionId, updated.parentRef)
            ? insertSorted(remaining, withUiKey(updated, old?.uiKey))
            : remaining
          return [key, { ...entry, items: placed }]
        })))
      }
    }
    // A success is already applied above, and the server follows it with a catalog event. A rejection
    // puts back what the server has for the folders involved.
    if (operation.status === 'REJECTED' && previous?.status !== operation.status) {
      applyRefreshPlan(request.connectionId, mergeRefreshPlans(null, {
        folders: request.parentRef !== undefined && request.parentRef !== null ? [request.parentRef || null] : [],
        containing: request.ref ? [request.ref] : [],
      }))
    }
  }

  const connectionsSignature = connections.map((connection) => `${connection.connectionId}:${connection.generation}`).join('|')
  useEffect(() => {
    if (!hydrated || !userId || !connectionsSignature || !hubApiRef.current.listOperations) return undefined
    let active = true
    let refreshTimer
    const pendingPlans = new Map()
    void hubApiRef.current.listOperations().then((operations) => {
      if (active) {
        for (const operation of operations ?? []) {
          if (!['SUCCEEDED', 'REJECTED'].includes(operation.status)) operationCallbackRef.current?.(operation)
          else {
            observedOperationsRef.current.set(operation.id, operation)
            setDurableOperations((current) => ({ ...current, [operation.id]: operation }))
          }
        }
        for (const connection of connectionsRef.current) refreshConnection(connection.connectionId)
      }
    }).catch(() => {})
    const stop = subscribeServerEvents(() => tokenRef.current, (event) => {
      if (event.type === 'reset') {
        for (const connection of connectionsRef.current) refreshConnection(connection.connectionId)
        return
      }
      const connection = connectionsRef.current.find((item) => item.connectionId === event.connectionId)
      if (!connection || String(connection.generation) !== String(event.generation)) return
      if (event.type === 'operation') operationCallbackRef.current?.(event.payload)
      else {
        pendingPlans.set(connection.connectionId, mergeRefreshPlans(pendingPlans.get(connection.connectionId), planEventRefresh(event)))
        clearTimeout(refreshTimer)
        refreshTimer = setTimeout(() => {
          for (const [id, plan] of pendingPlans) applyRefreshPlan(id, plan)
          pendingPlans.clear()
        }, 200)
      }
    })
    return () => { active = false; clearTimeout(refreshTimer); stop() }
  }, [hydrated, userId, connectionsSignature, refreshConnection, applyRefreshPlan])

  useEffect(() => {
    if (!hydrated || !userId || !connectionsSignature) return undefined
    let active = true
    let hoverTimer
    const prefetch = async (connectionId, ref) => {
      const item = findCachedItem(folderCacheRef.current, itemCacheRef.current, connectionId, ref)
      if (!active || !item || item.kind === 'folder' || item.size == null || item.size > 5 * 1024 * 1024 || navigator.connection?.saveData) return
      try {
        const descriptor = await actions.getReadSource({ connectionId, ref })
        if (active) await prefetchContent(descriptor)
      } catch { /* Speculative work must not affect the current interaction. */ }
    }
    const consider = (event) => {
      const anchor = event.target?.closest?.('a[href]')
      if (!anchor) return
      // /drives/:connectionId/file/:ref (the legacy /providers/... URLs redirect, and name no account).
      const match = anchor.pathname.match(/\/(?:drives|providers)\/([^/]+)\/file\/([^/]+)$/)
      if (!match) return
      clearTimeout(hoverTimer)
      hoverTimer = setTimeout(() => void prefetch(decodeURIComponent(match[1]), decodeURIComponent(match[2])), 200)
    }
    const cancel = () => clearTimeout(hoverTimer)
    const recentTimer = setTimeout(() => {
      for (const recent of recentsRef.current.entries.slice(0, 2)) void prefetch(recent.connectionId, recent.ref)
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
        if (!meta?.connectionId) return
        if (isTempRef(meta.folderRef)) return
        void loadFolderRef.current(meta.connectionId, meta.folderRef ?? null).catch(() => {})
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
      if (isStaleEntry(publicLinksRef.current, SHORTCUTS_STALE_MS, now) && publicLinksRef.current.status === 'ready') {
        void loadPublicLinks().catch(() => {})
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
  }, [loadProviders, loadPublicLinks, loadRecents, loadShortcuts])

  const projection = useMemo(() => projectOperations(folderCache, itemCache, durableOperations, connections), [folderCache, itemCache, durableOperations, connections])
  const value = useMemo(
    () => ({
      providersState,
      connections,
      folderCache: projection.folderCache,
      itemCache: projection.itemCache,
      hydrated,
      recentsState,
      shortcutsState,
      publicLinksState,
      searchState,
      setSearchState,
      loadProviders,
      loadFolder,
      loadItem,
      loadRecents,
      loadShortcuts,
      loadPublicLinks,
      runSearch,
      connectProvider,
      disconnectProvider,
      disconnectConnection,
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
      disconnectConnection,
      connections,
      folderCache,
      itemCache,
      loadFolder,
      loadItem,
      loadProviders,
      loadRecents,
      loadShortcuts,
      loadPublicLinks,
      providersState,
      publicLinksState,
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
