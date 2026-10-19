import { useCallback, useEffect, useRef, useState } from 'react'
import { getItem, getReadSource, isSessionFailure, listFolder, listPublicLinks, listRecents, listShortcuts, recordRecent } from '@bridgit/shared-client'
import { useSession } from '../auth/SessionContext'
import { useHub } from './HubContext'
import { fileScopes, folderScopes, HOME } from './eventScopes'
import { formatWhen, toEntry } from './format'
import { createLatestRunner } from './invalidation'

const MAX_PAGES = 20

// Runs `load(token)` on mount, when `key` changes and when one of `scopes` is invalidated.
// A refetch keeps the previous data on screen, and only the latest request may publish its
// result. A session failure (401) ends the session.
function useResource(load, key, scopes) {
  const { token, invalidate } = useSession()
  const { bus } = useHub()
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const [runner] = useState(createLatestRunner)
  const loadRef = useRef(load)
  loadRef.current = load
  const scopeKey = scopes.join('|')

  const run = useCallback(async () => {
    if (!token) return
    setState((current) => ({ ...current, status: current.data ? 'ready' : 'loading', error: null }))
    const result = await runner.run(() => loadRef.current(token))
    if (result.stale) return

    if (!('error' in result)) {
      setState({ status: 'ready', data: result.value, error: null })
      return
    }
    const { error } = result
    if (error?.code === 'CANCELADO') return
    if (isSessionFailure(error)) {
      invalidate()
      return
    }
    setState((current) => ({ ...current, status: 'error', error }))
  }, [token, invalidate, runner])
  const runRef = useRef(run)
  runRef.current = run

  useEffect(() => {
    run()
  }, [run, key])

  useEffect(() => bus.subscribe(scopeKey ? scopeKey.split('|') : [], () => runRef.current()), [bus, scopeKey])

  // A response that arrives after the screen is gone must not touch its state.
  useEffect(() => () => runner.cancel(), [runner])

  return { ...state, reload: run }
}

export function useProviders() {
  const { providers, providersStatus, reloadProviders } = useHub()
  return { status: providersStatus, providers, reload: reloadProviders }
}

export function useFolder(providerId, folderRef) {
  const { status, data, error, reload } = useResource(async (token) => {
    if (!providerId) return { title: null, folders: [], files: [] }

    let cursor
    let folder = null
    let catalog = null
    const items = []

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await listFolder(token, providerId, folderRef, cursor)
      folder = response.folder ?? folder
      if (page === 0) catalog = response.catalog ?? null
      items.push(...(response.items ?? []))
      cursor = response.nextCursor
      if (!cursor) break
    }

    const entries = items.map((item) => toEntry(item, providerId))
    return {
      title: folder?.name ?? null,
      catalog,
      folders: entries.filter((entry) => entry.isFolder),
      files: entries.filter((entry) => !entry.isFolder),
    }
  }, `${providerId}:${folderRef ?? ''}`, providerId ? folderScopes(providerId, folderRef) : [])

  return {
    status,
    error,
    reload,
    title: data?.title ?? null,
    catalog: data?.catalog ?? null,
    folders: data?.folders ?? [],
    files: data?.files ?? [],
  }
}

export function useHomeEntries() {
  const { status, data, error, reload } = useResource(async (token) => {
    const [recents, shortcuts] = await Promise.all([listRecents(token), listShortcuts(token)])
    return {
      recents: (recents ?? []).map((item) => toEntry({ ...item, kind: 'file' })),
      shortcuts: (shortcuts ?? []).map((item) => ({ ...toEntry({ ...item, kind: 'file' }), pinned: true })),
    }
  }, 'home', [HOME])

  return {
    status,
    error,
    reload,
    recents: data?.recents ?? [],
    shortcuts: data?.shortcuts ?? [],
  }
}

// The user's public links, newest first, for the side panel.
export function usePublicLinks() {
  const { status, data, error, reload } = useResource(async (token) => {
    const links = await listPublicLinks(token)
    return (links ?? []).map((link) => ({
      providerId: link.provider,
      ref: link.ref,
      name: link.name,
      kind: link.kind === 'folder' ? 'folder' : 'file',
      url: link.url,
      when: link.createdAt ? formatWhen(link.createdAt) : null,
    }))
  }, 'public-links', [HOME])

  return { status, error, reload, links: data ?? [] }
}

export function useFile(providerId, fileRef) {
  const { token } = useSession()
  const { status, data, error } = useResource(async (accessToken) => {
    const [item, source] = await Promise.all([
      getItem(accessToken, providerId, fileRef),
      getReadSource(accessToken, providerId, fileRef).catch(() => null),
    ])
    return { item, source }
  }, `${providerId}:${fileRef}`, fileScopes(providerId, fileRef))

  // Opening a file moves it to the top of "Recentes"; failing to record is not worth surfacing.
  useEffect(() => {
    if (!token || !providerId || !fileRef) return
    recordRecent(token, providerId, fileRef).catch(() => {})
  }, [token, providerId, fileRef])

  return {
    status,
    error,
    file: data?.item ? toEntry(data.item, providerId) : null,
    source: data?.source ?? null,
  }
}
