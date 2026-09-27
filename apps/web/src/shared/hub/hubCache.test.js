import { describe, expect, it } from 'vitest'
import { mergeRecentsLists, placeRecent, RECENTS_LIMIT } from './hubCache.js'

function recent(ref, openedAt) {
  return { provider: 'onedrive', ref, name: ref, openedAt }
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
