// Build-time API origin. Unset in dev (relative /api through the Vite proxy); set when the web
// is served from a different origin than the API (e.g. Azure Static Web Apps).
export function getApiBaseUrl(env = import.meta.env) {
  const value = typeof env?.VITE_API_BASE_URL === 'string' ? env.VITE_API_BASE_URL.trim() : ''
  return value.replace(/\/+$/, '')
}

const RELATIVE_API_URL = /^\/api(?:[/?#]|$)/

// Prefixes relative /api URLs with the base. Absolute URLs and non-API paths are left untouched.
export function resolveApiUrl(url, baseUrl = getApiBaseUrl()) {
  if (!baseUrl || typeof url !== 'string' || !RELATIVE_API_URL.test(url)) return url
  return `${baseUrl}${url}`
}

// Read descriptors and content tickets carry url/proxyUrl that may be relative /api/content/<ticket>.
export function resolveContentUrls(source, baseUrl = getApiBaseUrl()) {
  if (!baseUrl || !source || typeof source !== 'object') return source
  const next = { ...source }
  for (const key of ['url', 'proxyUrl']) {
    if (key in next) next[key] = resolveApiUrl(next[key], baseUrl)
  }
  return next
}
