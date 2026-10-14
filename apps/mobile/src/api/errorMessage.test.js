import { describe, expect, it } from 'vitest'
import { errorMessage } from './errorMessage'

describe('errorMessage', () => {
  it('uses the app text for local codes', () => {
    expect(errorMessage({ code: 'ERRO_CONEXAO', message: 'Não foi possível conectar ao servidor.' }))
      .toBe('Sem conexão com o servidor. Verifique a rede e tente de novo.')
    expect(errorMessage({ code: 'ARQUIVO_GRANDE', message: 'x' })).toBe('O arquivo excede o limite de 50 MB.')
    expect(errorMessage({ code: 'CANCELADO' })).toBe('A operação foi cancelada.')
    expect(errorMessage({ code: 'RESPOSTA_INVALIDA' })).toBe('O servidor enviou uma resposta inesperada. Tente novamente.')
  })

  it('points provider errors to the app settings', () => {
    expect(errorMessage({ code: 'RECONEXAO_NECESSARIA', message: 'É necessário reconectar este provedor de nuvem.' }))
      .toBe('O acesso a este provedor expirou. Reconecte em Ajustes.')
    expect(errorMessage({ code: 'PROVEDOR_NAO_CONECTADO', message: 'x' })).toBe('Conecte este provedor em Ajustes.')
  })

  it('shows the server message for every other code', () => {
    expect(errorMessage({ code: 'CREDENCIAIS_INVALIDAS', message: 'Usuário ou senha inválidos.' }))
      .toBe('Usuário ou senha inválidos.')
    expect(errorMessage({ code: 'OUTRO', message: 'Mensagem do servidor.' })).toBe('Mensagem do servidor.')
  })

  it('falls back when there is no message', () => {
    expect(errorMessage(null, 'Falhou.')).toBe('Falhou.')
    expect(errorMessage({ code: 'OUTRO', message: '  ' }, 'Falhou.')).toBe('Falhou.')
  })
})
