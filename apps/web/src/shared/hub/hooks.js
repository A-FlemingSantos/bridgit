import { startTransition, useEffect, useRef } from 'react'
import { useSession } from '../auth/SessionContext.jsx'
import { useHubDataContext } from './HubDataProvider.jsx'
import {
  FOLDER_STALE_MS,
  ITEM_STALE_MS,
  PROVIDERS_STALE_MS,
  RECENTS_STALE_MS,
  SHORTCUTS_STALE_MS,
  folderCacheKey,
  isStaleEntry,
  isTempRef,
  itemCacheKey,
} from './hubCache.js'

// Keeps the provider list (and the accounts inside it) loaded and fresh.
function useProvidersLoaded() {
  const { session } = useSession()
  const context = useHubDataContext()
  const { providersState, loadProviders, hydrated } = context

  useEffect(() => {
    if (!session?.accessToken || !hydrated) return
    if (providersState.status === 'idle') {
      void loadProviders()
    } else if (providersState.status === 'ready' && isStaleEntry(providersState, PROVIDERS_STALE_MS)) {
      void loadProviders()
    }
  }, [hydrated, loadProviders, providersState, session?.accessToken])

  return context
}

// One row per provider; each row lists its accounts in `connections`.
export function useProviders() {
  const { providersState, loadProviders, connectProvider, disconnectProvider, hydrated } = useProvidersLoaded()

  return {
    status: hydrated ? providersState.status : 'loading',
    providers: providersState.providers,
    error: providersState.error,
    reload: loadProviders,
    // connect(providerId, redirectTo, { addAccount }): addAccount links one more account of that provider.
    connect: connectProvider,
    // Disconnects every account of the provider.
    disconnect: disconnectProvider,
  }
}

// The connected accounts, flat: provider order, then oldest first. An account is identified by connectionId.
export function useConnections() {
  const { providersState, connections, loadProviders, connectProvider, disconnectConnection, hydrated } = useProvidersLoaded()

  return {
    status: hydrated ? providersState.status : 'loading',
    connections,
    error: providersState.error,
    reload: loadProviders,
    connect: connectProvider,
    // Disconnects that one account only.
    disconnect: disconnectConnection,
  }
}

export function useConnection(connectionId) {
  const { status, connections, error, reload } = useConnections()
  const connection = connectionId ? connections.find((item) => item.connectionId === connectionId) ?? null : null
  return { status, connection, error, reload }
}

export function useFolder(connectionId, folderRef) {
  const { session } = useSession()
  const { folderCache, loadFolder, hydrated } = useHubDataContext()
  const key = folderCacheKey(connectionId, folderRef)
  const entry = folderCache[key]

  useEffect(() => {
    if (!session?.accessToken || !hydrated || !connectionId || isTempRef(folderRef)) return
    if (!entry || entry.status === 'idle') {
      if (entry?.status !== 'loading') void loadFolder(connectionId, folderRef)
    } else if (
      entry.loaded &&
      entry.status === 'ready' &&
      isStaleEntry(entry, FOLDER_STALE_MS) &&
      !entry.revalidating &&
      !entry.isFetchingNextPage
    ) {
      void loadFolder(connectionId, folderRef)
    }
  }, [hydrated, entry, folderRef, loadFolder, connectionId, session?.accessToken])

  return {
    status: entry?.status ?? 'idle',
    folder: entry?.folder ?? null,
    items: entry?.items ?? [],
    nextCursor: entry?.nextCursor ?? null,
    hasMore: Boolean(entry?.nextCursor),
    isFetchingNextPage: entry?.isFetchingNextPage ?? false,
    revalidating: entry?.revalidating ?? false,
    error: entry?.error ?? null,
    // Set when the folder turned out to be gone ('gone' status): where the page should send the user.
    parentRef: entry?.parentRef ?? null,
    catalog: entry?.catalog ?? null,
    loadMore() {
      if (!entry?.nextCursor || entry?.isFetchingNextPage) return Promise.resolve()
      return loadFolder(connectionId, folderRef, entry.nextCursor)
    },
    reload() {
      return loadFolder(connectionId, folderRef, null, { force: true })
    },
  }
}

export function useItem(connectionId, ref) {
  const { session } = useSession()
  const { itemCache, loadItem, hydrated } = useHubDataContext()
  const key = connectionId && ref ? itemCacheKey(connectionId, ref) : null
  const entry = key ? itemCache[key] : null

  useEffect(() => {
    if (!session?.accessToken || !hydrated || !connectionId || !ref || isTempRef(ref)) return
    if (!entry || entry.status === 'idle') {
      if (entry?.status !== 'loading') void loadItem(connectionId, ref)
    } else if (entry.status === 'ready' && !entry.revalidating && (entry.complete === false || isStaleEntry(entry, ITEM_STALE_MS))) {
      void loadItem(connectionId, ref)
    }
  }, [hydrated, entry, loadItem, connectionId, ref, session?.accessToken])

  return {
    status: entry?.status ?? 'idle',
    item: entry?.item ?? null,
    error: entry?.error ?? null,
    parentRef: entry?.parentRef ?? null,
    reload() {
      if (!connectionId || !ref) return
      void loadItem(connectionId, ref)
    },
  }
}

export function useRecents() {
  const { session } = useSession()
  const { recentsState, loadRecents, hydrated } = useHubDataContext()

  useEffect(() => {
    if (!session?.accessToken || !hydrated) return
    if (recentsState.status === 'loading' || recentsState.status === 'error') return
    const incomplete = recentsState.authoritative !== true
    if (incomplete || isStaleEntry(recentsState, RECENTS_STALE_MS)) {
      void loadRecents()
    }
  }, [hydrated, loadRecents, recentsState, session?.accessToken])

  const synced = recentsState.authoritative === true
  return {
    status: synced ? recentsState.status : recentsState.status === 'error' ? 'error' : 'loading',
    entries: synced ? recentsState.entries : [],
    error: recentsState.error,
    reload: loadRecents,
  }
}

export function useShortcuts() {
  const { session } = useSession()
  const { shortcutsState, loadShortcuts, hydrated } = useHubDataContext()

  useEffect(() => {
    if (!session?.accessToken || !hydrated) return
    if (shortcutsState.status === 'idle') {
      void loadShortcuts()
    } else if (shortcutsState.status === 'ready' && isStaleEntry(shortcutsState, SHORTCUTS_STALE_MS)) {
      void loadShortcuts()
    }
  }, [hydrated, loadShortcuts, shortcutsState, session?.accessToken])

  return {
    status: shortcutsState.status,
    entries: shortcutsState.entries,
    error: shortcutsState.error,
    reload: loadShortcuts,
    isShortcut(connectionId, ref) {
      return shortcutsState.entries.some(
        (entry) => entry.connectionId === connectionId && entry.ref === ref,
      )
    },
  }
}

export function usePublicLinks() {
  const { session } = useSession()
  const { publicLinksState, loadPublicLinks, hydrated } = useHubDataContext()

  useEffect(() => {
    if (!session?.accessToken || !hydrated) return
    if (publicLinksState.status === 'idle') {
      void loadPublicLinks()
    } else if (publicLinksState.status === 'ready' && isStaleEntry(publicLinksState, SHORTCUTS_STALE_MS)) {
      void loadPublicLinks()
    }
  }, [hydrated, loadPublicLinks, publicLinksState, session?.accessToken])

  return {
    status: publicLinksState.status,
    entries: publicLinksState.entries,
    error: publicLinksState.error,
    reload: loadPublicLinks,
    isPublic(connectionId, ref) {
      return publicLinksState.entries.some(
        (entry) => entry.connectionId === connectionId && entry.ref === ref,
      )
    },
  }
}

export function useSearch(query) {
  const { session } = useSession()
  const { searchState, setSearchState, runSearch, hydrated } = useHubDataContext()
  const activeRequestRef = useRef(0)
  const trimmed = query.trim()

  useEffect(() => {
    if (!session?.accessToken || !hydrated) return undefined

    if (trimmed.length < 2) {
      activeRequestRef.current += 1
      // Nothing on screen waits for this reset (a short query already reads as idle below), so it renders
      // in slices instead of holding up the frame where Início unfolds its actions.
      startTransition(() => {
        setSearchState((prev) => (prev.status === 'idle' ? prev : {
          ...prev,
          status: 'idle',
          results: [],
          providers: [],
          error: null,
        }))
      })
      return undefined
    }

    const timer = window.setTimeout(() => {
      const requestId = activeRequestRef.current + 1
      activeRequestRef.current = requestId
      void runSearch(trimmed, requestId)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [hydrated, runSearch, session?.accessToken, setSearchState, trimmed])

  if (trimmed.length < 2) {
    return {
      status: 'idle',
      results: [],
      providers: [],
      error: null,
    }
  }

  return {
    status:
      searchState.requestId === activeRequestRef.current ? searchState.status : 'loading',
    results: searchState.results,
    providers: searchState.providers,
    error: searchState.error,
  }
}

export function useHubActions() {
  const { actions } = useHubDataContext()
  return actions
}
