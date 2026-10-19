import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fileMenuItems, folderMenuItems } from './entryActions.jsx'

const folder = { provider: 'onedrive', ref: 'folder-1', name: 'Docs' }
const file = { provider: 'onedrive', ref: 'file-1', name: 'a.pdf' }
const url = 'https://bridgit.test/p/docs-ab12'

function context(overrides = {}) {
  return {
    openOverlay: vi.fn(),
    onError: vi.fn(),
    actions: {
      enablePublicLink: vi.fn().mockResolvedValue({ url }),
      disablePublicLink: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  }
}

const ids = (items) => items.map((entry) => entry.id)
const byId = (items, id) => items.find((entry) => entry.id === id)

describe('entryActions public link items', () => {
  let writeText

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  afterEach(() => {
    delete navigator.clipboard
  })

  it('creates the link and copies its address, without opening a dialog', async () => {
    const ctx = context()
    const items = folderMenuItems(folder, ctx)
    expect(ids(items)).toContain('link')
    expect(ids(items)).not.toContain('unlink')
    expect(byId(items, 'link').label).toBe('Link público')

    expect(byId(items, 'link').fill).toBe(true)

    await byId(items, 'link').onSelect()

    expect(writeText).toHaveBeenCalledWith(url)
    expect(ctx.actions.enablePublicLink).toHaveBeenCalledWith({ providerId: 'onedrive', ref: 'folder-1' })
    expect(ctx.openOverlay).not.toHaveBeenCalled()
  })

  it('offers copy and disable once the item is published', async () => {
    const ctx = context({ hasPublicLink: () => true })
    const items = fileMenuItems(file, ctx)
    expect(byId(items, 'link').label).toBe('Copiar link')
    expect(byId(items, 'unlink').label).toBe('Desativar link')

    byId(items, 'unlink').onSelect()
    expect(ctx.actions.disablePublicLink).toHaveBeenCalledWith({ providerId: 'onedrive', ref: 'file-1' })
  })

  it('reports a failure to create the link', async () => {
    const failure = new Error('falhou')
    const ctx = context()
    ctx.actions.enablePublicLink.mockRejectedValue(failure)
    await expect(byId(fileMenuItems(file, ctx), 'link').onSelect()).rejects.toBe(failure)
    expect(ctx.onError).toHaveBeenCalledWith(failure)
    expect(writeText).not.toHaveBeenCalled()
  })
})
