import { ApiClientError } from '@bridgit/shared-client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  changePasswordRequest,
  deleteAccountRequest,
  loginRequest,
  listSessionsRequest,
  logoutRequest,
  refreshRequest,
  registerRequest,
  revokeOtherSessionsRequest,
  updateAccountRequest,
  updateSessionPersistentRequest,
} from './authApi.js'
import {
  clearBrowserCookie,
  clearSession,
  hasBrowserCookie,
  isValidStoredToken,
  readSession,
  SESSION_KEY,
  setBrowserCookie,
  writeSession,
} from './sessionStorage.js'

const REFRESH_LEAD_MS = 5 * 60 * 1000
const RETRY_MS = 60 * 1000

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [status, setStatus] = useState('boot')
  const [session, setSession] = useState(null)
  const refreshTimerRef = useRef(null)
  const retryTimerRef = useRef(null)
  const discardReturnPathRef = useRef(false)

  const clearAuth = useCallback(() => {
    clearSession()
    setSession(null)
    setStatus('anonymous')
  }, [])

  const endSessionWithoutReturn = useCallback(() => {
    discardReturnPathRef.current = true
    clearAuth()
  }, [clearAuth])

  const applySession = useCallback((nextSession) => {
    setSession(nextSession)
    setStatus('authenticated')
  }, [])

  const refreshSessionRef = useRef(null)

  const scheduleRefresh = useCallback((expiresAt, accessToken) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }

    if (!expiresAt || !accessToken) return

    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now() - REFRESH_LEAD_MS)
    refreshTimerRef.current = setTimeout(() => {
      void refreshSessionRef.current?.(accessToken)
    }, delay)
  }, [])

  const scheduleRetry = useCallback((accessToken) => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
    }

    retryTimerRef.current = setTimeout(() => {
      void refreshSessionRef.current?.(accessToken)
    }, RETRY_MS)
  }, [])

  const refreshSession = useCallback(
    async (token = session?.accessToken ?? readSession()?.accessToken) => {
      if (!token) return null

      try {
        const nextSession = await refreshRequest(token)
        applySession(nextSession)
        scheduleRefresh(nextSession.expiresAt, nextSession.accessToken)
        return nextSession
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          clearAuth()
          return null
        }

        if (error instanceof ApiClientError) {
          scheduleRetry(token)
        }

        return null
      }
    },
    [applySession, clearAuth, scheduleRefresh, scheduleRetry, session?.accessToken],
  )

  refreshSessionRef.current = refreshSession

  useEffect(() => {
    let active = true

    async function boot() {
      const stored = readSession()

      if (!stored?.accessToken) {
        if (active) setStatus('anonymous')
        return
      }

      if (!isValidStoredToken(stored.accessToken)) {
        clearSession()
        if (active) setStatus('anonymous')
        return
      }

      if (!stored.session?.persistent && !hasBrowserCookie()) {
        clearSession()
        if (active) setStatus('anonymous')
        return
      }

      try {
        const nextSession = await refreshRequest(stored.accessToken)
        if (!active) return
        applySession(nextSession)
        scheduleRefresh(nextSession.expiresAt, nextSession.accessToken)
      } catch (error) {
        if (!active) return

        if (error instanceof ApiClientError && error.status === 401) {
          clearAuth()
          return
        }

        if (error instanceof ApiClientError && error.status === 0) {
          applySession(stored)
          scheduleRetry(stored.accessToken)
          return
        }

        applySession(stored)
      }
    }

    void boot()

    return () => {
      active = false
    }
  }, [applySession, clearAuth, scheduleRefresh, scheduleRetry])

  useEffect(() => {
    if (status !== 'authenticated' || !session?.expiresAt || !session?.accessToken) return undefined

    scheduleRefresh(session.expiresAt, session.accessToken)

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [scheduleRefresh, session?.accessToken, session?.expiresAt, status])

  useEffect(() => {
    function onStorage(event) {
      if (event.key !== SESSION_KEY) return

      if (!event.newValue) {
        setSession(null)
        setStatus('anonymous')
        return
      }

      try {
        const parsed = JSON.parse(event.newValue)
        setSession(parsed)
        setStatus('authenticated')
      } catch {
        setSession(null)
        setStatus('anonymous')
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(
    () => () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    },
    [],
  )

  const handleUnauthorized = useCallback(
    (error) => {
      if (error instanceof ApiClientError && error.status === 401) {
        clearAuth()
      }
    },
    [clearAuth],
  )

  const login = useCallback(
    async (credentials) => {
      const nextSession = await loginRequest(credentials)
      applySession(nextSession)
      scheduleRefresh(nextSession.expiresAt, nextSession.accessToken)
      return nextSession
    },
    [applySession, scheduleRefresh],
  )

  const register = useCallback(
    async (credentials) => {
      const nextSession = await registerRequest(credentials)
      applySession(nextSession)
      scheduleRefresh(nextSession.expiresAt, nextSession.accessToken)
      return nextSession
    },
    [applySession, scheduleRefresh],
  )

  const logout = useCallback(async () => {
    const token = session?.accessToken ?? readSession()?.accessToken

    try {
      if (token) {
        await logoutRequest(token)
      }
    } catch (error) {
      handleUnauthorized(error)
    } finally {
      endSessionWithoutReturn()
    }
  }, [endSessionWithoutReturn, handleUnauthorized, session?.accessToken])

  const updateUsername = useCallback(
    async (username) => {
      const token = session?.accessToken
      if (!token) throw new Error('Sessao indisponivel.')

      try {
        const nextSession = await updateAccountRequest(token, username)
        applySession(nextSession)
        scheduleRefresh(nextSession.expiresAt, nextSession.accessToken)
        return nextSession
      } catch (error) {
        handleUnauthorized(error)
        throw error
      }
    },
    [applySession, handleUnauthorized, scheduleRefresh, session?.accessToken],
  )

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      const token = session?.accessToken
      if (!token) throw new Error('Sessao indisponivel.')

      try {
        return await changePasswordRequest(token, currentPassword, newPassword)
      } catch (error) {
        handleUnauthorized(error)
        throw error
      }
    },
    [handleUnauthorized, session?.accessToken],
  )

  const deleteAccount = useCallback(async () => {
    const token = session?.accessToken
    if (!token) throw new Error('Sessao indisponivel.')

    try {
      await deleteAccountRequest(token)
      endSessionWithoutReturn()
    } catch (error) {
      handleUnauthorized(error)
      throw error
    }
  }, [endSessionWithoutReturn, handleUnauthorized, session?.accessToken])

  const setPersistent = useCallback(
    async (persistent) => {
      const token = session?.accessToken
      if (!token) throw new Error('Sessao indisponivel.')

      if (!persistent) {
        setBrowserCookie()
      } else {
        clearBrowserCookie()
      }

      try {
        const updated = await updateSessionPersistentRequest(token, persistent)
        const stored = readSession()
        if (!stored) return updated

        const nextSession = {
          ...stored,
          session: {
            ...stored.session,
            ...updated,
          },
        }
        writeSession(nextSession)
        setSession(nextSession)
        return updated
      } catch (error) {
        handleUnauthorized(error)
        throw error
      }
    },
    [handleUnauthorized, session?.accessToken],
  )

  const listSessions = useCallback(async () => {
    const token = session?.accessToken
    if (!token) return []
    return listSessionsRequest(token)
  }, [session?.accessToken])

  const revokeOtherSessions = useCallback(async () => {
    const token = session?.accessToken
    if (!token) throw new Error('Sessao indisponivel.')

    try {
      return await revokeOtherSessionsRequest(token)
    } catch (error) {
      handleUnauthorized(error)
      throw error
    }
  }, [handleUnauthorized, session?.accessToken])

  const api = useMemo(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      shouldDiscardReturnPath: () => discardReturnPathRef.current,
      acknowledgeDiscardReturnPath: () => {
        discardReturnPathRef.current = false
      },
      login,
      register,
      logout,
      refreshSession,
      updateUsername,
      changePassword,
      deleteAccount,
      setPersistent,
      listSessions,
      revokeOtherSessions,
    }),
    [
      changePassword,
      deleteAccount,
      listSessions,
      login,
      logout,
      refreshSession,
      register,
      revokeOtherSessions,
      session,
      setPersistent,
      status,
      updateUsername,
    ],
  )

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) {
    throw new Error('useSession must be used within SessionProvider')
  }
  return value
}
