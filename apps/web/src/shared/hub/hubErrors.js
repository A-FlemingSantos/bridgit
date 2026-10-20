export class HubUploadError extends Error {
  constructor(message, { uploaded = [], failed = [] } = {}) {
    super(message)
    this.name = 'HubUploadError'
    this.uploaded = uploaded
    this.failed = failed
  }
}

export function buildUploadErrorMessage(uploadedCount, totalCount, failedFiles) {
  const list = Array.isArray(failedFiles) ? failedFiles : []
  const isUnreadable = (entry) => entry?.error?.code === 'ARQUIVO_ILEGIVEL'
  const unreadable = list.filter(isUnreadable)
  const explicit = list.filter((entry) => entry?.ambiguous !== true && !isUnreadable(entry))
  const ambiguous = list.filter((entry) => entry?.ambiguous === true)
  const nameOf = (entry) => entry?.file?.name ?? entry?.name ?? 'arquivo'
  if (totalCount <= 1) {
    const only = list[0]
    const name = nameOf(only)
    if (isUnreadable(only)) {
      return `Não foi possível ler ${name}. O arquivo pode ter sido movido ou apagado, ou ser um atalho quebrado.`
    }
    if (only?.ambiguous === true) {
      return `Não foi possível confirmar o envio de ${name}. Verificando se foi concluído…`
    }
    return `Falha ao enviar ${name}.`
  }
  const parts = [`${uploadedCount} de ${totalCount} arquivos enviados.`]
  if (unreadable.length > 0) {
    parts.push(`Não foi possível ler: ${unreadable.map(nameOf).join(', ')}. Confira se ainda existem no computador.`)
  }
  if (explicit.length > 0) {
    parts.push(`Falhou: ${explicit.map(nameOf).join(', ')}.`)
  }
  if (ambiguous.length > 0) {
    parts.push(`Verificando: ${ambiguous.map(nameOf).join(', ')}.`)
  }
  return parts.join(' ')
}
