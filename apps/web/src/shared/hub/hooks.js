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
  const { providersState, loadProviders, connectProvider, disconnectProvider, hydrated } = useHubDataContext()

  useEffect(() => {
    if (!session?.accessToken || !hydrated) return
    if (providersState.status === 'idle') {
      void loadProviders()
    } else if (providersState.status === 'ready' && isStaleEntry(providersState, PROVIDERS_STALE_MS)) {
      void loadProviders()
    }
  }, [hydrated, loadProviders, providersState, session?.accessToken])

  return {
    status: hydrated ? providersState.status : 'loading',
    providers: providersState.providers,
    error: providersState.error,
    reload: loadProviders,
    connect: connectProvider,
    disconnect: disconnectProvider,
  }
}

export function useFolder(providerId, folderRef) {
  const { session } = useSession()
  const { folderCache, loadFolder, hydrated } = useHubDataContext()
  const key = folderCacheKey(providerId, folderRef)
  const entry = folderCache[key]

  useEffect(() => {
    if (!session?.accessToken || !hydrated || !providerId || isTempRef(folderRef)) return
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
  }, [hydrated, entry, folderRef, loadFolder, providerId, session?.accessToken])

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
  const { itemCache, loadItem, hydrated } = useHubDataContext()
  const key = providerId && ref ? itemCacheKey(providerId, ref) : null
  const entry = key ? itemCache[key] : null

  useEffect(() => {
    if (!session?.accessToken || !hydrated || !providerId || !ref || isTempRef(ref)) return
    if (!entry || entry.status === 'idle') {
      if (entry?.status !== 'loading') void loadItem(providerId, ref)
    } else if (entry.status === 'ready' && !entry.revalidating && (entry.complete === false || isStaleEntry(entry, ITEM_STALE_MS))) {
      void loadItem(providerId, ref)
    }
  }, [hydrated, entry, loadItem, providerId, ref, session?.accessToken])

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
    isShortcut(providerId, ref) {
      return shortcutsState.entries.some(
        (entry) => entry.provider === providerId && entry.ref === ref,
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
