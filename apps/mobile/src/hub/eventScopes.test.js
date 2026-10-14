import { describe, expect, it } from 'vitest'
import { fileScopes, folderScope, folderScopes, foldersScope, HOME, itemWriteScopes, PROVIDERS, scopesForEvents } from './eventScopes'

const providers = [
  { id: 'google', connectionId: 'aaaa-1111' },
  { id: 'dropbox', connectionId: 'bbbb-2222' },
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
    expect(scopesForEvents(events, providers)).toEqual([HOME])
  })

  it('refreshes the folder where a folder or an upload was created', () => {
    expect(scopesForEvents([operation({ kind: 'CREATE_FOLDER', parentRef: 'p1' }, { parentRef: 'p1', parentKnown: true })], providers))
      .toEqual([folderScope('google', 'p1')])
    expect(scopesForEvents([operation({ kind: 'UPLOAD', parentRef: null }, { parentRef: null })], providers))
      .toEqual([folderScope('google', '')])
    expect(scopesForEvents([operation({ kind: 'UPLOAD', parentRef: '' })], providers))
      .toEqual([folderScope('google', '')])
  })

  it('adds the folder the item ended up in when it differs from the request', () => {
    const events = [operation({ kind: 'UPLOAD', parentRef: 'a' }, { parentRef: 'b', parentKnown: true })]
    expect(scopesForEvents(events, providers)).toEqual([folderScope('google', 'a'), folderScope('google', 'b')])
  })

  it('refreshes the folder of a renamed or deleted item, its entry and the Home', () => {
    const item = { ref: 'x', parentRef: 'p1', parentKnown: true }
    expect(scopesForEvents([operation({ kind: 'UPDATE', ref: 'x', parentRef: null }, item)], providers))
      .toEqual([folderScope('google', 'p1'), 'file:google:x', HOME])
    expect(scopesForEvents([operation({ kind: 'DELETE', ref: 'x' }, { ...item, parentRef: null })], providers))
      .toEqual([folderScope('google', ''), 'file:google:x', HOME])
  })

  it('falls back to every folder of the provider when the folder is unknown', () => {
    expect(scopesForEvents([operation({ kind: 'DELETE', ref: 'x' })], providers))
      .toEqual([foldersScope('google'), 'file:google:x', HOME])
    expect(scopesForEvents([operation({ kind: 'UPDATE', ref: 'x' }, { ref: 'x', parentRef: null, parentKnown: false })], providers))
      .toEqual([foldersScope('google'), 'file:google:x', HOME])
  })

  it('treats a move as touching every folder, since the origin is not reported', () => {
    const events = [operation({ kind: 'UPDATE', ref: 'x', parentRef: 'dest' }, { ref: 'x', parentRef: 'dest', parentKnown: true })]
    expect(scopesForEvents(events, providers)).toEqual([foldersScope('google'), 'file:google:x', HOME])
  })

  it('does not touch the Home for creations', () => {
    expect(scopesForEvents([operation({ kind: 'CREATE_FOLDER', parentRef: 'p' })], providers)).not.toContain(HOME)
  })

  it('maps catalog events by what they carry', () => {
    expect(scopesForEvents([catalog({ parentRef: 'p1' })], providers)).toEqual([folderScope('google', 'p1')])
    expect(scopesForEvents([catalog({ parentRef: null })], providers)).toEqual([folderScope('google', '')])
    expect(scopesForEvents([catalog({ ref: 'gone' })], providers)).toEqual([foldersScope('google'), 'file:google:gone'])
    expect(scopesForEvents([catalog({ refresh: true })], providers)).toEqual([foldersScope('google'), 'files:google', HOME])
  })

  it('keeps providers apart', () => {
    expect(scopesForEvents([catalog({ parentRef: 'p' }, 'bbbb-2222')], providers)).toEqual([folderScope('dropbox', 'p')])
  })

  it('reloads the provider list for a connection it does not know', () => {
    expect(scopesForEvents([catalog({ refresh: true }, 'cccc-3333')], providers)).toEqual([PROVIDERS])
    expect(scopesForEvents([operation({ kind: 'UPLOAD' }, null, 'cccc-3333')], [])).toEqual([PROVIDERS])
    expect(scopesForEvents([{ type: 'catalog', payload: { parentRef: 'p' } }], providers)).toEqual([PROVIDERS])
  })

  it('matches connection ids regardless of case and merges a batch without duplicates', () => {
    const events = [catalog({ parentRef: 'p' }, 'AAAA-1111'), catalog({ parentRef: 'p' }), { type: 'hub_entries', payload: {} }, { type: 'other' }]
    expect(scopesForEvents(events, providers)).toEqual([folderScope('google', 'p'), HOME])
  })

  it('ignores event types it does not know and empty input', () => {
    expect(scopesForEvents([{ type: 'future', connectionId: 'aaaa-1111' }], providers)).toEqual([])
    expect(scopesForEvents(undefined, providers)).toEqual([])
  })
})

describe('scope helpers', () => {
  it('names what a folder, a file and a local write touch', () => {
    expect(folderScopes('google', null)).toEqual(['folder:google:', 'folders:google'])
    expect(fileScopes('google', 'x')).toEqual(['file:google:x', 'files:google'])
    expect(itemWriteScopes('google', 'x')).toEqual(['folders:google', 'file:google:x', HOME])
  })
})
