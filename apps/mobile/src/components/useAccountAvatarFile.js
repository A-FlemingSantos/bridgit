import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'
import { connectionAvatarPath, getConnectionAvatar } from '@bridgit/shared-client'
import { API_BASE_URL } from '../api/config'

// The photo is behind the session, and on Android <Image> does not send the source's headers, so it is
// downloaded with the bearer token and shown from a local file. One file per account and generation:
// a reconnect is a new generation, which may bring a new photo.
const ROOT = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}account-avatars/` : null

// `${connectionId}-${generation}` -> local file URI (object URL in the browser), or null when the account
// has no photo.
const known = new Map()
const inflight = new Map()

async function dropOlderGenerations(connectionId, keep) {
  const names = await FileSystem.readDirectoryAsync(ROOT).catch(() => [])
  await Promise.all(
    names
      .filter((name) => name.startsWith(`${connectionId}-`) && name !== keep)
      .map((name) => FileSystem.deleteAsync(`${ROOT}${name}`, { idempotent: true }).catch(() => {})),
  )
}

async function fetchAvatar(connectionId, generation, token) {
  const name = `${connectionId}-${generation}`
  const file = `${ROOT}${name}`
  const info = await FileSystem.getInfoAsync(file).catch(() => null)
  if (info?.exists) return file

  await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true }).catch(() => {})
  const download = await FileSystem.downloadAsync(
    `${API_BASE_URL}${connectionAvatarPath(connectionId, generation)}`,
    file,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (download.status === 200) {
    dropOlderGenerations(connectionId, name)
    return file
  }
  await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {})
  // 404 is "no photo" (or not available right now); anything else is worth another try later.
  if (download.status === 404) return null
  throw new Error(`avatar ${download.status}`)
}

// In the browser there is no device file system, but fetch sends the token: the photo becomes an object URL.
async function fetchAvatarBlob(connectionId, generation, token) {
  try {
    const blob = await getConnectionAvatar(token, connectionId, generation)
    return blob ? URL.createObjectURL(blob) : null
  } catch (error) {
    if (error?.status === 404) return null
    throw error
  }
}

function loadAvatar(connectionId, generation, token) {
  const key = `${connectionId}-${generation}`
  if (known.has(key)) return Promise.resolve(known.get(key))
  const pending = inflight.get(key)
  if (pending) return pending

  const fetcher = Platform.OS === 'web' ? fetchAvatarBlob : fetchAvatar
  const request = fetcher(connectionId, generation, token)
    .then((uri) => {
      known.set(key, uri)
      return uri
    })
    .catch(() => null)
    .finally(() => inflight.delete(key))
  inflight.set(key, request)
  return request
}

// Local file URI of the account's photo, or null while loading or when there is none.
export function useAccountAvatarFile(connectionId, generation, token) {
  const key = connectionId ? `${connectionId}-${generation ?? 0}` : null
  const [uri, setUri] = useState(() => (key && known.has(key) ? known.get(key) : null))

  useEffect(() => {
    if (!key || !token || (!ROOT && Platform.OS !== 'web')) {
      setUri(null)
      return undefined
    }
    if (known.has(key)) {
      setUri(known.get(key))
      return undefined
    }
    let active = true
    setUri(null)
    loadAvatar(connectionId, generation ?? 0, token).then((next) => {
      if (active) setUri(next)
    })
    return () => {
      active = false
    }
  }, [key, connectionId, generation, token])

  return uri
}
