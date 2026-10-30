import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'
import { getThumbnail, itemThumbnailPath } from '@bridgit/shared-client'
import { API_BASE_URL } from '../api/config'
import { useSession } from '../auth/SessionContext'
import { createThumbnailQueue, previewSettling, thumbnailEligible } from '../hub/thumbnails'

// The preview is behind the session, and on Android <Image> does not send the source's headers, so it is
// downloaded with the bearer token and shown from a local file, like the account photos. One file per
// account, item and revision: an edit is a new revision, so a new preview.
const ROOT = FileSystem.cacheDirectory ? `${FileSystem.cacheDirectory}file-thumbs/` : null
const queue = createThumbnailQueue()

// Item refs can be long paths; the file name is a short hash of them.
function hash(text) {
  let value = 5381
  for (let i = 0; i < text.length; i += 1) value = ((value * 33) ^ text.charCodeAt(i)) >>> 0
  return value.toString(16)
}

// A preview being redrawn gets a new file each time (so <Image> does not reuse its memory of the old
// one); the previous one for the same item is dropped.
const settlingFiles = new Map()

function fileFor(key, settling) {
  return `${ROOT}${hash(key)}${settling ? `-s${Date.now()}` : ''}`
}

async function readStored(key) {
  const file = fileFor(key, false)
  const info = await FileSystem.getInfoAsync(file).catch(() => null)
  return info?.exists && info.size > 0 ? file : null
}

async function download(key, connectionId, ref, token, settling) {
  const file = fileFor(key, settling)
  if (settling) {
    const previous = settlingFiles.get(key)
    if (previous) FileSystem.deleteAsync(previous, { idempotent: true }).catch(() => {})
    settlingFiles.set(key, file)
  }
  await FileSystem.makeDirectoryAsync(ROOT, { intermediates: true }).catch(() => {})
  const result = await FileSystem.downloadAsync(`${API_BASE_URL}${itemThumbnailPath(connectionId, ref)}`, file, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (result.status === 200) {
    const info = await FileSystem.getInfoAsync(file).catch(() => null)
    if (info?.size > 0) return file
  }
  await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {})
  if (result.status === 200 || result.status === 404) return null
  const error = new Error(`thumbnail ${result.status}`)
  error.status = result.status
  throw error
}

// In the browser there is no device file system, but fetch sends the token: the preview becomes an object URL.
async function downloadBlob(connectionId, ref, token) {
  const blob = await getThumbnail(token, connectionId, ref)
  return blob && blob.size > 0 ? URL.createObjectURL(blob) : null
}

// URI of the file's cloud preview, or null while loading and when it has none (or cannot have one).
export function useFileThumbnail(file) {
  const { token } = useSession()
  const connectionId = file?.connectionId ?? null
  const ref = file?.ref ?? null
  const revision = file?.revision ?? ''
  const eligible = thumbnailEligible(file?.providerId, file) && Boolean(connectionId && ref)
  const settling = previewSettling(file)
  const key = eligible ? `${connectionId}\0${ref}\0${revision}` : null
  const [uri, setUri] = useState(() => (key ? queue.peek(key) ?? null : null))

  useEffect(() => {
    const web = Platform.OS === 'web'
    if (!key || !token || (!ROOT && !web)) {
      setUri(null)
      return undefined
    }
    const known = settling ? undefined : queue.peek(key)
    if (known !== undefined) {
      setUri(known)
      return undefined
    }
    let active = true
    setUri(null)
    queue.load(key, {
      readStored: web ? null : () => readStored(key),
      fetchRemote: web
        ? () => downloadBlob(connectionId, ref, token)
        : () => download(key, connectionId, ref, token, settling),
      keep: !settling,
    }).then((next) => {
      if (active) setUri(next)
    })
    return () => {
      active = false
    }
  }, [key, connectionId, ref, token, settling])

  return uri
}
