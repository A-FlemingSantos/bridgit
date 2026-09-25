import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../auth/SessionContext.jsx'
import { createHubApi } from './hubApi.js'
import {
  cloneFolderEntry,
  cloneListEntry,
  createTempItem,
  findCachedItem,
  folderCacheKey,
  itemCacheKey,
  withUiKey,
} from './hubCache.js'

const HubDataContext = createContext(null)

const emptyListState = { status: 'idle', entries: [], error: null }
const emptyProvidersState = { status: 'idle', providers: [], error: null }
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

  const onUnauthorized = useCallback(() => {
    void logout()
  }, [logout])

  const hubApi = useMemo(
    () => createHubApi(() => tokenRef.current, onUnauthorized),
    [onUnauthorized],
  )

  const upsertItemsCache = useCallback((items) => {
    if (!items?.length) return
    setItemCache((prev) => {
      const next = { ...prev }
      items.forEach((item) => {
        next[itemCacheKey(item.provider, item.ref)] = {
          status: 'ready',
          item,
          error: null,
        }
      })
      return next
    })
  }, [])

  const loadProviders = useCallback(async () => {
    setProvidersState((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      const providers = await hubApi.listProviders()
      setProvidersState({ status: 'ready', providers, error: null })
    } catch (error) {
      setProvidersState((prev) => ({ ...prev, status: 'error', error }))
    }
  }, [hubApi])

  const loadFolder = useCallback(
    async (providerId, folderRef, cursor = null) => {
      const key = folderCacheKey(providerId, folderRef)
      setFolderCache((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? { folder: null, items: [], nextCursor: null }),
          status: cursor ? prev[key]?.status ?? 'ready' : 'loading',
          error: null,
        },
      }))

      try {
        const data = await hubApi.listFolder(providerId, folderRef, cursor)
        const mappedItems = mapFolderItems(data.items)
        setFolderCache((prev) => {
          const previous = prev[key]
          const items = cursor && previous?.items ? [...previous.items, ...mappedItems] : mappedItems
          return {
            ...prev,
            [key]: {
              status: 'ready',
              folder: data.folder,
              items,
              nextCursor: data.nextCursor,
              error: null,
            },
          }
        })
        upsertItemsCache(mappedItems)
      } catch (error) {
        setFolderCache((prev) => ({
          ...prev,
          [key]: {
            ...(prev[key] ?? { folder: null, items: [], nextCursor: null }),
            status: 'error',
            error,
          },
        }))
      }
    },
    [hubApi, upsertItemsCache],
  )

  const loadItem = useCallback(
    async (providerId, ref) => {
      const key = itemCacheKey(providerId, ref)
      setItemCache((prev) => ({
        ...prev,
        [key]: { ...(prev[key] ?? {}), status: 'loading', error: null },
      }))

      try {
        const item = withUiKey(await hubApi.getItem(providerId, ref))
        setItemCache((prev) => ({
          ...prev,
          [key]: { status: 'ready', item, error: null },
        }))
      } catch (error) {
        setItemCache((prev) => ({
          ...prev,
          [key]: { ...(prev[key] ?? {}), status: 'error', error },
        }))
      }
    },
    [hubApi],
  )

  const loadRecents = useCallback(async () => {
    setRecentsState((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      const entries = await hubApi.listRecents()
      setRecentsState({ status: 'ready', entries, error: null })
    } catch (error) {
      setRecentsState((prev) => ({ ...prev, status: 'error', error }))
    }
  }, [hubApi])

  const loadShortcuts = useCallback(async () => {
    setShortcutsState((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      const entries = await hubApi.listShortcuts()
      setShortcutsState({ status: 'ready', entries, error: null })
    } catch (error) {
      setShortcutsState((prev) => ({ ...prev, status: 'error', error }))
    }
  }, [hubApi])

  const runSearch = useCallback(
    async (query, requestId) => {
      setSearchState((prev) => ({
        ...prev,
        status: 'loading',
        error: null,
        requestId,
      }))

      try {
        const data = await hubApi.search(query)
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
    [hubApi, upsertItemsCache],
  )

  const connectProvider = useCallback(
    async (providerId, redirectTo) => {
      const { authorizationUrl } = await hubApi.connectProvider(providerId, redirectTo)
      window.location.assign(authorizationUrl)
    },
    [hubApi],
  )

  const disconnectProvider = useCallback(
    async (providerId) => {
      const providers = await hubApi.disconnectProvider(providerId)
      setProvidersState({ status: 'ready', providers, error: null })
    },
    [hubApi],
  )

  const renameItemNameInCaches = useCallback((providerId, ref, name) => {
    setFolderCache((prev) => {
      const next = { ...prev }
      Object.entries(next).forEach(([key, entry]) => {
        if (!entry?.items?.length) return
        next[key] = {
          ...entry,
          items: entry.items.map((item) =>
            item.provider === providerId && item.ref === ref ? { ...item, name } : item,
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
        [key]: { ...entry, item: { ...entry.item, name } },
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

  const removeItemFromCaches = useCallback((providerId, ref, parentRef) => {
    const folderKey = folderCacheKey(providerId, parentRef)
    setFolderCache((prev) => {
      const entry = prev[folderKey]
      if (!entry?.items) return prev
      return {
        ...prev,
        [folderKey]: {
          ...entry,
          items: entry.items.filter((item) => !(item.provider === providerId && item.ref === ref)),
        },
      }
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
  }, [])

  const replaceOptimisticItem = useCallback((folderKey, uiKey, serverItem) => {
    const nextItem = withUiKey(serverItem, uiKey)
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
      }
      return next
    })
  }, [])

  const actions = useMemo(
    () => ({
      async createFolder({ providerId, parentRef, name }) {
        const folderKey = folderCacheKey(providerId, parentRef)
        const placeholder = createTempItem({
          provider: providerId,
          name,
          kind: 'folder',
          parentRef,
        })
        const folderSnapshot = cloneFolderEntry(folderCache[folderKey])

        setFolderCache((prev) => {
          const entry = prev[folderKey] ?? { status: 'ready', folder: null, items: [], nextCursor: null }
          return {
            ...prev,
            [folderKey]: {
              ...entry,
              items: [placeholder, ...(entry.items ?? [])],
            },
          }
        })

        try {
          const created = await hubApi.createFolder(providerId, parentRef, name)
          replaceOptimisticItem(folderKey, placeholder.uiKey, created)
          return withUiKey(created, placeholder.uiKey)
        } catch (error) {
          if (folderSnapshot) {
            setFolderCache((prev) => ({ ...prev, [folderKey]: folderSnapshot }))
          } else {
            setFolderCache((prev) => {
              const entry = prev[folderKey]
              if (!entry?.items) return prev
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
        const placeholders = files.map((file) =>
          createTempItem({
            provider: providerId,
            name: file.name,
            kind: 'file',
            parentRef,
            mimeType: file.type || null,
            extension: file.name.includes('.') ? file.name.split('.').pop() : null,
            size: file.size,
          }),
        )
        const folderSnapshot = cloneFolderEntry(folderCache[folderKey])

        setFolderCache((prev) => {
          const entry = prev[folderKey] ?? { status: 'ready', folder: null, items: [], nextCursor: null }
          return {
            ...prev,
            [folderKey]: {
              ...entry,
              items: [...placeholders, ...(entry.items ?? [])],
            },
          }
        })

        const uploaded = []

        try {
          for (let index = 0; index < files.length; index += 1) {
            const file = files[index]
            const placeholder = placeholders[index]
            const created = await hubApi.uploadFile(providerId, parentRef, file)
            replaceOptimisticItem(folderKey, placeholder.uiKey, created)
            uploaded.push(withUiKey(created, placeholder.uiKey))
          }
          return uploaded
        } catch (error) {
          if (folderSnapshot) {
            setFolderCache((prev) => ({
              ...prev,
              [folderKey]: folderSnapshot,
            }))
          } else {
            setFolderCache((prev) => {
              const entry = prev[folderKey]
              if (!entry?.items) return prev
              const placeholderKeys = new Set(placeholders.map((item) => item.uiKey))
              return {
                ...prev,
                [folderKey]: {
                  ...entry,
                  items: entry.items.filter((item) => !placeholderKeys.has(item.uiKey)),
                },
              }
            })
          }
          throw error
        }
      },

      async renameItem({ providerId, ref, name }) {
        const folderSnapshots = Object.fromEntries(
          Object.entries(folderCache).map(([key, entry]) => [key, cloneFolderEntry(entry)]),
        )
        const itemSnapshot = itemCache[itemCacheKey(providerId, ref)]
        const recentsSnapshot = cloneListEntry(recentsState)
        const shortcutsSnapshot = cloneListEntry(shortcutsState)
        const previousName =
          itemSnapshot?.item?.name ??
          findCachedItem(folderCache, itemCache, providerId, ref)?.name ??
          name

        renameItemNameInCaches(providerId, ref, name)

        try {
          const updated = await hubApi.updateItem(providerId, ref, { name })
          setFolderCache((prev) => {
            const next = { ...prev }
            Object.entries(next).forEach(([key, entry]) => {
              if (!entry?.items) return
              next[key] = {
                ...entry,
                items: entry.items.map((item) =>
                  item.provider === providerId && item.ref === ref
                    ? withUiKey(updated, item.uiKey)
                    : item,
                ),
              }
            })
            return next
          })
          setItemCache((prev) => {
            const key = itemCacheKey(providerId, ref)
            const current = prev[key]?.item
            return {
              ...prev,
              [key]: {
                status: 'ready',
                item: withUiKey(updated, current?.uiKey ?? itemCacheKey(providerId, ref)),
                error: null,
              },
            }
          })
          renameItemNameInCaches(providerId, ref, updated.name)
          return withUiKey(updated, itemSnapshot?.item?.uiKey ?? itemCacheKey(providerId, ref))
        } catch (error) {
          setFolderCache((prev) => ({ ...prev, ...folderSnapshots }))
          if (itemSnapshot) {
            setItemCache((prev) => ({ ...prev, [itemCacheKey(providerId, ref)]: itemSnapshot }))
          }
          if (recentsSnapshot) setRecentsState(recentsSnapshot)
          if (shortcutsSnapshot) setShortcutsState(shortcutsSnapshot)
          renameItemNameInCaches(providerId, ref, previousName)
          throw error
        }
      },

      async moveItem({ providerId, ref, fromParentRef, parentRef }) {
        const sourceKey = folderCacheKey(providerId, fromParentRef)
        const destKey = folderCacheKey(providerId, parentRef)
        const sourceSnapshot = cloneFolderEntry(folderCache[sourceKey])
        const destSnapshot = cloneFolderEntry(folderCache[destKey])
        const itemSnapshot = itemCache[itemCacheKey(providerId, ref)]
        const movingItem =
          itemSnapshot?.item ?? findCachedItem(folderCache, itemCache, providerId, ref)

        if (!movingItem) {
          const updated = await hubApi.updateItem(providerId, ref, { parentRef })
          return withUiKey(updated)
        }

        setFolderCache((prev) => {
          const next = { ...prev }
          const source = next[sourceKey]
          if (source?.items) {
            next[sourceKey] = {
              ...source,
              items: source.items.filter((item) => item.ref !== ref),
            }
          }
          const dest = next[destKey]
          if (dest?.status === 'ready') {
            next[destKey] = {
              ...dest,
              items: [{ ...movingItem, parentRef }, ...(dest.items ?? [])],
            }
          }
          return next
        })

        try {
          const updated = await hubApi.updateItem(providerId, ref, { parentRef })
          replaceOptimisticItem(destKey, movingItem.uiKey, updated)
          setFolderCache((prev) => {
            const source = prev[sourceKey]
            if (!source?.items) return prev
            return {
              ...prev,
              [sourceKey]: {
                ...source,
                items: source.items.filter((item) => item.ref !== ref),
              },
            }
          })
          return withUiKey(updated, movingItem.uiKey)
        } catch (error) {
          setFolderCache((prev) => ({
            ...prev,
            [sourceKey]: sourceSnapshot ?? prev[sourceKey],
            [destKey]: destSnapshot ?? prev[destKey],
          }))
          if (itemSnapshot) {
            setItemCache((prev) => ({ ...prev, [itemCacheKey(providerId, ref)]: itemSnapshot }))
          }
          throw error
        }
      },

      async deleteItem({ providerId, ref, parentRef }) {
        const folderKey = folderCacheKey(providerId, parentRef)
        const folderSnapshot = cloneFolderEntry(folderCache[folderKey])
        const itemSnapshot = itemCache[itemCacheKey(providerId, ref)]
        const recentsSnapshot = cloneListEntry(recentsState)
        const shortcutsSnapshot = cloneListEntry(shortcutsState)

        removeItemFromCaches(providerId, ref, parentRef)

        try {
          await hubApi.deleteItem(providerId, ref)
        } catch (error) {
          setFolderCache((prev) => ({
            ...prev,
            [folderKey]: folderSnapshot ?? prev[folderKey],
          }))
          if (itemSnapshot) {
            setItemCache((prev) => ({ ...prev, [itemCacheKey(providerId, ref)]: itemSnapshot }))
          }
          if (recentsSnapshot) setRecentsState(recentsSnapshot)
          if (shortcutsSnapshot) setShortcutsState(shortcutsSnapshot)
          throw error
        }
      },

      async toggleShortcut(item) {
        const exists = shortcutsState.entries.some(
          (entry) => entry.provider === item.provider && entry.ref === item.ref,
        )
        const snapshot = cloneListEntry(shortcutsState)

        if (exists) {
          setShortcutsState((prev) => ({
            ...prev,
            entries: prev.entries.filter(
              (entry) => !(entry.provider === item.provider && entry.ref === item.ref),
            ),
          }))
          try {
            await hubApi.removeShortcut(item.provider, item.ref)
          } catch (error) {
            setShortcutsState(snapshot)
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
          const created = await hubApi.addShortcut(item.provider, item.ref)
          setShortcutsState((prev) => ({
            ...prev,
            entries: prev.entries.map((entry) =>
              entry.provider === item.provider && entry.ref === item.ref ? created : entry,
            ),
          }))
          return created
        } catch (error) {
          setShortcutsState(snapshot)
          throw error
        }
      },

      getPublicLink: ({ providerId, ref }) => hubApi.getPublicLink(providerId, ref),
      enablePublicLink: ({ providerId, ref }) => hubApi.enablePublicLink(providerId, ref),
      disablePublicLink: ({ providerId, ref }) => hubApi.disablePublicLink(providerId, ref),
      recordRecent: ({ providerId, ref }) => hubApi.recordRecent(providerId, ref),
      getReadSource: ({ providerId, ref }) => hubApi.getReadSource(providerId, ref),
      async getDownloadUrl({ providerId, ref }) {
        const ticket = await hubApi.createContentTicket(providerId, ref, 'attachment')
        return ticket.url
      },
    }),
    [
      folderCache,
      hubApi,
      itemCache,
      recentsState,
      removeItemFromCaches,
      renameItemNameInCaches,
      replaceOptimisticItem,
      shortcutsState,
    ],
  )

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
