import { describe, expect, it } from 'vitest'
import { freshRejections, rejectionNotice } from './OperationNotices.jsx'

describe('rejectionNotice', () => {
  it('diz o que falhou e por quê', () => {
    expect(rejectionNotice({
      request: { kind: 'CREATE_FOLDER', name: 'Contratos' },
      errorMessage: 'Já existe um item com este nome.',
    })).toBe('Não foi possível criar a pasta "Contratos". Já existe um item com este nome.')
  })

  it('usa o nome guardado na intenção quando o pedido não traz nome', () => {
    expect(rejectionNotice({ request: { kind: 'DELETE' }, localItem: { name: 'a.txt' } }))
      .toBe('Não foi possível excluir "a.txt".')
  })
})

describe('rejectionNotice for a save', () => {
  it('names the file being saved', () => {
    expect(rejectionNotice({ request: { kind: 'REPLACE_CONTENT' }, localItem: { name: 'main.js' }, errorMessage: 'Bloqueado.' }))
      .toBe('Não foi possível salvar "main.js". Bloqueado.')
  })
})

describe('rejectionNotice with a cached name', () => {
  it('names the file from the catalog when the refusal carries no name', () => {
    expect(rejectionNotice({ request: { kind: 'REPLACE_CONTENT', name: null, ref: 'f' }, errorMessage: 'Bloqueado.' }, 'main.js'))
      .toBe('Não foi possível salvar "main.js". Bloqueado.')
  })

  it('prefers the name the operation itself carries', () => {
    expect(rejectionNotice({ request: { kind: 'UPDATE', name: 'novo.txt' } }, 'velho.txt'))
      .toBe('Não foi possível alterar "novo.txt".')
  })
})

describe('freshRejections', () => {
  const rejected = (id) => ({ id, status: 'REJECTED', request: { kind: 'DELETE' } })

  it('avisa só da operação vista pendente e agora recusada', () => {
    const previous = new Map([['op-1', 'QUEUED'], ['op-2', 'REJECTED']])
    expect(freshRejections(previous, [rejected('op-1'), rejected('op-2')]).map((op) => op.id)).toEqual(['op-1'])
  })

  it('ignora o histórico carregado com a página e as recusas no envio', () => {
    expect(freshRejections(new Map(), [rejected('op-old')])).toEqual([])
    expect(freshRejections(new Map([['client:k', 'SUBMITTING']]), [rejected('client:k')])).toEqual([])
  })
})
