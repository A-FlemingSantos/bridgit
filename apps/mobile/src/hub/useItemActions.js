import { useCallback, useEffect, useRef, useState } from 'react'
import { Platform, Share } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from '@bridgit/shared-client'
import FolderColorPalette from '../components/FolderColorPalette'
import { createMenuItems, fileMenuItems, folderMenuItems } from '../components/menus'
import { errorMessage } from '../api/errorMessage'
import { safeName } from './download'
import { splitExtension, withExtension } from './format'
import { useSession } from '../auth/SessionContext'
import { useFolderColors } from './folderColors'
import { useHub } from './HubContext'
import { openFileWith } from './openWith'
import { pickFolderTree } from './pickFolder'

function failureMessage(error) {
  return errorMessage(error)
}

// Menu handlers, dialogs and feedback for the write actions on files and folders.
// `providerId` and `parentRef` say where "Nova pasta" and "Enviar" act; without them the create menu is empty.
export function useItemActions({ providerId = null, parentRef = null } = {}) {
  const hub = useHub()
  const { token } = useSession()
  const folderColors = useFolderColors()
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

  const rename = (entry) => {
    // Files keep their extension: the field holds only the stem, like the web and the providers do.
    const { stem, extension } = entry.isFolder ? { stem: entry.name, extension: '' } : splitExtension(entry.name)
    setDialog({
      type: 'name',
      title: entry.isFolder ? 'Renomear pasta' : 'Renomear arquivo',
      initial: stem,
      suffix: extension,
      confirmLabel: 'Renomear',
      onSubmit: async (value) => {
        const name = withExtension(value, extension)
        if (name === entry.name) return
        await hub.rename(providerOf(entry), entry, name)
        say('Renomeado.')
      },
    })
  }

  const remove = (entry) => setDialog({
    type: 'confirm',
    title: entry.isFolder ? 'Excluir pasta' : 'Excluir arquivo',
    message: entry.isFolder
      ? `"${entry.name}" e tudo o que está dentro dela vão para a lixeira do provedor.`
      : `"${entry.name}" vai para a lixeira do provedor.`,
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

  // Opens the link sheet, which loads the link and creates, edits, shares or disables it.
  const openLinkSheet = (target) => setDialog({
    type: 'public-link',
    providerId: target.providerId,
    ref: target.ref,
    name: target.name,
    kind: target.kind,
  })

  const linkSheet = (entry) => openLinkSheet({
    providerId: providerOf(entry),
    ref: entry.ref,
    name: entry.name,
    kind: entry.isFolder ? 'folder' : 'file',
  })

  // A row of the side panel's public links.
  const manageLink = (link) => openLinkSheet(link)

  // Downloads the file and hands it to the system "Abrir com…" (the share sheet on iOS).
  const download = async (entry) => {
    try {
      say('Baixando…')
      await openFileWith(token, providerOf(entry), entry)
      setNotice('')
    } catch (error) {
      say(failureMessage(error))
    }
  }

  const shareUrl = async (url) => {
    try {
      await Share.share({ message: url })
    } catch (error) {
      say(failureMessage(error))
    }
  }

  const disableLink = async (link) => {
    try {
      await hub.disablePublicLink(link.providerId, link.ref)
      say('Link desativado.')
    } catch (error) {
      say(failureMessage(error))
    }
  }

  // `target` picks another provider's root (the Home asks which one); by default the screen's folder.
  const newFolder = (target = null) => setDialog({
    type: 'name',
    title: 'Nova pasta',
    initial: '',
    confirmLabel: 'Criar',
    onSubmit: async (name) => {
      if (target) await hub.createFolder(target, null, name)
      else await hub.createFolder(providerId, parentRef, name)
      say('Pasta criada.')
    },
  })

  // Sends picked files one after another to `target`'s root, or to the screen's folder by default.
  // Native sends { uri, name, type } as a form part; web sends the File the picker already holds.
  const sendFiles = async (target, files) => {
    const tooLarge = files.filter((file) => (file.size ?? 0) > MAX_UPLOAD_BYTES)
    const ready = files.filter((file) => (file.size ?? 0) <= MAX_UPLOAD_BYTES)
    if (ready.length === 0) {
      say(`O arquivo excede o limite de ${MAX_UPLOAD_LABEL}.`)
      return
    }
    for (const [index, file] of ready.entries()) {
      say(ready.length > 1 ? `Enviando ${index + 1} de ${ready.length}…` : 'Enviando…')
      if (target) await hub.upload(target, null, file)
      else await hub.upload(providerId, parentRef, file)
    }
    const sent = ready.length > 1 ? `${ready.length} arquivos enviados.` : 'Arquivo enviado.'
    const left = tooLarge.length === 1 ? '1 ficou de fora' : `${tooLarge.length} ficaram de fora`
    say(tooLarge.length ? `${sent} ${left} por passar de ${MAX_UPLOAD_LABEL}.` : sent)
  }

  const documentFile = (asset) => asset.file ?? {
    uri: asset.uri,
    name: asset.name,
    type: asset.mimeType ?? 'application/octet-stream',
    size: asset.size,
  }

  // Files from the device's picker, or null when the user backs out.
  const pickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true })
      if (result.canceled || !result.assets?.length) return null
      return result.assets.map(documentFile)
    } catch (error) {
      say(failureMessage(error))
      return null
    }
  }

  const upload = async () => {
    const files = await pickFiles()
    if (!files) return
    try {
      await sendFiles(null, files)
    } catch (error) {
      say(failureMessage(error))
    }
  }

  // A folder from the device (Android), or null when the user backs out or it holds no files.
  const pickFolder = async () => {
    try {
      const tree = await pickFolderTree()
      if (tree && tree.files.length === 0) {
        say('A pasta escolhida não tem arquivos.')
        return null
      }
      return tree
    } catch (error) {
      say(failureMessage(error))
      return null
    }
  }

  // Rebuilds the picked folder under `target`'s root, folder by folder, then uploads each folder's
  // files into its new counterpart, as the web does with a picked directory.
  const sendFolder = async (target, tree) => {
    const tooLarge = tree.files.filter(({ file }) => (file.size ?? 0) > MAX_UPLOAD_BYTES).length
    const ready = tree.files.filter(({ file }) => (file.size ?? 0) <= MAX_UPLOAD_BYTES)
    say('Criando pastas…')
    const root = await hub.createFolder(target, null, tree.name)
    const refs = new Map([['', root?.ref ?? null]])
    const dirs = [...new Set(ready.map(({ dir }) => dir))].sort((a, b) => a.split('/').length - b.split('/').length)
    for (const dir of dirs) {
      const parts = dir ? dir.split('/') : []
      for (let depth = 1; depth <= parts.length; depth += 1) {
        const path = parts.slice(0, depth).join('/')
        if (refs.has(path)) continue
        const created = await hub.createFolder(target, refs.get(parts.slice(0, depth - 1).join('/')), parts[depth - 1])
        refs.set(path, created?.ref ?? null)
      }
    }
    for (const [index, { dir, file }] of ready.entries()) {
      say(`Enviando ${index + 1} de ${ready.length}…`)
      await hub.upload(target, refs.get(dir), file)
    }
    const left = tooLarge === 1 ? ' 1 arquivo ficou de fora' : ` ${tooLarge} arquivos ficaram de fora`
    say(`Pasta "${tree.name}" enviada.${tooLarge ? `${left} por passar de ${MAX_UPLOAD_LABEL}.` : ''}`)
  }

  // Sends what the Home picked to the cloud chosen afterwards.
  const sendPicked = async (target, picked) => {
    try {
      if (picked.kind === 'folder') await sendFolder(target, picked.tree)
      else await sendFiles(target, picked.files)
    } catch (error) {
      say(failureMessage(error))
    }
  }

  // Photos and videos from the gallery (several at once) or straight from the camera.
  const mediaFile = (asset, index) => {
    const extension = asset.type === 'video' ? 'mp4' : 'jpg'
    return asset.file ?? {
      uri: asset.uri,
      name: asset.fileName ?? `${asset.type === 'video' ? 'video' : 'foto'}-${Date.now()}-${index + 1}.${extension}`,
      type: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      size: asset.fileSize,
    }
  }

  const uploadPhotos = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 1,
      })
      if (result.canceled || !result.assets?.length) return
      await sendFiles(null, result.assets.map(mediaFile))
    } catch (error) {
      say(failureMessage(error))
    }
  }

  const capture = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync()
      if (!permission.granted) {
        say('Permita o acesso à câmera nos ajustes do aparelho.')
        return
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 1 })
      if (result.canceled || !result.assets?.length) return
      await sendFiles(null, result.assets.map(mediaFile))
    } catch (error) {
      say(failureMessage(error))
    }
  }

  // An empty file with the typed name, as the web creates one; the provider opens it from there.
  // `target` picks another provider's root, like newFolder.
  const newFile = (target = null) => setDialog({
    type: 'name',
    title: 'Criar arquivo',
    label: 'Nome do arquivo',
    initial: '',
    confirmLabel: 'Criar',
    onSubmit: async (name) => {
      let file
      if (Platform.OS === 'web') {
        file = new File([], name)
      } else {
        const folder = `${FileSystem.cacheDirectory}new-file/${Date.now()}/`
        await FileSystem.makeDirectoryAsync(folder, { intermediates: true })
        const uri = `${folder}${safeName(name)}`
        await FileSystem.writeAsStringAsync(uri, '')
        file = { uri, name, type: 'application/octet-stream', size: 0 }
      }
      if (target) await hub.upload(target, null, file)
      else await hub.upload(providerId, parentRef, file)
      say('Arquivo criado.')
    },
  })

  const canCreate = Boolean(providerId)

  return {
    dialog,
    closeDialog,
    notice,
    fileMenu: (entry) => fileMenuItems({
      rename: () => rename(entry),
      download: () => download(entry),
      remove: () => remove(entry),
      pin: () => togglePin(entry),
      link: () => linkSheet(entry),
    }, { pinned: entry.pinned }),
    folderMenu: (entry) => {
      const color = folderColors.colorOf(providerOf(entry), entry.ref)
      return folderMenuItems({
        rename: () => rename(entry),
        link: () => linkSheet(entry),
        remove: () => remove(entry),
      }, {
        colorPicker: {
          swatch: color.hex,
          panel: ({ close }) => (
            <FolderColorPalette
              selectedId={color.id}
              onPick={(id) => {
                folderColors.setColor(providerOf(entry), entry.ref, id)
                close()
              }}
            />
          ),
        },
      })
    },
    createMenu: () => createMenuItems(canCreate
      ? {
        upload: () => upload(),
        photos: uploadPhotos,
        folder: () => newFolder(),
        file: () => newFile(),
        camera: capture,
      }
      : {}),
    folderColor: (entry) => folderColors.colorOf(providerOf(entry), entry.ref).hex,
    pickFiles,
    pickFolder,
    sendPicked,
    newFolderIn: (target) => newFolder(target),
    newFileIn: (target) => newFile(target),
    shareUrl,
    disableLink,
    manageLink,
  }
}
