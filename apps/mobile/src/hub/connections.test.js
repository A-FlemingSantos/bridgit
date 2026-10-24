import { describe, expect, it } from 'vitest'
import { findConnection, flattenConnections, oldestConnectionOf } from './connections'

const providers = [
  {
    id: 'google', name: 'Google Drive', connected: true,
    connections: [
      { connectionId: 'g2', provider: 'google', connectedAt: '2026-02-01T00:00:00Z' },
      { connectionId: 'g1', provider: 'google', connectedAt: '2026-01-01T00:00:00Z' },
    ],
  },
  { id: 'dropbox', name: 'Dropbox', connected: false, connections: [] },
  { id: 'onedrive', name: 'OneDrive', connected: true, connections: [{ connectionId: 'o1', provider: 'onedrive', providerName: 'OneDrive' }] },
]

describe('flattenConnections', () => {
  it('lists accounts by provider order, then oldest first', () => {
    expect(flattenConnections(providers).map((connection) => connection.connectionId)).toEqual(['g1', 'g2', 'o1'])
  })

  it('keeps the provider for display and tolerates missing lists', () => {
    expect(flattenConnections(providers)[0]).toMatchObject({ providerId: 'google', providerName: 'Google Drive' })
    expect(flattenConnections(undefined)).toEqual([])
    expect(flattenConnections([{ id: 'x' }])).toEqual([])
  })
})

describe('findConnection / oldestConnectionOf', () => {
  const connections = flattenConnections(providers)

  it('finds a connection by id regardless of case', () => {
    expect(findConnection(connections, 'G2')?.connectionId).toBe('g2')
    expect(findConnection(connections, 'nope')).toBeNull()
  })

  it('returns the oldest account of a provider', () => {
    expect(oldestConnectionOf(connections, 'google')?.connectionId).toBe('g1')
    expect(oldestConnectionOf(connections, 'dropbox')).toBeNull()
  })
})
