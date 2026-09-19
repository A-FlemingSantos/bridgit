import {
  ArrowLeftRight,
  Bookmark,
  FolderInput,
  Link,
  Pencil,
  Trash2,
} from 'lucide-react'
import { makeFolderLocationFromState } from '../../../shared/state/hubStore.js'

export function fileMenuItems(item, { openOverlay, dispatch, state }) {
  const shortcut = state.shortcuts.includes(item.fileRef)
  const origin = item.folderRef ? makeFolderLocationFromState(state, item.folderRef) : null
  return [
    {
      id: 'rename',
      label: 'Renomear',
      icon: Pencil,
      onSelect: () =>
        openOverlay({ type: 'name', kind: 'file', mode: 'rename', fileRef: item.fileRef }),
    },
    {
      id: 'move',
      label: 'Mover',
      icon: FolderInput,
      onSelect: () => openOverlay({ type: 'move', kind: 'file', fileRef: item.fileRef }),
    },
    {
      id: 'mirror',
      label: 'Espelhar',
      icon: ArrowLeftRight,
      onSelect: () => openOverlay({ type: 'composer', mode: 'create', origin }),
    },
    {
      id: 'link',
      label: 'Link público',
      icon: Link,
      onSelect: () => openOverlay({ type: 'public-link', fileRef: item.fileRef }),
    },
    {
      id: 'pin',
      label: shortcut ? 'Remover atalho' : 'Atalho',
      icon: Bookmark,
      onSelect: () => dispatch({ type: 'toggleShortcut', fileRef: item.fileRef }),
    },
    {
      id: 'delete',
      label: 'Excluir',
      icon: Trash2,
      danger: true,
      onSelect: () =>
        openOverlay({ type: 'confirm-delete-entry', kind: 'file', fileRef: item.fileRef }),
    },
  ]
}

export function folderMenuItems(item, { openOverlay }) {
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
          folderRef: item.folderRef,
        }),
    },
    {
      id: 'move',
      label: 'Mover',
      icon: FolderInput,
      onSelect: () => openOverlay({ type: 'move', kind: 'folder', folderRef: item.folderRef }),
    },
    {
      id: 'mirror',
      label: 'Espelhar',
      icon: ArrowLeftRight,
      onSelect: () =>
        openOverlay({
          type: 'composer',
          mode: 'create',
          origin: item.origin ?? null,
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
          folderRef: item.folderRef,
        }),
    },
  ]
}
