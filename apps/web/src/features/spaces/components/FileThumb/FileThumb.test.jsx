import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileThumb from './FileThumb.jsx'
import { clearThumbnailCache } from '../../../../shared/hub/thumbnailQueue.js'

vi.mock('../../../../shared/hub/index.js', () => ({
  useHubActions: vi.fn(),
}))

import { useHubActions } from '../../../../shared/hub/index.js'

class ImmediateObserver {
  constructor(callback) {
    this.callback = callback
  }

  observe(node) {
    this.callback([{ isIntersecting: true, target: node }])
  }

  disconnect() {}

  unobserve() {}
}

const jpeg = () => new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/jpeg' })

function mockThumbnail(impl, stored = async () => null) {
  const getThumbnail = vi.fn(impl)
  useHubActions.mockReturnValue({ getThumbnail, getStoredThumbnail: vi.fn(stored) })
  return getThumbnail
}

describe('FileThumb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = () => 'blob:preview'
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      URL.revokeObjectURL = () => {}
    }
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:preview-${Math.random()}`)
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    clearThumbnailCache()
    vi.stubGlobal('IntersectionObserver', ImmediateObserver)
  })

  it('shows the cloud preview when the thumbnail arrives', async () => {
    const getThumbnail = mockThumbnail(async () => jpeg())
    const { container } = render(
      <FileThumb file={{ ref: 'p', name: 'a.pdf', kind: 'file', mimeType: 'application/pdf', extension: 'pdf' }} providerId="onedrive" showTypeIcon />,
    )

    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())
    expect(getThumbnail).toHaveBeenCalledWith('onedrive', 'p', null, { keep: true })
    expect(container.querySelector('[data-type]')).toBeNull()
  })

  it('keeps the pixel sheet when a file without a mark has no thumbnail', async () => {
    const getThumbnail = mockThumbnail(async () => {
      throw Object.assign(new Error('missing'), { status: 404 })
    })
    const { container } = render(
      <FileThumb file={{ ref: 'p', name: 'a.pdf', kind: 'file', mimeType: 'application/pdf', extension: 'pdf' }} providerId="onedrive" showTypeIcon />,
    )

    await waitFor(() => expect(getThumbnail).toHaveBeenCalled())
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg[shape-rendering="crispEdges"]')).toBeTruthy()
    expect(container.querySelector('[data-type]')).toBeNull()
  })

  it('uses the Word mark while the preview is missing', async () => {
    const getThumbnail = mockThumbnail(async () => {
      throw Object.assign(new Error('missing'), { status: 404 })
    })
    const { container } = render(
      <FileThumb file={{ ref: 'd', name: 'a.docx', kind: 'file', extension: 'docx' }} providerId="onedrive" />,
    )

    expect(container.querySelector('[data-type="word"]')).toBeTruthy()
    await waitFor(() => expect(getThumbnail).toHaveBeenCalled())
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-type="word"]')).toBeTruthy()
  })

  it('puts the Word mark on a folder-grid document and leaves it off the home grid', async () => {
    mockThumbnail(async () => jpeg())
    const file = { ref: 'd', name: 'a.docx', kind: 'file', extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    const folder = render(<FileThumb file={file} providerId="onedrive" showTypeIcon />)
    await waitFor(() => expect(folder.container.querySelector('img')).toBeTruthy())
    expect(folder.container.querySelector('[data-type="word"]')).toBeTruthy()

    clearThumbnailCache()
    const home = render(<FileThumb file={{ ...file, ref: 'home' }} providerId="onedrive" align="center" />)
    await waitFor(() => expect(home.container.querySelector('img')).toBeTruthy())
    expect(home.container.querySelector('[data-type]')).toBeNull()
  })

  it('gives each document its own Word mark', () => {
    mockThumbnail(async () => new Promise(() => {}))
    const file = { ref: 'd', name: 'a.docx', kind: 'file', extension: 'docx' }
    const { container } = render(
      <>
        <FileThumb file={file} providerId="onedrive" showTypeIcon />
        <FileThumb file={{ ...file, ref: 'e' }} providerId="onedrive" showTypeIcon />
      </>,
    )
    expect(container.querySelectorAll('[data-type="word"]')).toHaveLength(2)
  })

  it('does not ask Dropbox for a thumbnail of a text file', async () => {
    const getThumbnail = mockThumbnail(async () => jpeg())
    const { container } = render(
      <FileThumb file={{ ref: 't', name: 'a.txt', kind: 'file', mimeType: 'text/plain', extension: 'txt' }} providerId="dropbox" showTypeIcon />,
    )
    expect(container.querySelector('svg[shape-rendering="crispEdges"]')).toBeTruthy()
    expect(container.querySelector('[data-type]')).toBeNull()
    expect(getThumbnail).not.toHaveBeenCalled()
  })

  it('asks OneDrive for a text preview and Drive only for .txt', async () => {
    const getThumbnail = mockThumbnail(async () => jpeg())
    render(
      <>
        <FileThumb file={{ ref: 'o', name: 'a.md', kind: 'file', extension: 'md' }} providerId="onedrive" />
        <FileThumb file={{ ref: 'g', name: 'a.txt', kind: 'file', extension: 'txt' }} providerId="google-drive" />
        <FileThumb file={{ ref: 'h', name: 'a.md', kind: 'file', extension: 'md' }} providerId="google-drive" />
      </>,
    )

    await waitFor(() => expect(getThumbnail).toHaveBeenCalledTimes(2))
    expect(getThumbnail.mock.calls.map((call) => call[1]).sort()).toEqual(['g', 'o'])
  })

  it('shows the preview this browser kept without asking the cloud', async () => {
    const getThumbnail = mockThumbnail(async () => jpeg(), async () => ({ blob: jpeg() }))
    const { container } = render(
      <FileThumb file={{ ref: 'k', name: 'a.pdf', kind: 'file', extension: 'pdf', contentRevision: 'r1' }} providerId="onedrive" />,
    )

    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())
    expect(getThumbnail).not.toHaveBeenCalled()
  })

  it('keys a native Google file by its version when it has no content revision', async () => {
    mockThumbnail(async () => jpeg())
    render(
      <FileThumb file={{ ref: 'g', name: 'Doc', kind: 'file', mimeType: 'application/vnd.google-apps.document', remoteVersion: '2026-02-01T00:00:00Z' }} providerId="google-drive" />,
    )

    await waitFor(() => expect(useHubActions().getStoredThumbnail).toHaveBeenCalledWith('google-drive', 'g', '2026-02-01T00:00:00Z'))
  })

  it('does not ask the cloud again for a revision it said has no preview', async () => {
    const getThumbnail = mockThumbnail(async () => jpeg(), async () => ({ missing: true }))
    const { container } = render(
      <FileThumb file={{ ref: 'm', name: 'a.pdf', kind: 'file', extension: 'pdf', contentRevision: 'r1' }} providerId="onedrive" />,
    )

    await waitFor(() => expect(useHubActions().getStoredThumbnail).toHaveBeenCalledWith('onedrive', 'm', 'r1'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getThumbnail).not.toHaveBeenCalled()
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows a native Google preview fetched right after an edit without keeping it', async () => {
    const getThumbnail = mockThumbnail(async () => jpeg())
    const modifiedAt = new Date(Date.now() - 60 * 1000).toISOString()
    const { container } = render(
      <FileThumb file={{ ref: 'fresh', name: 'Doc', kind: 'file', mimeType: 'application/vnd.google-apps.document', remoteVersion: modifiedAt, modifiedAt }} providerId="google-drive" />,
    )

    await waitFor(() => expect(container.querySelector('img')).toBeTruthy())
    expect(getThumbnail).toHaveBeenCalledWith('google-drive', 'fresh', modifiedAt, { keep: false })
  })
})
