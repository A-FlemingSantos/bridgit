import { useCallback, useEffect, useRef, useState } from 'react'
import { Share } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { createMenuItems, fileMenuItems, folderMenuItems } from '../components/menus'
import { useHub } from './HubContext'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function failureMessage(error) {
  return error?.message || 'Não foi possível concluir. Tente novamente.'
}

// Menu handlers, dialogs and feedback for the write actions on files and folders.
// `providerId` and `parentRef` say where "Nova pasta" and "Enviar" act; without them the create menu is empty.
export function useItemActions({ providerId = null, parentRef = null } = {}) {
  const hub = useHub()
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const say = useCallback((message) => {
    setNotice(message)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setNotice(''), 4000)
  }, [])

  const closeDialog = useCallback(() => setDialog(null), [])

  const providerOf = (entry) => entry.providerId ?? providerId

  const rename = (entry) => setDialog({
    type: 'name',
    title: entry.isFolder ? 'Renomear pasta' : 'Renomear arquivo',
    initial: entry.name,
    confirmLabel: 'Renomear',
    onSubmit: async (name) => {
      if (name === entry.name) return
      await hub.rename(providerOf(entry), entry, name)
      say('Renomeado.')
    },
  })

  const remove = (entry) => setDialog({
    type: 'confirm',
    title: entry.isFolder ? 'Excluir pasta' : 'Excluir arquivo',
    message: `"${entry.name}" será excluído do provedor.`,
    confirmLabel: 'Excluir',
    danger: true,
    onSubmit: async () => {
      await hub.remove(providerOf(entry), entry)
      say('Excluído.')
    },
  })

  const togglePin = async (entry) => {
    try {
      await hub.setShortcut(providerOf(entry), entry.ref, !entry.pinned)
      say(entry.pinned ? 'Atalho removido.' : 'Atalho criado.')
    } catch (error) {
      say(failureMessage(error))
    }
  }

  const shareLink = async (entry) => {
    try {
      const link = await hub.publicLink(providerOf(entry), entry.ref)
      await Share.share({ message: link?.url ?? '' })
    } catch (error) {
      say(failureMessage(error))
    }
  }

  const newFolder = () => setDialog({
    type: 'name',
    title: 'Nova pasta',
    initial: '',
    confirmLabel: 'Criar',
    onSubmit: async (name) => {
      await hub.createFolder(providerId, parentRef, name)
      say('Pasta criada.')
    },
  })

  const upload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false })
      if (result.canceled || !result.assets?.[0]) return
      const asset = result.assets[0]

      if ((asset.size ?? 0) > MAX_UPLOAD_BYTES) {
        say('O arquivo excede o limite de 50 MB.')
        return
      }

      // Native sends { uri, name, type } as a form part; web sends the File the picker already holds.
      const file = asset.file ?? {
        uri: asset.uri,
        name: asset.name,
        type: asset.mimeType ?? 'application/octet-stream',
        size: asset.size,
      }
      say('Enviando…')
      await hub.upload(providerId, parentRef, file)
      say('Arquivo enviado.')
    } catch (error) {
      say(failureMessage(error))
    }
  }

  const canCreate = Boolean(providerId)

  return {
    dialog,
    closeDialog,
    notice,
    fileMenu: (entry) => fileMenuItems({
      rename: () => rename(entry),
      remove: () => remove(entry),
      pin: () => togglePin(entry),
      link: () => shareLink(entry),
    }, { pinned: entry.pinned }),
    folderMenu: (entry) => folderMenuItems({
      rename: () => rename(entry),
      remove: () => remove(entry),
    }),
    createMenu: () => createMenuItems(canCreate ? { upload, folder: newFolder } : {}),
  }
}
