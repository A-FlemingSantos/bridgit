import { providerFileUrl } from '../../../shared/config/routes.js'
import OpenChoices from './OpenChoices/OpenChoices.jsx'
import { PixelBookmark, PixelBrush, PixelDownload, PixelFolderMove, PixelLink, PixelOpen, PixelPencil, PixelTrash, PixelUnlink } from '../../../shared/components/PixelIcons/PixelIcons.jsx'

export function fileMenuItems(item, { openOverlay, actions, isShortcut, hasPublicLink, navigate, onError }) {
  const pinned = isShortcut?.(item.provider, item.ref) ?? false
  const linked = hasPublicLink?.(item.provider, item.ref) ?? false

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
        openOverlay({
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
    {
      id: 'link',
      label: 'Link público',
      icon: linked ? PixelUnlink : PixelLink,
      onSelect: () =>
        openOverlay({
          type: 'public-link',
          kind: 'file',
          providerId: item.provider,
          ref: item.ref,
          name: item.name,
        }),
    },
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
export function folderMenuItems(item, { openOverlay, hasPublicLink, colorPicker = null }) {
  const linked = hasPublicLink?.(item.provider, item.ref) ?? false

  return [
    {
      id: 'rename',
      label: 'Renomear',
      icon: PixelPencil,
      onSelect: () =>
        openOverlay({
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
    {
      id: 'link',
      label: 'Link público',
      icon: linked ? PixelUnlink : PixelLink,
      onSelect: () =>
        openOverlay({
          type: 'public-link',
          kind: 'folder',
          providerId: item.provider,
          ref: item.ref,
          name: item.name,
        }),
    },
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
