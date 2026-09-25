import { describe, expect, it } from 'vitest'
import { resolveSpaceViewBreadcrumb } from './resolveSpaceViewBreadcrumb.js'

const nestedFolder = {
  folderRef: 'nested',
  name: 'Relatórios',
  parentFolderRef: 'parent',
}

const parentFolder = {
  folderRef: 'parent',
  name: 'Inovações técnicas',
}

const nestedFile = {
  fileRef: 'file-nested',
  title: 'Rascunho',
  folderRef: 'nested',
}

const catalog = {
  getProvider: (id) => (id === 'onedrive' ? { id: 'onedrive', name: 'OneDrive' } : null),
  getFolder: (folderRef) => {
    if (folderRef === 'nested') return nestedFolder
    if (folderRef === 'parent') return parentFolder
    return null
  },
  getFile: (fileRef) => (fileRef === 'file-nested' ? nestedFile : null),
  getFolderAncestry: (folderRef) => {
    if (folderRef === 'nested') return [parentFolder, nestedFolder]
    if (folderRef === 'parent') return [parentFolder]
    return []
  },
  providerHasFolder: (providerId, folderRef) =>
    providerId === 'onedrive' && (folderRef === 'nested' || folderRef === 'parent'),
}

describe('resolveSpaceViewBreadcrumb', () => {
  it('inclui a cadeia de pastas para um arquivo aninhado', () => {
    const { items } = resolveSpaceViewBreadcrumb(
      '/providers/onedrive/file/file-nested',
      catalog,
    )

    expect(items.map((item) => item.label)).toEqual([
      'Início',
      'OneDrive',
      'Inovações técnicas',
      'Relatórios',
      'Rascunho',
    ])
    expect(items.find((item) => item.label === 'Inovações técnicas').to).toBe(
      '/providers/onedrive/folder/parent',
    )
    expect(items.find((item) => item.label === 'Relatórios').to).toBe(
      '/providers/onedrive/folder/nested',
    )
  })

  it('usa ancestry no arquivo quando disponivel', () => {
    const catalogWithAncestry = {
      ...catalog,
      getFile: () => ({
        fileRef: 'file-nested',
        name: 'Rascunho',
        title: 'Rascunho',
        ancestry: [
          { ref: 'parent', name: 'Inovações técnicas' },
          { ref: 'nested', name: 'Relatórios' },
        ],
      }),
    }

    const { items } = resolveSpaceViewBreadcrumb(
      '/providers/onedrive/file/file-nested',
      catalogWithAncestry,
    )

    expect(items.map((item) => item.label)).toEqual([
      'Início',
      'OneDrive',
      'Inovações técnicas',
      'Relatórios',
      'Rascunho',
    ])
  })

  it('inclui a pasta pai ao abrir uma pasta aninhada', () => {
    const { items } = resolveSpaceViewBreadcrumb(
      '/providers/onedrive/folder/nested',
      catalog,
    )

    expect(items.map((item) => [item.label, item.current])).toEqual([
      ['Início', false],
      ['OneDrive', false],
      ['Inovações técnicas', false],
      ['Relatórios', true],
    ])
  })
})
