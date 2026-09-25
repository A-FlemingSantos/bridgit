import {
  ArrowLeftRight,
  Bookmark,
  FolderInput,
  Link,
  Pencil,
  Trash2,
} from 'lucide-react'
import { makeApiFolderLocation } from '../../../shared/state/hubStore.js'

export function fileMenuItems(item, { openOverlay, actions, isShortcut, onError, providerName }) {
  const pinned = isShortcut?.(item.provider, item.ref) ?? false
  const origin = item.parentRef
    ? makeApiFolderLocation({ ref: item.parentRef, name: '', provider: item.provider }, providerName)
    : null

  return [
    {
      id: 'rename',
      label: 'Renomear',
      icon: Pencil,
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
      icon: FolderInput,
      onSelect: () =>
        openOverlay({
          type: 'move',
          kind: 'file',
          providerId: item.provider,
          ref: item.ref,
          parentRef: item.parentRef ?? null,
        }),
    },
    {
      id: 'mirror',
      label: 'Espelhar',
      icon: ArrowLeftRight,
      onSelect: () =>
        openOverlay({
          type: 'composer',
          mode: 'create',
          origin: makeApiFolderLocation(item, providerName),
        }),
    },
    {
      id: 'link',
      label: 'Link público',
      icon: Link,
      onSelect: () =>
        openOverlay({ type: 'public-link', providerId: item.provider, ref: item.ref, name: item.name }),
    },
    {
      id: 'pin',
      label: pinned ? 'Remover atalho' : 'Atalho',
      icon: Bookmark,
      onSelect: () => {
        void actions.toggleShortcut(item).catch((error) => onError?.(error))
      },
    },
    {
      id: 'delete',
      label: 'Excluir',
      icon: Trash2,
      danger: true,
      onSelect: () =>
        openOverlay({
          type: 'confirm-delete-entry',
          kind: 'file',
          providerId: item.provider,
          ref: item.ref,
          parentRef: item.parentRef ?? null,
          name: item.name,
        }),
    },
  ]
}

export function folderMenuItems(item, { openOverlay, providerName }) {
  const origin = makeApiFolderLocation(item, providerName)

  return [
    {
      id: 'rename',
      label: 'Renomear',
      icon: Pencil,
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
      icon: FolderInput,
      onSelect: () =>
        openOverlay({
          type: 'move',
          kind: 'folder',
          providerId: item.provider,
          ref: item.ref,
          parentRef: item.parentRef ?? null,
        }),
    },
    {
      id: 'mirror',
      label: 'Espelhar',
      icon: ArrowLeftRight,
      onSelect: () =>
        openOverlay({
          type: 'composer',
          mode: 'create',
          origin,
        }),
    },
    {
      id: 'delete',
      label: 'Excluir',
      icon: Trash2,
      danger: true,
      onSelect: () =>
        openOverlay({
          type: 'confirm-delete-entry',
          kind: 'folder',
          providerId: item.provider,
          ref: item.ref,
          parentRef: item.parentRef ?? null,
          name: item.name,
        }),
    },
  ]
}
