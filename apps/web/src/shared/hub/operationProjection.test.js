import { describe, expect, it } from 'vitest'
import { projectOperations } from './operationProjection.js'

const file = { provider: 'onedrive', ref: 'file', parentRef: 'source', parentKnown: true, name: 'Old.txt', kind: 'file', uiKey: 'stable' }
const providers = [{ id: 'onedrive', connectionId: 'connection', generation: 2 }]
const base = { 'onedrive:source': { items: [file] }, 'onedrive:root': { items: [] } }
const detail = { 'onedrive:file': { item: { ...file, ancestry: [{ ref: 'source', name: 'Docs' }] } } }
const op = (fields) => ({ id: 'op', status: 'QUEUED', request: { provider: 'onedrive', connectionId: 'connection', generation: 2, kind: 'UPDATE', ref: 'file', ...fields } })

describe('durable intent projection', () => {
  it('renames without mutating the confirmed entity or losing ancestry', () => {
    const projected = projectOperations(base, detail, { op: op({ name: 'New.txt' }) }, providers)
    expect(projected.folderCache['onedrive:source'].items[0].name).toBe('New.txt')
    expect(base['onedrive:source'].items[0].name).toBe('Old.txt')
    expect(projected.itemCache['onedrive:file'].item.ancestry).toEqual(detail['onedrive:file'].item.ancestry)
  })
  it('moves into root in the projection while retaining the confirmed source for recovery', () => {
    const projected = projectOperations(base, detail, { op: op({ parentRef: '' }) }, providers)
    expect(projected.folderCache['onedrive:source'].items).toEqual([])
    expect(projected.folderCache['onedrive:root'].items[0]).toMatchObject({ ref: 'file', parentRef: null, uiKey: 'stable' })
    expect(base['onedrive:source'].items).toHaveLength(1)
  })
  it('ignores operations from another connection generation and exposes the confirmed item after rejection', () => {
    const stale = op({ generation: 1, name: 'Wrong.txt' })
    expect(projectOperations(base, detail, { stale }, providers).folderCache).toBe(base)
    const rejected = { ...op({ name: 'Rejected.txt' }), status: 'REJECTED' }
    expect(projectOperations(base, detail, { rejected }, providers).folderCache).toBe(base)
  })
})
