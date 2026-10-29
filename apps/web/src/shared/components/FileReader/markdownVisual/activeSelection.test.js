import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { frontMatter } from './frontMatter.js'
import { markdownVisual } from './index.js'

const views = []

function open(doc) {
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage, extensions: [frontMatter] }), markdownVisual({ editable: true })],
    }),
  })
  views.push(view)
  ensureSyntaxTree(view.state, doc.length, 5000)
  // A no-op update so the plugin rebuilds from the finished tree, without setting a selection.
  view.dispatch({})
  return view
}

const firstLine = (view) => view.contentDOM.querySelector('.cm-line')

afterEach(() => {
  while (views.length) views.pop().destroy()
  document.body.innerHTML = ''
})

describe('markdownVisual: seleção ativa', () => {
  it('abre com o título da primeira linha renderizado, mesmo com o cursor no começo', () => {
    const view = open('# Título\n\ntexto')

    expect(view.state.selection.main.head).toBe(0)
    expect(firstLine(view).textContent).toBe('Título')
  })

  it('mostra a sintaxe quando alguém põe o cursor ali', () => {
    const view = open('# Título\n\ntexto')

    view.dispatch({ selection: { anchor: 3 } })

    expect(firstLine(view).textContent).toBe('# Título')
  })
})
