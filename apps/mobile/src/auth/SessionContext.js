import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createSessionManager } from './sessionManager'

const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [status, setStatus] = useState('loading')
  const [session, setSession] = useState(null)
  const managerRef = useRef(null)
  if (!managerRef.current) managerRef.current = createSessionManager({ onChange: setSession })
  const manager = managerRef.current

  // The stored session is shown right away and confirmed once with the server; it never expires locally.
  useEffect(() => {
    let active = true

    async function restore() {
      await manager.restore()
      if (!active) return
      setStatus('ready')
      manager.revalidate()
    }

    restore()
    return () => {
      active = false
    }
  }, [manager])

  const value = useMemo(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      token: session?.accessToken ?? null,
      login: manager.login,
      register: manager.register,
      logout: manager.logout,
      // A rejected token (401) ends the session locally without calling the server.
      invalidate: manager.end,
      replaceSession: manager.replace,
    }),
    [status, session, manager],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside SessionProvider')
  return value
}
