import { useEffect, useRef } from 'react'
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

export function useProviders() {
  const { session } = useSession()
  const { providersState, loadProviders, connectProvider, disconnectProvider } = useHubDataContext()

  useEffect(() => {
    if (!session?.accessToken) return
    if (providersState.status === 'idle') {
      void loadProviders()
    } else if (providersState.status === 'ready' && isStaleEntry(providersState, PROVIDERS_STALE_MS)) {
      void loadProviders()
    }
  }, [loadProviders, providersState, session?.accessToken])

  return {
    status: providersState.status,
    providers: providersState.providers,
    error: providersState.error,
    reload: loadProviders,
    connect: connectProvider,
    disconnect: disconnectProvider,
  }
}

export function useFolder(providerId, folderRef) {
  const { session } = useSession()
  const { folderCache, loadFolder } = useHubDataContext()
  const key = folderCacheKey(providerId, folderRef)
  const entry = folderCache[key]

  useEffect(() => {
    if (!session?.accessToken || !providerId || isTempRef(folderRef)) return
    if (!entry || entry.status === 'idle') {
      if (entry?.status !== 'loading') void loadFolder(providerId, folderRef)
    } else if (
      entry.loaded &&
      entry.status === 'ready' &&
      isStaleEntry(entry, FOLDER_STALE_MS) &&
      !entry.revalidating &&
      !entry.isFetchingNextPage
    ) {
      void loadFolder(providerId, folderRef)
    }
  }, [entry, folderRef, loadFolder, providerId, session?.accessToken])

  return {
    status: entry?.status ?? 'idle',
    folder: entry?.folder ?? null,
    items: entry?.items ?? [],
    nextCursor: entry?.nextCursor ?? null,
    hasMore: Boolean(entry?.nextCursor),
    isFetchingNextPage: entry?.isFetchingNextPage ?? false,
    revalidating: entry?.revalidating ?? false,
    error: entry?.error ?? null,
    loadMore() {
      if (!entry?.nextCursor || entry?.isFetchingNextPage) return Promise.resolve()
      return loadFolder(providerId, folderRef, entry.nextCursor)
    },
    reload() {
      return loadFolder(providerId, folderRef, null, { force: true })
    },
  }
}

export function useItem(providerId, ref) {
  const { session } = useSession()
  const { itemCache, loadItem } = useHubDataContext()
  const key = providerId && ref ? itemCacheKey(providerId, ref) : null
  const entry = key ? itemCache[key] : null

  useEffect(() => {
    if (!session?.accessToken || !providerId || !ref || isTempRef(ref)) return
    if (!entry || entry.status === 'idle') {
      if (entry?.status !== 'loading') void loadItem(providerId, ref)
    } else if (entry.status === 'ready' && isStaleEntry(entry, ITEM_STALE_MS)) {
      void loadItem(providerId, ref)
    }
  }, [entry, loadItem, providerId, ref, session?.accessToken])

  return {
    status: entry?.status ?? 'idle',
    item: entry?.item ?? null,
    error: entry?.error ?? null,
    reload() {
      if (!providerId || !ref) return
      void loadItem(providerId, ref)
    },
  }
}

export function useRecents() {
  const { session } = useSession()
  const { recentsState, loadRecents } = useHubDataContext()

  useEffect(() => {
    if (!session?.accessToken) return
    if (recentsState.status === 'idle') {
      void loadRecents()
    } else if (recentsState.status === 'ready' && isStaleEntry(recentsState, RECENTS_STALE_MS)) {
      void loadRecents()
    }
  }, [loadRecents, recentsState, session?.accessToken])

  return {
    status: recentsState.status,
    entries: recentsState.entries,
    error: recentsState.error,
    reload: loadRecents,
  }
}

export function useShortcuts() {
  const { session } = useSession()
  const { shortcutsState, loadShortcuts } = useHubDataContext()

  useEffect(() => {
    if (!session?.accessToken) return
    if (shortcutsState.status === 'idle') {
      void loadShortcuts()
    } else if (shortcutsState.status === 'ready' && isStaleEntry(shortcutsState, SHORTCUTS_STALE_MS)) {
      void loadShortcuts()
    }
  }, [loadShortcuts, shortcutsState, session?.accessToken])

  return {
    status: shortcutsState.status,
    entries: shortcutsState.entries,
    error: shortcutsState.error,
    reload: loadShortcuts,
    isShortcut(providerId, ref) {
      return shortcutsState.entries.some(
        (entry) => entry.provider === providerId && entry.ref === ref,
      )
    },
  }
}

export function useSearch(query) {
  const { session } = useSession()
  const { searchState, setSearchState, runSearch } = useHubDataContext()
  const activeRequestRef = useRef(0)
  const trimmed = query.trim()

  useEffect(() => {
    if (!session?.accessToken) return undefined

    if (trimmed.length < 2) {
      activeRequestRef.current += 1
      setSearchState((prev) => ({
        ...prev,
        status: 'idle',
        results: [],
        providers: [],
        error: null,
      }))
      return undefined
    }

    const timer = window.setTimeout(() => {
      const requestId = activeRequestRef.current + 1
      activeRequestRef.current = requestId
      void runSearch(trimmed, requestId)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [runSearch, session?.accessToken, setSearchState, trimmed])

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
