import { describe, expect, it } from 'vitest'
import { errorMessage } from './errorMessage'

describe('errorMessage', () => {
  it('replaces a known server code with an accented message', () => {
    expect(errorMessage({ code: 'CREDENCIAIS_INVALIDAS', message: 'Usuario ou senha invalidos.' }))
      .toBe('Usuário ou senha inválidos.')
  })

  it('keeps the server message for an unknown code', () => {
    expect(errorMessage({ code: 'OUTRO', message: 'Mensagem do servidor.' })).toBe('Mensagem do servidor.')
  })

  it('falls back when there is no message', () => {
    expect(errorMessage(null, 'Falhou.')).toBe('Falhou.')
  })
})
