import { useCallback, useEffect, useRef, useState } from 'react'
import Constants from 'expo-constants'
import { apiRequest, disconnectConnection, disconnectProvider, isSessionFailure } from '@bridgit/shared-client'
import { useSession } from '../auth/SessionContext'
import { useHub } from '../hub/HubContext'
import { filesScope, foldersScope, HOME } from '../hub/eventScopes'
import { useProviders } from '../hub/hooks'
import { useConnectAccount } from '../hub/useConnectAccount'
import { formatWhen, needsReconnect } from '../hub/format'
import { errorMessage } from '../api/errorMessage'

export const ABOUT = {
  version: Constants.expoConfig?.version ?? '1.0.0',
}

// Real settings backed by the account, session and provider endpoints.
// Actions that can fail return a message in Portuguese, or '' on success.
export function useSettings() {
  const { token, user, logout, invalidate, replaceSession } = useSession()
  const { providers: statuses, status: providersStatus, reload: reloadProviders } = useProviders()
  const { refreshScopes, connections } = useHub()
  const connectionsRef = useRef(connections)
  connectionsRef.current = connections
  const connectionsOf = useCallback((providerId) => (
    connectionsRef.current.filter((connection) => connection.providerId === providerId).map((connection) => connection.connectionId)
  ), [])
  const connectAccount = useConnectAccount()
  const [sessions, setSessions] = useState([])

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

  const saveUsername = useCallback((next) => guard(async () => {
    const username = next.trim()
    if (!username || username === user?.username) return
    await replaceSession(await apiRequest('/api/account', { method: 'PATCH', token, body: { username } }))
  }), [guard, user, token, replaceSession])

  // Removes every account of the provider.
  const disconnect = useCallback((providerId) => guard(async () => {
    // Named before the call: the reload below drops them from the list.
    const removed = connectionsOf(providerId)
    await disconnectProvider(token, providerId)
    await reloadProviders()
    // Disconnecting drops the recents, shortcuts and catalog of every account of the provider.
    refreshScopes([HOME, ...removed.flatMap((id) => [foldersScope(id), filesScope(id)])])
  }), [guard, token, reloadProviders, refreshScopes, connectionsOf])

  // Removes one account; the provider's other accounts stay.
  const disconnectAccount = useCallback((connectionId) => guard(async () => {
    await disconnectConnection(token, connectionId)
    await reloadProviders()
    refreshScopes([HOME, foldersScope(connectionId), filesScope(connectionId)])
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
    providers: statuses.map((provider) => {
      const accounts = (provider.connections ?? []).map((connection) => ({
        connectionId: connection.connectionId,
        account: connection.account?.email ?? connection.account?.name ?? 'Conectado',
        needsReconnect: needsReconnect(connection),
        connectedAt: connection.connectedAt ?? null,
      }))
      return {
        id: provider.id,
        name: provider.name,
        connected: provider.connected,
        configured: provider.configured,
        needsReconnect: accounts.some((account) => account.needsReconnect),
        // Label of the oldest account (kept for screens that show one line per provider).
        account: provider.connected ? accounts[0]?.account ?? 'Conectado' : null,
        accounts,
      }
    }),
    providersStatus,
    reloadProviders,
    // connectProvider(providerId, { addAccount }): reconnects, or adds one more account with addAccount.
    connectProvider: connectAccount,
    disconnectProvider: disconnect,
    disconnectAccount,
    sessions,
    revokeOtherSessions,
    changePassword,
    deleteAccount,
  }
}
