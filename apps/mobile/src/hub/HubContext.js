import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  addShortcut,
  disablePublicLink,
  enablePublicLink,
  getHubEventHead,
  getHubEvents,
  isSessionFailure,
  listProviders,
  removeShortcut,
} from '@bridgit/shared-client'
import { useSession } from '../auth/SessionContext'
import { createEventPoller } from './eventPoller'
import { fileScope, folderScope, foldersScope, HOME, itemWriteScopes, PROVIDERS, scopesForEvents } from './eventScopes'
import { createInvalidationBus } from './invalidation'
import { runOperation } from './operations'

const HubContext = createContext(null)

// A folder's version moves with its own contents and right after creation, so the listed one goes stale
// at once and would reject the user's own rename or delete as "changed".
function expectedVersion(entry) {
  return entry.isFolder ? null : entry.version
}

// Shares the provider list, the invalidation scopes that tell each screen when to refetch, the
// event poller and the write actions, so a screen refetches only when something it shows changed.
export function HubProvider({ children }) {
  const { token, invalidate } = useSession()
  const [providers, setProviders] = useState([])
  const [providersStatus, setProvidersStatus] = useState('loading')
  const [bus] = useState(createInvalidationBus)
  const tokenRef = useRef(token)
  tokenRef.current = token
  const providersRef = useRef(providers)
  providersRef.current = providers

  const reloadProviders = useCallback(async () => {
    if (!tokenRef.current) return
    try {
      setProviders(await listProviders(tokenRef.current))
      setProvidersStatus('ready')
    } catch (error) {
      if (isSessionFailure(error)) invalidate()
      else setProvidersStatus('error')
    }
  }, [invalidate])

  // Refetches what the scopes cover. `providers` is held here; the other scopes belong to screens.
  const refreshScopes = useCallback((scopes) => {
    if (scopes.includes(PROVIDERS)) reloadProviders()
    bus.invalidate(scopes)
  }, [bus, reloadProviders])

  useEffect(() => {
    setProviders([])
    setProvidersStatus('loading')
    if (token) reloadProviders()
  }, [token, reloadProviders])

  useEffect(() => {
    if (!token) return undefined

    const poller = createEventPoller({
      getToken: () => tokenRef.current,
      fetchHead: (accessToken) => getHubEventHead(accessToken),
      fetchEvents: (accessToken, after) => getHubEvents(accessToken, after),
      onEvents: (events) => refreshScopes(scopesForEvents(events, providersRef.current)),
      onUnauthorized: invalidate,
    })

    poller.start()
    // Polling pauses in the background and resumes on return, with a refresh for what changed meanwhile.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        poller.start()
        reloadProviders()
        bus.invalidateAll()
      } else {
        poller.stop()
      }
    })

    return () => {
      subscription.remove()
      poller.stop()
    }
  }, [token, reloadProviders, refreshScopes, bus, invalidate])

  // Runs a write and refetches only the scopes it touched when it finishes, whether it succeeded or not.
  const write = useCallback(async (action, scopes = []) => {
    try {
      return await action(tokenRef.current)
    } catch (error) {
      if (isSessionFailure(error)) invalidate()
      throw error
    } finally {
      refreshScopes(scopes)
    }
  }, [refreshScopes, invalidate])

  const operate = useCallback((providerId, operation, scopes) => write((accessToken) => {
    const connection = providersRef.current.find((provider) => provider.id === providerId)
    if (!connection?.connected) {
      throw Object.assign(new Error('Conecte este provedor em Ajustes.'), { status: 409 })
    }
    return runOperation(accessToken, connection, operation)
  }, scopes), [write])

  const actions = useMemo(() => ({
    createFolder: (providerId, parentRef, name) =>
      operate(providerId, { kind: 'CREATE_FOLDER', parentRef: parentRef ?? '', name }, [folderScope(providerId, parentRef)]),
    rename: (providerId, entry, name) =>
      operate(providerId, { kind: 'UPDATE', ref: entry.ref, name, version: expectedVersion(entry) }, itemWriteScopes(providerId, entry.ref)),
    remove: (providerId, entry) =>
      operate(providerId, { kind: 'DELETE', ref: entry.ref, version: expectedVersion(entry) }, itemWriteScopes(providerId, entry.ref)),
    upload: (providerId, parentRef, file) =>
      operate(providerId, { kind: 'UPLOAD', parentRef: parentRef ?? '', file }, [folderScope(providerId, parentRef)]),
    // Folder listings carry the pinned flag, so they refetch along with the Home.
    setShortcut: (providerId, ref, pinned) => write((accessToken) => (
      pinned ? addShortcut(accessToken, providerId, ref) : removeShortcut(accessToken, providerId, ref)
    ), [HOME, foldersScope(providerId), fileScope(providerId, ref)]),
    // The Home lists the public links, so it refetches after one is created or turned off.
    publicLink: (providerId, ref) => write((accessToken) => enablePublicLink(accessToken, providerId, ref), [HOME]),
    disablePublicLink: (providerId, ref) =>
      write((accessToken) => disablePublicLink(accessToken, providerId, ref), [HOME]),
  }), [operate, write])

  const value = useMemo(
    () => ({ providers, providersStatus, bus, reloadProviders, refreshScopes, ...actions }),
    [providers, providersStatus, bus, reloadProviders, refreshScopes, actions],
  )

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>
}

export function useHub() {
  const value = useContext(HubContext)
  if (!value) throw new Error('useHub must be used inside HubProvider')
  return value
}
