// What the OAuth redirect (a deep link with status and error in the query string) means for the user.
export const ACCOUNT_CHANGE_ERROR = 'OAUTH_CONTA_DIFERENTE'

export const OAUTH_ERRORS = {
  PROVEDOR_RECUSOU: 'A conexão foi cancelada no provedor.',
  OAUTH_STATE_EXPIRADO: 'A tentativa expirou. Tente conectar de novo.',
  OAUTH_STATE_INVALIDO: 'A tentativa de conexão é inválida. Tente de novo.',
  OAUTH_CODE_AUSENTE: 'O provedor não retornou a autorização. Tente de novo.',
  REFRESH_TOKEN_AUSENTE: 'O provedor não concedeu acesso contínuo. Tente de novo.',
  OAUTH_TROCA_TEMPORARIA: 'O provedor não respondeu. Tente conectar de novo.',
  PROVEDOR_NAO_CONFIGURADO: 'Este provedor ainda não foi configurado no servidor.',
}

const DEFAULT_ERROR = 'Não foi possível conectar o provedor.'

// Returns { message, accountChange }. message is '' when the connection succeeded or needs a confirmation
// instead of an error (accountChange: the user came back with a different account).
export function describeOauthReturn(queryParams) {
  if (queryParams?.status === 'connected') return { message: '', accountChange: false }
  if (queryParams?.error === ACCOUNT_CHANGE_ERROR) return { message: '', accountChange: true }
  return { message: OAUTH_ERRORS[queryParams?.error] ?? DEFAULT_ERROR, accountChange: false }
}
