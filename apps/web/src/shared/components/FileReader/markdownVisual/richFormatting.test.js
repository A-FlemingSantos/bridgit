import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { frontMatter } from './frontMatter.js'
import { insert } from './insert.js'
import { blockPreview } from './blockPreview.js'
import { inlinePreview } from './inlinePreview.js'
import { richBlocks } from './richBlocks.js'

const views = []

// The whole Visualizar mode over a fully parsed document, with the cursor at the end unless told otherwise.
function open(doc, anchor = doc.length) {
  const parent = document.createElement('div')
  document.body.append(parent)
  const state = EditorState.create({
    doc,
    selection: { anchor },
    extensions: [
      markdown({ base: markdownLanguage, extensions: [frontMatter, insert] }),
      inlinePreview(),
      blockPreview({ editable: true }),
      richBlocks(),
    ],
  })
  ensureSyntaxTree(state, doc.length, 5000)
  const view = new EditorView({ state, parent })
  views.push(view)
  view.dispatch({ selection: { anchor } })
  return view
}

const lines = (view) => [...view.contentDOM.querySelectorAll('.cm-line')]

afterEach(() => {
  while (views.length) views.pop().destroy()
  document.body.innerHTML = ''
})

describe('Visualizar: formatação rica', () => {
  it('mantém negrito, itálico, código e tachado nas células da tabela', () => {
    const view = open('| a | b |\n|---|---|\n| **n** `c` | *i* ~~t~~ ++u++ |\n\nfim')
    const cells = view.dom.querySelectorAll('td')

    expect(cells[0].querySelector('strong').textContent).toBe('n')
    expect(cells[0].querySelector('code').textContent).toBe('c')
    expect(cells[1].querySelector('em').textContent).toBe('i')
    expect(cells[1].querySelector('s').textContent).toBe('t')
    expect(cells[1].querySelector('u').textContent).toBe('u')
    expect(cells[0].textContent).toBe('n c')
  })

  it('aplica <b> e <kbd> dentro da célula, sem virar HTML de verdade', () => {
    const view = open('| a |\n|---|\n| <b>x</b> <kbd>K</kbd> <img src=x> |\n\nfim')
    const cell = view.dom.querySelector('td')

    expect(cell.querySelector('b').textContent).toBe('x')
    expect(cell.querySelector('kbd').textContent).toBe('K')
    expect(cell.querySelector('img')).toBeNull()
    expect(cell.textContent).toBe('x K <img src=x>')
  })

  it('estiliza <u> e <kbd> inline e esconde as tags com o cursor fora', () => {
    const view = open('um <u>dois</u> e <kbd>Ctrl</kbd>\nfim')

    expect(lines(view)[0].textContent).toBe('um dois e Ctrl')
    expect(lines(view)[0].querySelector('.cm-md-ins').textContent).toBe('dois')
    expect(lines(view)[0].querySelector('.cm-md-kbd').textContent).toBe('Ctrl')
  })

  it('mostra as tags inline com o cursor dentro', () => {
    const view = open('um <u>dois</u>\nfim', 8)

    expect(lines(view)[0].textContent).toBe('um <u>dois</u>')
  })

  it('esconde os --- do front matter com o cursor fora', () => {
    const view = open('---\ntitle: Oi\n---\n\ntexto')
    const [first, middle, last] = lines(view)

    expect(first.textContent).toBe('')
    expect(middle.textContent).toBe('title: Oi')
    expect(last.textContent).toBe('')
    expect(first.classList.contains('cm-md-frontmatter-edge')).toBe(true)
  })

  it('desenha uma barra por nível de citação', () => {
    const view = open('> um\n>\n> > dois\n\nfim')
    const [first, , nested] = lines(view)

    expect(first.classList.contains('cm-md-quote-d1')).toBe(true)
    expect(nested.classList.contains('cm-md-quote-d2')).toBe(true)
    expect(nested.textContent).toBe('dois')
  })

  it('alinha as listas pela profundidade, sem o recuo digitado', () => {
    const view = open('- a\n  - b\n1. c\n   1. d\n\nfim')
    const [a, b, c, d] = lines(view)

    expect(a.classList.contains('cm-md-li-d1')).toBe(true)
    expect(b.classList.contains('cm-md-li-d2')).toBe(true)
    expect(b.textContent).toBe('•b')
    expect(c.classList.contains('cm-md-li-d1')).toBe(true)
    expect(d.classList.contains('cm-md-li-d2')).toBe(true)
    expect(d.textContent).toBe('1. d')
    expect(view.state.doc.toString()).toBe('- a\n  - b\n1. c\n   1. d\n\nfim')
  })

  it('junta <details> separado por linhas em branco num só bloco', async () => {
    const doc = '<details>\n<summary>Abrir</summary>\n\nTexto com <u>u</u>.\n\n</details>\n\nfim'
    const view = open(doc)

    await vi.waitFor(() => expect(view.dom.querySelector('.cm-md-html')).not.toBeNull())
    const previews = view.dom.querySelectorAll('.cm-md-html')
    expect(previews).toHaveLength(1)
    expect(previews[0].querySelector('details summary').textContent).toBe('Abrir')
    expect(previews[0].querySelector('details u').textContent).toBe('u')
  })

  it('não deixa espaço para um bloco HTML que fica vazio depois da limpeza', async () => {
    const view = open('antes\n\n<div><b>x</b></div>\n\n<script>alert(1)</script>\n\nfim')

    await vi.waitFor(() => expect(view.dom.querySelector('.cm-md-html')).not.toBeNull())
    expect(view.dom.querySelectorAll('.cm-md-html')).toHaveLength(1)
    expect(view.contentDOM.textContent).not.toContain('script')
  })
})
