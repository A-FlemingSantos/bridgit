import { describe, expect, it } from 'vitest'
import { ApiClientError } from './apiClient.js'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from './limits.js'
import { SESSION_FAILURE_CODES, isSessionFailure } from './session.js'

describe('isSessionFailure', () => {
  it('lists the six session codes', () => {
    expect(SESSION_FAILURE_CODES).toEqual([
      'TOKEN_INVALIDO',
      'SESSAO_INVALIDA',
      'SESSAO_EXPIRADA',
      'SESSAO_REVOGADA',
      'USUARIO_INVALIDO',
      'AUTENTICACAO_OBRIGATORIA',
    ])
  })

  it.each(SESSION_FAILURE_CODES)('401 with %s is a session failure', (code) => {
    expect(isSessionFailure(new ApiClientError('x', { status: 401, code }))).toBe(true)
  })

  it('401 without a code or with ERRO_API counts as a session failure', () => {
    expect(isSessionFailure(new ApiClientError('x', { status: 401 }))).toBe(true)
    expect(isSessionFailure(new ApiClientError('x', { status: 401, code: 'ERRO_API' }))).toBe(true)
    expect(isSessionFailure({ status: 401 })).toBe(true)
  })

  it('401 with an unrelated code is not a session failure', () => {
    expect(isSessionFailure(new ApiClientError('x', { status: 401, code: 'TOKEN_PROVEDOR_INVALIDO' }))).toBe(false)
  })

  it('other statuses and non-errors never are', () => {
    for (const status of [0, 400, 403, 404, 409, 429, 500, 503]) {
      expect(isSessionFailure(new ApiClientError('x', { status, code: 'SESSAO_EXPIRADA' }))).toBe(false)
    }
    expect(isSessionFailure(null)).toBe(false)
    expect(isSessionFailure(undefined)).toBe(false)
    expect(isSessionFailure(new Error('x'))).toBe(false)
  })
})

describe('upload limit', () => {
  it('exports the 50 MB limit and label', () => {
    expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024)
    expect(MAX_UPLOAD_LABEL).toBe('50 MB')
  })
})
