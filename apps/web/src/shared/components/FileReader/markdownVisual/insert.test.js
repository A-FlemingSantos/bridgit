import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { inlinePreview } from './inlinePreview.js'
import { insert } from './insert.js'

const views = []

function open(doc, anchor = doc.length) {
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor },
      extensions: [markdown({ base: markdownLanguage, extensions: [insert] }), inlinePreview()],
    }),
  })
  views.push(view)
  ensureSyntaxTree(view.state, doc.length, 5000)
  view.dispatch({ selection: { anchor } })
  return view
}

const firstLine = (view) => view.contentDOM.querySelector('.cm-line')

afterEach(() => {
  while (views.length) views.pop().destroy()
  document.body.innerHTML = ''
})

describe('++texto++', () => {
  it('sublinha e esconde os ++ com o cursor fora', () => {
    const view = open('um ++dois++ três\nfim')

    expect(firstLine(view).textContent).toBe('um dois três')
    expect(firstLine(view).querySelector('.cm-md-ins').textContent).toBe('dois')
    expect(view.state.doc.toString()).toBe('um ++dois++ três\nfim')
  })

  it('mostra os ++ com o cursor dentro', () => {
    const view = open('um ++dois++ três\nfim', 6)

    expect(firstLine(view).textContent).toBe('um ++dois++ três')
  })

  it('deixa c++ e ++ soltos como texto', () => {
    const view = open('c++ e a ++ b\nfim')

    expect(firstLine(view).textContent).toBe('c++ e a ++ b')
    expect(firstLine(view).querySelector('.cm-md-ins')).toBeNull()
  })

  it('aceita pontuação logo depois do ++ de abertura', () => {
    const view = open('++*Nomes que começam com++ use\nfim')

    expect(firstLine(view).querySelector('.cm-md-ins').textContent).toBe('*Nomes que começam com')
  })
})
