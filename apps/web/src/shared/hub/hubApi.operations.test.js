import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, submitOperation, submitUploadOperation, getOperation } from '@bridgit/shared-client'
import { createHubApi } from './hubApi.js'

vi.mock('@bridgit/shared-client', async (original) => ({
  ...await original(), submitOperation: vi.fn(), submitUploadOperation: vi.fn(), getOperation: vi.fn(),
}))
const connection = { connectionId: 'connection', provider: 'onedrive', generation: 1, operationsEnabled: true }
const request = { provider: 'onedrive', kind: 'CREATE_FOLDER', name: 'Docs' }
const item = { connectionId: 'connection', provider: 'onedrive', ref: 'folder', kind: 'folder', name: 'Docs' }
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('durable API operations', () => {
  it('addresses the work to the account and names its real provider', async () => {
    const getConnection = vi.fn(() => ({ ...connection, connectionId: 'second-account' }))
    submitOperation.mockResolvedValue({ id: 'op', status: 'SUCCEEDED', request, item: { ref: 'folder', name: 'Docs' } })
    const api = createHubApi(() => 'token', vi.fn(), { getConnection, getIdentity: () => 'user' })
    const created = await api.createFolder('second-account', null, 'Docs')
    expect(getConnection).toHaveBeenCalledWith('second-account')
    expect(submitOperation.mock.calls[0][1]).toMatchObject({ provider: 'onedrive', connectionId: 'second-account', generation: 1 })
    expect(created).toMatchObject({ ref: 'folder', connectionId: 'second-account' })
  })
  it('retries a lost acceptance with the same idempotency key', async () => {
    submitOperation.mockRejectedValueOnce(new ApiClientError('network', { status: 0 }))
      .mockResolvedValueOnce({ id: 'op', status: 'SUCCEEDED', request, item })
    const api = createHubApi(() => 'token', vi.fn(), { getConnection: () => connection, getIdentity: () => 'user' })
    const result = api.createFolder('connection', null, 'Docs')
    await vi.advanceTimersByTimeAsync(300)
    await expect(result).resolves.toEqual(item)
    expect(submitOperation).toHaveBeenCalledTimes(2)
    expect(submitOperation.mock.calls[0][1].clientKey).toBe(submitOperation.mock.calls[1][1].clientKey)
  })
  it('does not report success on acceptance or resubmit while polling fails', async () => {
    submitOperation.mockResolvedValue({ id: 'op', status: 'QUEUED', request })
    getOperation.mockRejectedValueOnce(new ApiClientError('unavailable', { status: 503 }))
      .mockResolvedValueOnce({ id: 'op', status: 'SUCCEEDED', request, item })
    const events = vi.fn()
    const api = createHubApi(() => 'token', vi.fn(), { getConnection: () => connection, getIdentity: () => 'user', onOperation: events })
    let finished = false
    const result = api.createFolder('connection', null, 'Docs').then((value) => { finished = true; return value })
    await vi.advanceTimersByTimeAsync(750)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(750)
    await expect(result).resolves.toEqual(item)
    expect(submitOperation).toHaveBeenCalledTimes(1)
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'SUCCEEDED' }))
  })
  it('tells the caller as soon as the server accepts, before the work is done', async () => {
    submitOperation.mockResolvedValue({ id: 'op', status: 'QUEUED', request })
    getOperation.mockResolvedValueOnce({ id: 'op', status: 'SUCCEEDED', request, item })
    const accepted = vi.fn()
    const api = createHubApi(() => 'token', vi.fn(), { getConnection: () => connection, getIdentity: () => 'user' })
    let finished = false
    const result = api.createFolder('connection', null, 'Docs', { onAccepted: accepted }).then((value) => { finished = true; return value })
    await vi.advanceTimersByTimeAsync(0)
    expect(accepted).toHaveBeenCalledTimes(1)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(750)
    await expect(result).resolves.toEqual(item)
    expect(accepted).toHaveBeenCalledTimes(1)
  })
  it('keeps the form open when the server refuses the work at submit', async () => {
    submitOperation.mockResolvedValue({ id: 'op', status: 'REJECTED', request, errorMessage: 'Já existe.' })
    const accepted = vi.fn()
    const api = createHubApi(() => 'token', vi.fn(), { getConnection: () => connection, getIdentity: () => 'user' })
    await expect(api.createFolder('connection', null, 'Docs', { onAccepted: accepted })).rejects.toThrow('Já existe.')
    expect(accepted).not.toHaveBeenCalled()
  })
  it('rejects a late result from another authenticated identity', async () => {
    let identity = 'user-a'
    let resolve
    submitOperation.mockImplementation(() => new Promise((done) => { resolve = done }))
    const api = createHubApi(() => 'token', vi.fn(), { getConnection: () => connection, getIdentity: () => identity })
    const result = api.createFolder('connection', null, 'Docs')
    const assertion = expect(result).rejects.toMatchObject({ code: 'RESPOSTA_OBSOLETA' })
    identity = 'user-b'
    resolve({ id: 'op', status: 'SUCCEEDED', request, item })
    await assertion
  })
  describe('replaceFileContent', () => {
    const saved = { ref: 'file', name: 'a.txt', contentRevision: 'r2' }
    const textFile = () => new File(['texto'], 'a.txt', { type: 'text/plain' })
    const make = (extra = {}) => createHubApi(() => 'token', vi.fn(), { getConnection: () => connection, getIdentity: () => 'user', ...extra })

    it('submits REPLACE_CONTENT with the explicit version over the cached one', async () => {
      submitUploadOperation.mockResolvedValue({ id: 'op', status: 'SUCCEEDED', request, item: saved })
      const file = textFile()
      const result = await make({ getItemVersion: () => 'cached-version' }).replaceFileContent('connection', 'file', file, 'r1')
      const [, sent, sentFile] = submitUploadOperation.mock.calls[0]
      expect(sent).toMatchObject({ kind: 'REPLACE_CONTENT', ref: 'file', expectedVersion: 'r1', contentType: 'text/plain', connectionId: 'connection' })
      expect(sentFile).toBe(file)
      expect(result).toEqual({ ...saved, connectionId: 'connection' })
    })

    it('sends a null content type when the file has none', async () => {
      submitUploadOperation.mockResolvedValue({ id: 'op', status: 'SUCCEEDED', request, item: saved })
      await make().replaceFileContent('connection', 'file', new File(['x'], 'Makefile'), 'r1')
      expect(submitUploadOperation.mock.calls[0][1].contentType).toBeNull()
    })

    it('reuses the same client key when the same file is retried after an ambiguous failure', async () => {
      submitUploadOperation.mockRejectedValue(new ApiClientError('unavailable', { status: 503 }))
      const api = make()
      const file = textFile()
      const first = expect(api.replaceFileContent('connection', 'file', file, 'r1')).rejects.toMatchObject({ status: 503 })
      await vi.advanceTimersByTimeAsync(2000)
      await first
      submitUploadOperation.mockResolvedValue({ id: 'op', status: 'SUCCEEDED', request, item: saved })
      await api.replaceFileContent('connection', 'file', file, 'r1')
      const keys = submitUploadOperation.mock.calls.map((call) => call[1].clientKey)
      expect(new Set(keys).size).toBe(1)
    })

    it('reports the request to the caller before it is sent', async () => {
      submitUploadOperation.mockResolvedValue({ id: 'op', status: 'SUCCEEDED', request, item: saved })
      const onRequest = vi.fn()
      await make().replaceFileContent('connection', 'file', textFile(), 'r1', { onRequest })
      expect(onRequest).toHaveBeenCalledWith(expect.objectContaining({ kind: 'REPLACE_CONTENT', clientKey: submitUploadOperation.mock.calls[0][1].clientKey }))
    })

    it('throws for text over 2 MB before any request', async () => {
      const file = textFile()
      Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 + 1 })
      await expect(make().replaceFileContent('connection', 'file', file, 'r1')).rejects.toMatchObject({ code: 'TEXTO_GRANDE_DEMAIS', status: 400 })
      expect(submitUploadOperation).not.toHaveBeenCalled()
    })
  })
})
