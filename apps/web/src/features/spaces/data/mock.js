export const spaces = [
  {
    space_id: '6f2c4a1e-8b3d-4c91-9e0a-1b7d2c8f4a11',
    slug: 'trabalho',
    name: 'Trabalho',
    count: 11,
  },
  {
    space_id: '2a9e71c4-0d58-4b22-a6f1-9c3e84d0b772',
    slug: 'pessoal',
    name: 'Pessoal',
    count: 6,
  },
  {
    space_id: 'c0d14b8f-5e27-4a90-8d3c-7f1b62ae90d4',
    slug: 'empresa',
    name: 'Empresa',
    count: 4,
  },
]

export const providers = [
  { id: 'onedrive', name: 'OneDrive' },
  { id: 'google-drive', name: 'Google Drive' },
  { id: 'dropbox', name: 'Dropbox' },
]

const folders = {
  '4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334': {
    name: 'Inovações técnicas',
    provider: 'OneDrive',
  },
  'b17d93e0-2c4a-4e88-9f01-6a5d3c8e12b9': {
    name: 'Acervo digital',
    provider: 'Google Drive',
  },
  '0f3c8a91-7b26-4d55-ae10-8c4f9d2a76e1': {
    name: 'Soluções de software',
    provider: 'Dropbox',
  },
  'd92e4b70-1a8c-4f09-b3d6-5e7c0a18f2d3': {
    name: 'Referências de código',
    provider: 'OneDrive',
  },
}

const files = {
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

const spaceContents = {
  trabalho: {
    folderRefs: [
      '4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334',
      'b17d93e0-2c4a-4e88-9f01-6a5d3c8e12b9',
      '0f3c8a91-7b26-4d55-ae10-8c4f9d2a76e1',
      'd92e4b70-1a8c-4f09-b3d6-5e7c0a18f2d3',
    ],
    fileRefs: [
      'a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0',
      '7b2f0c18-4e9a-4d66-a813-0f5c1b9e3d24',
      '3e6a91d4-0c28-4f77-b902-1a8d5e4c7b16',
      'c4d8b207-5a1e-49f3-8e6c-9b0d2f7a13e8',
      '18f0a6c3-9d47-4b2e-a5c1-7e3d8b90f412',
      'e9b3c714-2f80-4a16-9d5e-0c4a8f1b6d37',
      '5d1e8a90-6c23-4f4b-b7e2-3a9c0d18f564',
      '91a2f0e8-3b57-4c19-8d64-2e7f1a0c9b45',
    ],
  },
  pessoal: {
    folderRefs: ['b17d93e0-2c4a-4e88-9f01-6a5d3c8e12b9'],
    fileRefs: [
      '7b2f0c18-4e9a-4d66-a813-0f5c1b9e3d24',
      '18f0a6c3-9d47-4b2e-a5c1-7e3d8b90f412',
      '91a2f0e8-3b57-4c19-8d64-2e7f1a0c9b45',
    ],
  },
  empresa: {
    folderRefs: ['4e8a1c2b-9d70-4f13-a5e6-0c8b2d91f334', '0f3c8a91-7b26-4d55-ae10-8c4f9d2a76e1'],
    fileRefs: ['a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0', 'c4d8b207-5a1e-49f3-8e6c-9b0d2f7a13e8'],
  },
}

const folderContents = {
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

const providerContents = {
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

export function getSpace(slug) {
  return spaces.find((space) => space.slug === slug) ?? null
}

export function getProvider(id) {
  return providers.find((provider) => provider.id === id) ?? null
}

export function getFolder(folderRef) {
  const folder = folders[folderRef]
  return folder ? { folderRef, ...folder } : null
}

export function getFile(fileRef) {
  const file = files[fileRef]
  return file ? { fileRef, ...file } : null
}

function hydrate(refs) {
  return {
    folders: refs.folderRefs.map((folderRef) => getFolder(folderRef)).filter(Boolean),
    files: refs.fileRefs.map((fileRef) => getFile(fileRef)).filter(Boolean),
  }
}

export function getSpaceContents(slug) {
  const refs = spaceContents[slug]
  return refs ? hydrate(refs) : null
}

export function getFolderContents(folderRef) {
  const refs = folderContents[folderRef]
  return refs ? hydrate(refs) : { folders: [], files: [] }
}

export function getProviderContents(id) {
  const refs = providerContents[id]
  return refs ? hydrate(refs) : null
}

export function findSpaceForFolder(folderRef) {
  return (
    Object.keys(spaceContents).find((slug) => spaceContents[slug].folderRefs.includes(folderRef)) ??
    spaces[0].slug
  )
}

export function findSpaceForFile(fileRef) {
  return (
    Object.keys(spaceContents).find((slug) => spaceContents[slug].fileRefs.includes(fileRef)) ??
    spaces[0].slug
  )
}

export function spaceHasFolder(slug, folderRef) {
  return Boolean(spaceContents[slug]?.folderRefs.includes(folderRef))
}

export function providerHasFolder(providerId, folderRef) {
  return Boolean(providerContents[providerId]?.folderRefs.includes(folderRef))
}
