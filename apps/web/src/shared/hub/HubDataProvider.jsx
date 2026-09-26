import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../auth/SessionContext.jsx'
import { createHubApi } from './hubApi.js'
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
  withUiKey,
} from './hubCache.js'

const HubDataContext = createContext(null)

const emptyListState = { status: 'idle', entries: [], error: null, fetchedAt: 0 }
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
  const tokenRef = useRef(session?.accessToken ?? null)
  tokenRef.current = session?.accessToken ?? null

  const [providersState, setProvidersState] = useState(emptyProvidersState)
  const [folderCache, setFolderCache] = useState({})
  const [itemCache, setItemCache] = useState({})
  const [recentsState, setRecentsState] = useState(emptyListState)
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
    broadcastHubEvent({ ...event, source: instanceIdRef.current })
  }, [])

  const onUnauthorized = useCallback(() => {
    void logout()
  }, [logout])

  const hubApi = useMemo(
    () => createHubApi(() => tokenRef.current, onUnauthorized),
    [onUnauthorized],
  )
  const hubApiRef = useRef(hubApi)
  hubApiRef.current = hubApi

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
        if (error?.code === 'CURSOR_INVALIDO') {
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
        const data = await hubApiRef.current.listFolder(providerId, folderRef, null)
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
    const prev = recentsRef.current
    const background = prev.status === 'ready' && !opts.force
    if (!background) {
      setRecentsState((current) => ({ ...current, status: 'loading', error: null }))
    }
    try {
      const entries = await hubApiRef.current.listRecents()
      setRecentsState({ status: 'ready', entries, error: null, fetchedAt: Date.now() })
    } catch (error) {
      setRecentsState((current) => ({
        ...current,
        status: current.status === 'ready' ? 'ready' : 'error',
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
      setSearchState((prev) => ({
        ...prev,
        status: 'loading',
        error: null,
        requestId,
      }))

      try {
        const data = await hubApiRef.current.search(query)
        setSearchState((prev) => {
          if (prev.requestId !== requestId) return prev
          return {
            status: 'ready',
            results: mapFolderItems(data.results ?? []),
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
      const providers = await hubApiRef.current.disconnectProvider(providerId)
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

  const actions = useMemo(
    () => ({
      async createFolder({ providerId, parentRef, name }) {
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
            failed.push({ file, error })
            if (isAmbiguousError(error)) {
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
                  const clean = { ...withUiKey(updated, item.uiKey) }
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
            const clean = { ...withUiKey(updated, current?.uiKey ?? itemCacheKey(providerId, ref)) }
            delete clean._op
            return {
              ...prev,
              [key]: { status: 'ready', item: clean, error: null, complete: true, fetchedAt: Date.now(), generation: itemGenerationsRef.current[key] ?? 0 },
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
            setRecentsState((prev) => ({
              ...prev,
              status: 'ready',
              entries: [entry, ...(prev.entries ?? []).filter(
                (candidate) => !(candidate.provider === (entry.provider ?? providerId) && candidate.ref === (entry.ref ?? ref)),
              )],
              error: null,
              fetchedAt: Date.now(),
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
      getReadSource: ({ providerId, ref }) => hubApiRef.current.getReadSource(providerId, ref),
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

  const value = useMemo(
    () => ({
      providersState,
      folderCache,
      itemCache,
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
    }),
    [
      actions,
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
