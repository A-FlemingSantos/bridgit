import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../storage/index.js', () => ({
  getContent: vi.fn(),
  putContent: vi.fn(),
  withContentLock: vi.fn(async (_descriptor, callback) => callback()),
}))

import { getContent, putContent, withContentLock } from '../storage/index.js'
import { isCacheableContent, loadContent, prefetchContent } from './index.js'

const descriptor = {
  userId: 'user-1',
  connectionId: 'connection-1',
  generation: 2,
  ref: 'file-1',
  revision: 'etag-1',
  authorizedUntil: '2099-01-01T00:00:00.000Z',
  size: 6,
  mode: 'text',
  url: '/content',
  verifyRevision: vi.fn().mockResolvedValue(true),
}

describe('content reader cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    descriptor.verifyRevision.mockResolvedValue(true)
  })

  it('reuses a cached private blob without requesting the ticket URL', async () => {
    const cached = new Blob(['cached'])
    getContent.mockResolvedValue(cached)
    vi.stubGlobal('fetch', vi.fn())

    await expect(loadContent(descriptor)).resolves.toBe(cached)
    expect(withContentLock).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the content lock for one shared download and persists the resulting blob', async () => {
    getContent.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    const blob = new Blob(['shared'])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }))

    await expect(loadContent(descriptor)).resolves.toBe(blob)
    expect(withContentLock).toHaveBeenCalledWith(descriptor, expect.any(Function), { signal: undefined })
    expect(fetch).toHaveBeenCalledWith('/content', { signal: undefined })
    expect(putContent).toHaveBeenCalledWith(descriptor, blob)
    expect(descriptor.verifyRevision).toHaveBeenCalledTimes(1)
  })

  it('falls back once to the OneDrive proxy when its direct URL fails', async () => {
    getContent.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    const blob = new Blob(['proxy'])
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockRejectedValueOnce(new Error('expired direct URL'))
        .mockResolvedValueOnce({ ok: true, blob: async () => blob }),
    )

    await expect(loadContent({ ...descriptor, providerId: 'onedrive', proxyUrl: '/proxy' })).resolves.toBe(blob)
    expect(fetch).toHaveBeenNthCalledWith(1, '/content', { signal: undefined })
    expect(fetch).toHaveBeenNthCalledWith(2, '/proxy', { signal: undefined })
  })

  it('does not prefetch a file larger than five megabytes', async () => {
    await expect(prefetchContent({ ...descriptor, size: 5 * 1024 * 1024 + 1 })).resolves.toBe(false)
    expect(withContentLock).not.toHaveBeenCalled()
  })

  it('requires a known size but permits a real zero-byte descriptor', () => {
    expect(isCacheableContent({ ...descriptor, size: null })).toBe(false)
    expect(isCacheableContent({ ...descriptor, size: undefined })).toBe(false)
    expect(isCacheableContent({ ...descriptor, size: 0 })).toBe(true)
  })

  it('returns downloaded bytes but does not persist an unverified revision', async () => {
    getContent.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    descriptor.verifyRevision.mockResolvedValue(false)
    const blob = new Blob(['shared'])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }))

    await expect(loadContent(descriptor)).resolves.toBe(blob)
    expect(putContent).not.toHaveBeenCalled()
  })
})
