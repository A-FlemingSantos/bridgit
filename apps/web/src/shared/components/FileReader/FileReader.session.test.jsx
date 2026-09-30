import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FileReader from './FileReader.jsx'

vi.mock('../../hub/content/index.js', async (importOriginal) => ({
  ...await importOriginal(),
  loadContent: vi.fn(),
  getCachedContent: vi.fn(),
}))
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  PDFDataRangeTransport: class {},
  getDocument: vi.fn(),
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/worker.mjs' }))

import { loadContent } from '../../hub/content/index.js'

const file = { name: 'Nota.txt', extension: 'txt', mimeType: 'text/plain' }
const now = Date.parse('2026-09-30T12:00:00Z')
function descriptor(overrides = {}) {
  return {
    userId: 'user-1', connectionId: 'connection-1', generation: 1, ref: 'file-1',
    revision: 'r-1', variant: 'ORIGINAL', size: 4, mode: 'text', url: '/ticket-1',
    authorizedUntil: new Date(now + 60_000).toISOString(),
    expiresAt: new Date(now + 300_000).toISOString(),
    ...overrides,
  }
}

describe('active reading session', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
    vi.clearAllMocks()
    loadContent.mockResolvedValue({ arrayBuffer: async () => new TextEncoder().encode('nota').buffer })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('expired ticket')))
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps opened bytes after cache authorization and transport ticket expire', async () => {
    const source = descriptor()
    const view = render(<FileReader file={file} source={source} onContentError={() => false} />)
    expect(await screen.findByText('nota')).toBeInTheDocument()
    const text = document.querySelector('pre')
    const loads = loadContent.mock.calls.length

    vi.setSystemTime(now + 360_000)
    view.rerender(<FileReader file={{ ...file, name: 'Renomeada.txt' }} source={source} onContentError={() => false} />)
    await act(async () => {})

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('nota')).toBe(text)
    expect(screen.queryByRole('status', { name: 'Carregando arquivo' })).toBeNull()
    expect(loadContent).toHaveBeenCalledTimes(loads)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps the opened image URL while renewing authorization for the same revision', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:opened-image')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    loadContent.mockResolvedValue(new Blob(['image']))
    const source = descriptor({ mode: 'image' })
    const view = render(<FileReader file={file} source={source} onContentError={() => false} />)
    await waitFor(() => expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:opened-image'))
    const image = document.querySelector('img')
    fireEvent.load(image)

    vi.setSystemTime(now + 360_000)
    view.rerender(<FileReader file={file} source={{ ...source, url: '/ticket-2', authorizedUntil: new Date(now + 420_000).toISOString() }} onContentError={() => false} />)
    await act(async () => {})

    expect(document.querySelector('img')).toBe(image)
    expect(image.getAttribute('src')).toBe('blob:opened-image')
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    expect(loadContent).toHaveBeenCalledTimes(1)
  })

  it('shows the existing error if asynchronous ticket recovery fails', async () => {
    let recover
    const onContentError = vi.fn(() => new Promise((resolve) => { recover = resolve }))
    render(<FileReader file={file} source={descriptor({ mode: 'video' })} onContentError={onContentError} onRetry={vi.fn()} />)
    fireEvent.error(document.querySelector('video'))
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => recover(false))
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar este arquivo.')
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
  })
})
