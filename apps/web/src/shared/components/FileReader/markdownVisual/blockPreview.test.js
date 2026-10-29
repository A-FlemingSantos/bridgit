import { history, undo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { blockPreview } from './blockPreview.js'

let view

// A real editor with the markdown grammar fully parsed, so the tree is complete before the first decoration.
function open(doc, { editable = true, anchor = doc.length } = {}) {
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      history(),
      markdown({ base: markdownLanguage }),
      blockPreview({ editable }),
      EditorState.readOnly.of(!editable),
      EditorView.editable.of(editable),
    ],
  })
  ensureSyntaxTree(state, doc.length, 5000)
  view = new EditorView({ state, parent: document.body })
  // Rebuilds the decorations over the finished tree.
  view.dispatch({ selection: { anchor } })
  return view
}

function select(at) {
  view.dispatch({ selection: { anchor: at } })
}

afterEach(() => {
  view?.destroy()
  view = null
})

describe('blockPreview', () => {
  describe('regra horizontal', () => {
    const doc = 'intro\n\n---\n\nfim'

    it('mostra a regra com o cursor fora e o texto cru com o cursor dentro', () => {
      open(doc)
      expect(view.dom.querySelector('.cm-md-hr')).toBeTruthy()
      expect(view.contentDOM.textContent).not.toContain('---')

      select(doc.indexOf('---') + 1)
      expect(view.dom.querySelector('.cm-md-hr')).toBeNull()
      expect(view.contentDOM.textContent).toContain('---')
    })

    it('não troca o sublinhado de um título por regra', () => {
      open('Título\n---\n\nfim')
      expect(view.dom.querySelector('.cm-md-hr')).toBeNull()
    })
  })

  describe('tarefas', () => {
    const doc = '- [ ] feita\n- [x] pronta\n\nfim'

    it('mostra caixas de seleção com o estado do texto', () => {
      open(doc)
      const boxes = view.dom.querySelectorAll('input.cm-md-task')
      expect(boxes).toHaveLength(2)
      expect(boxes[0].checked).toBe(false)
      expect(boxes[1].checked).toBe(true)
      expect(view.contentDOM.textContent).not.toContain('[ ]')
    })

    it('volta ao texto cru quando o cursor entra no marcador', () => {
      open(doc)
      select(doc.indexOf('[ ]') + 1)
      expect(view.dom.querySelectorAll('input.cm-md-task')).toHaveLength(1)
      expect(view.contentDOM.textContent).toContain('[ ]')
    })

    it('marca no clique, só no caractere do marcador, e o desfazer devolve', () => {
      open(doc)
      view.dom.querySelector('input.cm-md-task').click()

      expect(view.state.doc.toString()).toBe('- [x] feita\n- [x] pronta\n\nfim')
      expect(view.dom.querySelectorAll('input.cm-md-task')[0].checked).toBe(true)

      undo(view)
      expect(view.state.doc.toString()).toBe(doc)
    })

    it('desmarca [x] no clique', () => {
      open(doc)
      view.dom.querySelectorAll('input.cm-md-task')[1].click()
      expect(view.state.doc.toString()).toBe('- [ ] feita\n- [ ] pronta\n\nfim')
    })

    it('fica desabilitada e não escreve quando o arquivo é só de leitura', () => {
      open(doc, { editable: false })
      const box = view.dom.querySelector('input.cm-md-task')
      expect(box.disabled).toBe(true)

      box.click()
      expect(view.state.doc.toString()).toBe(doc)
    })

    it('esmaece o texto da tarefa concluída', () => {
      open(doc)
      expect(view.dom.querySelector('.cm-md-task-done').textContent).toContain('pronta')
    })
  })

  describe('imagens', () => {
    it('mostra <img> para URL https', () => {
      const doc = '![gato](https://exemplo.com/gato.png)\n\nfim'
      open(doc)

      const image = view.dom.querySelector('img.cm-md-image')
      expect(image.getAttribute('src')).toBe('https://exemplo.com/gato.png')
      expect(image.getAttribute('alt')).toBe('gato')
      expect(image.getAttribute('loading')).toBe('lazy')
      expect(image.getAttribute('referrerpolicy')).toBe('no-referrer')

      select(3)
      expect(view.dom.querySelector('img:not(.cm-widgetBuffer)')).toBeNull()
      expect(view.contentDOM.textContent).toContain('![gato](https://exemplo.com/gato.png)')
    })

    it.each(['./gato.png', 'http://exemplo.com/gato.png', 'data:image/png;base64,AAAA', '//exemplo.com/gato.png'])(
      'mostra a faixa de imagem não carregada, sem <img>, para %s',
      (url) => {
        open(`![meu gato](${url})\n\nfim`)

        expect(view.dom.querySelector('img:not(.cm-widgetBuffer)')).toBeNull()
        const placeholder = view.dom.querySelector('.cm-md-image-missing')
        expect(placeholder.textContent).toBe('Não foi possível carregar a imagem')
        expect(placeholder.title).toBe('meu gato')
        expect(placeholder.querySelector('svg')).toBeTruthy()
      },
    )

    it('remove a imagem e a linha dela pela lixeira, e o desfazer devolve', () => {
      const doc = 'antes\n![gato](./gato.png)\ndepois'
      open(doc, { anchor: 0 })

      view.dom.querySelector('.cm-md-image-remove').click()

      expect(view.state.doc.toString()).toBe('antes\ndepois')
      undo(view)
      expect(view.state.doc.toString()).toBe(doc)
    })

    it('remove só a imagem quando ela divide a linha com texto', () => {
      open('veja ![gato](./gato.png) aqui\n\nfim', { anchor: 0 })

      view.dom.querySelector('.cm-md-image-remove').click()

      expect(view.state.doc.toString()).toBe('veja  aqui\n\nfim')
    })

    it('não oferece a lixeira quando o arquivo é só de leitura', () => {
      open('![gato](./gato.png)\n\nfim', { editable: false })

      expect(view.dom.querySelector('.cm-md-image-missing')).toBeTruthy()
      expect(view.dom.querySelector('.cm-md-image-remove')).toBeNull()
    })

    it('não carrega imagem de referência sem URL própria', () => {
      open('![gato][ref]\n\n[ref]: https://exemplo.com/gato.png\n\nfim')
      expect(view.dom.querySelector('img:not(.cm-widgetBuffer)')).toBeNull()
      expect(view.dom.querySelector('.cm-md-image-missing')).toBeTruthy()
    })
  })

  describe('tabelas', () => {
    const doc = '| a | b |\n|:--|--:|\n| 1 | **dois** |\n\nfim'

    it('mostra a tabela com cabeçalho, linhas e alinhamento', () => {
      open(doc)

      const table = view.dom.querySelector('table.cm-md-table')
      expect([...table.querySelectorAll('th')].map((cell) => cell.textContent)).toEqual(['a', 'b'])
      expect([...table.querySelectorAll('tbody td')].map((cell) => cell.textContent)).toEqual(['1', 'dois'])
      expect(table.querySelectorAll('th')[0].style.textAlign).toBe('left')
      expect(table.querySelectorAll('th')[1].style.textAlign).toBe('right')
      expect(view.contentDOM.textContent).not.toContain('|')
    })

    it('volta ao texto cru quando o cursor entra na tabela', () => {
      open(doc)
      select(doc.indexOf('1'))

      expect(view.dom.querySelector('table')).toBeNull()
      expect(view.contentDOM.textContent).toContain('| 1 |')
    })

    it('mostra como texto o HTML que não é só formatação', () => {
      open('| x |\n|---|\n| <img src=x onerror=alert(1)> <b class="a">y</b> |\n\nfim')

      const cell = view.dom.querySelector('tbody td')
      expect(cell.textContent).toBe('<img src=x onerror=alert(1)> <b class="a">y</b>')
      expect(view.dom.querySelector('table img, table b')).toBeNull()
    })

    it('abre o texto da tabela, na célula clicada, ao clicar nela', () => {
      open(doc)
      const cell = view.dom.querySelectorAll('tbody td')[1]
      cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

      expect(view.dom.querySelector('table')).toBeNull()
      expect(view.state.selection.main.head).toBe(doc.indexOf('**dois**'))
    })

    it('mantém a tabela intacta entre atualizações que não a tocam', () => {
      open(doc)
      const before = view.dom.querySelector('table')

      view.dispatch({ changes: { from: view.state.doc.length, insert: '!' } })
      expect(view.dom.querySelector('table')).toBe(before)
    })
  })
})
