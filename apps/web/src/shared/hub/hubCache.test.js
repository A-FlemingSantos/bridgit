import { describe, expect, it } from 'vitest'
import { ApiClientError } from '@bridgit/shared-client'
import {
  findCachedItem,
  flattenConnections,
  folderCacheKey,
  folderKeysContaining,
  isAmbiguousError,
  itemCacheKey,
  mergeFolderItems,
  mergeRecentsLists,
  placeRecent,
  RECENTS_LIMIT,
  dedupeItemsByRef,
} from './hubCache.js'

function recent(ref, openedAt) {
  return { connectionId: 'conn-1', provider: 'onedrive', ref, name: ref, openedAt }
}

describe('recents cache', () => {
  it('coloca o arquivo registrado na frente e respeita o limite', () => {
    const existing = Array.from({ length: RECENTS_LIMIT }, (_, index) => recent(`file-${index}`, `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`))
    const opened = recent('file-3', '2026-09-26T00:00:00.000Z')
    const next = placeRecent(existing, opened)
    expect(next).toHaveLength(RECENTS_LIMIT)
    expect(next[0].ref).toBe('file-3')
    expect(next.filter((entry) => entry.ref === 'file-3')).toHaveLength(1)

    const openedNew = recent('file-new', '2026-09-26T00:00:00.000Z')
    const withNew = placeRecent(existing, openedNew)
    expect(withNew).toHaveLength(RECENTS_LIMIT)
    expect(withNew[0].ref).toBe('file-new')
    expect(withNew.some((entry) => entry.ref === 'file-11')).toBe(false)
  })

  it('preserva um registro local mais novo que o snapshot do servidor', () => {
    const server = [recent('old', '2026-01-02T00:00:00.000Z'), recent('older', '2026-01-01T00:00:00.000Z')]
    const local = [recent('new', '2026-09-26T00:00:00.000Z')]
    expect(mergeRecentsLists(server, local).map((entry) => entry.ref)).toEqual(['new', 'old', 'older'])
  })

  it('prefere o openedAt mais recente quando o mesmo arquivo está nos dois lados', () => {
    const server = [recent('file', '2026-01-01T00:00:00.000Z')]
    const local = [recent('file', '2026-09-26T00:00:00.000Z')]
    const merged = mergeRecentsLists(server, local)
    expect(merged).toHaveLength(1)
    expect(merged[0].openedAt).toBe('2026-09-26T00:00:00.000Z')
  })
})

describe('mergeFolderItems', () => {
  it('mantém a chave de um item já na tela quando chega a listagem do servidor', () => {
    const shown = [{ connectionId: 'conn-1', ref: 'f-1', name: 'Nova', uiKey: 'operation-abc' }]
    const server = [
      { connectionId: 'conn-1', ref: 'f-1', name: 'Nova', uiKey: 'conn-1:f-1' },
      { connectionId: 'conn-1', ref: 'f-2', name: 'Outra', uiKey: 'conn-1:f-2' },
    ]

    const merged = mergeFolderItems(shown, server)

    expect(merged.map((item) => item.uiKey)).toEqual(['operation-abc', 'conn-1:f-2'])
  })

  it('mantém os itens provisórios que o servidor ainda não conhece', () => {
    const shown = [{ connectionId: 'conn-1', ref: 'temp-1', name: 'Enviando', pending: true, uiKey: 'temp-1' }]

    expect(mergeFolderItems(shown, []).map((item) => item.ref)).toEqual(['temp-1'])
  })
})

describe('isAmbiguousError', () => {
  it('trata 4xx e falta de espaço no provedor como recusa definitiva', () => {
    expect(isAmbiguousError(new ApiClientError('x', { status: 409, code: 'ITEM_CONFLITO' }))).toBe(false)
    expect(isAmbiguousError(new ApiClientError('x', { status: 507, code: 'PROVEDOR_SEM_ESPACO' }))).toBe(false)
  })

  it('trata rede e 5xx como resultado incerto', () => {
    expect(isAmbiguousError(new ApiClientError('x', { status: 0, code: 'ERRO_CONEXAO' }))).toBe(true)
    expect(isAmbiguousError(new ApiClientError('x', { status: 503, code: 'PROVEDOR_INDISPONIVEL' }))).toBe(true)
    expect(isAmbiguousError(new Error('x'))).toBe(true)
  })
})

describe('cache identity by connection', () => {
  const first = { connectionId: 'conn-1', provider: 'onedrive', ref: 'same', name: 'Primeira' }
  const second = { connectionId: 'conn-2', provider: 'onedrive', ref: 'same', name: 'Segunda' }

  it('keys folders and items by connectionId, never by provider', () => {
    expect(folderCacheKey('conn-1', null)).toBe('conn-1:root')
    expect(folderCacheKey('conn-1', 'abc')).toBe('conn-1:abc')
    expect(itemCacheKey('conn-2', 'abc')).toBe('conn-2:abc')
  })

  it('tells two accounts of the same provider apart when they share a ref', () => {
    const folderCache = { 'conn-1:root': { items: [first] }, 'conn-2:root': { items: [second] } }
    expect(findCachedItem(folderCache, {}, 'conn-2', 'same').name).toBe('Segunda')
    expect(findCachedItem(folderCache, {}, 'conn-1', 'same').name).toBe('Primeira')
    expect(folderKeysContaining(folderCache, 'conn-2', 'same')).toEqual(['conn-2:root'])
    expect(dedupeItemsByRef([first, second])).toHaveLength(2)
  })

  it('keeps recents of two accounts apart', () => {
    const merged = mergeRecentsLists([{ ...first, openedAt: '2026-01-01T00:00:00.000Z' }], [{ ...second, openedAt: '2026-01-02T00:00:00.000Z' }])
    expect(merged.map((entry) => entry.connectionId)).toEqual(['conn-2', 'conn-1'])
  })

  it('flattens the provider rows in provider order, oldest account first', () => {
    const rows = [
      { id: 'onedrive', name: 'OneDrive', connections: [{ connectionId: 'a', generation: 1 }, { connectionId: 'b', generation: 1 }] },
      { id: 'dropbox', name: 'Dropbox', connections: [] },
      { id: 'google-drive', name: 'Google Drive', connections: [{ connectionId: 'c', provider: 'google-drive', generation: 2 }] },
    ]
    expect(flattenConnections(rows).map((connection) => [connection.connectionId, connection.provider])).toEqual([
      ['a', 'onedrive'], ['b', 'onedrive'], ['c', 'google-drive'],
    ])
    expect(flattenConnections(undefined)).toEqual([])
  })
})
