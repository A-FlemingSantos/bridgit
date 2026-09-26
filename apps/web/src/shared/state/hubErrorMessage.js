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
    const names = failed.map((entry) => entry?.file?.name ?? entry?.name ?? 'arquivo').join(', ')
    if (total <= 0) return fallback
    if (total === 1) return `Falha ao enviar ${names || 'arquivo'}.`
    return `${uploaded} de ${total} arquivos enviados. Falhou: ${names}.`
  }
  if (error instanceof ApiClientError || error?.name === 'ApiClientError') {
    if (error.code && CODE_MESSAGES[error.code]) return CODE_MESSAGES[error.code]
  }
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }
  return fallback
}
