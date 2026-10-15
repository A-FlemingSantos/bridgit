import { afterEach, describe, expect, it, vi } from 'vitest'
import { getApiBaseUrl, resolveApiUrl, resolveContentUrls } from './apiBase.js'

const BASE = 'https://bridgit-demo.duckdns.org'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getApiBaseUrl', () => {
  it('returns empty when the variable is unset or blank', () => {
    expect(getApiBaseUrl({})).toBe('')
    expect(getApiBaseUrl({ VITE_API_BASE_URL: '   ' })).toBe('')
    expect(getApiBaseUrl(undefined)).toBe(getApiBaseUrl(import.meta.env))
  })

  it('trims whitespace and trailing slashes', () => {
    expect(getApiBaseUrl({ VITE_API_BASE_URL: ` ${BASE}// ` })).toBe(BASE)
  })

  it('reads import.meta.env by default', () => {
    vi.stubEnv('VITE_API_BASE_URL', `${BASE}/`)
    expect(getApiBaseUrl()).toBe(BASE)
  })
})

describe('resolveApiUrl', () => {
  it('prefixes relative /api URLs, keeping the query string', () => {
    expect(resolveApiUrl('/api/hub/events/stream?after=3', BASE)).toBe(`${BASE}/api/hub/events/stream?after=3`)
    expect(resolveApiUrl('/api/content/abc', BASE)).toBe(`${BASE}/api/content/abc`)
  })

  it('leaves absolute, protocol-relative and non-api URLs untouched', () => {
    expect(resolveApiUrl('https://files.example.com/x?a=1', BASE)).toBe('https://files.example.com/x?a=1')
    expect(resolveApiUrl('//cdn.example.com/api/x', BASE)).toBe('//cdn.example.com/api/x')
    expect(resolveApiUrl('/apiary/x', BASE)).toBe('/apiary/x')
    expect(resolveApiUrl('/proxy.pdf', BASE)).toBe('/proxy.pdf')
    expect(resolveApiUrl('blob:http://localhost/1', BASE)).toBe('blob:http://localhost/1')
  })

  it('passes non-strings through', () => {
    expect(resolveApiUrl(undefined, BASE)).toBeUndefined()
    expect(resolveApiUrl(null, BASE)).toBeNull()
  })

  it('is a no-op without a base', () => {
    expect(resolveApiUrl('/api/content/abc', '')).toBe('/api/content/abc')
    expect(resolveApiUrl('/api/content/abc')).toBe('/api/content/abc')
  })
})

describe('resolveContentUrls', () => {
  it('resolves url and proxyUrl without touching other fields', () => {
    const source = { url: '/api/content/t1', proxyUrl: '/api/content/t2', revision: 'r1', size: 4 }
    expect(resolveContentUrls(source, BASE)).toEqual({
      url: `${BASE}/api/content/t1`,
      proxyUrl: `${BASE}/api/content/t2`,
      revision: 'r1',
      size: 4,
    })
    expect(source.url).toBe('/api/content/t1')
  })

  it('keeps absolute provider URLs and missing proxyUrl as-is', () => {
    const source = { url: 'https://graph.example.com/file' }
    expect(resolveContentUrls(source, BASE)).toEqual(source)
  })

  it('returns the same object without a base or for non-objects', () => {
    const source = { url: '/api/content/t1' }
    expect(resolveContentUrls(source, '')).toBe(source)
    expect(resolveContentUrls(null, BASE)).toBeNull()
  })
})
