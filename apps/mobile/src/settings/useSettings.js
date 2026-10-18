import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import Constants from 'expo-constants'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { apiRequest, connectProvider, disconnectProvider, isSessionFailure } from '@bridgit/shared-client'
import { useSession } from '../auth/SessionContext'
import { useHub } from '../hub/HubContext'
import { filesScope, foldersScope, HOME } from '../hub/eventScopes'
import { useProviders } from '../hub/hooks'
import { formatWhen, needsReconnect } from '../hub/format'
import { errorMessage } from '../api/errorMessage'
import { describeOauthReturn } from './oauthOutcome'

export const ABOUT = {
  version: Constants.expoConfig?.version ?? '1.0.0',
}

// Lets the in-app browser close itself when the redirect returns to the app.
WebBrowser.maybeCompleteAuthSession()


// Real settings backed by the account, session and provider endpoints.
// Actions that can fail return a message in Portuguese, or '' on success.
export function useSettings() {
  const { token, user, logout, invalidate, replaceSession } = useSession()
  const { providers: statuses, status: providersStatus, reload: reloadProviders } = useProviders()
  const { refreshScopes } = useHub()
  const [sessions, setSessions] = useState([])
  // Provider whose OAuth came back with a different account and waits for the user's confirmation.
  const [accountChangeId, setAccountChangeId] = useState(null)

  const guard = useCallback(async (action) => {
    try {
      await action()
      return ''
    } catch (error) {
      if (isSessionFailure(error)) {
        invalidate()
        return ''
      }
      return errorMessage(error)
    }
  }, [invalidate])

  const loadSessions = useCallback(async () => {
    try {
      const items = await apiRequest('/api/auth/sessions', { token })
      setSessions((Array.isArray(items) ? items : []).map((item) => ({
        id: item.id,
        browser: item.browser || 'Sessão',
        device: item.device || '',
        detail: item.current ? 'Ativa agora' : `Ativa ${formatWhen(item.lastSeenAt).toLowerCase()}`,
        current: Boolean(item.current),
      })))
    } catch (error) {
      if (isSessionFailure(error)) invalidate()
    }
  }, [token, invalidate])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  // OAuth finishes in the system browser; refresh provider state when the app comes back.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reloadProviders()
    })
    return () => subscription.remove()
  }, [reloadProviders])

  const saveUsername = useCallback((next) => guard(async () => {
    const username = next.trim()
    if (!username || username === user?.username) return
    await replaceSession(await apiRequest('/api/account', { method: 'PATCH', token, body: { username } }))
  }), [guard, user, token, replaceSession])

  // The consent happens in the system browser. The server sends the user back to the app's own URL
  // (bridgit:// in a build, exp:// in Expo Go) with the outcome in the query string.
  const connect = useCallback(async (id, { allowAccountChange = false } = {}) => {
    const redirectUrl = Linking.createURL('oauth')
    setAccountChangeId(null)
    const message = await guard(async () => {
      const { authorizationUrl } = await connectProvider(token, id, redirectUrl, { allowAccountChange })
      const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, redirectUrl)
      if (result.type === 'success' && result.url) {
        const outcome = describeOauthReturn(Linking.parse(result.url).queryParams)
        if (outcome.accountChange) {
          setAccountChangeId(id)
          return
        }
        if (outcome.message) throw new Error(outcome.message)
      }
    })
    // Refresh even when the browser was dismissed: the connection may have completed anyway.
    await reloadProviders()
    refreshScopes([HOME, foldersScope(id), filesScope(id)])
    return message
  }, [guard, token, reloadProviders, refreshScopes])

  // Replacing the account deletes recents, shortcuts, public links and the catalog of the old one.
  const confirmAccountChange = useCallback(() => {
    const id = accountChangeId
    if (!id) return Promise.resolve('')
    return connect(id, { allowAccountChange: true })
  }, [accountChangeId, connect])

  const cancelAccountChange = useCallback(() => setAccountChangeId(null), [])

  const disconnect = useCallback((id) => guard(async () => {
    await disconnectProvider(token, id)
    await reloadProviders()
    // Disconnecting drops the provider's recents, shortcuts and catalog.
    refreshScopes([HOME, foldersScope(id), filesScope(id)])
  }), [guard, token, reloadProviders, refreshScopes])

  const revokeOtherSessions = useCallback(() => guard(async () => {
    await apiRequest('/api/auth/sessions/revoke-others', { method: 'POST', token })
    await loadSessions()
  }), [guard, token, loadSessions])

  const changePassword = useCallback((current, next, confirm) => {
    if (!current || !next || !confirm) return Promise.resolve('Preencha os campos obrigatórios.')
    if (next !== confirm) return Promise.resolve('As senhas não coincidem.')
    return guard(() => apiRequest('/api/account/password', {
      method: 'POST',
      token,
      body: { currentPassword: current, newPassword: next },
    }))
  }, [guard, token])

  const deleteAccount = useCallback(async (password) => {
    if (!password) return 'Informe sua senha para excluir a conta.'
    const message = await guard(() => apiRequest('/api/account', { method: 'DELETE', token, body: { password } }))
    if (!message) await logout()
    return message
  }, [guard, token, logout])

  return {
    username: user?.username ?? '',
    saveUsername,
    providers: statuses.map((provider) => ({
      id: provider.id,
      name: provider.name,
      connected: provider.connected,
      configured: provider.configured,
      needsReconnect: needsReconnect(provider),
      account: provider.connected
        ? provider.account?.email ?? provider.account?.name ?? 'Conectado'
        : null,
    })),
    providersStatus,
    reloadProviders,
    connectProvider: connect,
    accountChangeId,
    confirmAccountChange,
    cancelAccountChange,
    disconnectProvider: disconnect,
    sessions,
    revokeOtherSessions,
    changePassword,
    deleteAccount,
  }
}
