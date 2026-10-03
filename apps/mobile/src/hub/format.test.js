import { describe, expect, it } from 'vitest'
import { formatWhen, kindLabel, toEntry } from './format'

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
