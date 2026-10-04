import { apiRequest } from '@bridgit/shared-client'
import { apiOptions } from '../api/config'
import {
  buildStoredSession,
  clearSession,
  getDeviceKey,
  readSession,
  writeSession,
} from './sessionStore'

// Framework-free session logic behind SessionProvider. The phone is the user's own device, so a session
// never expires locally: it ends only when the server rejects it (401) or the user logs out.
export function createSessionManager({ onChange }) {
  let current = null

  function set(next) {
    current = next
    onChange(next)
  }

  async function store(next) {
    current = next
    await writeSession(next)
    onChange(next)
  }

  function end() {
    current = null
    onChange(null)
    clearSession().catch(() => {})
  }

  // Loads the stored session and shows it as-is, however old it is. Call revalidate() afterwards.
  async function restore() {
    let stored = null
    try {
      stored = await readSession()
    } catch {
      // Unreadable secure storage behaves like a signed-out device.
    }
    if (!stored?.accessToken) return null
    set(stored)
    return stored
  }

  // Asks the server once whether the session is still valid. Only a 401 ends it; being offline or a
  // server error keeps the user signed in.
  async function revalidate() {
    const checked = current
    if (!checked?.accessToken) return
    try {
      const data = await apiRequest('/api/auth/refresh', {
        ...apiOptions,
        method: 'POST',
        token: checked.accessToken,
      })
      if (current?.accessToken !== checked.accessToken) return
      await store(buildStoredSession(data))
    } catch (error) {
      if (error?.status === 401 && current?.accessToken === checked.accessToken) end()
    }
  }

  async function authenticate(path, { username, password }) {
    const data = await apiRequest(path, {
      ...apiOptions,
      method: 'POST',
      body: {
        username,
        password,
        deviceKey: await getDeviceKey(),
        clientKind: 'mobile',
        persistent: true,
      },
    })
    const next = buildStoredSession(data)
    await store(next)
    return next
  }

  async function logout() {
    const token = current?.accessToken
    end()
    if (token) {
      await apiRequest('/api/auth/logout', { ...apiOptions, method: 'POST', token }).catch(() => {})
    }
  }

  // Replaces the stored session after the server returns a new one (e.g. username change).
  async function replace(data) {
    await store(buildStoredSession(data))
  }

  return {
    restore,
    revalidate,
    login: (credentials) => authenticate('/api/auth/login', credentials),
    register: (credentials) => authenticate('/api/auth/register', credentials),
    logout,
    end,
    replace,
    current: () => current,
  }
}
