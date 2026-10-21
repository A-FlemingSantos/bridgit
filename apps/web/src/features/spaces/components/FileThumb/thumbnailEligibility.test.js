import { describe, expect, it } from 'vitest'
import { previewSettling } from './thumbnailEligibility.js'

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
