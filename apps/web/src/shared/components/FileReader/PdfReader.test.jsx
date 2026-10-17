import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pdfjsMock = vi.hoisted(() => ({ getDocument: vi.fn() }))

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  PDFDataRangeTransport: class {},
  getDocument: pdfjsMock.getDocument,
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.min.mjs' }))

import PdfReader from './PdfReader.jsx'

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function pdfDocument(numPages, render) {
  return {
    numPages,
    getPage: vi.fn(async () => ({
      getViewport: ({ scale }) => ({ width: 100 * scale, height: 140 * scale }),
      render,
    })),
  }
}

describe('PdfReader', () => {
  beforeEach(() => {
    pdfjsMock.getDocument.mockReset()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(720)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the first page of a document that loads after the width is measured', async () => {
    // A converted DOCX takes seconds to arrive, and the hidden reader is never intersecting.
    const loading = deferred()
    const renderTask = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
    pdfjsMock.getDocument.mockReturnValue({ promise: loading.promise, destroy: vi.fn(async () => {}) })
    const onFirstPageReady = vi.fn()
    const onError = vi.fn()

    const view = renderReader({ onFirstPageReady, onError })
    await new Promise((done) => setTimeout(done, 200))
    loading.resolve(pdfDocument(38, renderTask))

    await waitFor(() => expect(onFirstPageReady).toHaveBeenCalledTimes(1))
    expect(renderTask).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
    expect(view.container.querySelectorAll('canvas')).toHaveLength(38)
  })

  it('treats a render replaced by a newer width as cancelled, not as a failure', async () => {
    const cancelled = Object.assign(new Error('cancelled'), { name: 'RenderingCancelledException' })
    const tasks = []
    const renderTask = vi.fn(() => {
      const task = deferred()
      const entry = { promise: task.promise, cancel: vi.fn(() => task.resolve(Promise.reject(cancelled))), finish: () => task.resolve() }
      tasks.push(entry)
      return entry
    })
    pdfjsMock.getDocument.mockReturnValue({ promise: Promise.resolve(pdfDocument(1, renderTask)), destroy: vi.fn(async () => {}) })
    const resize = []
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback) { resize.push(callback) }
      observe() {}
      disconnect() {}
    })
    const onFirstPageReady = vi.fn()
    const onError = vi.fn()

    renderReader({ onFirstPageReady, onError })
    await waitFor(() => expect(renderTask).toHaveBeenCalledTimes(1))
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(480)
    resize.forEach((callback) => callback())

    await waitFor(() => expect(renderTask).toHaveBeenCalledTimes(2))
    expect(tasks[0].cancel).toHaveBeenCalled()
    tasks[1].finish()

    await waitFor(() => expect(onFirstPageReady).toHaveBeenCalledTimes(1))
    expect(onError).not.toHaveBeenCalled()
  })
})

function renderReader(props) {
  return render(<PdfReader url="/api/content/token" content={null} source={{ mode: 'pdf', url: '/api/content/token', size: null }} {...props} />)
}
