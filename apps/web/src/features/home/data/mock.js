import { getFile, providers } from '../../spaces/data/mock.js'

export { providers }

export const shortcuts = [
  'a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0',
  '7b2f0c18-4e9a-4d66-a813-0f5c1b9e3d24',
  '3e6a91d4-0c28-4f77-b902-1a8d5e4c7b16',
].map((fileRef) => getFile(fileRef)).filter(Boolean)

export const recents = [
  { fileRef: 'c4d8b207-5a1e-49f3-8e6c-9b0d2f7a13e8', when: 'Há 12 min' },
  { fileRef: '91a2f0e8-3b57-4c19-8d64-2e7f1a0c9b45', when: 'Há 1 h' },
  { fileRef: 'e9b3c714-2f80-4a16-9d5e-0c4a8f1b6d37', when: 'Há 3 h' },
  { fileRef: 'a1c9e4d2-8f70-4b31-9c05-2d6e8a14b7f0', when: 'Ontem' },
  { fileRef: '18f0a6c3-9d47-4b2e-a5c1-7e3d8b90f412', when: 'Ontem' },
  { fileRef: '5d1e8a90-6c23-4f4b-b7e2-3a9c0d18f564', when: 'Há 2 dias' },
  { fileRef: '7b2f0c18-4e9a-4d66-a813-0f5c1b9e3d24', when: 'Há 4 dias' },
  { fileRef: '3e6a91d4-0c28-4f77-b902-1a8d5e4c7b16', when: 'Há 1 sem' },
]
  .map((entry) => {
    const file = getFile(entry.fileRef)
    return file ? { ...file, when: entry.when } : null
  })
  .filter(Boolean)
