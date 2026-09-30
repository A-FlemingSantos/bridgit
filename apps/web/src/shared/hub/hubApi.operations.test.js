import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, submitOperation, getOperation } from '@bridgit/shared-client'
import { createHubApi } from './hubApi.js'

vi.mock('@bridgit/shared-client', async (original) => ({
  ...await original(), submitOperation: vi.fn(), getOperation: vi.fn(),
}))
const connection = { connectionId: 'connection', generation: 1, operationsEnabled: true }
const request = { provider: 'onedrive', kind: 'CREATE_FOLDER', name: 'Docs' }
const item = { provider: 'onedrive', ref: 'folder', kind: 'folder', name: 'Docs' }
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('durable API operations', () => {
  it('retries a lost acceptance with the same idempotency key', async () => {
    submitOperation.mockRejectedValueOnce(new ApiClientError('network', { status: 0 }))
      .mockResolvedValueOnce({ id: 'op', status: 'SUCCEEDED', request, item })
    const api = createHubApi(() => 'token', vi.fn(), { getConnection: () => connection, getIdentity: () => 'user' })
    const result = api.createFolder('onedrive', null, 'Docs')
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
    const result = api.createFolder('onedrive', null, 'Docs').then((value) => { finished = true; return value })
    await vi.advanceTimersByTimeAsync(750)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(750)
    await expect(result).resolves.toEqual(item)
    expect(submitOperation).toHaveBeenCalledTimes(1)
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'SUCCEEDED' }))
  })
  it('rejects a late result from another authenticated identity', async () => {
    let identity = 'user-a'
    let resolve
    submitOperation.mockImplementation(() => new Promise((done) => { resolve = done }))
    const api = createHubApi(() => 'token', vi.fn(), { getConnection: () => connection, getIdentity: () => identity })
    const result = api.createFolder('onedrive', null, 'Docs')
    const assertion = expect(result).rejects.toMatchObject({ code: 'RESPOSTA_OBSOLETA' })
    identity = 'user-b'
    resolve({ id: 'op', status: 'SUCCEEDED', request, item })
    await assertion
  })
})
