import { describe, expect, it } from 'vitest'
import { officeBadge, previewSettling, thumbnailEligible } from './thumbnailEligibility.js'

describe('officeBadge', () => {
  it('gives native Google files their own mark and Office files theirs', () => {
    expect(officeBadge({ mimeType: 'application/vnd.google-apps.document' })).toBe('google-docs')
    expect(officeBadge({ mimeType: 'application/vnd.google-apps.spreadsheet' })).toBe('google-sheets')
    expect(officeBadge({ mimeType: 'application/vnd.google-apps.presentation' })).toBe('google-slides')
    expect(officeBadge({ extension: 'docx' })).toBe('word')
    expect(officeBadge({ extension: 'xlsx' })).toBe('excel')
    expect(officeBadge({ extension: 'pptx' })).toBe('powerpoint')
    expect(officeBadge({ extension: 'pdf' })).toBeNull()
  })
})

describe('previewSettling', () => {
  const now = Date.parse('2026-10-21T12:00:00Z')
  const doc = (modifiedAt) => ({ mimeType: 'application/vnd.google-apps.document', modifiedAt })

  it('holds a native Google preview for ten minutes after an edit', () => {
    expect(previewSettling(doc('2026-10-21T11:55:00Z'), now)).toBe(true)
    expect(previewSettling(doc('2026-10-21T11:49:00Z'), now)).toBe(false)
  })

  it('never holds other files', () => {
    expect(previewSettling({ mimeType: 'application/pdf', modifiedAt: '2026-10-21T11:59:00Z' }, now)).toBe(false)
  })
})

describe('thumbnailEligible', () => {
  it('decides by the kind of cloud, not by the account', () => {
    const text = { kind: 'file', extension: 'txt' }
    expect(thumbnailEligible('dropbox', text)).toBe(false)
    expect(thumbnailEligible('google-drive', text)).toBe(true)
    expect(thumbnailEligible('4f0c9a52-6f0e-4a55-9e56-1b6a8f3d2c10', text)).toBe(false)
    expect(thumbnailEligible('dropbox', { kind: 'file', extension: 'jpg', size: 1024 })).toBe(true)
  })
})
