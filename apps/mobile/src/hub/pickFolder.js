import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'

const { StorageAccessFramework } = FileSystem

// Only Android lets an app open a whole folder from the device (Storage Access Framework).
export const canPickFolder = Platform.OS === 'android'

const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

function typeOf(name) {
  const dot = name.lastIndexOf('.')
  return (dot > 0 && TYPES[name.slice(dot + 1).toLowerCase()]) || 'application/octet-stream'
}

// A SAF uri ends in an encoded document id such as "primary:DCIM/Camera/IMG_1.jpg"; its last
// segment is the entry's name.
export function safName(uri) {
  const id = decodeURIComponent(String(uri).split('/').pop() ?? '')
  const path = id.slice(id.indexOf(':') + 1)
  return path.split('/').filter(Boolean).pop() ?? id
}

async function isDirectory(uri) {
  try {
    const info = await FileSystem.getInfoAsync(uri)
    return Boolean(info.isDirectory)
  } catch {
    return false
  }
}

// Asks for a folder and lists every file under it.
// Returns { name, files: [{ dir, file }] } or null when the user backs out; `dir` is the file's
// folder relative to the picked one ("" for its top level, "a/b" below), as the web's
// webkitRelativePath gives it.
export async function pickFolderTree() {
  const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync()
  if (!permission.granted) return null
  const root = permission.directoryUri
  const files = []

  async function walk(uri, dir) {
    const children = await StorageAccessFramework.readDirectoryAsync(uri)
    for (const child of children) {
      const name = safName(child)
      if (await isDirectory(child)) {
        await walk(child, dir ? `${dir}/${name}` : name)
        continue
      }
      const info = await FileSystem.getInfoAsync(child).catch(() => null)
      files.push({ dir, file: { uri: child, name, type: typeOf(name), size: info?.size } })
    }
  }

  await walk(root, '')
  return { name: safName(root), files }
}
