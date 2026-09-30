import { describe, expect, it, vi } from 'vitest'

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  PDFDataRangeTransport: class {
    constructor() {
      this.progressive = []
      this.ranges = []
    }

    onDataProgressiveRead(chunk) {
      this.progressive.push(Array.from(chunk))
      // Simulate PDF.js owning/transferring the supplied bytes.
      chunk.fill(0)
    }

    onDataProgressiveDone() {}

    onDataRange(begin, chunk) {
      this.ranges.push({ begin, bytes: Array.from(chunk) })
      chunk.fill(0)
    }
  },
}))

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.min.mjs' }))
vi.mock('../../hub/storage/index.js', () => ({
  getContent: vi.fn(),
  putContent: vi.fn(),
  withContentLock: vi.fn(),
}))

import { ProgressivePdfTransport } from './PdfReader.jsx'

function source(overrides = {}) {
  return {
    userId: 'user-1',
    connectionId: 'connection-1',
    generation: 1,
    ref: 'file-1',
    revision: 'r-1',
    size: 4,
    url: '/direct.pdf',
    providerId: 'onedrive',
    proxyUrl: '/proxy.pdf',
    ...overrides,
  }
}

function failingStreamAfter(chunk) {
  return {
    getReader: () => ({
      read: vi.fn()
        .mockResolvedValueOnce({ value: new Uint8Array(chunk), done: false })
        .mockRejectedValueOnce(new Error('network interrupted')),
      releaseLock: vi.fn(),
    }),
  }
}

describe('ProgressivePdfTransport', () => {
  it('does not retry through the proxy after publishing direct-response bytes', async () => {
    const transport = new ProgressivePdfTransport(source(), vi.fn())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: failingStreamAfter([1, 2]) }))

    await expect(transport.download()).rejects.toThrow('network interrupted')

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(transport.fullChunks[0]).toEqual(new Uint8Array([1, 2]))
    expect(transport.progressive).toEqual([[1, 2]])
  })

  it('deduplicates missing range requests and gives PDF.js a disposable copy', async () => {
    const transport = new ProgressivePdfTransport(source({ size: 8 }), vi.fn())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([5, 6, 7]).buffer }),
    )

    transport.requestDataRange(5, 8)
    transport.requestDataRange(5, 8)

    await vi.waitFor(() => expect(transport.ranges).toEqual([{ begin: 5, bytes: [5, 6, 7] }]))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/direct.pdf', {
      signal: expect.any(AbortSignal),
      headers: { Range: 'bytes=5-7' },
    })
  })

  it('fulfills waiting ranges from a cached complete document', async () => {
    const transport = new ProgressivePdfTransport(source(), vi.fn())
    const delayedRange = new Promise(() => {})
    vi.stubGlobal('fetch', vi.fn(() => delayedRange))

    transport.requestDataRange(1, 3)
    await transport.pushCached(new Blob([new Uint8Array([1, 2, 3, 4])]))

    expect(transport.ranges).toEqual([{ begin: 1, bytes: [2, 3] }])
  })
})
