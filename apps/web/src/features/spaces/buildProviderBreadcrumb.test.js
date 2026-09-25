import { describe, expect, it } from 'vitest'
import { buildProviderBreadcrumbItems, childFolderTrail } from './buildProviderBreadcrumb.js'

const provider = { id: 'onedrive', name: 'OneDrive' }

describe('buildProviderBreadcrumbItems', () => {
  it('marca o provedor como atual na raiz', () => {
    const items = buildProviderBreadcrumbItems({ provider, folder: { ref: null, name: 'OneDrive', ancestry: [] } })

    expect(items.map((item) => item.label)).toEqual(['Início', 'OneDrive'])
    expect(items.at(-1).current).toBe(true)
  })

  it('mostra a própria pasta como atual numa pasta da raiz', () => {
    const items = buildProviderBreadcrumbItems({
      provider,
      folder: { ref: 'docs', name: 'Documentos', ancestry: [] },
    })

    expect(items.map((item) => item.label)).toEqual(['Início', 'OneDrive', 'Documentos'])
    expect(items.at(-1)).toMatchObject({ current: true, to: null })
    expect(items[1].current).toBeUndefined()
  })

  it('lista as pastas acima e passa o caminho adiante', () => {
    const folder = { ref: 'rel', name: 'Relatórios', ancestry: [{ ref: 'docs', name: 'Documentos' }] }
    const items = buildProviderBreadcrumbItems({ provider, folder })

    expect(items.map((item) => item.label)).toEqual(['Início', 'OneDrive', 'Documentos', 'Relatórios'])
    expect(items[2].state).toEqual({ folderName: 'Documentos', folderTrail: [] })
    expect(childFolderTrail(folder)).toEqual([
      { ref: 'docs', name: 'Documentos' },
      { ref: 'rel', name: 'Relatórios' },
    ])
  })
})
