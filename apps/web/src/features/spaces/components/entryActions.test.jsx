import { describe, expect, it, vi } from 'vitest'
import { fileMenuItems, folderMenuItems } from './entryActions.jsx'
import { PixelLink, PixelUnlink } from '../../../shared/components/PixelIcons/PixelIcons.jsx'

const folder = { provider: 'onedrive', ref: 'folder-1', name: 'Docs' }
const file = { provider: 'onedrive', ref: 'file-1', name: 'a.pdf' }

describe('entryActions public link item', () => {
  it('adds a folder item that opens the overlay with kind folder', () => {
    const openOverlay = vi.fn()
    const item = folderMenuItems(folder, { openOverlay }).find((entry) => entry.id === 'link')
    expect(item.label).toBe('Link público')
    item.onSelect()
    expect(openOverlay).toHaveBeenCalledWith({
      type: 'public-link',
      kind: 'folder',
      providerId: 'onedrive',
      ref: 'folder-1',
      name: 'Docs',
    })
  })

  it('uses the unlink icon only for linked folders', () => {
    const hasPublicLink = vi.fn((provider, ref) => ref === 'folder-1')
    const linked = folderMenuItems(folder, { openOverlay: vi.fn(), hasPublicLink }).find((entry) => entry.id === 'link')
    const other = folderMenuItems({ ...folder, ref: 'folder-2' }, { openOverlay: vi.fn(), hasPublicLink }).find((entry) => entry.id === 'link')
    expect(linked.icon).toBe(PixelUnlink)
    expect(other.icon).toBe(PixelLink)
    expect(folderMenuItems(folder, { openOverlay: vi.fn() }).find((entry) => entry.id === 'link').icon).toBe(PixelLink)
  })

  it('makes the file item pass kind file', () => {
    const openOverlay = vi.fn()
    fileMenuItems(file, { openOverlay }).find((entry) => entry.id === 'link').onSelect()
    expect(openOverlay).toHaveBeenCalledWith(expect.objectContaining({ type: 'public-link', kind: 'file', ref: 'file-1' }))
  })
})
