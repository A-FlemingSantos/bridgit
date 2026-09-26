import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHubApi } from './hubApi.js'

const requestFns = {
  listProvidersRequest: vi.fn(),
}

vi.mock('@bridgit/shared-client', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(message, options = {}) {
      super(message)
      this.name = 'ApiClientError'
      this.code = options.code ?? 'ERRO_API'
      this.status = options.status ?? 500
      this.validations = options.validations ?? null
    }
  },
  listProviders: (...args) => requestFns.listProvidersRequest(...args),
  connectProvider: vi.fn(),
  disconnectProvider: vi.fn(),
  listFolder: vi.fn(),
  getItem: vi.fn(),
  createFolder: vi.fn(),
  uploadFile: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  getReadSource: vi.fn(),
  createContentTicket: vi.fn(),
  search: vi.fn(),
  listRecents: vi.fn(),
  recordRecent: vi.fn(),
  listShortcuts: vi.fn(),
  addShortcut: vi.fn(),
  removeShortcut: vi.fn(),
  getPublicLink: vi.fn(),
  enablePublicLink: vi.fn(),
  disablePublicLink: vi.fn(),
}))

async function sessionErrorApi(code, status) {
  const { ApiClientError } = await import('@bridgit/shared-client')
  return new ApiClientError('Falhou', { code, status })
}

beforeEach(() => {
  requestFns.listProvidersRequest.mockReset()
})

describe('hubApi autorizacao', () => {
  it('F18 desloga apenas em falha de sessao 401', async () => {
    const onUnauthorized = vi.fn()
    const api = createHubApi(() => 'token', onUnauthorized)

    requestFns.listProvidersRequest.mockResolvedValue([])
    await api.listProviders()
    expect(onUnauthorized).not.toHaveBeenCalled()

    requestFns.listProvidersRequest.mockRejectedValue(await sessionErrorApi('TOKEN_INVALIDO', 401))
    await expect(api.listProviders()).rejects.toMatchObject({ code: 'TOKEN_INVALIDO' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)

    requestFns.listProvidersRequest.mockRejectedValue(await sessionErrorApi('SESSAO_INVALIDA', 401))
    await expect(api.listProviders()).rejects.toMatchObject({ code: 'SESSAO_INVALIDA' })
    expect(onUnauthorized).toHaveBeenCalledTimes(2)

    requestFns.listProvidersRequest.mockRejectedValue(await sessionErrorApi('AUTENTICACAO_OBRIGATORIA', 401))
    await expect(api.listProviders()).rejects.toMatchObject({ code: 'AUTENTICACAO_OBRIGATORIA' })
    expect(onUnauthorized).toHaveBeenCalledTimes(3)

    requestFns.listProvidersRequest.mockRejectedValue(await sessionErrorApi('ERRO_API', 401))
    await expect(api.listProviders()).rejects.toMatchObject({ code: 'ERRO_API' })
    expect(onUnauthorized).toHaveBeenCalledTimes(4)
  })

  it('F18 nunca desloga em erro de provedor', async () => {
    const onUnauthorized = vi.fn()
    const api = createHubApi(() => 'token', onUnauthorized)

    requestFns.listProvidersRequest.mockRejectedValue(await sessionErrorApi('TOKEN_PROVEDOR_INVALIDO', 401))
    await expect(api.listProviders()).rejects.toMatchObject({ code: 'TOKEN_PROVEDOR_INVALIDO' })
    expect(onUnauthorized).not.toHaveBeenCalled()

    requestFns.listProvidersRequest.mockRejectedValue(await sessionErrorApi('TOKEN_PROVEDOR_INVALIDO', 403))
    await expect(api.listProviders()).rejects.toMatchObject({ status: 403 })
    expect(onUnauthorized).not.toHaveBeenCalled()

    requestFns.listProvidersRequest.mockRejectedValue(await sessionErrorApi('RECONEXAO_NECESSARIA', 400))
    await expect(api.listProviders()).rejects.toMatchObject({ code: 'RECONEXAO_NECESSARIA' })
    expect(onUnauthorized).not.toHaveBeenCalled()

    requestFns.listProvidersRequest.mockRejectedValue(await sessionErrorApi('ERRO_API', 500))
    await expect(api.listProviders()).rejects.toMatchObject({ status: 500 })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
