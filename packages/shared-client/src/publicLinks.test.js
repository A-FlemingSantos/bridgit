import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPublicLinkItem,
  getPublicLinkMetadata,
  isValidLinkAlias,
  listPublicLinkFolder,
  normalizeLinkAlias,
  parseLinkRef,
} from './publicLinks.js'
import { apiRequest } from './apiClient.js'

vi.mock('./apiClient.js', () => ({
  apiRequest: vi.fn(),
}))

beforeEach(() => {
  apiRequest.mockReset()
})

describe('public link requests', () => {
  it('getPublicLinkMetadata is anonymous and encodes the ref', async () => {
    apiRequest.mockResolvedValue({ kind: 'folder' })
    await getPublicLinkMetadata('minhas-fotos-ab12')
    expect(apiRequest).toHaveBeenCalledWith('/api/public/links/minhas-fotos-ab12')
    expect(apiRequest.mock.calls[0][1]).toBeUndefined()

    await getPublicLinkMetadata('a/b')
    expect(apiRequest).toHaveBeenLastCalledWith('/api/public/links/a%2Fb')
  })

  it('listPublicLinkFolder omits folder and cursor when absent', async () => {
    apiRequest.mockResolvedValue({ items: [], nextCursor: null })
    await listPublicLinkFolder('fotos-ab12')
    expect(apiRequest).toHaveBeenCalledWith('/api/public/links/fotos-ab12/items', { query: {} })

    await listPublicLinkFolder('fotos-ab12', { folder: null, cursor: null })
    expect(apiRequest).toHaveBeenLastCalledWith('/api/public/links/fotos-ab12/items', { query: {} })
  })

  it('listPublicLinkFolder forwards folder and cursor', async () => {
    apiRequest.mockResolvedValue({ items: [], nextCursor: null })
    await listPublicLinkFolder('fotos-ab12', { folder: 'sub/ref!', cursor: 'c1' })
    expect(apiRequest).toHaveBeenCalledWith('/api/public/links/fotos-ab12/items', {
      query: { folder: 'sub/ref!', cursor: 'c1' },
    })
  })

  it('getPublicLinkItem encodes the item ref', async () => {
    apiRequest.mockResolvedValue({ kind: 'file' })
    await getPublicLinkItem('fotos-ab12', 'dir/file!1')
    expect(apiRequest).toHaveBeenCalledWith('/api/public/links/fotos-ab12/items/dir%2Ffile!1')
  })
})

describe('parseLinkRef', () => {
  it('splits at the last dash for new 4-char codes', () => {
    expect(parseLinkRef('minhas-fotos-ab12')).toEqual({ alias: 'minhas-fotos', code: 'ab12' })
    expect(parseLinkRef('doc-x7k2')).toEqual({ alias: 'doc', code: 'x7k2' })
  })

  it('accepts legacy 16-char base62 codes preserving case', () => {
    expect(parseLinkRef('relatorio-AbCdEfGh12345678')).toEqual({
      alias: 'relatorio',
      code: 'AbCdEfGh12345678',
    })
  })

  it('lowercases the alias but not the code', () => {
    expect(parseLinkRef('Fotos-AbCdEfGh12345678')).toEqual({ alias: 'fotos', code: 'AbCdEfGh12345678' })
  })

  it('rejects malformed refs', () => {
    expect(parseLinkRef('')).toBeNull()
    expect(parseLinkRef(null)).toBeNull()
    expect(parseLinkRef('semdash')).toBeNull()
    expect(parseLinkRef('-ab12')).toBeNull()
    expect(parseLinkRef('fotos-')).toBeNull()
    expect(parseLinkRef('fotos-abc')).toBeNull()
    expect(parseLinkRef('fotos-ABCD')).toBeNull()
    expect(parseLinkRef('fotos-abcde')).toBeNull()
    expect(parseLinkRef('fo--tos-ab12')).toBeNull()
    expect(parseLinkRef(`${'a'.repeat(61)}-ab12`)).toBeNull()
  })

  it('accepts an alias of exactly 60 chars', () => {
    expect(parseLinkRef(`${'a'.repeat(60)}-ab12`)).toEqual({ alias: 'a'.repeat(60), code: 'ab12' })
  })
})

describe('normalizeLinkAlias', () => {
  it('strips accents, lowercases and dashes separators', () => {
    expect(normalizeLinkAlias('Relatório Final 2024')).toBe('relatorio-final-2024')
    expect(normalizeLinkAlias('  Ação & Coração!! ')).toBe('acao-coracao')
  })

  it('collapses and trims dashes', () => {
    expect(normalizeLinkAlias('--a___b--c--')).toBe('a-b-c')
  })

  it('returns an empty string when nothing is left', () => {
    expect(normalizeLinkAlias('')).toBe('')
    expect(normalizeLinkAlias('!!!')).toBe('')
    expect(normalizeLinkAlias(null)).toBe('')
  })

  it('does not truncate', () => {
    expect(normalizeLinkAlias('a'.repeat(100))).toHaveLength(100)
  })
})

describe('isValidLinkAlias', () => {
  it('accepts valid aliases', () => {
    expect(isValidLinkAlias('a')).toBe(true)
    expect(isValidLinkAlias('minhas-fotos-2024')).toBe(true)
    expect(isValidLinkAlias('Fotos')).toBe(true)
    expect(isValidLinkAlias('a'.repeat(60))).toBe(true)
  })

  it('rejects invalid aliases', () => {
    expect(isValidLinkAlias('')).toBe(false)
    expect(isValidLinkAlias('-a')).toBe(false)
    expect(isValidLinkAlias('a-')).toBe(false)
    expect(isValidLinkAlias('a--b')).toBe(false)
    expect(isValidLinkAlias('a b')).toBe(false)
    expect(isValidLinkAlias('ação')).toBe(false)
    expect(isValidLinkAlias('a'.repeat(61))).toBe(false)
    expect(isValidLinkAlias(undefined)).toBe(false)
  })
})
