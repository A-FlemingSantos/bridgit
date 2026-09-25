import { ApiClientError } from '@bridgit/shared-client'

const CODE_MESSAGES = {
  RECONEXAO_NECESSARIA: 'Reconecte o provedor em Configurações.',
  PROVEDOR_NAO_CONECTADO: 'Conecte o provedor em Configurações.',
  NAO_ENCONTRADO: 'Item não encontrado.',
  ARQUIVO_GRANDE: 'O arquivo excede o limite de 50 MB.',
}

export function hubErrorMessage(error, fallback = 'Algo deu errado. Tente novamente.') {
  if (!error) return fallback
  if (error instanceof ApiClientError && error.code && CODE_MESSAGES[error.code]) {
    return CODE_MESSAGES[error.code]
  }
  if (typeof error.message === 'string' && error.message.trim()) {
    return error.message
  }
  return fallback
}
