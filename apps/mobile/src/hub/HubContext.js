import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  addShortcut,
  enablePublicLink,
  getHubEventHead,
  getHubEvents,
  listProviders,
  removeShortcut,
} from '@bridgit/shared-client'
import { useSession } from '../auth/SessionContext'
import { createEventPoller } from './eventPoller'
import { runOperation } from './operations'

const HubContext = createContext(null)

// Shares the provider list, a change counter that screens use to refetch, the event poller
// and the write actions, so every screen sees the result of an operation or a remote change.
export function HubProvider({ children }) {
  const { token, invalidate } = useSession()
  const [providers, setProviders] = useState([])
  const [providersStatus, setProvidersStatus] = useState('loading')
  const [revision, setRevision] = useState(0)
  const tokenRef = useRef(token)
  tokenRef.current = token
  const providersRef = useRef(providers)
  providersRef.current = providers

  const bump = useCallback(() => setRevision((current) => current + 1), [])

  const reloadProviders = useCallback(async () => {
    if (!tokenRef.current) return
    try {
      setProviders(await listProviders(tokenRef.current))
      setProvidersStatus('ready')
    } catch (error) {
      if (error?.status === 401) invalidate()
      else setProvidersStatus('error')
    }
  }, [invalidate])

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
      onEvents: () => {
        reloadProviders()
        bump()
      },
      onUnauthorized: invalidate,
    })

    poller.start()
    // Polling pauses in the background and resumes on return, with a refresh for what changed meanwhile.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        poller.start()
        reloadProviders()
        bump()
      } else {
        poller.stop()
      }
    })

    return () => {
      subscription.remove()
      poller.stop()
    }
  }, [token, reloadProviders, bump, invalidate])

  // Runs a write and refreshes every screen when it finishes, whether it succeeded or not.
  const write = useCallback(async (action) => {
    try {
      return await action(tokenRef.current)
    } catch (error) {
      if (error?.status === 401) invalidate()
      throw error
    } finally {
      bump()
    }
  }, [bump, invalidate])

  const operate = useCallback((providerId, operation) => write((accessToken) => {
    const connection = providersRef.current.find((provider) => provider.id === providerId)
    if (!connection?.connected) {
      throw Object.assign(new Error('Conecte este provedor em Ajustes.'), { status: 409 })
    }
    return runOperation(accessToken, connection, operation)
  }), [write])

  const actions = useMemo(() => ({
    createFolder: (providerId, parentRef, name) =>
      operate(providerId, { kind: 'CREATE_FOLDER', parentRef: parentRef ?? '', name }),
    rename: (providerId, entry, name) =>
      operate(providerId, { kind: 'UPDATE', ref: entry.ref, name, version: entry.version }),
    remove: (providerId, entry) =>
      operate(providerId, { kind: 'DELETE', ref: entry.ref, version: entry.version }),
    upload: (providerId, parentRef, file) =>
      operate(providerId, { kind: 'UPLOAD', parentRef: parentRef ?? '', file }),
    setShortcut: (providerId, ref, pinned) => write((accessToken) => (
      pinned ? addShortcut(accessToken, providerId, ref) : removeShortcut(accessToken, providerId, ref)
    )),
    publicLink: (providerId, ref) => write((accessToken) => enablePublicLink(accessToken, providerId, ref)),
  }), [operate, write])

  const value = useMemo(
    () => ({ providers, providersStatus, revision, reloadProviders, refresh: bump, ...actions }),
    [providers, providersStatus, revision, reloadProviders, bump, actions],
  )

  return <HubContext.Provider value={value}>{children}</HubContext.Provider>
}

export function useHub() {
  const value = useContext(HubContext)
  if (!value) throw new Error('useHub must be used inside HubProvider')
  return value
}
