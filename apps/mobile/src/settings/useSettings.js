import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { apiRequest, connectProvider, disconnectProvider } from '@bridgit/shared-client'
import { getItem, setItem } from '../auth/secureStorage'
import { useSession } from '../auth/SessionContext'
import { useProviders } from '../hub/hooks'
import { formatWhen } from '../hub/format'

export const ABOUT = {
  version: '0.1',
  stores: 'Só metadados. O arquivo fica no provedor.',
  providers: 'OneDrive, Google Drive e Dropbox.',
}

const NOTIFY_FAIL_KEY = 'bridgit.notifyFail'

// Lets the in-app browser close itself when the redirect returns to the app.
WebBrowser.maybeCompleteAuthSession()

const OAUTH_ERRORS = {
  PROVEDOR_RECUSOU: 'A conexão foi cancelada no provedor.',
  OAUTH_STATE_EXPIRADO: 'A tentativa expirou. Tente conectar de novo.',
  OAUTH_STATE_INVALIDO: 'A tentativa de conexão é inválida. Tente de novo.',
  OAUTH_CODE_AUSENTE: 'O provedor não retornou a autorização. Tente de novo.',
  REFRESH_TOKEN_AUSENTE: 'O provedor não concedeu acesso contínuo. Tente de novo.',
}

function oauthOutcome(url) {
  const { queryParams } = Linking.parse(url)
  if (queryParams?.status === 'connected') return ''
  return OAUTH_ERRORS[queryParams?.error] ?? 'Não foi possível conectar o provedor.'
}

// The API reports "scheduled" while a connection is healthy and "attention" after an error.
const SYNC_STATES = {
  SCHEDULED: 'Sincronização agendada',
  ATTENTION: 'Precisa de atenção',
}

function syncLabel(state) {
  if (!state) return 'Aguardando a primeira sincronização'
  return SYNC_STATES[String(state).toUpperCase()] ?? String(state)
}

function sessionLabel(item) {
  const parts = [item.browser, item.device].filter(Boolean)
  return item.current ? 'Este aparelho' : parts.join(' · ') || 'Sessão'
}

// Real settings backed by the account, session and provider endpoints.
// Actions that can fail return a message in Portuguese, or '' on success.
export function useSettings() {
  const { token, user, logout, invalidate, replaceSession } = useSession()
  const { providers: statuses, reload: reloadProviders } = useProviders()
  const [notifyFail, setNotifyFailState] = useState(true)
  const [sessions, setSessions] = useState([])

  const guard = useCallback(async (action) => {
    try {
      await action()
      return ''
    } catch (error) {
      if (error?.status === 401) {
        invalidate()
        return ''
      }
      return error?.message || 'Não foi possível concluir. Tente novamente.'
    }
  }, [invalidate])

  const loadSessions = useCallback(async () => {
    try {
      const items = await apiRequest('/api/auth/sessions', { token })
      setSessions((Array.isArray(items) ? items : []).map((item) => ({
        id: item.id,
        device: sessionLabel(item),
        detail: item.current ? 'Ativo agora' : `Ativo ${formatWhen(item.lastSeenAt).toLowerCase()}`,
        current: Boolean(item.current),
      })))
    } catch (error) {
      if (error?.status === 401) invalidate()
    }
  }, [token, invalidate])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  useEffect(() => {
    getItem(NOTIFY_FAIL_KEY)
      .then((value) => {
        if (value != null) setNotifyFailState(value !== '0')
      })
      .catch(() => {})
  }, [])

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
  const connect = useCallback(async (id) => {
    const redirectUrl = Linking.createURL('oauth')
    const message = await guard(async () => {
      const { authorizationUrl } = await connectProvider(token, id, redirectUrl)
      const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, redirectUrl)
      if (result.type === 'success' && result.url) {
        const outcome = oauthOutcome(result.url)
        if (outcome) throw new Error(outcome)
      }
    })
    // Refresh even when the browser was dismissed: the connection may have completed anyway.
    await reloadProviders()
    return message
  }, [guard, token, reloadProviders])

  const disconnect = useCallback((id) => guard(async () => {
    await disconnectProvider(token, id)
    await reloadProviders()
  }), [guard, token, reloadProviders])

  const setNotifyFail = useCallback((value) => {
    setNotifyFailState(value)
    setItem(NOTIFY_FAIL_KEY, value ? '1' : '0').catch(() => {})
  }, [])

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

  const deleteAccount = useCallback(async () => {
    const message = await guard(() => apiRequest('/api/account', { method: 'DELETE', token }))
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
      account: provider.connected
        ? provider.account?.email ?? provider.account?.name ?? 'Conectado'
        : null,
      sync: provider.connected ? syncLabel(provider.syncState) : null,
    })),
    connectProvider: connect,
    disconnectProvider: disconnect,
    notifyFail,
    setNotifyFail,
    sessions,
    revokeOtherSessions,
    changePassword,
    deleteAccount,
  }
}
