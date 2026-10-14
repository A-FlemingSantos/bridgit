import { describe, expect, it } from 'vitest'
import { rejectionNotice } from './OperationNotices.jsx'

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
