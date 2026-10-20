import { describe, expect, it } from 'vitest'
import { buildUploadErrorMessage } from './hubErrors.js'

const unreadable = (name) => ({ file: { name }, error: { code: 'ARQUIVO_ILEGIVEL' }, ambiguous: false })

describe('buildUploadErrorMessage', () => {
  it('diz que um arquivo sozinho não pôde ser lido', () => {
    expect(buildUploadErrorMessage(0, 1, [unreadable('atalho.md')]))
      .toBe('Não foi possível ler atalho.md. O arquivo pode ter sido movido ou apagado, ou ser um atalho quebrado.')
  })

  it('separa arquivos ilegíveis das outras falhas', () => {
    const failed = [
      unreadable('atalho.md'),
      { file: { name: 'recusado.txt' }, error: { code: 'ERRO' }, ambiguous: false },
      { file: { name: 'duvidoso.txt' }, error: { code: 'ERRO' }, ambiguous: true },
    ]
    expect(buildUploadErrorMessage(2, 5, failed)).toBe(
      '2 de 5 arquivos enviados. Não foi possível ler: atalho.md. Confira se ainda existem no computador. '
      + 'Falhou: recusado.txt. Verificando: duvidoso.txt.',
    )
  })
})
