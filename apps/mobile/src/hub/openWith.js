import { Linking, Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'
import * as IntentLauncher from 'expo-intent-launcher'
import * as Sharing from 'expo-sharing'
import { createContentTicket } from '@bridgit/shared-client'
import { API_BASE_URL } from '../api/config'
import { contentType, fileNameFrom } from './download'

// Android's FLAG_GRANT_READ_URI_PERMISSION: the chosen app may read the cached copy.
const GRANT_READ = 1

// Downloads the file into the app cache and hands it to the system: "Abrir com…" on Android, the
// share sheet (with "Abrir em…") on iOS. `url` must already carry its access ticket.
export async function openWith({ url, name, mimeType }) {
  if (Platform.OS === 'web') {
    await Linking.openURL(url)
    return
  }

  // Each download gets its own folder so the file keeps its real name; older copies are dropped.
  const root = `${FileSystem.cacheDirectory}open-with/`
  await FileSystem.deleteAsync(root, { idempotent: true }).catch(() => {})
  const folder = `${root}${Date.now()}/`
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true })
  const download = await FileSystem.downloadAsync(url, `${folder}download`)
  if (download.status < 200 || download.status >= 300) {
    await FileSystem.deleteAsync(folder, { idempotent: true }).catch(() => {})
    throw new Error('Não foi possível baixar o arquivo.')
  }
  const target = `${folder}${fileNameFrom(download.headers, name)}`
  await FileSystem.moveAsync({ from: download.uri, to: target })
  const type = contentType(download.headers, mimeType)

  if (Platform.OS === 'android') {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: await FileSystem.getContentUriAsync(target),
        flags: GRANT_READ,
        type,
      })
      return
    } catch {
      // No app opens this type directly; the share sheet still lets the user pick one.
    }
  }

  if (!(await Sharing.isAvailableAsync())) throw new Error('Nenhum app disponível para abrir este arquivo.')
  await Sharing.shareAsync(target, { mimeType: type, dialogTitle: 'Abrir com' })
}

// Asks for a fresh download ticket (one in hand may have expired, they last 5 min) and opens the
// file with another app. Backs the reader's "Abrir com…" and the file menu's "Baixar".
export async function openFileWith(token, providerId, file) {
  const ticket = await createContentTicket(token, providerId, file.ref, 'attachment')
  if (!ticket?.url) throw new Error('Arquivo indisponível.')
  const url = /^https?:\/\//i.test(ticket.url) ? ticket.url : `${API_BASE_URL}${ticket.url}`
  await openWith({ url, name: file.name, mimeType: file.mimeType })
}
