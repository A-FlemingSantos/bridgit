export const SESSION_KEY = 'bridgit.session'
export const DEVICE_KEY = 'bridgit.device'
export const BROWSER_COOKIE = 'bridgit.browser'

export function getDeviceKey() {
  let deviceKey = localStorage.getItem(DEVICE_KEY)
  if (!deviceKey) {
    deviceKey = crypto.randomUUID()
    localStorage.setItem(DEVICE_KEY, deviceKey)
  }
  return deviceKey
}

export function readSession() {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  clearBrowserCookie()
}

export function isValidStoredToken(token) {
  if (!token || typeof token !== 'string') return false
  if (token.startsWith('demo-')) return false
  return token.length > 0
}

export function setBrowserCookie() {
  document.cookie = `${BROWSER_COOKIE}=1; Path=/; SameSite=Lax`
}

export function clearBrowserCookie() {
  document.cookie = `${BROWSER_COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`
}

export function hasBrowserCookie() {
  return document.cookie.split(';').some((part) => part.trim().startsWith(`${BROWSER_COOKIE}=`))
}

export function buildStoredSession(data) {
  return {
    accessToken: data.accessToken,
    expiresAt: data.expiresAt,
    user: data.user,
    session: data.session,
  }
}
