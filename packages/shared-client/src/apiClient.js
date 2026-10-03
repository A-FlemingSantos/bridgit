export class ApiClientError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'ApiClientError'
    this.code = options.code ?? 'ERRO_API'
    this.status = options.status ?? 500
    this.validations = options.validations ?? null
  }
}

export function buildApiUrl(path, query, options = {}) {
  const baseUrl = options.baseUrl ?? ''
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
  } catch {
    throw new ApiClientError('Nao foi possivel conectar ao backend.', {
      code: 'ERRO_CONEXAO',
      status: 0,
    })
  }

  if (responseType === 'blob') {
    if (!response.ok) {
      throw new ApiClientError('Nao foi possivel concluir a operacao solicitada.', {
        code: 'ERRO_DOWNLOAD',
        status: response.status,
      })
    }

    return response.blob()
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok || payload?.success === false) {
    const error = payload?.error
    throw new ApiClientError(
      error?.message ?? 'Nao foi possivel concluir a operacao solicitada.',
      {
        code: error?.code,
        status: response.status,
        validations: error?.validations ?? null,
      },
    )
  }

  return payload?.data
}

export function createApiClient(options = {}) {
  return {
    request(path, requestOptions = {}) {
      return apiRequest(path, { ...options, ...requestOptions })
    },
  }
}
