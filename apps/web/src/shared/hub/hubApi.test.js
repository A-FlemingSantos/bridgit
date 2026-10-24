import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHubApi } from './hubApi.js'

const requestFns = {
  listProvidersRequest: vi.fn(),
}

vi.mock('@bridgit/shared-client', async (importOriginal) => ({
  ...(await importOriginal()),
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

    requestFns.listProvidersRequest.mockRejectedValue(await sessionErrorApi('SESSAO_REVOGADA', 401))
    await expect(api.listProviders()).rejects.toMatchObject({ code: 'SESSAO_REVOGADA' })
    expect(onUnauthorized).toHaveBeenCalledTimes(5)

    requestFns.listProvidersRequest.mockRejectedValue(await sessionErrorApi('USUARIO_INVALIDO', 401))
    await expect(api.listProviders()).rejects.toMatchObject({ code: 'USUARIO_INVALIDO' })
    expect(onUnauthorized).toHaveBeenCalledTimes(6)
  })

  it('resolve url e proxyUrl relativos de descritores e tickets contra VITE_API_BASE_URL', async () => {
    const { getReadSource, createContentTicket } = await import('@bridgit/shared-client')
    getReadSource.mockResolvedValue({ url: '/api/content/t1', proxyUrl: '/api/content/t2', revision: 'r1' })
    createContentTicket.mockResolvedValue({ url: '/api/content/t3' })
    const api = createHubApi(() => 'token', vi.fn())

    expect(await api.getReadSource('connection-a', 'ref')).toEqual({ url: '/api/content/t1', proxyUrl: '/api/content/t2', revision: 'r1' })
    expect(await api.createContentTicket('connection-a', 'ref', 'attachment')).toEqual({ url: '/api/content/t3' })

    vi.stubEnv('VITE_API_BASE_URL', 'https://bridgit-demo.duckdns.org')
    try {
      expect(await api.getReadSource('connection-a', 'ref')).toEqual({
        url: 'https://bridgit-demo.duckdns.org/api/content/t1',
        proxyUrl: 'https://bridgit-demo.duckdns.org/api/content/t2',
        revision: 'r1',
      })
      expect(await api.createContentTicket('connection-a', 'ref', 'attachment')).toEqual({
        url: 'https://bridgit-demo.duckdns.org/api/content/t3',
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('recusa sem enviar um arquivo que não pode mais ser lido', async () => {
    const { uploadFile } = await import('@bridgit/shared-client')
    uploadFile.mockReset()
    const api = createHubApi(() => 'token', vi.fn())
    const gone = new File(['conteudo'], 'atalho.md')
    gone.slice = () => ({ arrayBuffer: () => Promise.reject(new DOMException('A requested file could not be found.', 'NotFoundError')) })

    await expect(api.uploadFile('connection-b', null, gone)).rejects.toMatchObject({ code: 'ARQUIVO_ILEGIVEL', status: 400 })
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('recusa um arquivo vazio cujo destino sumiu (atalho quebrado)', async () => {
    const { uploadFile } = await import('@bridgit/shared-client')
    uploadFile.mockReset()
    const api = createHubApi(() => 'token', vi.fn())
    const shortcut = new File([], 'Hub-nuvem.md')
    shortcut.arrayBuffer = () => Promise.reject(new DOMException('A requested file could not be found.', 'NotFoundError'))

    await expect(api.uploadFile('connection-b', null, shortcut)).rejects.toMatchObject({ code: 'ARQUIVO_ILEGIVEL' })
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('envia um arquivo vazio legível', async () => {
    const { uploadFile } = await import('@bridgit/shared-client')
    uploadFile.mockReset().mockResolvedValue({ ref: 'r2' })
    const api = createHubApi(() => 'token', vi.fn())

    await expect(api.uploadFile('connection-b', null, new File([], 'novo.txt'))).resolves.toEqual({ ref: 'r2' })
  })

  it('envia um arquivo legível depois de ler o primeiro byte', async () => {
    const { uploadFile } = await import('@bridgit/shared-client')
    uploadFile.mockReset().mockResolvedValue({ ref: 'r1' })
    const api = createHubApi(() => 'token', vi.fn())

    await expect(api.uploadFile('connection-b', null, new File(['conteudo'], 'nota.md'))).resolves.toEqual({ ref: 'r1' })
    expect(uploadFile).toHaveBeenCalledTimes(1)
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
