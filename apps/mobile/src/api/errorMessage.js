// The API writes its messages without accents. Codes the user can run into get a proper Portuguese
// message here; anything else falls back to the server message, then to the caller's fallback.
const CODE_MESSAGES = {
  CREDENCIAIS_INVALIDAS: 'Usuário ou senha inválidos.',
  USUARIO_EM_USO: 'Já existe uma conta com este usuário.',
  USUARIO_OBRIGATORIO: 'Informe o usuário.',
  SENHA_OBRIGATORIA: 'Informe a senha.',
  SENHA_INVALIDA: 'A senha deve ter pelo menos 8 caracteres.',
  SENHA_ATUAL_INVALIDA: 'A senha atual está incorreta.',
  AUTENTICACAO_OBRIGATORIA: 'Faça login para continuar.',
  TOKEN_INVALIDO: 'Sua sessão expirou. Faça login novamente.',
  SESSAO_INVALIDA: 'Sua sessão não é mais válida. Faça login novamente.',
  SESSAO_EXPIRADA: 'Sua sessão expirou. Faça login novamente.',
  SESSAO_REVOGADA: 'Sua sessão foi encerrada. Faça login novamente.',
  USUARIO_INVALIDO: 'Não foi possível identificar sua conta. Faça login novamente.',
  ERRO_CONEXAO: 'Sem conexão com o servidor. Verifique a rede e tente de novo.',
  ERRO_INTERNO: 'Algo deu errado no servidor. Tente novamente.',
  RECONEXAO_NECESSARIA: 'O acesso a este provedor expirou. Reconecte em Ajustes.',
  PROVEDOR_NAO_CONECTADO: 'Conecte este provedor em Ajustes.',
  CONEXAO_ALTERADA: 'A conexão com o provedor mudou. Atualize e tente de novo.',
  NAO_ENCONTRADO: 'Item não encontrado.',
  ITEM_NAO_ENCONTRADO: 'Item não encontrado. Ele pode ter sido movido ou excluído no provedor.',
  CONTEUDO_NAO_ENCONTRADO: 'Conteúdo não encontrado ou expirado.',
  ARQUIVO_GRANDE: 'O arquivo excede o limite de 50 MB.',
  ARQUIVO_ALTERADO: 'O arquivo foi alterado. Atualize e tente de novo.',
  NOME_INVALIDO: 'Informe um nome válido, sem barras e com até 255 caracteres.',
  DESTINO_INVALIDO: 'O destino não é uma pasta.',
  LINK_APENAS_ARQUIVO: 'Só arquivos podem ter link público.',
  OPERACAO_EM_VERIFICACAO: 'A operação está sendo verificada. Aguarde antes de repetir.',
  RESULTADO_NAO_CONFIRMADO: 'Não foi possível confirmar o resultado. Atualize antes de repetir.',
  OPERACOES_INDISPONIVEIS: 'Operações temporariamente indisponíveis.',
  UPLOAD_FILA_CHEIA: 'Aguarde os envios pendentes antes de enviar mais arquivos.',
  UPLOAD_INCOMPLETO: 'O arquivo não foi recebido por completo. Tente de novo.',
  UPLOAD_AUSENTE: 'Selecione o arquivo novamente.',
}

export function errorMessage(error, fallback = 'Não foi possível concluir. Tente novamente.') {
  if (error?.code && CODE_MESSAGES[error.code]) return CODE_MESSAGES[error.code]
  if (typeof error?.message === 'string' && error.message.trim()) return error.message
  return fallback
}
