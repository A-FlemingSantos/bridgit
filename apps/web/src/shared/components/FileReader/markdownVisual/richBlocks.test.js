import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { frontMatter } from './frontMatter.js'
import { richBlocks } from './richBlocks.js'

const views = []

// Parses the whole document first, then moves the cursor so the field rebuilds from the finished tree.
function mount(doc, cursor = doc.length) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const state = EditorState.create({
    doc,
    selection: { anchor: 0 },
    extensions: [markdown({ base: markdownLanguage, extensions: [frontMatter] }), richBlocks()],
  })
  ensureSyntaxTree(state, doc.length, 5000)
  const view = new EditorView({ state, parent })
  views.push(view)
  view.dispatch({ selection: { anchor: cursor } })
  return view
}

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

afterEach(() => {
  views.splice(0).forEach((view) => view.destroy())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('richBlocks', () => {
  it('dims front matter lines and lifts the dimming while the cursor is inside', () => {
    const doc = '---\ntitle: Oi\n---\n\ntexto'
    const view = mount(doc)
    expect(view.dom.querySelectorAll('.cm-md-frontmatter')).toHaveLength(3)
    expect(view.dom.querySelector('.cm-md-frontmatter-active')).toBeNull()
    view.dispatch({ selection: { anchor: 6 } })
    expect(view.dom.querySelectorAll('.cm-md-frontmatter-active')).toHaveLength(3)
    expect(view.state.doc.toString()).toBe(doc)
  })

  it('previews an HTML block sanitized, with no script, handler or unsafe URL', async () => {
    const doc = [
      '<div style="color:red">',
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(2)>',
      '<a href="javascript:alert(3)">link</a>',
      '<a href="https://example.com">ok</a>',
      '<iframe src="https://example.com"></iframe>',
      '<form action="https://example.com"><input name="a"></form>',
      '</div>',
      '',
      'texto',
    ].join('\n')
    const view = mount(doc)
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-md-html')).not.toBeNull())
    const preview = view.dom.querySelector('.cm-md-html')
    expect(preview.querySelector('script')).toBeNull()
    expect(preview.querySelector('iframe, form, input')).toBeNull()
    expect(preview.innerHTML).not.toMatch(/onerror|javascript:|style=/i)
    const links = [...preview.querySelectorAll('a')]
    expect(links.find((a) => a.textContent === 'link').hasAttribute('href')).toBe(false)
    expect(links.find((a) => a.textContent === 'ok').getAttribute('href')).toBe('https://example.com')
    for (const element of preview.querySelectorAll('*')) {
      expect([...element.attributes].some((attr) => attr.name.startsWith('on'))).toBe(false)
    }
    expect(view.state.doc.toString()).toBe(doc)
  })

  it('shows the HTML block as raw text while the cursor is inside it', async () => {
    const doc = '<div>\nola\n</div>\n\ntexto'
    const view = mount(doc)
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-md-html')).not.toBeNull())
    view.dispatch({ selection: { anchor: 7 } })
    expect(view.dom.querySelector('.cm-md-html')).toBeNull()
    expect(view.dom.textContent).toContain('<div>')
  })

  it('places the cursor in the source when the preview is clicked', async () => {
    const doc = 'antes\n\n<div>\nola\n</div>\n\ndepois'
    const view = mount(doc)
    await vi.waitFor(() => expect(view.dom.querySelector('.cm-md-html')).not.toBeNull())
    view.dom
      .querySelector('.cm-md-html')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    expect(view.state.selection.main.head).toBe(7)
    expect(view.dom.querySelector('.cm-md-html')).toBeNull()
  })

  it('copies only the code of a fenced block and leaves doc and selection alone', () => {
    const writeText = mockClipboard()
    const doc = 'texto\n\n```js title\nconst a = 1\nconst b = 2\n```\n\nfim'
    const view = mount(doc, 2)
    const button = view.dom.querySelector('.cm-md-copy')
    expect(button).not.toBeNull()
    const selection = view.state.selection
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(writeText).toHaveBeenCalledWith('const a = 1\nconst b = 2')
    expect(view.state.doc.toString()).toBe(doc)
    expect(view.state.selection.eq(selection)).toBe(true)
  })

  it('shows the copy button while the mouse is over any line of its block', () => {
    const doc = 'texto\n\n```js\nconst a = 1\nconst b = 2\n```\n\nfim'
    const view = mount(doc, 0)
    const button = view.dom.querySelector('.cm-md-copy')
    // jsdom has no layout, so the position under the mouse comes from a stub.
    const posAtCoords = vi.spyOn(view, 'posAtCoords')

    posAtCoords.mockReturnValue(doc.indexOf('const b'))
    view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(button.classList.contains('cm-md-copy-shown')).toBe(true)

    posAtCoords.mockReturnValue(doc.indexOf('fim'))
    view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(button.classList.contains('cm-md-copy-shown')).toBe(false)

    posAtCoords.mockReturnValue(doc.indexOf('const a'))
    view.contentDOM.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    view.contentDOM.dispatchEvent(new MouseEvent('mouseleave'))
    expect(button.classList.contains('cm-md-copy-shown')).toBe(false)
  })

  it('shows the copy button over the opening and closing fence lines too', () => {
    const doc = 'texto\n\n```js\nconst a = 1\n```\n\nfim'
    const view = mount(doc, 0)
    const button = view.dom.querySelector('.cm-md-copy')
    const lines = [...view.contentDOM.querySelectorAll('.cm-line')]

    lines[4].dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(button.classList.contains('cm-md-copy-shown')).toBe(true)

    lines[6].dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(button.classList.contains('cm-md-copy-shown')).toBe(false)

    lines[2].dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
    expect(button.classList.contains('cm-md-copy-shown')).toBe(true)
  })

  it('copies an unclosed fence up to the end and an empty fence as empty text', () => {
    const writeText = mockClipboard()
    mount('```\nabc', 0).dom.querySelector('.cm-md-copy').click()
    expect(writeText).toHaveBeenLastCalledWith('abc')
    mount('```\n```', 0).dom.querySelector('.cm-md-copy').click()
    expect(writeText).toHaveBeenLastCalledWith('')
  })
})
