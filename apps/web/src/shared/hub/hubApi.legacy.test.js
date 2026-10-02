import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, createFolder, uploadFile, updateItem, deleteItem } from '@bridgit/shared-client'
import { createHubApi } from './hubApi.js'

vi.mock('@bridgit/shared-client', async (original) => ({
  ...await original(), createFolder: vi.fn(), uploadFile: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn(),
}))
beforeEach(() => vi.resetAllMocks())
const item = { ref: 'remote-id', name: 'Docs' }

describe('legacy mutation identity', () => {
  it.each([0, 503])('reuses folder identity after status %s, then allows a distinct identical action', async (status) => {
    createFolder.mockRejectedValueOnce(new ApiClientError('uncertain', { status })).mockResolvedValue(item)
    const api = createHubApi(() => 'token', vi.fn(), { getIdentity: () => 'user' })
    await expect(api.createFolder('onedrive', null, 'Docs')).rejects.toMatchObject({ status })
    await expect(api.createFolder('onedrive', null, 'Docs')).resolves.toEqual(item)
    await api.createFolder('onedrive', null, 'Docs')
    const keys = createFolder.mock.calls.map((args) => args[4].clientKey)
    expect(keys[0]).toBe(keys[1])
    expect(keys[2]).not.toBe(keys[0])
  })

  it('retains keys separately for uploads, updates and deletions after transient errors', async () => {
    uploadFile.mockRejectedValueOnce(new ApiClientError('uncertain', { status: 503 })).mockResolvedValue(item)
    updateItem.mockRejectedValueOnce(new ApiClientError('uncertain', { status: 0 })).mockResolvedValue(item)
    deleteItem.mockRejectedValueOnce(new ApiClientError('uncertain', { status: 503 })).mockResolvedValue({ deleted: true })
    const api = createHubApi(() => 'token', vi.fn())
    const file = new File(['content'], 'File.txt', { type: 'text/plain' })
    await expect(api.uploadFile('onedrive', null, file)).rejects.toMatchObject({ status: 503 })
    await api.uploadFile('onedrive', null, file)
    expect(uploadFile.mock.calls[0][4].clientKey).toBe(uploadFile.mock.calls[1][4].clientKey)
    await expect(api.updateItem('onedrive', 'ref', { name: 'New.txt' })).rejects.toMatchObject({ status: 0 })
    await api.updateItem('onedrive', 'ref', { name: 'New.txt' })
    expect(updateItem.mock.calls[0][4].clientKey).toBe(updateItem.mock.calls[1][4].clientKey)
    await expect(api.deleteItem('onedrive', 'ref')).rejects.toMatchObject({ status: 503 })
    await api.deleteItem('onedrive', 'ref')
    expect(deleteItem.mock.calls[0][3].clientKey).toBe(deleteItem.mock.calls[1][3].clientKey)
  })

  it('starts a new identity after a definitive rejection', async () => {
    createFolder.mockRejectedValueOnce(new ApiClientError('rejected', { status: 409 })).mockResolvedValue(item)
    const api = createHubApi(() => 'token', vi.fn())
    await expect(api.createFolder('onedrive', null, 'Docs')).rejects.toMatchObject({ status: 409 })
    await api.createFolder('onedrive', null, 'Docs')
    expect(createFolder.mock.calls[0][4].clientKey).not.toBe(createFolder.mock.calls[1][4].clientKey)
  })

  it('does not reuse a previous users uncertain key after a session change', async () => {
    createFolder.mockRejectedValueOnce(new ApiClientError('uncertain', { status: 503 })).mockResolvedValue(item)
    let identity = 'user-a'
    const api = createHubApi(() => 'token', vi.fn(), { getIdentity: () => identity })
    await expect(api.createFolder('onedrive', null, 'Docs')).rejects.toMatchObject({ status: 503 })
    identity = 'user-b'
    await api.createFolder('onedrive', null, 'Docs')
    expect(createFolder.mock.calls[0][4].clientKey).not.toBe(createFolder.mock.calls[1][4].clientKey)
  })

  it('uses distinct identities for different file objects and providers', async () => {
    uploadFile.mockRejectedValue(new ApiClientError('uncertain', { status: 503 }))
    createFolder.mockRejectedValue(new ApiClientError('uncertain', { status: 503 }))
    const api = createHubApi(() => 'token', vi.fn())
    await expect(api.uploadFile('onedrive', null, new File(['same'], 'File.txt'))).rejects.toMatchObject({ status: 503 })
    await expect(api.uploadFile('onedrive', null, new File(['same'], 'File.txt'))).rejects.toMatchObject({ status: 503 })
    expect(uploadFile.mock.calls[0][4].clientKey).not.toBe(uploadFile.mock.calls[1][4].clientKey)
    await expect(api.createFolder('onedrive', null, 'Docs')).rejects.toMatchObject({ status: 503 })
    await expect(api.createFolder('google-drive', null, 'Docs')).rejects.toMatchObject({ status: 503 })
    expect(createFolder.mock.calls[0][4].clientKey).not.toBe(createFolder.mock.calls[1][4].clientKey)
  })
})
