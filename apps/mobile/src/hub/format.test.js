import { describe, expect, it } from 'vitest'
import { formatWhen, kindLabel, needsReconnect, splitExtension, staleCatalogNotice, toEntry, withExtension } from './format'

describe('kindLabel', () => {
  it('labels folders and files by extension', () => {
    expect(kindLabel({ kind: 'folder' })).toBe('Pasta')
    expect(kindLabel({ kind: 'file', extension: '.pdf' })).toBe('PDF')
    expect(kindLabel({ kind: 'file', extension: 'docx' })).toBe('DOCX')
    expect(kindLabel({ kind: 'file' })).toBe('Arquivo')
  })
})

describe('toEntry', () => {
  it('maps a cloud item to what the screens use', () => {
    const entry = toEntry({
      ref: 'r1', name: 'Relatório', kind: 'file', extension: 'pdf', provider: 'onedrive',
      remoteVersion: 'v7', mimeType: 'application/pdf', size: 12,
    })
    expect(entry).toMatchObject({
      ref: 'r1', name: 'Relatório', kind: 'PDF', providerId: 'onedrive', isFolder: false,
      version: 'v7', mimeType: 'application/pdf', size: 12, pinned: false,
    })
  })

  it('keeps the provider the list was loaded from', () => {
    expect(toEntry({ ref: 'f', name: 'x', kind: 'folder' }, 'dropbox')).toMatchObject({
      providerId: 'dropbox', isFolder: true, kind: 'Pasta',
    })
  })
})

describe('formatWhen', () => {
  const now = Date.parse('2026-10-03T12:00:00Z')

  it('formats relative times in Portuguese', () => {
    expect(formatWhen('2026-10-03T11:30:00Z', now)).toBe('Há 30 min')
    expect(formatWhen('2026-10-03T09:00:00Z', now)).toBe('Há 3 h')
    expect(formatWhen('2026-10-02T09:00:00Z', now)).toBe('Ontem')
    expect(formatWhen('2026-09-29T12:00:00Z', now)).toBe('Há 4 dias')
    expect(formatWhen('2026-09-19T12:00:00Z', now)).toBe('Há 2 sem')
    expect(formatWhen('not a date', now)).toBe('')
  })
})

describe('needsReconnect', () => {
  it('flags a connected provider whose refresh token was rejected', () => {
    expect(needsReconnect({ connected: true, lastError: 'RECONEXAO_NECESSARIA' })).toBe(true)
    expect(needsReconnect({ connected: true, lastError: null })).toBe(false)
    expect(needsReconnect({ connected: false, lastError: 'RECONEXAO_NECESSARIA' })).toBe(false)
    expect(needsReconnect(undefined)).toBe(false)
  })
})

describe('splitExtension', () => {
  it('separates the last extension and leaves dotfiles whole', () => {
    expect(splitExtension('Relatório.final.docx')).toEqual({ stem: 'Relatório.final', extension: '.docx' })
    expect(splitExtension('.env')).toEqual({ stem: '.env', extension: '' })
    expect(splitExtension('LEIAME')).toEqual({ stem: 'LEIAME', extension: '' })
    expect(splitExtension('nota.')).toEqual({ stem: 'nota.', extension: '' })
  })
})

describe('withExtension', () => {
  it('keeps the extension, even after a stem that ends with a dot segment', () => {
    expect(withExtension('Entrega1.d', '.docx')).toBe('Entrega1.d.docx')
    expect(withExtension('Entrega2', '.docx')).toBe('Entrega2.docx')
    expect(withExtension('Entrega2.DOCX', '.docx')).toBe('Entrega2.DOCX')
    expect(withExtension('Pasta', '')).toBe('Pasta')
  })
})

describe('staleCatalogNotice', () => {
  const now = Date.parse('2026-10-14T12:00:00Z')
  const stale = { freshness: 'stale', staleReason: 'SINCRONIZACAO_FALHOU', syncedAt: '2026-10-14T09:00:00Z' }

  it('says when the catalog was last synced', () => {
    expect(staleCatalogNotice(stale, { now })).toBe('Pode estar desatualizado. Última sincronização: há 3 h.')
    expect(staleCatalogNotice({ ...stale, syncedAt: '2026-10-13T08:00:00Z' }, { now }))
      .toBe('Pode estar desatualizado. Última sincronização: ontem.')
  })

  it('omits the date when it is missing or invalid', () => {
    expect(staleCatalogNotice({ ...stale, syncedAt: null }, { now })).toBe('Pode estar desatualizado.')
    expect(staleCatalogNotice({ ...stale, syncedAt: 'x' }, { now })).toBe('Pode estar desatualizado.')
  })

  it('stays quiet for a current or absent catalog', () => {
    expect(staleCatalogNotice({ freshness: 'current', syncedAt: stale.syncedAt }, { now })).toBeNull()
    expect(staleCatalogNotice(null, { now })).toBeNull()
    expect(staleCatalogNotice(undefined)).toBeNull()
  })

  it('does not repeat the reconnect warning the screen already shows', () => {
    const expired = { ...stale, staleReason: 'RECONEXAO_NECESSARIA' }
    expect(staleCatalogNotice(expired, { reconnectShown: true, now })).toBeNull()
    expect(staleCatalogNotice(expired, { reconnectShown: false, now })).toContain('Pode estar desatualizado')
    expect(staleCatalogNotice(stale, { reconnectShown: true, now })).toContain('Pode estar desatualizado')
  })
})
