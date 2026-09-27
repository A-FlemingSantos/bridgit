import { ApiClientError } from '@bridgit/shared-client'

const CODE_MESSAGES = {
  RECONEXAO_NECESSARIA: 'Reconecte o provedor em Configurações.',
  PROVEDOR_NAO_CONECTADO: 'Conecte o provedor em Configurações.',
  NAO_ENCONTRADO: 'Item não encontrado.',
  ARQUIVO_GRANDE: 'O arquivo excede o limite de 50 MB.',
}

export function hubErrorMessage(error, fallback = 'Algo deu errado. Tente novamente.') {
  if (!error) return fallback
  if (error?.name === 'HubUploadError') {
    if (typeof error.message === 'string' && error.message.trim()) return error.message
    const uploaded = Array.isArray(error.uploaded) ? error.uploaded.length : 0
    const failed = Array.isArray(error.failed) ? error.failed : []
    const total = uploaded + failed.length
    const nameOf = (entry) => entry?.file?.name ?? entry?.name ?? 'arquivo'
    const explicit = failed.filter((entry) => entry?.ambiguous !== true)
    const ambiguous = failed.filter((entry) => entry?.ambiguous === true)
    if (total <= 0) return fallback
    if (total === 1) {
      const only = failed[0]
      if (only?.ambiguous === true) {
        return `Não foi possível confirmar o envio de ${nameOf(only)}. Verificando se foi concluído…`
      }
      return `Falha ao enviar ${nameOf(only) || 'arquivo'}.`
    }
    const parts = [`${uploaded} de ${total} arquivos enviados.`]
    if (explicit.length > 0) {
      parts.push(`Falhou: ${explicit.map(nameOf).join(', ')}.`)
    }
    if (ambiguous.length > 0) {
      parts.push(`Verificando: ${ambiguous.map(nameOf).join(', ')}.`)
    }
    return parts.join(' ')
  }
  if (error instanceof ApiClientError || error?.name === 'ApiClientError') {
    if (error.code && CODE_MESSAGES[error.code]) return CODE_MESSAGES[error.code]
  }
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }
  return fallback
}
