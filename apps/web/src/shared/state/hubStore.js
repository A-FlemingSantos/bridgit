import {
  providers as seedProviders,
  spaces as seedSpaces,
} from '../../features/spaces/data/mock.js'
import { recents as seedRecents, shortcuts as seedShortcuts } from '../../features/home/data/mock.js'

export const HUB_STORAGE_KEY = 'bridgit.hub.v1'

const seedFolders = {
  '4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334': {
    name: 'Inovações técnicas',
    provider: 'OneDrive',
    providerId: 'onedrive',
  },
  'b17d93e0-2c4a-4e88-9f01-6a5d3c8e12b9': {
    name: 'Acervo digital',
    provider: 'Google Drive',
    providerId: 'google-drive',
  },
  '0f3c8a91-7b26-4d55-ae10-8c4f9d2a76e1': {
    name: 'Soluções de software',
    provider: 'Dropbox',
    providerId: 'dropbox',
  },
  'd92e4b70-1a8c-4f09-b3d6-5e7c0a18f2d3': {
    name: 'Referências de código',
    provider: 'OneDrive',
    providerId: 'onedrive',
  },
}

const seedFiles = {
  'a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0': {
    title: 'Relatório 2023',
    kind: 'PDF',
    provider: 'OneDrive',
    providerId: 'onedrive',
    folderRef: '4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334',
  },
  '7b2f0c18-4e9a-4d66-a813-0f5c1b9e3d24': {
    title: 'Revisão anual',
    kind: 'PDF',
    provider: 'Google Drive',
    providerId: 'google-drive',
    folderRef: 'b17d93e0-2c4a-4e88-9f01-6a5d3c8e12b9',
  },
  '3e6a91d4-0c28-4f77-b902-1a8d5e4c7b16': {
    title: 'Tendências',
    kind: 'PDF',
    provider: 'Dropbox',
    providerId: 'dropbox',
    folderRef: '0f3c8a91-7b26-4d55-ae10-8c4f9d2a76e1',
  },
  'c4d8b207-5a1e-49f3-8e6c-9b0d2f7a13e8': {
    title: 'Análise de desempenho',
    kind: 'PDF',
    provider: 'OneDrive',
    providerId: 'onedrive',
    folderRef: '4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334',
  },
  '18f0a6c3-9d47-4b2e-a5c1-7e3d8b90f412': {
    title: 'Estudo abrangente',
    kind: 'PDF',
    provider: 'Google Drive',
    providerId: 'google-drive',
  },
  'e9b3c714-2f80-4a16-9d5e-0c4a8f1b6d37': {
    title: 'Efetividade',
    kind: 'PDF',
    provider: 'Dropbox',
    providerId: 'dropbox',
    folderRef: '0f3c8a91-7b26-4d55-ae10-8c4f9d2a76e1',
  },
  '5d1e8a90-6c23-4f4b-b7e2-3a9c0d18f564': {
    title: 'Visão geral',
    kind: 'PDF',
    provider: 'OneDrive',
    providerId: 'onedrive',
    folderRef: 'd92e4b70-1a8c-4f09-b3d6-5e7c0a18f2d3',
  },
  '91a2f0e8-3b57-4c19-8d64-2e7f1a0c9b45': {
    title: 'Estratégias',
    kind: 'PDF',
    provider: 'Google Drive',
    providerId: 'google-drive',
    folderRef: 'b17d93e0-2c4a-4e88-9f01-6a5d3c8e12b9',
  },
}

const seedFolderContents = {
  '4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334': {
    folderRefs: [],
    fileRefs: ['a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0', 'c4d8b207-5a1e-49f3-8e6c-9b0d2f7a13e8'],
  },
  'b17d93e0-2c4a-4e88-9f01-6a5d3c8e12b9': {
    folderRefs: [],
    fileRefs: ['7b2f0c18-4e9a-4d66-a813-0f5c1b9e3d24', '91a2f0e8-3b57-4c19-8d64-2e7f1a0c9b45'],
  },
  '0f3c8a91-7b26-4d55-ae10-8c4f9d2a76e1': {
    folderRefs: [],
    fileRefs: ['3e6a91d4-0c28-4f77-b902-1a8d5e4c7b16', 'e9b3c714-2f80-4a16-9d5e-0c4a8f1b6d37'],
  },
  'd92e4b70-1a8c-4f09-b3d6-5e7c0a18f2d3': {
    folderRefs: [],
    fileRefs: ['5d1e8a90-6c23-4f4b-b7e2-3a9c0d18f564', '18f0a6c3-9d47-4b2e-a5c1-7e3d8b90f412'],
  },
}

const seedProviderContents = {
  onedrive: {
    folderRefs: ['4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334', 'd92e4b70-1a8c-4f09-b3d6-5e7c0a18f2d3'],
    fileRefs: [
      'a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0',
      'c4d8b207-5a1e-49f3-8e6c-9b0d2f7a13e8',
      '5d1e8a90-6c23-4f4b-b7e2-3a9c0d18f564',
    ],
  },
  'google-drive': {
    folderRefs: ['b17d93e0-2c4a-4e88-9f01-6a5d3c8e12b9'],
    fileRefs: [
      '7b2f0c18-4e9a-4d66-a813-0f5c1b9e3d24',
      '18f0a6c3-9d47-4b2e-a5c1-7e3d8b90f412',
      '91a2f0e8-3b57-4c19-8d64-2e7f1a0c9b45',
    ],
  },
  dropbox: {
    folderRefs: ['0f3c8a91-7b26-4d55-ae10-8c4f9d2a76e1'],
    fileRefs: ['3e6a91d4-0c28-4f77-b902-1a8d5e4c7b16', 'e9b3c714-2f80-4a16-9d5e-0c4a8f1b6d37'],
  },
}

export function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function slugify(name) {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'space'
}

export function uniqueSlug(name, spaces, ignoreId = null) {
  const base = slugify(name)
  let slug = base
  let n = 2

  while (spaces.some((space) => space.slug === slug && space.space_id !== ignoreId)) {
    slug = `${base}-${n}`
    n += 1
  }

  return slug
}

export function clone(value) {
  return structuredClone(value)
}

function seedPairs() {
  return [
    {
      pair_id: 'p-trabalho-folders',
      space_id: seedSpaces[0].space_id,
      left: locationFromFolder('4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334'),
      right: locationFromFolder('b17d93e0-2c4a-4e88-9f01-6a5d3c8e12b9'),
      status: 'synced',
    },
    {
      pair_id: 'p-trabalho-files',
      space_id: seedSpaces[0].space_id,
      left: locationFromFile('a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0'),
      right: locationFromFile('7b2f0c18-4e9a-4d66-a813-0f5c1b9e3d24'),
      status: 'conflict',
    },
    {
      pair_id: 'p-pessoal-folders',
      space_id: seedSpaces[1].space_id,
      left: locationFromFolder('0f3c8a91-7b26-4d55-ae10-8c4f9d2a76e1'),
      right: locationFromFolder('d92e4b70-1a8c-4f09-b3d6-5e7c0a18f2d3'),
      status: 'paused',
    },
  ]
}

function locationFromFolder(folderRef) {
  const folder = seedFolders[folderRef]
  return {
    kind: 'folder',
    ref: folderRef,
    name: folder.name,
    providerId: folder.providerId,
    provider: folder.provider,
  }
}

function locationFromFile(fileRef) {
  const file = seedFiles[fileRef]
  return {
    kind: 'file',
    ref: fileRef,
    name: file.title,
    providerId: file.providerId,
    provider: file.provider,
  }
}

export function seedState() {
  return {
    providers: clone(seedProviders),
    spaces: seedSpaces.map((space) => ({ ...space, paused: false })),
    pairs: seedPairs(),
    folders: clone(seedFolders),
    files: clone(seedFiles),
    folderContents: clone(seedFolderContents),
    providerContents: clone(seedProviderContents),
    recents: seedRecents.map((file) => ({ fileRef: file.fileRef, when: file.when })),
    shortcuts: seedShortcuts.map((file) => file.fileRef),
    publicLinks: {},
    recentsView: 'list',
    notifyFail: true,
    overlay: null,
  }
}

function persistable(state) {
  const { overlay, ...rest } = state
  void overlay
  return rest
}

export function loadState() {
  const fallback = seedState()

  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = window.localStorage.getItem(HUB_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return {
      ...fallback,
      ...parsed,
      overlay: null,
    }
  } catch {
    return fallback
  }
}

export function saveState(state) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(HUB_STORAGE_KEY, JSON.stringify(persistable(state)))
  } catch {
    // Ignore quota / private-mode failures; UI still works in-memory.
  }
}

export function getProvider(state, id) {
  return state.providers.find((provider) => provider.id === id) ?? null
}

export function getFolder(state, folderRef) {
  const folder = state.folders[folderRef]
  return folder ? { folderRef, ...folder } : null
}

export function getFile(state, fileRef) {
  const file = state.files[fileRef]
  return file ? { fileRef, ...file } : null
}

export function getSpace(state, spaceRef) {
  return (
    state.spaces.find((space) => space.slug === spaceRef || space.space_id === spaceRef) ?? null
  )
}

export function getSpacePairs(state, spaceId) {
  return state.pairs.filter((pair) => pair.space_id === spaceId)
}

export function providerHasFolder(state, providerId, folderRef) {
  return Boolean(state.providerContents[providerId]?.folderRefs.includes(folderRef))
}

function hydrate(state, refs) {
  return {
    folders: refs.folderRefs.map((folderRef) => getFolder(state, folderRef)).filter(Boolean),
    files: refs.fileRefs.map((fileRef) => getFile(state, fileRef)).filter(Boolean),
  }
}

export function getFolderContents(state, folderRef) {
  const refs = state.folderContents[folderRef]
  return refs ? hydrate(state, refs) : { folders: [], files: [] }
}

export function getProviderContents(state, id) {
  const refs = state.providerContents[id]
  return refs ? hydrate(state, refs) : { folders: [], files: [] }
}

export function emptyContents() {
  return { folderRefs: [], fileRefs: [] }
}

export function spaceStatus(space, pairs) {
  if (space.paused) return 'paused'
  if (pairs.length === 0) return 'empty'
  if (pairs.some((pair) => pair.status === 'conflict')) return 'conflict'
  if (pairs.every((pair) => pair.status === 'paused')) return 'paused'
  return 'synced'
}

export function statusLabel(status) {
  if (status === 'conflict') return 'Conflito'
  if (status === 'paused') return 'Pausado'
  if (status === 'empty') return 'Sem espelho'
  return 'Sincronizado'
}

export function spaceProvidersLabel(state, space) {
  const pairs = getSpacePairs(state, space.space_id)
  const status = spaceStatus(space, pairs)
  if (status === 'empty') return statusLabel(status)
  if (status === 'paused' || status === 'conflict') return statusLabel(status)

  const names = []
  pairs.forEach((pair) => {
    ;[pair.left, pair.right].forEach((side) => {
      if (side.provider && !names.includes(side.provider)) names.push(side.provider)
    })
  })

  return names.join(' · ')
}

export function hydrateRecents(state) {
  return state.recents
    .map((entry) => {
      const file = getFile(state, entry.fileRef)
      return file ? { ...file, when: entry.when } : null
    })
    .filter(Boolean)
}

export function hydrateShortcuts(state) {
  return state.shortcuts.map((fileRef) => getFile(state, fileRef)).filter(Boolean)
}

function copyContents(contents) {
  return {
    folderRefs: [...(contents?.folderRefs ?? [])],
    fileRefs: [...(contents?.fileRefs ?? [])],
  }
}

function addToContents(contents, kind, ref) {
  const key = kind === 'folder' ? 'folderRefs' : 'fileRefs'
  if (!contents[key].includes(ref)) {
    contents[key] = [...contents[key], ref]
  }
}

function touchRecent(state, fileRef) {
  const rest = state.recents.filter((entry) => entry.fileRef !== fileRef)
  return [{ fileRef, when: 'Agora' }, ...rest].slice(0, 12)
}

export function locationLabel(location) {
  if (!location) return ''
  if (location.kind === 'root') return location.provider
  return location.name
}

export function makeRootLocation(provider) {
  return {
    kind: 'root',
    ref: null,
    name: provider.name,
    providerId: provider.id,
    provider: provider.name,
  }
}

export function makeFolderLocation(folder) {
  return {
    kind: 'folder',
    ref: folder.folderRef,
    name: folder.name,
    providerId: folder.providerId,
    provider: folder.provider,
  }
}

export function makeFileLocation(file) {
  return {
    kind: 'file',
    ref: file.fileRef,
    name: file.title,
    providerId: file.providerId,
    provider: file.provider,
  }
}

export function publicLinkFor(fileRef, suffix) {
  return `https://bridgit.local/p/${suffix}`
}

export function reducer(state, action) {
  switch (action.type) {
    case 'openOverlay':
      return { ...state, overlay: action.overlay }
    case 'closeOverlay':
      return { ...state, overlay: null }
    case 'setRecentsView':
      return { ...state, recentsView: action.view }
    case 'setNotifyFail':
      return { ...state, notifyFail: action.value }
    case 'createSpace': {
      const name = action.name.trim()
      if (!name) return state
      const space_id = createId()
      const slug = uniqueSlug(name, state.spaces)
      const space = { space_id, slug, name, paused: false }
      const pairs = [...state.pairs]
      if (action.left && action.right) {
        pairs.push({
          pair_id: createId(),
          space_id,
          left: action.left,
          right: action.right,
          status: 'synced',
        })
      }
      return {
        ...state,
        spaces: [...state.spaces, space],
        pairs,
        overlay: null,
      }
    }
    case 'renameSpace': {
      const name = action.name.trim()
      if (!name) return state
      return {
        ...state,
        spaces: state.spaces.map((space) =>
          space.space_id === action.spaceId ? { ...space, name } : space,
        ),
        overlay: null,
      }
    }
    case 'pauseSpace': {
      const paused = action.paused
      return {
        ...state,
        spaces: state.spaces.map((space) =>
          space.space_id === action.spaceId ? { ...space, paused } : space,
        ),
        pairs: state.pairs.map((pair) => {
          if (pair.space_id !== action.spaceId) return pair
          if (paused) return { ...pair, status: pair.status === 'conflict' ? 'conflict' : 'paused' }
          return { ...pair, status: pair.status === 'paused' ? 'synced' : pair.status }
        }),
      }
    }
    case 'deleteSpace':
      return {
        ...state,
        spaces: state.spaces.filter((space) => space.space_id !== action.spaceId),
        pairs: state.pairs.filter((pair) => pair.space_id !== action.spaceId),
        overlay: null,
      }
    case 'addPair': {
      if (!action.left || !action.right) return state
      return {
        ...state,
        pairs: [
          ...state.pairs,
          {
            pair_id: createId(),
            space_id: action.spaceId,
            left: action.left,
            right: action.right,
            status: 'synced',
          },
        ],
        overlay: null,
      }
    }
    case 'setPairStatus':
      return {
        ...state,
        pairs: state.pairs.map((pair) =>
          pair.pair_id === action.pairId ? { ...pair, status: action.status } : pair,
        ),
      }
    case 'removePair':
      return {
        ...state,
        pairs: state.pairs.filter((pair) => pair.pair_id !== action.pairId),
      }
    case 'createFolder': {
      const name = action.name.trim()
      if (!name) return state
      const provider = getProvider(state, action.providerId)
      if (!provider) return state
      const folderRef = createId()
      const folders = {
        ...state.folders,
        [folderRef]: { name, provider: provider.name, providerId: provider.id },
      }
      const folderContents = { ...state.folderContents, [folderRef]: emptyContents() }
      const providerContents = { ...state.providerContents }
      const root = copyContents(providerContents[provider.id])
      providerContents[provider.id] = root

      if (action.parentFolderRef) {
        const parent = copyContents(folderContents[action.parentFolderRef])
        addToContents(parent, 'folder', folderRef)
        folderContents[action.parentFolderRef] = parent
      } else {
        addToContents(root, 'folder', folderRef)
      }

      return {
        ...state,
        folders,
        folderContents,
        providerContents,
        overlay: null,
      }
    }
    case 'createFile': {
      const title = action.title.trim()
      if (!title) return state
      const provider = getProvider(state, action.providerId)
      if (!provider) return state
      const fileRef = createId()
      const files = {
        ...state.files,
        [fileRef]: {
          title,
          kind: action.kind ?? 'PDF',
          provider: provider.name,
          providerId: provider.id,
          folderRef: action.parentFolderRef ?? undefined,
        },
      }
      const folderContents = { ...state.folderContents }
      const providerContents = { ...state.providerContents }
      const root = copyContents(providerContents[provider.id])
      providerContents[provider.id] = root
      addToContents(root, 'file', fileRef)

      if (action.parentFolderRef) {
        const parent = copyContents(folderContents[action.parentFolderRef])
        addToContents(parent, 'file', fileRef)
        folderContents[action.parentFolderRef] = parent
      }

      return {
        ...state,
        files,
        folderContents,
        providerContents,
        recents: touchRecent(state, fileRef),
        overlay: null,
      }
    }
    case 'toggleShortcut': {
      const has = state.shortcuts.includes(action.fileRef)
      return {
        ...state,
        shortcuts: has
          ? state.shortcuts.filter((fileRef) => fileRef !== action.fileRef)
          : [...state.shortcuts, action.fileRef],
      }
    }
    case 'setPublicLink': {
      const publicLinks = { ...state.publicLinks }
      if (action.enabled) {
        publicLinks[action.fileRef] = publicLinks[action.fileRef] ?? createId().slice(0, 10)
      } else {
        delete publicLinks[action.fileRef]
      }
      return { ...state, publicLinks }
    }
    default:
      return state
  }
}

