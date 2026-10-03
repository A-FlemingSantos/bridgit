import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { apiRequest } from '@bridgit/shared-client'
import { apiOptions } from '../api/config'
import {
  buildStoredSession,
  clearSession,
  getDeviceKey,
  isSessionExpired,
  readSession,
  writeSession,
} from './sessionStore'

const SessionContext = createContext(null)

// Same cadence as the web client: renew 5 minutes before expiry, retry every minute on network failure.
const REFRESH_LEAD_MS = 5 * 60 * 1000
const RETRY_MS = 60 * 1000

export function SessionProvider({ children }) {
  const [status, setStatus] = useState('loading')
  const [session, setSession] = useState(null)
  const sessionRef = useRef(null)
  const timerRef = useRef(null)
  const refreshRef = useRef(null)

  const clearTimer = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  // Without "remember", the session lives in memory only and ends with the app process.
  const storeSession = useCallback(async (next) => {
    sessionRef.current = next
    if (next.session?.persistent) await writeSession(next)
    else await clearSession().catch(() => {})
    setSession(next)
  }, [])

  const endSession = useCallback(() => {
    clearTimer()
    sessionRef.current = null
    setSession(null)
    clearSession().catch(() => {})
  }, [clearTimer])

  const scheduleRefresh = useCallback((current, delayOverride) => {
    clearTimer()
    if (!current?.accessToken) return
    const expiresAt = Date.parse(current.expiresAt)
    const delay = delayOverride ?? (
      Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now() - REFRESH_LEAD_MS) : RETRY_MS
    )
    timerRef.current = setTimeout(() => refreshRef.current?.(), delay)
  }, [clearTimer])

  // Renews the token while it is still valid; the server cannot renew an expired one.
  const refresh = useCallback(async () => {
    const current = sessionRef.current
    if (!current?.accessToken) return
    try {
      const data = await apiRequest('/api/auth/refresh', {
        ...apiOptions,
        method: 'POST',
        token: current.accessToken,
      })
      if (sessionRef.current?.accessToken !== current.accessToken) return
      const next = buildStoredSession(data)
      await storeSession(next)
      scheduleRefresh(next)
    } catch (error) {
      if (error?.status === 401) {
        endSession()
        return
      }
      // Offline or server error: keep the session and try again shortly.
      scheduleRefresh(current, RETRY_MS)
    }
  }, [storeSession, scheduleRefresh, endSession])
  refreshRef.current = refresh

  useEffect(() => {
    let active = true

    async function restore() {
      let stored = null
      try {
        stored = await readSession()
      } catch {
        // Unreadable secure storage behaves like a signed-out device.
      }

      if (!active) return
      if (!stored || isSessionExpired(stored)) {
        if (stored) clearSession().catch(() => {})
        setStatus('ready')
        return
      }

      // Show the stored session right away, then confirm it with the server.
      sessionRef.current = stored
      setSession(stored)
      setStatus('ready')
      scheduleRefresh(stored, 0)
    }

    restore()
    return () => {
      active = false
      clearTimer()
    }
  }, [scheduleRefresh, clearTimer])

  // Timers do not run while the app is in the background, so recheck when it returns.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !sessionRef.current) return
      if (isSessionExpired(sessionRef.current)) {
        endSession()
        return
      }
      scheduleRefresh(sessionRef.current)
    })
    return () => subscription.remove()
  }, [scheduleRefresh, endSession])

  const authenticate = useCallback(async (path, { username, password, persistent }) => {
    const data = await apiRequest(path, {
      ...apiOptions,
      method: 'POST',
      body: { username, password, deviceKey: await getDeviceKey(), persistent },
    })
    const next = buildStoredSession(data)

    await storeSession(next)
    scheduleRefresh(next)
    return next
  }, [storeSession, scheduleRefresh])

  const login = useCallback(
    ({ username, password, persistent }) =>
      authenticate('/api/auth/login', { username, password, persistent }),
    [authenticate],
  )

  const register = useCallback(
    ({ username, password }) =>
      authenticate('/api/auth/register', { username, password, persistent: false }),
    [authenticate],
  )

  const logout = useCallback(async () => {
    const token = sessionRef.current?.accessToken
    endSession()
    if (token) {
      await apiRequest('/api/auth/logout', { ...apiOptions, method: 'POST', token }).catch(() => {})
    }
  }, [endSession])

  // Replaces the stored session after the server returns a new one (e.g. username change).
  const replaceSession = useCallback(async (data) => {
    const next = buildStoredSession(data)
    await storeSession(next)
    scheduleRefresh(next)
  }, [storeSession, scheduleRefresh])

  const value = useMemo(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      token: session?.accessToken ?? null,
      login,
      register,
      logout,
      // A rejected token (401) ends the session locally without calling the server.
      invalidate: endSession,
      replaceSession,
    }),
    [status, session, login, register, logout, endSession, replaceSession],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}
