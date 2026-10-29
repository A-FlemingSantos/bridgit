import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inlinePreview } from './inlinePreview.js'

const views = []

// `§` in the text marks where the cursor goes (it is removed from the document).
function open(text) {
  const anchor = text.indexOf('§')
  const doc = text.replace('§', '')
  const parent = document.createElement('div')
  document.body.append(parent)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: anchor < 0 ? doc.length : anchor },
      extensions: [markdown({ base: markdownLanguage }), inlinePreview({ editable: true })],
    }),
  })
  views.push(view)
  // Force a full parse, then a selection-only update so the plugin rebuilds from the finished tree.
  ensureSyntaxTree(view.state, doc.length, 5000)
  view.dispatch({ selection: { anchor: view.state.selection.main.head } })
  return view
}

const lines = (view) => [...view.contentDOM.querySelectorAll('.cm-line')]

afterEach(() => {
  while (views.length) views.pop().destroy()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('inlinePreview', () => {
  it('marks the editor with the visual class', () => {
    const view = open('x')
    expect(view.dom.classList.contains('cm-md-visual')).toBe(true)
  })

  it('hides inline marks with the cursor elsewhere and keeps the text', () => {
    const view = open('**b** *i* ~~s~~ `c` [t](https://a.com)\ntail§')
    expect(lines(view)[0].textContent).toBe('b i s c t')
    expect(lines(view)[0].querySelector('.cm-md-strong')).toBeTruthy()
    expect(lines(view)[0].querySelector('.cm-md-em')).toBeTruthy()
    expect(lines(view)[0].querySelector('.cm-md-strike')).toBeTruthy()
    expect(lines(view)[0].querySelector('.cm-md-code')).toBeTruthy()
    expect(lines(view)[0].querySelector('.cm-md-link')).toBeTruthy()
    expect(view.state.doc.toString()).toBe('**b** *i* ~~s~~ `c` [t](https://a.com)\ntail')
  })

  it('shows the marks of the node the selection touches, and only that node', () => {
    const view = open('**b§** *i* ~~s~~ `c` [t](https://a.com)\ntail')
    expect(lines(view)[0].textContent).toBe('**b** i s c t')

    view.dispatch({ selection: { anchor: 7 } })
    expect(lines(view)[0].textContent).toBe('b *i* s c t')

    view.dispatch({ selection: { anchor: 12 } })
    expect(lines(view)[0].textContent).toBe('b i ~~s~~ c t')

    view.dispatch({ selection: { anchor: 17 } })
    expect(lines(view)[0].textContent).toBe('b i s `c` t')

    view.dispatch({ selection: { anchor: 25 } })
    expect(lines(view)[0].textContent).toBe('b i s c [t](https://a.com)')
  })

  it('treats a selection that covers a node as touching it', () => {
    const view = open('a **b** c\ntail')
    view.dispatch({ selection: { anchor: 0, head: 10 } })
    expect(lines(view)[0].textContent).toBe('a **b** c')
  })

  it('styles headings and hides the hashes off the line', () => {
    const view = open('# One\n###### Six\ntail§')
    expect(lines(view)[0].classList.contains('cm-md-h1')).toBe(true)
    expect(lines(view)[1].classList.contains('cm-md-h6')).toBe(true)
    expect(lines(view)[0].textContent).toBe('One')
    expect(lines(view)[1].textContent).toBe('Six')

    view.dispatch({ selection: { anchor: 3 } })
    expect(lines(view)[0].textContent).toBe('# One')
    expect(lines(view)[1].textContent).toBe('Six')
    expect(lines(view)[0].classList.contains('cm-md-h1')).toBe(true)
  })

  it('hides the setext underline unless the cursor is on its lines', () => {
    const view = open('Title\n=====\ntail§')
    expect(lines(view)[0].classList.contains('cm-md-h1')).toBe(true)
    expect(lines(view)[1].textContent).toBe('')

    view.dispatch({ selection: { anchor: 2 } })
    expect(lines(view)[1].textContent).toBe('=====')
  })

  it('styles quotes and hides the quote mark off the line', () => {
    const view = open('> quoted\ntail§')
    expect(lines(view)[0].classList.contains('cm-md-quote')).toBe(true)
    expect(lines(view)[0].textContent).toBe('quoted')

    view.dispatch({ selection: { anchor: 4 } })
    expect(lines(view)[0].textContent).toBe('> quoted')
  })

  it('draws bullets for unordered lists only, and only off the line', () => {
    const view = open('- a\n* b\n+ c\n1. d\ntail§')
    // The bullet takes the marker's space too: both sit in one fixed box.
    expect(lines(view).slice(0, 3).map((l) => l.textContent)).toEqual(['•a', '•b', '•c'])
    expect(lines(view)[3].textContent).toBe('1. d')
    expect(view.contentDOM.querySelectorAll('.cm-md-bullet')).toHaveLength(3)

    view.dispatch({ selection: { anchor: 1 } })
    expect(lines(view)[0].textContent).toBe('- a')
  })

  it('hides the list mark of task items instead of drawing a bullet', () => {
    const view = open('- [ ] todo\ntail§')
    expect(view.contentDOM.querySelector('.cm-md-bullet')).toBeNull()
    expect(lines(view)[0].textContent).toBe('[ ] todo')
  })

  it('decorates fenced and indented code blocks and hides the fences with the cursor outside', () => {
    const view = open('```js\nconst a = 1\n```\n\n    indented\n\ntail§')
    const [open_, body, close, , indented] = lines(view)
    expect(open_.textContent).toBe('')
    expect(close.textContent).toBe('')
    expect(body.textContent).toBe('const a = 1')
    expect(open_.classList.contains('cm-md-fence-hidden')).toBe(true)
    expect(open_.classList.contains('cm-md-fence')).toBe(true)
    expect(close.classList.contains('cm-md-fence')).toBe(true)
    expect(open_.classList.contains('cm-md-codeblock-first')).toBe(true)
    expect(close.classList.contains('cm-md-codeblock-last')).toBe(true)
    expect(body.classList.contains('cm-md-codeblock')).toBe(true)
    expect(body.classList.contains('cm-md-fence')).toBe(false)
    expect(indented.classList.contains('cm-md-codeblock')).toBe(true)
    expect(view.state.doc.toString()).toBe('```js\nconst a = 1\n```\n\n    indented\n\ntail')
  })

  it('shows the fences while the cursor is in the code block', () => {
    const view = open('```js\nconst§ a = 1\n```\n\ntail')
    const [open_, , close] = lines(view)
    expect(open_.textContent).toBe('```js')
    expect(close.textContent).toBe('```')
    expect(open_.classList.contains('cm-md-fence-hidden')).toBe(false)
  })

  it('leaves images and tables to the block preview, and styles bare inline HTML', () => {
    const text = '![alt](pic.png)\n\n| a | b |\n|---|---|\n| **1** | 2 |\n\n<b>raw</b>\n\ntail§'
    const view = open(text)
    const all = lines(view).map((l) => l.textContent)
    expect(all[0]).toBe('![alt](pic.png)')
    expect(all[2]).toBe('| a | b |')
    expect(all[4]).toBe('| **1** | 2 |')
    expect(all[6]).toBe('raw')
    expect(lines(view)[6].querySelector('.cm-md-strong').textContent).toBe('raw')
  })

  it('never changes the document', () => {
    const text = '# H\n\n**b** [t](https://a.com)\n\n> q\n\n- a\n\n```\nc\n```\ntail§'
    const view = open(text)
    expect(view.state.doc.toString()).toBe(text.replace('§', ''))
  })

  it('keeps the previous decorations while composing', () => {
    const view = open('**b** x\ntail§')
    expect(lines(view)[0].textContent).toBe('b x')
    view.inputState.composing = 1
    view.dispatch({ selection: { anchor: 3 } })
    expect(lines(view)[0].textContent).toBe('b x')
    view.inputState.composing = -1
    view.dispatch({ selection: { anchor: 2 } })
    expect(lines(view)[0].textContent).toBe('**b** x')
  })

  describe('links', () => {
    function linkEl(view) {
      return view.contentDOM.querySelector('.cm-md-link')
    }

    it('opens http(s) and mailto links on Ctrl+click and Cmd+click', () => {
      const open_ = vi.spyOn(window, 'open').mockReturnValue(null)
      const view = open('[a](https://example.com) [m](mailto:x@y.com) [h](http://e.com)\ntail§')
      const [a, m, h] = view.contentDOM.querySelectorAll('.cm-md-link')

      fireEvent.click(a, { ctrlKey: true })
      expect(open_).toHaveBeenLastCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
      fireEvent.click(m, { metaKey: true })
      expect(open_).toHaveBeenLastCalledWith('mailto:x@y.com', '_blank', 'noopener,noreferrer')
      fireEvent.click(h, { ctrlKey: true })
      expect(open_).toHaveBeenLastCalledWith('http://e.com', '_blank', 'noopener,noreferrer')
    })

    it('never opens javascript: or relative links, and a plain click only places the cursor', () => {
      const open_ = vi.spyOn(window, 'open').mockReturnValue(null)
      const view = open('[j](javascript:alert(1)) [r](./a.md) [h](https://example.com)\ntail§')
      const [j, r, h] = view.contentDOM.querySelectorAll('.cm-md-link')

      fireEvent.click(j, { ctrlKey: true })
      fireEvent.click(r, { ctrlKey: true })
      fireEvent.click(h)
      expect(open_).not.toHaveBeenCalled()
      expect(linkEl(view)).toBeTruthy()
    })

    it('opens autolinks and bare URLs', () => {
      const open_ = vi.spyOn(window, 'open').mockReturnValue(null)
      const view = open('<https://a.com> https://b.com\ntail§')
      const els = view.contentDOM.querySelectorAll('.cm-md-link')

      fireEvent.click(els[0], { ctrlKey: true })
      expect(open_).toHaveBeenLastCalledWith('https://a.com', '_blank', 'noopener,noreferrer')
      fireEvent.click(els[els.length - 1], { ctrlKey: true })
      expect(open_).toHaveBeenLastCalledWith('https://b.com', '_blank', 'noopener,noreferrer')
    })
  })
})
