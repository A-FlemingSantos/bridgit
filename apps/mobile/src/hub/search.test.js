import { describe, expect, it } from 'vitest'
import { searchEntries, summarizeSearch } from './search'

describe('searchEntries', () => {
  it('maps files and folders into the account each was found in', () => {
    const entries = searchEntries({
      results: [
        { ref: 'f1', name: 'Projetos', kind: 'folder', provider: 'onedrive', connectionId: 'c1' },
        { ref: 'a1', name: 'Plano.docx', kind: 'file', provider: 'google-drive', connectionId: 'c2', contentRevision: 'r1' },
      ],
    })
    expect(entries).toMatchObject([
      { ref: 'f1', isFolder: true, connectionId: 'c1', providerId: 'onedrive' },
      { ref: 'a1', isFolder: false, connectionId: 'c2', providerId: 'google-drive', extension: 'docx', revision: 'r1' },
    ])
  })

  it('reads a missing or malformed answer as no results', () => {
    expect(searchEntries(null)).toEqual([])
    expect(searchEntries({ results: 'x' })).toEqual([])
  })
})

describe('summarizeSearch', () => {
  it('tells failed and still-syncing accounts apart', () => {
    const summary = summarizeSearch([
      { connectionId: 'c1', ok: true, catalog: { coverage: 'complete' } },
      { connectionId: 'c2', ok: false },
      { connectionId: 'c3', ok: true, catalog: { coverage: 'partial' } },
    ])
    expect(summary.failed.map((entry) => entry.connectionId)).toEqual(['c2'])
    expect(summary.syncing.map((entry) => entry.connectionId)).toEqual(['c3'])
    expect(summary).toMatchObject({ allFailed: false, someFailed: true })
  })

  it('reports a search where every account failed', () => {
    expect(summarizeSearch([{ ok: false }, { ok: false }])).toMatchObject({ allFailed: true, someFailed: false })
  })

  it('has nothing to report without accounts', () => {
    expect(summarizeSearch(undefined)).toEqual({ failed: [], syncing: [], allFailed: false, someFailed: false })
  })
})
