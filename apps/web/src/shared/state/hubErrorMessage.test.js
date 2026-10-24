import { ApiClientError } from '@bridgit/shared-client'
import { describe, expect, it } from 'vitest'
import { apiErrorMessage, hubErrorMessage } from './hubErrorMessage.js'

describe('hubErrorMessage', () => {
  it('uses the app text for local codes and UI pointers', () => {
    expect(hubErrorMessage(new ApiClientError('x', { code: 'ERRO_CONEXAO', status: 0 })))
      .toBe('Sem conexão com o servidor. Verifique a rede e tente de novo.')
    expect(hubErrorMessage(new ApiClientError('x', { code: 'ARQUIVO_GRANDE', status: 400 })))
      .toBe('O arquivo excede o limite de 50 MB.')
    expect(hubErrorMessage(new ApiClientError('x', { code: 'RECONEXAO_NECESSARIA', status: 409 })))
      .toBe('Reconecte o provedor em Configurações.')
  })

  it('words the editing errors the editor can hit', () => {
    expect(hubErrorMessage(new ApiClientError('x', { code: 'TEXTO_GRANDE_DEMAIS', status: 400 })))
      .toBe('O texto passou de 2 MB e não pode ser salvo aqui.')
    expect(hubErrorMessage(new ApiClientError('x', { code: 'EDICAO_INDISPONIVEL', status: 409 })))
      .toBe('Este arquivo não pode ser editado aqui.')
    expect(hubErrorMessage(new ApiClientError('O arquivo mudou na nuvem.', { code: 'ARQUIVO_ALTERADO', status: 409 })))
      .toBe('O arquivo mudou na nuvem.')
  })

  it('shows the server message for every other code', () => {
    const error = new ApiClientError('Usuário ou senha inválidos.', { code: 'CREDENCIAIS_INVALIDAS', status: 401 })
    expect(hubErrorMessage(error)).toBe('Usuário ou senha inválidos.')
  })

  it('falls back without an error or message', () => {
    expect(hubErrorMessage(null, 'Falhou.')).toBe('Falhou.')
    expect(hubErrorMessage(new Error(' '), 'Falhou.')).toBe('Falhou.')
  })
})

describe('apiErrorMessage', () => {
  it('uses the shared mapping for API errors and the fallback for anything else', () => {
    expect(apiErrorMessage(new ApiClientError('A senha atual está incorreta.', { code: 'SENHA_ATUAL_INVALIDA', status: 400 }), 'Falhou.'))
      .toBe('A senha atual está incorreta.')
    expect(apiErrorMessage(new TypeError('x is not a function'), 'Falhou.')).toBe('Falhou.')
  })
})
