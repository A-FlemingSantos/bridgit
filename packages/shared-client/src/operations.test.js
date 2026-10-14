import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './apiClient.js'
import {
  getHubEventHead,
  getHubEvents,
  getOperation,
  listOperations,
  retryOperation,
  submitOperation,
  submitUploadOperation,
} from './operations.js'
import { MAX_UPLOAD_BYTES } from './limits.js'

vi.mock('./apiClient.js', () => ({
  apiRequest: vi.fn(),
  ApiClientError: class ApiClientError extends Error {
    constructor(message, options = {}) {
      super(message)
      this.name = 'ApiClientError'
      this.code = options.code ?? 'ERRO_API'
      this.status = options.status ?? 500
    }
  },
}))

const token = 'tok'

beforeEach(() => {
  apiRequest.mockReset()
  apiRequest.mockResolvedValue({ id: 'op-1' })
})

describe('operations api', () => {
  it('submitOperation posts the request as JSON', async () => {
    const request = { clientKey: 'k', kind: 'DELETE' }
    await submitOperation(token, request)
    expect(apiRequest).toHaveBeenCalledWith('/api/operations', { token, method: 'POST', body: request })
  })

  it('getOperation, retryOperation and listOperations use the right routes', async () => {
    await getOperation(token, 'a/b')
    expect(apiRequest).toHaveBeenLastCalledWith('/api/operations/a%2Fb', { token })
    await retryOperation(token, 'op-1')
    expect(apiRequest).toHaveBeenLastCalledWith('/api/operations/op-1/retry', { token, method: 'POST' })
    await listOperations(token)
    expect(apiRequest).toHaveBeenLastCalledWith('/api/operations', { token })
  })

  it('event routes forward after and signal', async () => {
    const signal = new AbortController().signal
    await getHubEvents(token, 7, signal)
    expect(apiRequest).toHaveBeenLastCalledWith('/api/hub/events', { token, query: { after: 7 }, signal })
    await getHubEventHead(token, signal)
    expect(apiRequest).toHaveBeenLastCalledWith('/api/hub/events/head', { token, signal })
  })

  describe('submitUploadOperation', () => {
    const request = { clientKey: 'upload-1', kind: 'UPLOAD', parentRef: 'p1', name: 'a.txt' }

    it('sends multipart with the request as text and the Idempotency-Key', async () => {
      const file = new File(['hello'], 'a.txt', { type: 'text/plain' })
      await submitUploadOperation(token, request, file)
      const [path, options] = apiRequest.mock.calls[0]
      expect(path).toBe('/api/operations/uploads')
      expect(options.method).toBe('POST')
      expect(options.body).toBeInstanceOf(FormData)
      expect(options.body.get('request')).toBe(JSON.stringify(request))
      expect(options.body.get('file')).toBe(file)
      expect(options.headers).toEqual({ 'Idempotency-Key': 'upload-1' })
    })

    it('prefers an explicit clientKey option', async () => {
      await submitUploadOperation(token, request, new File(['x'], 'a.txt'), { clientKey: 'explicit' })
      expect(apiRequest.mock.calls[0][1].headers).toEqual({ 'Idempotency-Key': 'explicit' })
    })

    it('generates a key when none is given', async () => {
      await submitUploadOperation(token, { kind: 'UPLOAD' }, new File(['x'], 'a.txt'))
      expect(apiRequest.mock.calls[0][1].headers['Idempotency-Key']).toEqual(expect.any(String))
    })

    it('rejects the promise for files over the limit without sending', async () => {
      const file = new File(['x'], 'big.bin')
      Object.defineProperty(file, 'size', { value: MAX_UPLOAD_BYTES + 1 })
      let pending
      expect(() => { pending = submitUploadOperation(token, request, file) }).not.toThrow()
      await expect(pending).rejects.toMatchObject({ code: 'ARQUIVO_GRANDE', status: 400 })
      expect(apiRequest).not.toHaveBeenCalled()
    })

    it('accepts a file exactly at the limit and files without a size', async () => {
      const atLimit = new File(['x'], 'a.bin')
      Object.defineProperty(atLimit, 'size', { value: MAX_UPLOAD_BYTES })
      await submitUploadOperation(token, request, atLimit)
      await submitUploadOperation(token, request, { uri: 'file:///a', name: 'a', type: 'text/plain' })
      expect(apiRequest).toHaveBeenCalledTimes(2)
    })
  })
})
