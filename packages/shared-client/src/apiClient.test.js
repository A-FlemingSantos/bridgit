import { describe, expect, it, vi } from 'vitest'
import { ApiClientError, apiRequest, buildApiUrl, configureApiClient } from './apiClient.js'

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function envelope(data) {
  return { success: true, data }
}

describe('buildApiUrl', () => {
  it('returns a relative path without baseUrl', () => {
    expect(buildApiUrl('/api/x', { a: 1, b: '', c: null })).toBe('/api/x?a=1')
  })

  it('joins baseUrl and path without doubling the slash', () => {
    expect(buildApiUrl('/api/x', undefined, { baseUrl: 'http://host:8080/' })).toBe('http://host:8080/api/x')
    expect(buildApiUrl('/api/x', undefined, { baseUrl: 'http://host:8080///' })).toBe('http://host:8080/api/x')
    expect(buildApiUrl('/api/x', undefined, { baseUrl: 'http://host:8080' })).toBe('http://host:8080/api/x')
  })
})

describe('apiRequest', () => {
  it('returns data from a valid envelope, including null data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(envelope({ ok: 1 })))
    await expect(apiRequest('/api/x', { fetchImpl })).resolves.toEqual({ ok: 1 })

    fetchImpl.mockResolvedValue(jsonResponse(envelope(null)))
    await expect(apiRequest('/api/x', { fetchImpl })).resolves.toBeNull()
  })

  it('sends bearer token, JSON body and signal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(envelope(1)))
    const signal = new AbortController().signal
    await apiRequest('/api/x', { fetchImpl, token: 't', method: 'POST', body: { a: 1 }, signal })
    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers.get('Authorization')).toBe('Bearer t')
    expect(init.headers.get('Content-Type')).toBe('application/json')
    expect(init.body).toBe('{"a":1}')
    expect(init.signal).toBe(signal)
  })

  it('does not set a content type for FormData', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(envelope(1)))
    const body = new FormData()
    body.append('a', 'b')
    await apiRequest('/api/x', { fetchImpl, method: 'POST', body })
    const [, init] = fetchImpl.mock.calls[0]
    expect(init.headers.has('Content-Type')).toBe(false)
    expect(init.body).toBe(body)
  })

  it('uses configured defaults', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(envelope(1)))
    configureApiClient({ baseUrl: 'http://api.test/', fetchImpl })
    try {
      await apiRequest('/api/x')
      expect(fetchImpl.mock.calls[0][0]).toBe('http://api.test/api/x')
    } finally {
      configureApiClient({})
    }
  })

  it('rejects a 200 without a valid envelope with RESPOSTA_INVALIDA', async () => {
    const bodies = [{}, { data: 1 }, { success: true }, 'texto', null, []]
    for (const body of bodies) {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(body))
      await expect(apiRequest('/api/x', { fetchImpl })).rejects.toMatchObject({
        name: 'ApiClientError',
        code: 'RESPOSTA_INVALIDA',
        status: 200,
        message: 'O servidor enviou uma resposta inesperada.',
      })
    }
  })

  it('rejects a 200 that says success false', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: false, data: null }))
    await expect(apiRequest('/api/x', { fetchImpl })).rejects.toBeInstanceOf(ApiClientError)
  })

  it('rejects a 200 with a non-JSON body (e.g. an HTML page from a proxy)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html></html>', { status: 200 }))
    await expect(apiRequest('/api/x', { fetchImpl })).rejects.toMatchObject({ code: 'RESPOSTA_INVALIDA' })
  })

  it('accepts 204 with no body as undefined', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await expect(apiRequest('/api/x', { fetchImpl })).resolves.toBeUndefined()
  })

  it('maps the server error envelope to ApiClientError', async () => {
    const error = { code: 'SESSAO_REVOGADA', message: 'Sua sessão foi encerrada.', validations: [{ field: 'a' }] }
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: false, data: null, error }, { status: 401 }))
    const caught = await apiRequest('/api/x', { fetchImpl }).catch((e) => e)
    expect(caught).toBeInstanceOf(ApiClientError)
    expect(caught).toMatchObject({ code: 'SESSAO_REVOGADA', status: 401, message: 'Sua sessão foi encerrada.' })
    expect(caught.validations).toEqual([{ field: 'a' }])
  })

  it('falls back to a generic error for a non-envelope failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 }))
    await expect(apiRequest('/api/x', { fetchImpl })).rejects.toMatchObject({
      code: 'ERRO_API',
      status: 502,
      message: 'Não foi possível concluir a operação solicitada.',
    })
  })

  it('turns a network failure into ERRO_CONEXAO keeping the cause', async () => {
    const cause = new TypeError('Failed to fetch')
    const fetchImpl = vi.fn().mockRejectedValue(cause)
    const caught = await apiRequest('/api/x', { fetchImpl }).catch((e) => e)
    expect(caught).toBeInstanceOf(ApiClientError)
    expect(caught).toMatchObject({ code: 'ERRO_CONEXAO', status: 0, message: 'Não foi possível conectar ao servidor.' })
    expect(caught.cause).toBe(cause)
  })

  it('turns an abort into CANCELADO keeping the cause', async () => {
    const controller = new AbortController()
    const cause = new DOMException('aborted', 'AbortError')
    const fetchImpl = vi.fn().mockImplementation(() => {
      controller.abort()
      return Promise.reject(cause)
    })
    const caught = await apiRequest('/api/x', { fetchImpl, signal: controller.signal }).catch((e) => e)
    expect(caught).toMatchObject({ code: 'CANCELADO', status: 0 })
    expect(caught.cause).toBe(cause)
  })

  it('treats a failure after the signal aborted as CANCELADO', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network'))
    await expect(apiRequest('/api/x', { fetchImpl, signal: controller.signal })).rejects.toMatchObject({
      code: 'CANCELADO',
    })
  })

  describe('blob mode', () => {
    it('returns the blob on success', async () => {
      const blob = new Blob(['abc'])
      const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: () => Promise.resolve(blob) })
      await expect(apiRequest('/api/x', { fetchImpl, responseType: 'blob' })).resolves.toBe(blob)
    })

    it('uses the server envelope when the error is JSON', async () => {
      const error = { code: 'CONTEUDO_NAO_ENCONTRADO', message: 'Conteúdo não encontrado.' }
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: false, data: null, error }, { status: 404 }))
      await expect(apiRequest('/api/x', { fetchImpl, responseType: 'blob' })).rejects.toMatchObject({
        code: 'CONTEUDO_NAO_ENCONTRADO',
        status: 404,
        message: 'Conteúdo não encontrado.',
      })
    })

    it('keeps ERRO_DOWNLOAD for non-JSON errors', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response('oops', { status: 500, headers: { 'Content-Type': 'text/plain' } }),
      )
      await expect(apiRequest('/api/x', { fetchImpl, responseType: 'blob' })).rejects.toMatchObject({
        code: 'ERRO_DOWNLOAD',
        status: 500,
      })
    })

    it('keeps ERRO_DOWNLOAD when the JSON error has no envelope', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ foo: 1 }, { status: 500 }))
      await expect(apiRequest('/api/x', { fetchImpl, responseType: 'blob' })).rejects.toMatchObject({
        code: 'ERRO_DOWNLOAD',
      })
    })
  })
})

describe('ApiClientError', () => {
  it('has defaults and accepts cause', () => {
    const plain = new ApiClientError('x')
    expect(plain).toMatchObject({ code: 'ERRO_API', status: 500, validations: null })
    expect('cause' in plain).toBe(false)
    const cause = new Error('root')
    expect(new ApiClientError('x', { cause }).cause).toBe(cause)
  })
})
