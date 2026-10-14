import { describe, expect, it } from 'vitest'
import { staleCatalogNotice } from './staleCatalogNotice.js'

describe('staleCatalogNotice', () => {
  it('não diz nada para um catálogo atual', () => {
    expect(staleCatalogNotice({ freshness: 'current' })).toBeNull()
    expect(staleCatalogNotice(null)).toBeNull()
  })

  it('avisa desde quando a lista é conhecida', () => {
    expect(staleCatalogNotice({ freshness: 'stale', staleReason: 'PROVEDOR_INDISPONIVEL', syncedAt: '2026-10-13T12:00:00Z' }))
      .toMatch(/^Esta lista pode estar desatualizada\. Última sincronização: .+\.$/)
  })

  it('não repete o aviso de reconectar', () => {
    const catalog = { freshness: 'stale', staleReason: 'RECONEXAO_NECESSARIA', syncedAt: '2026-10-13T12:00:00Z' }
    expect(staleCatalogNotice(catalog, { reconnectShown: true })).toBeNull()
    expect(staleCatalogNotice(catalog)).not.toBeNull()
  })
})
