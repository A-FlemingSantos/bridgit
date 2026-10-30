import { describe, expect, it, vi } from 'vitest'
import { createThumbnailQueue, officeBadge, previewSettling, thumbnailEligible } from './thumbnails'

describe('officeBadge', () => {
  it('gives native Google files their own mark and Office files theirs', () => {
    expect(officeBadge({ mimeType: 'application/vnd.google-apps.document' })).toBe('google-docs')
    expect(officeBadge({ mimeType: 'application/vnd.google-apps.spreadsheet' })).toBe('google-sheets')
    expect(officeBadge({ mimeType: 'application/vnd.google-apps.presentation' })).toBe('google-slides')
    expect(officeBadge({ extension: 'docx' })).toBe('word')
    expect(officeBadge({ extension: '.XLSX' })).toBe('excel')
    expect(officeBadge({ extension: 'pptx' })).toBe('powerpoint')
    expect(officeBadge({ extension: 'pdf' })).toBeNull()
  })
})

describe('previewSettling', () => {
  const now = Date.parse('2026-10-21T12:00:00Z')
  const doc = (modifiedAt) => ({ mimeType: 'application/vnd.google-apps.document', modifiedAt })

  it('holds a native Google preview for ten minutes after an edit', () => {
    expect(previewSettling(doc('2026-10-21T11:55:00Z'), now)).toBe(true)
    expect(previewSettling(doc('2026-10-21T11:49:00Z'), now)).toBe(false)
  })

  it('never holds other files', () => {
    expect(previewSettling({ mimeType: 'application/pdf', modifiedAt: '2026-10-21T11:59:00Z' }, now)).toBe(false)
  })
})

describe('thumbnailEligible', () => {
  it('decides by the kind of cloud, not by the account', () => {
    const text = { kind: 'file', extension: 'txt' }
    expect(thumbnailEligible('dropbox', text)).toBe(false)
    expect(thumbnailEligible('google-drive', text)).toBe(true)
    expect(thumbnailEligible('4f0c9a52-6f0e-4a55-9e56-1b6a8f3d2c10', text)).toBe(false)
    expect(thumbnailEligible('dropbox', { kind: 'file', extension: 'jpg', size: 1024 })).toBe(true)
  })

  it('skips folders, including the mobile entries that only say isFolder', () => {
    expect(thumbnailEligible('onedrive', { kind: 'Pasta', isFolder: true, extension: 'png' })).toBe(false)
    expect(thumbnailEligible('onedrive', { kind: 'PNG', isFolder: false, extension: 'png' })).toBe(true)
  })

  it('keeps Dropbox previews to images of up to 20 MB', () => {
    expect(thumbnailEligible('dropbox', { extension: 'png', size: 21 * 1024 * 1024 })).toBe(false)
    expect(thumbnailEligible('dropbox', { extension: 'pdf' })).toBe(false)
  })
})

describe('createThumbnailQueue', () => {
  function deferred() {
    let resolve
    const promise = new Promise((done) => {
      resolve = done
    })
    return { promise, resolve }
  }

  it('lets at most four previews download at once', async () => {
    const queue = createThumbnailQueue()
    const gates = Array.from({ length: 6 }, deferred)
    let started = 0
    const loads = gates.map((gate, index) => queue.load(`k${index}`, {
      fetchRemote: () => {
        started += 1
        return gate.promise
      },
    }))
    await Promise.resolve()
    expect(started).toBe(4)
    gates[0].resolve('file://0')
    await loads[0]
    await Promise.resolve()
    expect(started).toBe(5)
    gates.forEach((gate, index) => gate.resolve(`file://${index}`))
    await expect(Promise.all(loads)).resolves.toEqual(gates.map((_, index) => `file://${index}`))
  })

  it('reads what the device kept without waiting for a slot or the cloud', async () => {
    const queue = createThumbnailQueue({ maxInFlight: 1 })
    queue.load('busy', { fetchRemote: () => new Promise(() => {}) })
    const fetchRemote = vi.fn()
    await expect(queue.load('kept', { readStored: async () => 'file://kept', fetchRemote })).resolves.toBe('file://kept')
    expect(fetchRemote).not.toHaveBeenCalled()
    expect(queue.peek('kept')).toBe('file://kept')
  })

  it('remembers a 404 as no preview for an hour, then asks again', async () => {
    let now = 0
    const queue = createThumbnailQueue({ now: () => now })
    const fetchRemote = vi.fn(async () => {
      throw Object.assign(new Error('gone'), { status: 404 })
    })
    await expect(queue.load('k', { fetchRemote })).resolves.toBeNull()
    await expect(queue.load('k', { fetchRemote })).resolves.toBeNull()
    expect(fetchRemote).toHaveBeenCalledTimes(1)
    now = 60 * 60 * 1000
    await queue.load('k', { fetchRemote })
    expect(fetchRemote).toHaveBeenCalledTimes(2)
  })

  it('tries other failures again on the next load', async () => {
    const queue = createThumbnailQueue()
    const fetchRemote = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 }))
      .mockResolvedValueOnce('file://ok')
    await expect(queue.load('k', { fetchRemote })).resolves.toBeNull()
    await expect(queue.load('k', { fetchRemote })).resolves.toBe('file://ok')
  })

  it('shares one download between tiles of the same file', async () => {
    const queue = createThumbnailQueue()
    const gate = deferred()
    const fetchRemote = vi.fn(() => gate.promise)
    const first = queue.load('k', { fetchRemote })
    const second = queue.load('k', { fetchRemote })
    gate.resolve('file://k')
    await expect(Promise.all([first, second])).resolves.toEqual(['file://k', 'file://k'])
    expect(fetchRemote).toHaveBeenCalledTimes(1)
  })

  it('shows a preview still being redrawn without keeping it', async () => {
    const queue = createThumbnailQueue()
    const readStored = vi.fn(async () => 'file://old')
    await expect(queue.load('k', { readStored, fetchRemote: async () => 'file://fresh', keep: false })).resolves.toBe('file://fresh')
    expect(readStored).not.toHaveBeenCalled()
    expect(queue.peek('k')).toBeUndefined()
  })
})
