export class ApiClientError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiClientError'
    if (options.cause !== undefined) this.cause = options.cause
    this.code = options.code ?? 'ERRO_API'
    this.status = options.status ?? 500
    this.validations = options.validations ?? null
  }
}

export function buildApiUrl(path, query, options = {}) {
  const baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '')
  const origin = options.origin ?? 'http://localhost'
  const url = new URL(`${baseUrl}${path}`, origin)

  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return
      url.searchParams.set(key, value)
    })
  }

  if (!baseUrl && options.relative !== false) {
    return `${url.pathname}${url.search}`
  }

  return url.toString()
}

let clientDefaults = {}

// Hosts without a same-origin proxy (e.g. React Native) set baseUrl/fetchImpl once at startup.
export function configureApiClient(defaults = {}) {
  clientDefaults = { ...defaults }
}

export async function apiRequest(path, requestOptions = {}) {
  const options = { ...clientDefaults, ...requestOptions }
  const {
    method = 'GET',
    body,
    token,
    headers = {},
    query,
    responseType = 'json',
    baseUrl = '',
    origin,
    relative,
    fetchImpl = globalThis.fetch,
    signal,
  } = options

  const requestHeaders = new Headers(headers)
  const init = {
    method,
    headers: requestHeaders,
    ...(signal ? { signal } : {}),
  }

  if (token) {
    requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json')
    init.body = JSON.stringify(body)
  }

  let response

  try {
    response = await fetchImpl(buildApiUrl(path, query, { baseUrl, origin, relative }), init)
  } catch (cause) {
    if (cause?.name === 'AbortError' || signal?.aborted) throw cancelledError(cause)
    throw new ApiClientError('Não foi possível conectar ao servidor.', {
      code: 'ERRO_CONEXAO',
      status: 0,
      cause,
    })
  }

  if (responseType === 'blob') {
    if (!response.ok) throw await downloadError(response)
    return response.blob()
  }

  const payload = await response.json().catch((cause) => {
    if (cause?.name === 'AbortError') throw cancelledError(cause)
    return null
  })

  if (!response.ok || payload?.success === false) {
    throw errorFromPayload(payload, response.status)
  }

  // No body is a valid answer only when the server says so (204/205).
  if (response.status === 204 || response.status === 205) return undefined

  if (payload?.success !== true || !('data' in payload)) {
    throw new ApiClientError(INVALID_RESPONSE_MESSAGE, { code: 'RESPOSTA_INVALIDA', status: response.status })
  }

  return payload.data
}

const FAILED_MESSAGE = 'Não foi possível concluir a operação solicitada.'
const INVALID_RESPONSE_MESSAGE = 'O servidor enviou uma resposta inesperada.'

function cancelledError(cause) {
  return new ApiClientError('A requisição foi cancelada.', { code: 'CANCELADO', status: 0, cause })
}

function errorFromPayload(payload, status) {
  const error = payload?.error
  return new ApiClientError(error?.message ?? FAILED_MESSAGE, {
    code: error?.code,
    status,
    validations: error?.validations ?? null,
  })
}

// A failed download normally carries the same JSON envelope as any other error.
async function downloadError(response) {
  const contentType = response.headers?.get?.('content-type') ?? ''
  if (/json/i.test(contentType)) {
    const payload = await response.json().catch(() => null)
    if (payload?.error?.message || payload?.error?.code) return errorFromPayload(payload, response.status)
  }
  return new ApiClientError(FAILED_MESSAGE, { code: 'ERRO_DOWNLOAD', status: response.status })
}
