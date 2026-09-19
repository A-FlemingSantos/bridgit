import {
  providers as seedProviders,
  spaces as seedSpaces,
} from '../../features/spaces/data/mock.js'
import { recents as seedRecents, shortcuts as seedShortcuts } from '../../features/home/data/mock.js'

export const HUB_STORAGE_KEY = 'bridgit.hub.v2'

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
  'e3c7a1b4-6d29-4f80-9e15-2a8c4b70d193': {
    name: 'Relatórios',
    provider: 'OneDrive',
    providerId: 'onedrive',
    parentFolderRef: '4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334',
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
  'f2b8d4c1-7e50-4a91-8c36-1d9e5a0b7f24': {
    title: 'Rascunho',
    kind: 'PDF',
    provider: 'OneDrive',
    providerId: 'onedrive',
    folderRef: 'e3c7a1b4-6d29-4f80-9e15-2a8c4b70d193',
  },
}

const seedFolderContents = {
  '4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334': {
    folderRefs: ['e3c7a1b4-6d29-4f80-9e15-2a8c4b70d193'],
    fileRefs: ['a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0', 'c4d8b207-5a1e-49f3-8e6c-9b0d2f7a13e8'],
  },
  'e3c7a1b4-6d29-4f80-9e15-2a8c4b70d193': {
    folderRefs: [],
    fileRefs: ['f2b8d4c1-7e50-4a91-8c36-1d9e5a0b7f24'],
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

function seedHubSpaces() {
  return [
    {
      ...seedSpaces[0],
      origin: locationFromFolder('d92e4b70-1a8c-4f09-b3d6-5e7c0a18f2d3'),
      destination: locationFromFolder('0f3c8a91-7b26-4d55-ae10-8c4f9d2a76e1'),
      status: 'synced',
      lastSyncedAt: 'há 2 min',
      paused: false,
      conflicts: [],
    },
    {
      ...seedSpaces[1],
      origin: locationFromFolder('b17d93e0-2c4a-4e88-9f01-6a5d3c8e12b9'),
      destination: locationFromFolder('4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334'),
      status: 'conflict',
      lastSyncedAt: 'há 1 h',
      paused: false,
      conflicts: [{ id: 'c-curriculo-pdf', fileName: 'Currículo.pdf' }],
    },
  ]
}

function locationFromFolder(folderRef) {
  const folder = seedFolders[folderRef]
  return makeFolderLocation({ folderRef, ...folder })
}

export function seedState() {
  return {
    providers: clone(seedProviders),
    spaces: seedHubSpaces(),
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

export function getFolderParent(state, folderRef) {
  const folder = getFolder(state, folderRef)
  if (!folder) return null
  if (folder.parentFolderRef) return getFolder(state, folder.parentFolderRef)

  for (const [parentRef, contents] of Object.entries(state.folderContents ?? {})) {
    if (contents.folderRefs?.includes(folderRef)) {
      return getFolder(state, parentRef)
    }
  }

  return null
}

export function getFolderAncestry(state, folderRef) {
  const chain = []
  const seen = new Set()
  let currentRef = folderRef

  while (currentRef && !seen.has(currentRef)) {
    seen.add(currentRef)
    const folder = getFolder(state, currentRef)
    if (!folder) break
    chain.unshift(folder)
    currentRef = getFolderParent(state, currentRef)?.folderRef ?? null
  }

  return chain
}

export function folderLocationPath(state, folderRef) {
  const ancestry = getFolderAncestry(state, folderRef)
  if (ancestry.length === 0) return ''
  return `/${ancestry.map((folder) => folder.name).join('/')}`
}

export function providerHasFolder(state, providerId, folderRef) {
  const roots = state.providerContents[providerId]?.folderRefs ?? []
  if (roots.includes(folderRef)) return true
  return getFolderAncestry(state, folderRef).some((folder) => roots.includes(folder.folderRef))
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

export function spaceStatus(space) {
  if (space?.paused) return 'paused'
  if ((space?.conflicts ?? []).length > 0) return 'conflict'
  return space?.status || 'synced'
}

export function statusLabel(status) {
  if (status === 'conflict') return 'Conflito'
  if (status === 'paused') return 'Pausado'
  return 'Sincronizado'
}

export function statusBannerLabel(status) {
  if (status === 'conflict') return 'Conflito — escolha o lado a manter'
  if (status === 'paused') return 'Pausado'
  return 'Sincronizado'
}

export function locationPath(location) {
  if (!location) return ''
  if (location.path) return location.path
  if (location.kind === 'folder' && location.name) return `/${location.name}`
  return location.name ?? ''
}

export function isFolderLocation(location) {
  return Boolean(location && location.kind === 'folder' && location.ref)
}

export function spaceSummary(space) {
  if (!space?.origin || !space?.destination) return ''
  return `${space.origin.provider} ↔ ${space.destination.provider}`
}

export function spaceProvidersLabel(space) {
  return spaceSummary(space)
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

function withoutRef(list, ref) {
  return (list ?? []).filter((item) => item !== ref)
}

function stripEntry(contents, kind, ref) {
  const next = copyContents(contents)
  const key = kind === 'folder' ? 'folderRefs' : 'fileRefs'
  next[key] = withoutRef(next[key], ref)
  return next
}

function mapContents(bag, mapper) {
  const next = {}
  for (const [key, contents] of Object.entries(bag ?? {})) {
    next[key] = mapper(contents)
  }
  return next
}

export function collectDescendantFolderRefs(state, folderRef) {
  const refs = []
  const queue = [...(state.folderContents[folderRef]?.folderRefs ?? [])]
  while (queue.length) {
    const current = queue.shift()
    if (!current || refs.includes(current)) continue
    refs.push(current)
    queue.push(...(state.folderContents[current]?.folderRefs ?? []))
  }
  return refs
}

function purgeFile(state, fileRef) {
  const files = { ...state.files }
  delete files[fileRef]
  const publicLinks = { ...state.publicLinks }
  delete publicLinks[fileRef]
  return {
    ...state,
    files,
    publicLinks,
    folderContents: mapContents(state.folderContents, (contents) => stripEntry(contents, 'file', fileRef)),
    providerContents: mapContents(state.providerContents, (contents) => stripEntry(contents, 'file', fileRef)),
    shortcuts: state.shortcuts.filter((ref) => ref !== fileRef),
    recents: state.recents.filter((entry) => entry.fileRef !== fileRef),
  }
}

function purgeFolder(state, folderRef) {
  const foldersToRemove = [folderRef, ...collectDescendantFolderRefs(state, folderRef)]
  let next = state
  for (const ref of foldersToRemove) {
    for (const fileRef of next.folderContents[ref]?.fileRefs ?? []) {
      next = purgeFile(next, fileRef)
    }
  }

  const folders = { ...next.folders }
  const folderContents = mapContents(next.folderContents, (contents) => {
    let mapped = contents
    for (const ref of foldersToRemove) {
      mapped = stripEntry(mapped, 'folder', ref)
    }
    return mapped
  })
  for (const ref of foldersToRemove) {
    delete folders[ref]
    delete folderContents[ref]
  }

  return {
    ...next,
    folders,
    folderContents,
    providerContents: mapContents(next.providerContents, (contents) => {
      let mapped = contents
      for (const ref of foldersToRemove) {
        mapped = stripEntry(mapped, 'folder', ref)
      }
      return mapped
    }),
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
    path: folder.path ?? `/${folder.name}`,
    providerId: folder.providerId,
    provider: folder.provider,
  }
}

export function makeFolderLocationFromState(state, folderRef) {
  const folder = getFolder(state, folderRef)
  if (!folder) return null
  return makeFolderLocation({ ...folder, path: folderLocationPath(state, folderRef) })
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
      const origin = action.origin ?? action.left
      const destination = action.destination ?? action.right
      if (!name || !isFolderLocation(origin) || !isFolderLocation(destination)) return state
      if (origin.ref === destination.ref) return state
      const space_id = createId()
      const slug = uniqueSlug(name, state.spaces)
      const space = {
        space_id,
        slug,
        name,
        origin,
        destination,
        status: 'synced',
        lastSyncedAt: 'Agora',
        paused: false,
        conflicts: [],
      }
      return {
        ...state,
        spaces: [...state.spaces, space],
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
        spaces: state.spaces.map((space) => {
          if (space.space_id !== action.spaceId) return space
          const conflicts = space.conflicts ?? []
          return {
            ...space,
            paused,
            status: paused ? 'paused' : conflicts.length > 0 ? 'conflict' : 'synced',
          }
        }),
      }
    }
    case 'syncNow':
      return {
        ...state,
        spaces: state.spaces.map((space) =>
          space.space_id === action.spaceId
            ? { ...space, lastSyncedAt: 'Agora' }
            : space,
        ),
      }
    case 'resolveConflict': {
      return {
        ...state,
        spaces: state.spaces.map((space) => {
          if (space.space_id !== action.spaceId) return space
          const conflicts = (space.conflicts ?? []).filter(
            (conflict) => conflict.id !== action.conflictId,
          )
          return {
            ...space,
            conflicts,
            status: space.paused ? 'paused' : conflicts.length > 0 ? 'conflict' : 'synced',
          }
        }),
      }
    }
    case 'deleteSpace':
      return {
        ...state,
        spaces: state.spaces.filter((space) => space.space_id !== action.spaceId),
        overlay: null,
      }
    case 'createFolder': {
      const name = action.name.trim()
      if (!name) return state
      const provider = getProvider(state, action.providerId)
      if (!provider) return state
      const folderRef = createId()
      const folders = {
        ...state.folders,
        [folderRef]: {
          name,
          provider: provider.name,
          providerId: provider.id,
          parentFolderRef: action.parentFolderRef ?? null,
        },
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
    case 'renameFile': {
      const title = action.title.trim()
      const file = getFile(state, action.fileRef)
      if (!title || !file) return state
      return {
        ...state,
        files: {
          ...state.files,
          [action.fileRef]: { ...state.files[action.fileRef], title },
        },
        overlay: null,
      }
    }
    case 'renameFolder': {
      const name = action.name.trim()
      const folder = getFolder(state, action.folderRef)
      if (!name || !folder) return state
      return {
        ...state,
        folders: {
          ...state.folders,
          [action.folderRef]: { ...state.folders[action.folderRef], name },
        },
        overlay: null,
      }
    }
    case 'moveFile': {
      const file = getFile(state, action.fileRef)
      if (!file) return state
      const parentFolderRef = action.parentFolderRef ?? null
      if (parentFolderRef) {
        const dest = getFolder(state, parentFolderRef)
        if (!dest || dest.providerId !== file.providerId) return state
      }
      if ((file.folderRef ?? null) === parentFolderRef) {
        return { ...state, overlay: null }
      }

      let folderContents = mapContents(state.folderContents, (contents) =>
        stripEntry(contents, 'file', file.fileRef),
      )
      let providerContents = mapContents(state.providerContents, (contents) =>
        stripEntry(contents, 'file', file.fileRef),
      )

      if (parentFolderRef) {
        const dest = copyContents(folderContents[parentFolderRef] ?? emptyContents())
        addToContents(dest, 'file', file.fileRef)
        folderContents = { ...folderContents, [parentFolderRef]: dest }
      } else {
        const root = copyContents(providerContents[file.providerId])
        addToContents(root, 'file', file.fileRef)
        providerContents = { ...providerContents, [file.providerId]: root }
      }

      return {
        ...state,
        files: {
          ...state.files,
          [file.fileRef]: {
            ...state.files[file.fileRef],
            folderRef: parentFolderRef || undefined,
          },
        },
        folderContents,
        providerContents,
        overlay: null,
      }
    }
    case 'moveFolder': {
      const folder = getFolder(state, action.folderRef)
      if (!folder) return state
      const parentFolderRef = action.parentFolderRef ?? null
      if (parentFolderRef === folder.folderRef) return state
      if (parentFolderRef && collectDescendantFolderRefs(state, folder.folderRef).includes(parentFolderRef)) {
        return state
      }
      if (parentFolderRef) {
        const dest = getFolder(state, parentFolderRef)
        if (!dest || dest.providerId !== folder.providerId) return state
      }
      const currentParent = folder.parentFolderRef ?? null
      if (currentParent === parentFolderRef) {
        return { ...state, overlay: null }
      }

      let folderContents = mapContents(state.folderContents, (contents) =>
        stripEntry(contents, 'folder', folder.folderRef),
      )
      let providerContents = mapContents(state.providerContents, (contents) =>
        stripEntry(contents, 'folder', folder.folderRef),
      )

      if (parentFolderRef) {
        const dest = copyContents(folderContents[parentFolderRef] ?? emptyContents())
        addToContents(dest, 'folder', folder.folderRef)
        folderContents = { ...folderContents, [parentFolderRef]: dest }
      } else {
        const root = copyContents(providerContents[folder.providerId])
        addToContents(root, 'folder', folder.folderRef)
        providerContents = { ...providerContents, [folder.providerId]: root }
      }

      return {
        ...state,
        folders: {
          ...state.folders,
          [folder.folderRef]: {
            ...state.folders[folder.folderRef],
            parentFolderRef: parentFolderRef || undefined,
          },
        },
        folderContents,
        providerContents,
        overlay: null,
      }
    }
    case 'deleteFile':
      return { ...purgeFile(state, action.fileRef), overlay: null }
    case 'deleteFolder':
      return { ...purgeFolder(state, action.folderRef), overlay: null }
    default:
      return state
  }
}

