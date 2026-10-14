import { MAX_UPLOAD_LABEL } from '@bridgit/shared-client'

// The API sends its messages in Portuguese, so they are shown as they come. This map only holds what
// the app says differently: errors raised on the device and messages that point to the app's own screens.
const CODE_MESSAGES = {
  ERRO_CONEXAO: 'Sem conexão com o servidor. Verifique a rede e tente de novo.',
  CANCELADO: 'A operação foi cancelada.',
  RESPOSTA_INVALIDA: 'O servidor enviou uma resposta inesperada. Tente novamente.',
  ARQUIVO_GRANDE: `O arquivo excede o limite de ${MAX_UPLOAD_LABEL}.`,
  RECONEXAO_NECESSARIA: 'O acesso a este provedor expirou. Reconecte em Ajustes.',
  PROVEDOR_NAO_CONECTADO: 'Conecte este provedor em Ajustes.',
}

export function errorMessage(error, fallback = 'Não foi possível concluir. Tente novamente.') {
  if (error?.code && CODE_MESSAGES[error.code]) return CODE_MESSAGES[error.code]
  if (typeof error?.message === 'string' && error.message.trim()) return error.message
  return fallback
}
