import { describe, expect, it } from 'vitest'
import { describeOauthReturn } from './oauthOutcome'

describe('describeOauthReturn', () => {
  it('treats connected as success', () => {
    expect(describeOauthReturn({ status: 'connected' })).toEqual({ message: '', accountChange: false })
  })

  it('asks for confirmation when the account is different', () => {
    expect(describeOauthReturn({ status: 'error', error: 'OAUTH_CONTA_DIFERENTE' })).toEqual({
      message: '',
      accountChange: true,
    })
  })

  it('translates the transient and configuration errors', () => {
    expect(describeOauthReturn({ status: 'error', error: 'OAUTH_TROCA_TEMPORARIA' }).message)
      .toBe('O provedor não respondeu. Tente conectar de novo.')
    expect(describeOauthReturn({ status: 'error', error: 'PROVEDOR_NAO_CONFIGURADO' }).message)
      .toBe('Este provedor ainda não foi configurado no servidor.')
  })

  it('falls back to a generic message', () => {
    expect(describeOauthReturn({ status: 'error', error: 'OUTRO' }).message)
      .toBe('Não foi possível conectar o provedor.')
    expect(describeOauthReturn(undefined).message).toBe('Não foi possível conectar o provedor.')
  })
})
