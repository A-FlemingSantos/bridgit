import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, runScopeHandlers } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { markdownKeymap, toggleBold, toggleItalic } from './markdownCommands.js'

let view = null

function open(doc, selection, { editable = true, getToggle } = {}) {
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection,
      extensions: [EditorState.allowMultipleSelections.of(true), markdownKeymap({ editable, getToggle })],
    }),
  })
  return view
}

function press(key) {
  const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true })
  return runScopeHandlers(view, event, 'editor')
}

describe('markdownCommands', () => {
  afterEach(() => {
    view?.destroy()
    view = null
  })

  it('envolve a seleção em negrito e itálico', () => {
    open('uma palavra', EditorSelection.range(4, 11))

    toggleBold(view)
    expect(view.state.doc.toString()).toBe('uma **palavra**')
    expect(view.state.selection.main).toMatchObject({ from: 6, to: 13 })

    toggleItalic(view)
    expect(view.state.doc.toString()).toBe('uma ***palavra***')
  })

  it('tira a marca quando a seleção já está envolvida, por fora ou por dentro', () => {
    open('uma **palavra**', EditorSelection.range(6, 13))
    toggleBold(view)
    expect(view.state.doc.toString()).toBe('uma palavra')

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '*x*' }, selection: EditorSelection.range(0, 3) })
    toggleItalic(view)
    expect(view.state.doc.toString()).toBe('x')
  })

  it('não confunde negrito com itálico', () => {
    open('**x**', EditorSelection.range(2, 3))

    toggleItalic(view)
    expect(view.state.doc.toString()).toBe('***x***')
    toggleBold(view)
    expect(view.state.doc.toString()).toBe('*x*')
  })

  it('sem seleção insere o par com o cursor no meio', () => {
    open('ab', EditorSelection.cursor(1))

    toggleBold(view)

    expect(view.state.doc.toString()).toBe('a****b')
    expect(view.state.selection.main.head).toBe(3)
  })

  it('trata cada seleção por conta própria', () => {
    open('a b', EditorSelection.create([EditorSelection.range(0, 1), EditorSelection.range(2, 3)]))

    toggleItalic(view)

    expect(view.state.doc.toString()).toBe('*a* *b*')
  })

  it('Ctrl+B e Ctrl+I agem pelo teclado', () => {
    open('x', EditorSelection.range(0, 1))

    expect(press('b')).toBe(true)
    expect(view.state.doc.toString()).toBe('**x**')
  })

  it('Ctrl+/ chama o callback atual, sem comentar nada, mesmo sem callback', () => {
    let toggle = vi.fn()
    open('texto', EditorSelection.cursor(0), { getToggle: () => toggle })

    expect(press('/')).toBe(true)
    expect(toggle).toHaveBeenCalledTimes(1)

    toggle = vi.fn()
    press('/')
    expect(toggle).toHaveBeenCalledTimes(1)
    expect(view.state.doc.toString()).toBe('texto')

    view.destroy()
    open('texto', EditorSelection.cursor(0), { getToggle: () => undefined })
    expect(press('/')).toBe(true)
    expect(view.state.doc.toString()).toBe('texto')
  })

  it('só lendo, Ctrl+B e Ctrl+I não escrevem, mas Ctrl+/ continua', () => {
    const toggle = vi.fn()
    open('x', EditorSelection.range(0, 1), { editable: false, getToggle: () => toggle })

    expect(press('b')).toBe(false)
    expect(view.state.doc.toString()).toBe('x')
    expect(press('/')).toBe(true)
    expect(toggle).toHaveBeenCalledTimes(1)
  })
})
