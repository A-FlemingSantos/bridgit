const WHEN = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

// Text for a folder served from a catalog the server marks as stale, or null when there is nothing to say.
// When the provider needs reconnecting the page already says so, with the button to fix it.
export function staleCatalogNotice(catalog, { reconnectShown = false } = {}) {
  if (catalog?.freshness !== 'stale') return null
  if (reconnectShown && catalog.staleReason === 'RECONEXAO_NECESSARIA') return null
  const synced = catalog.syncedAt ? new Date(catalog.syncedAt) : null
  if (!synced || Number.isNaN(synced.getTime())) return 'Esta lista pode estar desatualizada.'
  return `Esta lista pode estar desatualizada. Última sincronização: ${WHEN.format(synced)}.`
}
