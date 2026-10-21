import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearThumbnailCache, loadThumbnail } from './thumbnailQueue.js'

const jpeg = () => new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/jpeg' })

describe('thumbnailQueue', () => {
  beforeEach(() => {
    if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:preview'
    if (typeof URL.revokeObjectURL !== 'function') URL.revokeObjectURL = () => {}
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:preview-${Math.random()}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    clearThumbnailCache()
  })

  it('reuses a preview for the page session and asks again once the cache is cleared', async () => {
    const fetchBlob = vi.fn(async () => jpeg())

    const first = await loadThumbnail('k', fetchBlob)
    expect(await loadThumbnail('k', fetchBlob)).toBe(first)
    expect(fetchBlob).toHaveBeenCalledTimes(1)

    clearThumbnailCache()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first)
    await loadThumbnail('k', fetchBlob)
    expect(fetchBlob).toHaveBeenCalledTimes(2)
  })
})
