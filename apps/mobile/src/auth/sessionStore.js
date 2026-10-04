import { getItem, removeItem, setItem } from './secureStorage'

const SESSION_KEY = 'bridgit.session'
const DEVICE_KEY = 'bridgit.device'

// Hermes has no crypto.randomUUID; the device key only needs to be unique, not secret.
function createDeviceKey() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

export async function getDeviceKey() {
  let deviceKey = await getItem(DEVICE_KEY)
  if (!deviceKey) {
    deviceKey = createDeviceKey()
    await setItem(DEVICE_KEY, deviceKey)
  }
  return deviceKey
}

export async function readSession() {
  const raw = await getItem(SESSION_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function writeSession(session) {
  await setItem(SESSION_KEY, JSON.stringify(session))
}

export async function clearSession() {
  await removeItem(SESSION_KEY)
}

export function buildStoredSession(data) {
  return {
    accessToken: data.accessToken,
    expiresAt: data.expiresAt,
    user: data.user,
    session: data.session,
  }
}
