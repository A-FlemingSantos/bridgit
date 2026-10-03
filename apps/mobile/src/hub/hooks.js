import { useCallback, useEffect, useRef, useState } from 'react'
import { getItem, getReadSource, listFolder, listRecents, listShortcuts, recordRecent } from '@bridgit/shared-client'
import { useSession } from '../auth/SessionContext'
import { useHub } from './HubContext'
import { toEntry } from './format'

const MAX_PAGES = 20

// Runs `load(token)` on mount, when `key` changes and whenever the hub reports a change.
// A refetch keeps the previous data on screen. A 401 ends the session.
function useResource(load, key) {
  const { token, invalidate } = useSession()
  const { revision } = useHub()
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const loadRef = useRef(load)
  loadRef.current = load

  const run = useCallback(async () => {
    if (!token) return
    setState((current) => ({ ...current, status: current.data ? 'ready' : 'loading', error: null }))
    try {
      const data = await loadRef.current(token)
      setState({ status: 'ready', data, error: null })
    } catch (error) {
      if (error?.status === 401) {
        invalidate()
        return
      }
      setState((current) => ({ ...current, status: 'error', error }))
    }
  }, [token, invalidate])

  useEffect(() => {
    run()
  }, [run, key, revision])

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
    const items = []

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const response = await listFolder(token, providerId, folderRef, cursor)
      folder = response.folder ?? folder
      items.push(...(response.items ?? []))
      cursor = response.nextCursor
      if (!cursor) break
    }

    const entries = items.map((item) => toEntry(item, providerId))
    return {
      title: folder?.name ?? null,
      folders: entries.filter((entry) => entry.isFolder),
      files: entries.filter((entry) => !entry.isFolder),
    }
  }, `${providerId}:${folderRef ?? ''}`)

  return {
    status,
    error,
    reload,
    title: data?.title ?? null,
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
  }, 'home')

  return {
    status,
    error,
    reload,
    recents: data?.recents ?? [],
    shortcuts: data?.shortcuts ?? [],
  }
}

export function useFile(providerId, fileRef) {
  const { token } = useSession()
  const { status, data, error } = useResource(async (accessToken) => {
    const [item, source] = await Promise.all([
      getItem(accessToken, providerId, fileRef),
      getReadSource(accessToken, providerId, fileRef).catch(() => null),
    ])
    return { item, source }
  }, `${providerId}:${fileRef}`)

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
