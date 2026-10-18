import {
  PixelBookmark,
  PixelBrush,
  PixelCamera,
  PixelDownload,
  PixelFilePlus,
  PixelFolderPlus,
  PixelImage,
  PixelLink,
  PixelPencil,
  PixelTrash,
  PixelUpload,
} from './PixelIcons'

// Each factory only lists the actions the caller can perform, so no entry is a dead button.
// handlers: { rename, download, remove, pin, link } for items; { upload, photos, folder, file, camera }
// for the create menu.
const FILE_ACTIONS = [
  { id: 'rename', key: 'rename', label: 'Renomear', icon: PixelPencil },
  { id: 'download', key: 'download', label: 'Baixar', icon: PixelDownload },
  { id: 'link', key: 'link', label: 'Link público', icon: PixelLink },
  { id: 'pin', key: 'pin', label: 'Atalho', icon: PixelBookmark },
  { id: 'delete', key: 'remove', label: 'Excluir', icon: PixelTrash, danger: true },
]

const FOLDER_ACTIONS = [
  { id: 'rename', key: 'rename', label: 'Renomear', icon: PixelPencil },
  { id: 'delete', key: 'remove', label: 'Excluir', icon: PixelTrash, danger: true },
]

// The create menu's tiles across the top, then its list.
const CREATE_TILES = [
  { id: 'upload', key: 'upload', label: 'Enviar arquivos', icon: PixelUpload },
  { id: 'photos', key: 'photos', label: 'Enviar fotos', icon: PixelImage },
]

const CREATE_ACTIONS = [
  { id: 'folder', key: 'folder', label: 'Criar pasta', icon: PixelFolderPlus },
  { id: 'file', key: 'file', label: 'Criar arquivo', icon: PixelFilePlus },
  { id: 'camera', key: 'camera', label: 'Tire uma foto ou grave um vídeo', icon: PixelCamera },
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

// colorPicker (optional): { swatch, panel } adds "Cor da pasta", which opens a palette under its row.
export function folderMenuItems(handlers, { colorPicker = null } = {}) {
  const items = build(FOLDER_ACTIONS, handlers)
  if (!colorPicker) return items
  const color = { id: 'color', label: 'Cor da pasta', icon: PixelBrush, swatch: colorPicker.swatch, panel: colorPicker.panel }
  const at = items.findIndex((item) => item.id === 'delete')
  return at < 0 ? [...items, color] : [...items.slice(0, at), color, ...items.slice(at)]
}

export function createMenuItems(handlers) {
  return { tiles: build(CREATE_TILES, handlers), items: build(CREATE_ACTIONS, handlers) }
}
