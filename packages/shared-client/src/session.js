// Codes the API sends with a 401. A 401 always means the session is no longer usable.
export const SESSION_FAILURE_CODES = [
  'TOKEN_INVALIDO',
  'SESSAO_INVALIDA',
  'SESSAO_EXPIRADA',
  'SESSAO_REVOGADA',
  'USUARIO_INVALIDO',
  'AUTENTICACAO_OBRIGATORIA',
]

// True when the error means the stored session must be dropped. Only 401 qualifies; a missing code or
// the generic ERRO_API also counts, because the API has no other kind of 401. Other statuses never do.
export function isSessionFailure(error) {
  if (!error || error.status !== 401) return false
  const code = error.code ?? 'ERRO_API'
  return code === 'ERRO_API' || SESSION_FAILURE_CODES.includes(code)
}
