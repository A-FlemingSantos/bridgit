import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@bridgit/shared-client', () => {
  class ApiClientError extends Error {
    constructor(message, options = {}) {
      super(message)
      this.status = options.status ?? 500
      this.code = options.code
    }
  }
  return {
    ApiClientError,
    createFolder: vi.fn(),
    deleteItem: vi.fn(),
    getOperation: vi.fn(),
    submitOperation: vi.fn(),
    submitUploadOperation: vi.fn(),
    updateItem: vi.fn(),
    uploadFile: vi.fn(),
  }
})

const client = await import('@bridgit/shared-client')
const { runOperation } = await import('./operations')

const durable = { id: 'onedrive', connectionId: 'c1', generation: 3, operationsEnabled: true }

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})

async function settle(promise) {
  const result = promise.then((value) => ({ value }), (error) => ({ error }))
  await vi.runAllTimersAsync()
  return result
}

describe('runOperation (durable)', () => {
  it('submits once and waits for the server to finish', async () => {
    client.submitOperation.mockResolvedValue({ id: 'op1', status: 'QUEUED' })
    client.getOperation
      .mockResolvedValueOnce({ id: 'op1', status: 'EXECUTING' })
      .mockResolvedValueOnce({ id: 'op1', status: 'SUCCEEDED', item: { ref: 'new' } })

    const { value } = await settle(runOperation('t', durable, { kind: 'CREATE_FOLDER', parentRef: '', name: 'Docs' }))

    expect(value).toEqual({ ref: 'new' })
    expect(client.submitOperation).toHaveBeenCalledTimes(1)
    expect(client.submitOperation.mock.calls[0][1]).toMatchObject({
      provider: 'onedrive', kind: 'CREATE_FOLDER', connectionId: 'c1', generation: 3, parentRef: '', name: 'Docs',
    })
  })

  it('resubmits a lost response with the same client key', async () => {
    client.submitOperation
      .mockRejectedValueOnce(new client.ApiClientError('offline', { status: 0 }))
      .mockResolvedValueOnce({ id: 'op1', status: 'SUCCEEDED', item: {} })

    const { error } = await settle(runOperation('t', durable, { kind: 'DELETE', ref: 'r1', version: 'v1' }))

    expect(error).toBeUndefined()
    const keys = client.submitOperation.mock.calls.map((call) => call[1].clientKey)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(client.submitOperation.mock.calls[0][1]).toMatchObject({ ref: 'r1', expectedVersion: 'v1' })
  })

  it('does not retry a rejected request', async () => {
    client.submitOperation.mockRejectedValue(new client.ApiClientError('nome inválido', { status: 400 }))
    const { error } = await settle(runOperation('t', durable, { kind: 'UPDATE', ref: 'r1', name: '' }))
    expect(error.message).toBe('nome inválido')
    expect(client.submitOperation).toHaveBeenCalledTimes(1)
  })

  it('throws when the server rejects the operation', async () => {
    client.submitOperation.mockResolvedValue({
      id: 'op1', status: 'REJECTED', errorCode: 'ARQUIVO_ALTERADO', errorMessage: 'O arquivo mudou.',
    })
    const { error } = await settle(runOperation('t', durable, { kind: 'UPDATE', ref: 'r1', name: 'x' }))
    expect(error.message).toBe('O arquivo mudou.')
    expect(error.code).toBe('ARQUIVO_ALTERADO')
  })

  it('does not submit twice when polling fails', async () => {
    client.submitOperation.mockResolvedValue({ id: 'op1', status: 'QUEUED' })
    client.getOperation
      .mockRejectedValueOnce(new client.ApiClientError('offline', { status: 0 }))
      .mockResolvedValueOnce({ id: 'op1', status: 'SUCCEEDED', item: {} })
    await settle(runOperation('t', durable, { kind: 'DELETE', ref: 'r1' }))
    expect(client.submitOperation).toHaveBeenCalledTimes(1)
  })

  it('sends uploads as a multipart operation', async () => {
    client.submitUploadOperation.mockResolvedValue({ id: 'op1', status: 'SUCCEEDED', item: { ref: 'f' } })
    const file = { uri: 'file:///a.txt', name: 'a.txt', type: 'text/plain' }
    await settle(runOperation('t', durable, { kind: 'UPLOAD', parentRef: 'p', file }))
    expect(client.submitUploadOperation).toHaveBeenCalledWith('t', expect.objectContaining({
      kind: 'UPLOAD', parentRef: 'p', name: 'a.txt', contentType: 'text/plain',
    }), file)
  })
})

describe('runOperation (legacy routes)', () => {
  it('uses the idempotent route when there is no durable connection', async () => {
    client.createFolder.mockResolvedValue({ ref: 'x' })
    const result = await runOperation('t', { id: 'dropbox' }, { kind: 'CREATE_FOLDER', parentRef: '', name: 'Docs' })
    expect(result).toEqual({ ref: 'x' })
    expect(client.createFolder).toHaveBeenCalledWith('t', 'dropbox', '', 'Docs', { clientKey: expect.any(String) })
    expect(client.submitOperation).not.toHaveBeenCalled()
  })
})
