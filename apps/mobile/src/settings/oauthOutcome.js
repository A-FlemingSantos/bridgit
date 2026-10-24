// What the OAuth redirect (a deep link with status and error in the query string) means for the user.
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

// Returns { message, connectionId }. message is '' when the connection succeeded; connectionId is the
// account the server connected (the redirect carries `connection={uuid}` on success), or null.
export function describeOauthReturn(queryParams) {
  if (queryParams?.status === 'connected') {
    const connectionId = queryParams.connection ? String(queryParams.connection) : null
    return { message: '', connectionId }
  }
  return { message: OAUTH_ERRORS[queryParams?.error] ?? DEFAULT_ERROR, connectionId: null }
}
