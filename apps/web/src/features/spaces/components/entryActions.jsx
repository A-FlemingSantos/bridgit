import { providerFileUrl } from '../../../shared/config/routes.js'
import OpenChoices from './OpenChoices/OpenChoices.jsx'
import { PixelBookmark, PixelBrush, PixelCopy, PixelDownload, PixelFolderMove, PixelLink, PixelOpen, PixelPencil, PixelTrash, PixelUnlink } from '../../../shared/components/PixelIcons/PixelIcons.jsx'

// Creating the link (or asking for the existing one: the call is idempotent) copies its address.
// The item fills while that runs; the rejection tells the menu to empty it again.
function publicLinkItems(item, { actions, hasPublicLink, onError }) {
  const linked = hasPublicLink?.(item.provider, item.ref) ?? false
  const target = { providerId: item.provider, ref: item.ref }
  const copyLink = () =>
    actions
      .enablePublicLink(target)
      .then((link) => navigator.clipboard.writeText(link.url))
      .catch((error) => {
        onError?.(error)
        throw error
      })

  if (!linked) {
    return [{ id: 'link', label: 'Link público', icon: PixelLink, fill: true, onSelect: copyLink }]
  }
  return [
    { id: 'link', label: 'Copiar link', icon: PixelCopy, fill: true, onSelect: copyLink },
    {
      id: 'unlink',
      label: 'Desativar link',
      icon: PixelUnlink,
      onSelect: () => {
        void actions.disablePublicLink(target).catch((error) => onError?.(error))
      },
    },
  ]
}

export function fileMenuItems(item, { openOverlay, actions, isShortcut, hasPublicLink, navigate, onError, onRename }) {
  const pinned = isShortcut?.(item.provider, item.ref) ?? false

  const fileUrl = providerFileUrl(item.provider, item.ref)

  return [
    {
      id: 'open',
      label: 'Abrir',
      icon: PixelOpen,
      panel: ({ close }) => (
        <OpenChoices
          onNewTab={() => {
            close()
            window.open(fileUrl, '_blank', 'noopener,noreferrer')
          }}
          onHere={() => {
            close()
            if (navigate) navigate(fileUrl)
            else window.location.assign(fileUrl)
          }}
        />
      ),
    },
    {
      id: 'rename',
      label: 'Renomear',
      icon: PixelPencil,
      onSelect: () =>
        onRename ? onRename(item) : openOverlay({
          type: 'name',
          kind: 'file',
          mode: 'rename',
          providerId: item.provider,
          ref: item.ref,
          name: item.name,
        }),
    },
    {
      id: 'download',
      label: 'Baixar',
      icon: PixelDownload,
      onSelect: () => {
        void actions
          .getDownloadUrl({ providerId: item.provider, ref: item.ref })
          .then((url) => {
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = item.name ?? ''
            anchor.rel = 'noopener'
            document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
          })
          .catch((error) => onError?.(error))
      },
    },
    {
      id: 'move',
      label: 'Mover',
      icon: PixelFolderMove,
      onSelect: () =>
        openOverlay({
          type: 'move',
          kind: 'file',
          providerId: item.provider,
          ref: item.ref,
          parentRef: item.parentRef ?? undefined,
        }),
    },
    ...publicLinkItems(item, { actions, hasPublicLink, onError }),
    {
      id: 'pin',
      label: pinned ? 'Remover atalho' : 'Atalho',
      icon: PixelBookmark,
      onSelect: () => {
        void actions.toggleShortcut(item).catch((error) => onError?.(error))
      },
    },
    {
      id: 'delete',
      label: 'Excluir',
      icon: PixelTrash,
      danger: true,
      onSelect: () =>
        openOverlay({
          type: 'confirm-delete-entry',
          kind: 'file',
          providerId: item.provider,
          ref: item.ref,
          name: item.name,
        }),
    },
  ]
}

// colorPicker (optional): { swatch, panel } adds a "Cor da pasta" choice that opens a docked palette.
export function folderMenuItems(item, { openOverlay, actions, hasPublicLink, onError, onRename, colorPicker = null }) {
  return [
    {
      id: 'rename',
      label: 'Renomear',
      icon: PixelPencil,
      onSelect: () =>
        onRename ? onRename(item) : openOverlay({
          type: 'name',
          kind: 'folder',
          mode: 'rename',
          providerId: item.provider,
          ref: item.ref,
          name: item.name,
        }),
    },
    {
      id: 'move',
      label: 'Mover',
      icon: PixelFolderMove,
      onSelect: () =>
        openOverlay({
          type: 'move',
          kind: 'folder',
          providerId: item.provider,
          ref: item.ref,
          parentRef: item.parentRef ?? undefined,
        }),
    },
    ...(colorPicker
      ? [
          {
            id: 'color',
            label: 'Cor da pasta',
            icon: PixelBrush,
            swatch: colorPicker.swatch,
            panel: colorPicker.panel,
          },
        ]
      : []),
    ...publicLinkItems(item, { actions, hasPublicLink, onError }),
    {
      id: 'delete',
      label: 'Excluir',
      icon: PixelTrash,
      danger: true,
      onSelect: () =>
        openOverlay({
          type: 'confirm-delete-entry',
          kind: 'folder',
          providerId: item.provider,
          ref: item.ref,
          name: item.name,
        }),
    },
  ]
}
