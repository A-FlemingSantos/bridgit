import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileThumb from './FileThumb.jsx'
import { clearThumbnailCache } from './thumbnailQueue.js'

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

function mockThumbnail(impl) {
  const getThumbnail = vi.fn(impl)
  useHubActions.mockReturnValue({ getThumbnail })
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
    expect(getThumbnail).toHaveBeenCalledWith('onedrive', 'p')
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

  it('gives each Word mark its own gradient ids', () => {
    mockThumbnail(async () => new Promise(() => {}))
    const file = { ref: 'd', name: 'a.docx', kind: 'file', extension: 'docx' }
    const { container } = render(
      <>
        <FileThumb file={file} providerId="onedrive" showTypeIcon />
        <FileThumb file={{ ...file, ref: 'e' }} providerId="onedrive" showTypeIcon />
      </>,
    )
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id).filter(Boolean)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not ask for a thumbnail of a text file', async () => {
    const getThumbnail = mockThumbnail(async () => jpeg())
    const { container } = render(
      <FileThumb file={{ ref: 't', name: 'a.txt', kind: 'file', mimeType: 'text/plain', extension: 'txt' }} providerId="onedrive" showTypeIcon />,
    )
    expect(container.querySelector('svg[shape-rendering="crispEdges"]')).toBeTruthy()
    expect(container.querySelector('[data-type]')).toBeNull()
    expect(getThumbnail).not.toHaveBeenCalled()
  })
})
