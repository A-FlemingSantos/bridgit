import { PixelBookmark, PixelBrush, PixelFolderMove, PixelLink, PixelPencil, PixelTrash, PixelUnlink } from '../../../shared/components/PixelIcons/PixelIcons.jsx'

export function fileMenuItems(item, { openOverlay, actions, isShortcut, hasPublicLink, onError }) {
  const pinned = isShortcut?.(item.provider, item.ref) ?? false
  const linked = hasPublicLink?.(item.provider, item.ref) ?? false

  return [
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
        openOverlay({ type: 'public-link', providerId: item.provider, ref: item.ref, name: item.name }),
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
export function folderMenuItems(item, { openOverlay, colorPicker = null }) {
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
