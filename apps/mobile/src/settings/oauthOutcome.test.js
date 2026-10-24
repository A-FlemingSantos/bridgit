import { describe, expect, it } from 'vitest'
import { describeOauthReturn } from './oauthOutcome'

describe('describeOauthReturn', () => {
  it('treats connected as success', () => {
    expect(describeOauthReturn({ status: 'connected' })).toEqual({ message: '', connectionId: null })
  })

  it('reports the connection the server created or reconnected', () => {
    expect(describeOauthReturn({ status: 'connected', connection: '3f2c' })).toEqual({ message: '', connectionId: '3f2c' })
  })

  it('no longer treats a different account as a special case', () => {
    expect(describeOauthReturn({ status: 'error', error: 'OAUTH_CONTA_DIFERENTE' })).toEqual({
      message: 'Não foi possível conectar o provedor.',
      connectionId: null,
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
