import {
  ArrowLeftRight,
  Bookmark,
  FilePen,
  FolderInput,
  FolderPlus,
  Link,
  PenLine,
  Pencil,
  Stamp,
  Trash,
  Upload,
} from 'lucide-react-native'

export function fileMenuItems(onSelect) {
  return [
    { id: 'rename', label: 'Renomear', icon: Pencil, onSelect },
    { id: 'move', label: 'Mover', icon: FolderInput, onSelect },
    { id: 'mirror', label: 'Espelhar', icon: ArrowLeftRight, onSelect },
    { id: 'link', label: 'Link público', icon: Link, onSelect },
    { id: 'pin', label: 'Atalho', icon: Bookmark, onSelect },
    { id: 'delete', label: 'Excluir', icon: Trash, danger: true, onSelect },
  ]
}

export function folderMenuItems(onSelect) {
  return [
    { id: 'rename', label: 'Renomear', icon: Pencil, onSelect },
    { id: 'move', label: 'Mover', icon: FolderInput, onSelect },
    { id: 'mirror', label: 'Espelhar', icon: ArrowLeftRight, onSelect },
    { id: 'delete', label: 'Excluir', icon: Trash, danger: true, onSelect },
  ]
}

export function createMenuItems(onSelect) {
  return [
    { id: 'upload', label: 'Enviar', icon: Upload, onSelect },
    { id: 'folder', label: 'Nova pasta', icon: FolderPlus, onSelect },
    { id: 'edit', label: 'Editar PDF', icon: FilePen, onSelect },
    { id: 'sign-req', label: 'Pedir assinaturas', icon: Stamp, onSelect },
    { id: 'sign', label: 'Assinar', icon: PenLine, onSelect },
  ]
}
