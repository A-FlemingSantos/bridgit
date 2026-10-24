import { describe, expect, it } from 'vitest'
import { fileScopes, folderScope, folderScopes, foldersScope, HOME, itemWriteScopes, PROVIDERS, scopesForEvents } from './eventScopes'

const connections = [
  { provider: 'google', connectionId: 'aaaa-1111' },
  { provider: 'dropbox', connectionId: 'bbbb-2222' },
]

const operation = (request, item = null, connectionId = 'aaaa-1111') => ({
  type: 'operation',
  connectionId,
  payload: { id: 'op', status: 'SUCCEEDED', request: { connectionId, ...request }, item },
})

const catalog = (payload, connectionId = 'aaaa-1111') => ({ type: 'catalog', connectionId, payload })

describe('scopesForEvents', () => {
  it('maps hub_entries to the Home only, whatever the connection', () => {
    const events = [{ type: 'hub_entries', payload: { entry: 'shortcut', ref: 'r', removed: false } },
      { type: 'hub_entries', connectionId: 'unknown', payload: { entry: 'recent', ref: 'r' } }]
    expect(scopesForEvents(events, connections)).toEqual([HOME])
  })

  it('refreshes the folder where a folder or an upload was created', () => {
    expect(scopesForEvents([operation({ kind: 'CREATE_FOLDER', parentRef: 'p1' }, { parentRef: 'p1', parentKnown: true })], connections))
      .toEqual([folderScope('aaaa-1111', 'p1')])
    expect(scopesForEvents([operation({ kind: 'UPLOAD', parentRef: null }, { parentRef: null })], connections))
      .toEqual([folderScope('aaaa-1111', '')])
    expect(scopesForEvents([operation({ kind: 'UPLOAD', parentRef: '' })], connections))
      .toEqual([folderScope('aaaa-1111', '')])
  })

  it('adds the folder the item ended up in when it differs from the request', () => {
    const events = [operation({ kind: 'UPLOAD', parentRef: 'a' }, { parentRef: 'b', parentKnown: true })]
    expect(scopesForEvents(events, connections)).toEqual([folderScope('aaaa-1111', 'a'), folderScope('aaaa-1111', 'b')])
  })

  it('refreshes the folder of a renamed or deleted item, its entry and the Home', () => {
    const item = { ref: 'x', parentRef: 'p1', parentKnown: true }
    expect(scopesForEvents([operation({ kind: 'UPDATE', ref: 'x', parentRef: null }, item)], connections))
      .toEqual([folderScope('aaaa-1111', 'p1'), 'file:aaaa-1111:x', HOME])
    expect(scopesForEvents([operation({ kind: 'DELETE', ref: 'x' }, { ...item, parentRef: null })], connections))
      .toEqual([folderScope('aaaa-1111', ''), 'file:aaaa-1111:x', HOME])
  })

  it('falls back to every folder of the provider when the folder is unknown', () => {
    expect(scopesForEvents([operation({ kind: 'DELETE', ref: 'x' })], connections))
      .toEqual([foldersScope('aaaa-1111'), 'file:aaaa-1111:x', HOME])
    expect(scopesForEvents([operation({ kind: 'UPDATE', ref: 'x' }, { ref: 'x', parentRef: null, parentKnown: false })], connections))
      .toEqual([foldersScope('aaaa-1111'), 'file:aaaa-1111:x', HOME])
  })

  it('treats a move as touching every folder, since the origin is not reported', () => {
    const events = [operation({ kind: 'UPDATE', ref: 'x', parentRef: 'dest' }, { ref: 'x', parentRef: 'dest', parentKnown: true })]
    expect(scopesForEvents(events, connections)).toEqual([foldersScope('aaaa-1111'), 'file:aaaa-1111:x', HOME])
  })

  it('does not touch the Home for creations', () => {
    expect(scopesForEvents([operation({ kind: 'CREATE_FOLDER', parentRef: 'p' })], connections)).not.toContain(HOME)
  })

  it('maps catalog events by what they carry', () => {
    expect(scopesForEvents([catalog({ parentRef: 'p1' })], connections)).toEqual([folderScope('aaaa-1111', 'p1')])
    expect(scopesForEvents([catalog({ parentRef: null })], connections)).toEqual([folderScope('aaaa-1111', '')])
    expect(scopesForEvents([catalog({ ref: 'gone' })], connections)).toEqual([foldersScope('aaaa-1111'), 'file:aaaa-1111:gone'])
    expect(scopesForEvents([catalog({ refresh: true })], connections)).toEqual([foldersScope('aaaa-1111'), 'files:aaaa-1111', HOME])
  })

  it('keeps accounts of the same provider apart', () => {
    const two = [...connections, { provider: 'google', connectionId: 'dddd-4444' }]
    expect(scopesForEvents([catalog({ parentRef: 'p' }, 'dddd-4444')], two)).toEqual([folderScope('dddd-4444', 'p')])
  })

  it('keeps connections apart', () => {
    expect(scopesForEvents([catalog({ parentRef: 'p' }, 'bbbb-2222')], connections)).toEqual([folderScope('bbbb-2222', 'p')])
  })

  it('reloads the provider list for a connection it does not know', () => {
    expect(scopesForEvents([catalog({ refresh: true }, 'cccc-3333')], connections)).toEqual([PROVIDERS])
    expect(scopesForEvents([operation({ kind: 'UPLOAD' }, null, 'cccc-3333')], [])).toEqual([PROVIDERS])
    expect(scopesForEvents([{ type: 'catalog', payload: { parentRef: 'p' } }], connections)).toEqual([PROVIDERS])
  })

  it('matches connection ids regardless of case and merges a batch without duplicates', () => {
    const events = [catalog({ parentRef: 'p' }, 'AAAA-1111'), catalog({ parentRef: 'p' }), { type: 'hub_entries', payload: {} }, { type: 'other' }]
    expect(scopesForEvents(events, connections)).toEqual([folderScope('aaaa-1111', 'p'), HOME])
  })

  it('ignores event types it does not know and empty input', () => {
    expect(scopesForEvents([{ type: 'future', connectionId: 'aaaa-1111' }], connections)).toEqual([])
    expect(scopesForEvents(undefined, connections)).toEqual([])
  })
})

describe('scope helpers', () => {
  it('compares connection ids in lower case', () => {
    expect(folderScope('AAAA-1111', 'p')).toBe(folderScope('aaaa-1111', 'p'))
  })


  it('names what a folder, a file and a local write touch', () => {
    expect(folderScopes('aaaa-1111', null)).toEqual(['folder:aaaa-1111:', 'folders:aaaa-1111'])
    expect(fileScopes('aaaa-1111', 'x')).toEqual(['file:aaaa-1111:x', 'files:aaaa-1111'])
    expect(itemWriteScopes('aaaa-1111', 'x')).toEqual(['folders:aaaa-1111', 'file:aaaa-1111:x', HOME])
  })
})
