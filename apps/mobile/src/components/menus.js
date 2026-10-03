import {
  Bookmark,
  FolderPlus,
  Link,
  Pencil,
  Trash,
  Upload,
} from 'lucide-react-native'

// Each factory only lists the actions the caller can perform, so no entry is a dead button.
// handlers: { rename, remove, pin, link } for items; { upload, folder } for the create menu.
const FILE_ACTIONS = [
  { id: 'rename', key: 'rename', label: 'Renomear', icon: Pencil },
  { id: 'link', key: 'link', label: 'Link público', icon: Link },
  { id: 'pin', key: 'pin', label: 'Atalho', icon: Bookmark },
  { id: 'delete', key: 'remove', label: 'Excluir', icon: Trash, danger: true },
]

const FOLDER_ACTIONS = [
  { id: 'rename', key: 'rename', label: 'Renomear', icon: Pencil },
  { id: 'delete', key: 'remove', label: 'Excluir', icon: Trash, danger: true },
]

const CREATE_ACTIONS = [
  { id: 'upload', key: 'upload', label: 'Enviar', icon: Upload },
  { id: 'folder', key: 'folder', label: 'Nova pasta', icon: FolderPlus },
]

function build(actions, handlers = {}, overrides = {}) {
  return actions
    .filter((action) => typeof handlers[action.key] === 'function')
    .map(({ key, ...action }) => ({
      ...action,
      ...overrides[action.id],
      onSelect: handlers[key],
    }))
}

export function fileMenuItems(handlers, { pinned = false } = {}) {
  return build(FILE_ACTIONS, handlers, { pin: { label: pinned ? 'Remover atalho' : 'Atalho' } })
}

export function folderMenuItems(handlers) {
  return build(FOLDER_ACTIONS, handlers)
}

export function createMenuItems(handlers) {
  return build(CREATE_ACTIONS, handlers)
}
