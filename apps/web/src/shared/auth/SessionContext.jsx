import { ApiClientError } from '@bridgit/shared-client'
import { clearUserStorage } from '../hub/storage/index.js'
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
import { clearSession, isValidStoredToken, readSession, SESSION_KEY, writeSession } from './sessionStorage.js'

const MAX_TIMEOUT_MS = 2 ** 31 - 1

function getSessionExpiry(storedSession) {
  return storedSession?.session?.expiresAt ?? storedSession?.expiresAt ?? null
}

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [status, setStatus] = useState('boot')
  const [session, setSession] = useState(null)
  const expiryTimerRef = useRef(null)
  const discardReturnPathRef = useRef(false)
  const activeUserRef = useRef(null)

  const clearAuth = useCallback(() => {
    const previousUser = activeUserRef.current ?? readSession()?.user?.id
    activeUserRef.current = null
    if (previousUser) void clearUserStorage(previousUser)
    clearSession()
    setSession(null)
    setStatus('anonymous')
  }, [])

  const endSessionWithoutReturn = useCallback(() => {
    discardReturnPathRef.current = true
    clearAuth()
  }, [clearAuth])

  const applySession = useCallback((nextSession) => {
    const nextUser = nextSession?.user?.id ?? null
    if (activeUserRef.current && activeUserRef.current !== nextUser) void clearUserStorage(activeUserRef.current)
    activeUserRef.current = nextUser
    setSession(nextSession)
    setStatus('authenticated')
  }, [])

  const refreshSession = useCallback(
    async (token = session?.accessToken ?? readSession()?.accessToken) => {
      if (!token) return null

      try {
        const nextSession = await refreshRequest(token)
        applySession(nextSession)
        return nextSession
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          clearAuth()
        }

        return null
      }
    },
    [applySession, clearAuth, session?.accessToken],
  )

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

      try {
        const nextSession = await refreshRequest(stored.accessToken)
        if (!active) return
        applySession(nextSession)
      } catch (error) {
        if (!active) return

        if (error instanceof ApiClientError && error.status === 401) {
          clearAuth()
          return
        }

        applySession(stored)
      }
    }

    void boot()

    return () => {
      active = false
    }
  }, [applySession, clearAuth])

  const sessionPersistent = session?.session?.persistent ?? null
  const sessionExpiresAt = getSessionExpiry(session)

  useEffect(() => {
    if (status !== 'authenticated' || sessionPersistent !== false || !sessionExpiresAt) return undefined

    const expiresMs = Date.parse(sessionExpiresAt)
    if (Number.isNaN(expiresMs)) return undefined

    const delay = Math.min(Math.max(0, expiresMs - Date.now()), MAX_TIMEOUT_MS)
    expiryTimerRef.current = setTimeout(() => {
      expiryTimerRef.current = null
      clearAuth()
    }, delay)

    return () => {
      if (expiryTimerRef.current) {
        clearTimeout(expiryTimerRef.current)
        expiryTimerRef.current = null
      }
    }
  }, [clearAuth, sessionExpiresAt, sessionPersistent, status])

  useEffect(() => {
    function onStorage(event) {
      if (event.key !== SESSION_KEY) return

      if (!event.newValue) {
        if (activeUserRef.current) void clearUserStorage(activeUserRef.current)
        activeUserRef.current = null
        setSession(null)
        setStatus('anonymous')
        return
      }

      try {
        const parsed = JSON.parse(event.newValue)
        applySession(parsed)
      } catch {
        setSession(null)
        setStatus('anonymous')
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [applySession])

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
      return nextSession
    },
    [applySession],
  )

  const register = useCallback(
    async (credentials) => {
      const nextSession = await registerRequest(credentials)
      applySession(nextSession)
      return nextSession
    },
    [applySession],
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
        return nextSession
      } catch (error) {
        handleUnauthorized(error)
        throw error
      }
    },
    [applySession, handleUnauthorized, session?.accessToken],
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

      try {
        const updated = await updateSessionPersistentRequest(token, persistent)
        const stored = readSession()
        if (!stored) return updated

        const nextSession = {
          ...stored,
          expiresAt: updated?.expiresAt ?? stored.expiresAt,
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
