import { useCallback, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import { connectProvider, isSessionFailure } from '@bridgit/shared-client'
import { errorMessage } from '../api/errorMessage'
import { describeOauthReturn } from '../settings/oauthOutcome'
import { useSession } from '../auth/SessionContext'
import { filesScope, foldersScope, HOME } from './eventScopes'
import { useHub } from './HubContext'

// Lets the in-app browser close itself when the redirect returns to the app.
WebBrowser.maybeCompleteAuthSession()

// The OAuth flow that connects a cloud account. Returns `connectAccount(providerId, options)`:
//   addAccount   true connects one more account of the provider; false (default) reconnects the existing one
//   onConnected  called with the connectionId the server reports when the connection succeeded
// It resolves to a message in Portuguese, or '' on success.
// The consent happens in the system browser. The server sends the user back to the app's own URL
// (bridgit:// in a build, exp:// in Expo Go) with the outcome in the query string.
export function useConnectAccount() {
  const { token, invalidate } = useSession()
  const { reloadProviders, refreshScopes } = useHub()
  const pending = useRef(false)

  // OAuth finishes in the system browser; refresh the provider list when the app comes back.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pending.current) reloadProviders()
    })
    return () => subscription.remove()
  }, [reloadProviders])

  return useCallback(async (providerId, { addAccount = false, onConnected } = {}) => {
    const redirectUrl = Linking.createURL('oauth')
    let message = ''
    let connectionId = null
    pending.current = true
    try {
      const { authorizationUrl } = await connectProvider(token, providerId, redirectUrl, { addAccount })
      const result = await WebBrowser.openAuthSessionAsync(authorizationUrl, redirectUrl)
      if (result.type === 'success' && result.url) {
        const outcome = describeOauthReturn(Linking.parse(result.url).queryParams)
        if (outcome.message) throw new Error(outcome.message)
        connectionId = outcome.connectionId
      }
    } catch (error) {
      if (isSessionFailure(error)) invalidate()
      else message = errorMessage(error)
    } finally {
      pending.current = false
    }
    // Refresh even when the browser was dismissed: the connection may have completed anyway.
    await reloadProviders()
    refreshScopes(connectionId ? [HOME, foldersScope(connectionId), filesScope(connectionId)] : [HOME])
    if (connectionId && !message) onConnected?.(connectionId)
    return message
  }, [token, invalidate, reloadProviders, refreshScopes])
}
