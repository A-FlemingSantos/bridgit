import { syntaxTree } from '@codemirror/language'
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import { activeSelectionChanged, touchesSelection } from './activeSelection.js'

// Front matter, HTML blocks and the code copy button. All of them only decorate: the document is never
// rewritten. They come from a StateField because the HTML widget is a block that changes line heights.

const SAFE_URL = /^(?:https?:|mailto:)/i
const URL_ATTRIBUTES = ['href', 'src', 'poster', 'cite', 'action', 'formaction', 'xlink:href']

// DOMPurify is only imported once a document actually holds an HTML block, so it ships with markdown only.
let purify = null
let purifyLoading = null

function createPurify(createDOMPurify) {
  // Own instance so these hooks do not leak into any other use of DOMPurify.
  const instance = createDOMPurify(window)
  instance.addHook('afterSanitizeAttributes', (node) => {
    // Anything that is not http, https or mailto goes (javascript:, data:, relative paths).
    for (const name of URL_ATTRIBUTES) {
      if (node.hasAttribute?.(name) && !SAFE_URL.test(node.getAttribute(name).trim())) node.removeAttribute(name)
    }
    // Same as the markdown images: only https loads, and a remote picture never gets to tell the host which
    // page asked for it.
    if (node.tagName === 'IMG') {
      if (node.hasAttribute('src') && !/^https:\/\//i.test(node.getAttribute('src').trim())) node.removeAttribute('src')
      node.setAttribute('referrerpolicy', 'no-referrer')
      node.setAttribute('loading', 'lazy')
    }
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  return instance
}

function loadPurify() {
  purifyLoading ??= import('dompurify').then((module) => {
    purify = createPurify(module.default)
  })
  return purifyLoading
}

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  FORBID_TAGS: [
    'style', 'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button',
    'textarea', 'select', 'option', 'link', 'meta', 'base', 'svg', 'math',
  ],
  FORBID_ATTR: ['style', 'srcset', 'srcdoc'],
  ALLOWED_URI_REGEXP: SAFE_URL,
  RETURN_DOM_FRAGMENT: true,
}

// Dispatched when DOMPurify finishes loading, so the raw HTML text swaps for its preview.
const purifyReady = StateEffect.define()

class HtmlBlockWidget extends WidgetType {
  constructor(html) {
    super()
    this.html = html
  }

  eq(other) {
    return other.html === this.html
  }

  toDOM(view) {
    const dom = document.createElement('div')
    dom.className = 'cm-md-html'
    dom.appendChild(purify.sanitize(this.html, PURIFY_CONFIG))
    // Clicking the preview opens the source so it can be edited; links never navigate on a plain click.
    dom.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || (event.target.closest?.('a') && (event.ctrlKey || event.metaKey))) return
      // A <details> summary opens and closes its block instead.
      if (event.target.closest?.('summary')) return
      event.preventDefault()
      view.dispatch({ selection: { anchor: view.posAtDOM(dom) } })
      view.focus()
    })
    dom.addEventListener('click', (event) => {
      if (event.target.closest?.('a') && !(event.ctrlKey || event.metaKey)) event.preventDefault()
    })
    return dom
  }

  ignoreEvent() {
    return true
  }
}

// The code between the fences, found from the tree when clicked so the widget itself carries no text and
// stays equal (and reusable) across edits.
function fencedCodeText(state, node) {
  const doc = state.doc
  const open = doc.lineAt(node.from)
  const marks = []
  for (let child = node.firstChild; child; child = child.nextSibling) if (child.name === 'CodeMark') marks.push(child)
  const closed = marks.length > 1
  const end = closed ? doc.lineAt(marks[marks.length - 1].from).from - 1 : node.to
  return open.to + 1 > end ? '' : doc.sliceString(open.to + 1, end)
}

const SVG_NS = 'http://www.w3.org/2000/svg'
// Lucide's "copy" and "check", drawn inline so no icon dependency is needed.
const COPY_SHAPES = [
  ['rect', { x: '8', y: '8', width: '14', height: '14', rx: '2', ry: '2' }],
  ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
]
const CHECK_SHAPES = [['path', { d: 'M20 6 9 17l-5-5' }]]

function icon(shapes) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  const attributes = {
    viewBox: '0 0 24 24',
    width: '14',
    height: '14',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value)
  for (const [name, shape] of shapes) {
    const element = document.createElementNS(SVG_NS, name)
    for (const [key, value] of Object.entries(shape)) element.setAttribute(key, value)
    svg.append(element)
  }
  return svg
}

class CopyCodeWidget extends WidgetType {
  eq() {
    return true
  }

  toDOM(view) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'cm-md-copy'
    button.append(icon(COPY_SHAPES))
    button.setAttribute('aria-label', 'Copiar código')
    button.title = 'Copiar código'
    // Keeps focus and the cursor where they were: copying must not touch the editor.
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      let node = syntaxTree(view.state).resolveInner(view.posAtDOM(button), -1)
      while (node && node.name !== 'FencedCode') node = node.parent
      if (!node) return
      Promise.resolve(navigator.clipboard?.writeText(fencedCodeText(view.state, node))).catch(() => {})
      // A check for a moment confirms the copy, then the copy icon comes back.
      button.replaceChildren(icon(CHECK_SHAPES))
      setTimeout(() => button.replaceChildren(icon(COPY_SHAPES)), 1200)
    })
    return button
  }

  ignoreEvent() {
    return true
  }
}

const copyWidget = Decoration.widget({ widget: new CopyCodeWidget(), side: 1 })

const HIDDEN_LINE = Decoration.replace({})
const HIDDEN_BLOCK = Decoration.replace({ block: true })
const VOID_TAGS = new Set(['area', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const OPEN_TAG = /^\s*<([a-z][\w-]*)\b[^>]*>/i

// Markdown cuts an HTML block at its first blank line, so `<details>` … `</details>` with paragraphs in between
// arrives as several blocks. These are the top-level nodes of one such element, from its opening block to the
// block that closes it, as long as only paragraphs sit in between.
function htmlGroup(state, nodes, index) {
  const tag = OPEN_TAG.exec(state.sliceDoc(nodes[index].from, nodes[index].to))?.[1]?.toLowerCase()
  if (!tag || VOID_TAGS.has(tag)) return 1
  const closing = new RegExp(`</${tag}\\s*>`, 'i')
  if (closing.test(state.sliceDoc(nodes[index].from, nodes[index].to))) return 1
  for (let next = index + 1; next < nodes.length; next++) {
    const node = nodes[next]
    if (node.name === 'HTMLBlock' && closing.test(state.sliceDoc(node.from, node.to))) return next - index + 1
    if (node.name !== 'HTMLBlock' && node.name !== 'Paragraph') return 1
  }
  return 1
}

// The source handed to the sanitizer: HTML as written, paragraphs between the blocks as <p>.
function groupHtml(state, nodes) {
  return nodes
    .map((node) => {
      const text = state.sliceDoc(node.from, node.to)
      return node.name === 'HTMLBlock' ? text : `<p>${text}</p>`
    })
    .join('\n')
}

// Whether the sanitized HTML shows nothing (only a script, a lone closing tag…). Cached: every selection
// change rebuilds the decorations.
const emptyHtml = new Map()
function isEmptyHtml(html) {
  if (!emptyHtml.has(html)) {
    if (emptyHtml.size > 200) emptyHtml.clear()
    const fragment = purify.sanitize(html, PURIFY_CONFIG)
    emptyHtml.set(html, !fragment.textContent.trim() && !fragment.querySelector?.('img, hr, br, table'))
  }
  return emptyHtml.get(html)
}

function htmlDecorations(state, ranges) {
  const nodes = []
  for (let node = syntaxTree(state).topNode.firstChild; node; node = node.nextSibling) nodes.push(node)
  for (let index = 0; index < nodes.length; index++) {
    if (nodes[index].name !== 'HTMLBlock') continue
    const size = htmlGroup(state, nodes, index)
    const group = nodes.slice(index, index + size)
    index += size - 1
    const from = state.doc.lineAt(group[0].from).from
    const to = state.doc.lineAt(group[group.length - 1].to).to
    if (touchesSelection(state, from, to)) continue
    const html = groupHtml(state, group)
    // Nothing left after cleaning: the block takes no room at all instead of an empty gap.
    if (isEmptyHtml(html)) ranges.push(HIDDEN_BLOCK.range(from, to))
    else ranges.push(Decoration.replace({ widget: new HtmlBlockWidget(html), block: true }).range(from, to))
  }
}

function buildDecorations(state) {
  const ranges = []
  let wantsPurify = false
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'FrontMatter') {
        const active = touchesSelection(state, node.from, node.to)
        const first = state.doc.lineAt(node.from).number
        const last = state.doc.lineAt(node.to).number
        // Stays mono text either way; while the cursor is outside it is dimmed and its `---` lines go, leaving
        // them as slim edges (like the fences of a code block).
        const line = Decoration.line({ class: active ? 'cm-md-frontmatter cm-md-frontmatter-active' : 'cm-md-frontmatter' })
        const edge = Decoration.line({ class: 'cm-md-frontmatter cm-md-frontmatter-edge' })
        for (let n = first; n <= last; n++) {
          const current = state.doc.line(n)
          const delimiter = !active && (n === first || n === last)
          ranges.push((delimiter ? edge : line).range(current.from))
          if (delimiter && current.from < current.to) ranges.push(HIDDEN_LINE.range(current.from, current.to))
        }
        return false
      }
      if (node.name === 'HTMLBlock') {
        if (!purify) wantsPurify = true
        return false
      }
      if (node.name === 'FencedCode') {
        const open = state.doc.lineAt(node.from)
        ranges.push(Decoration.line({ class: 'cm-md-code-open' }).range(open.from))
        ranges.push(copyWidget.range(open.to))
      }
      return undefined
    },
  })
  // HTML blocks are read off the top level, where an element split by blank lines can be put back together.
  if (purify) htmlDecorations(state, ranges)
  return { decorations: Decoration.set(ranges, true), wantsPurify }
}

const richField = StateField.define({
  create: buildDecorations,
  update(value, tr) {
    const parsed = syntaxTree(tr.state) !== syntaxTree(tr.startState)
    if (tr.docChanged || tr.selection || parsed || activeSelectionChanged(tr) || tr.effects.some((effect) => effect.is(purifyReady))) {
      return buildDecorations(tr.state)
    }
    return value
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

// Starts the DOMPurify import the first time an HTML block shows up, then asks the field to rebuild.
const purifyLoader = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view
      this.requested = false
      this.destroyed = false
      this.check()
    }

    update() {
      this.check()
    }

    check() {
      if (this.requested || purify || !this.view.state.field(richField).wantsPurify) return
      this.requested = true
      // A failed import leaves the raw text; there is nothing better to show.
      loadPurify()
        .then(() => {
          if (!this.destroyed) this.view.dispatch({ effects: purifyReady.of(null) })
        })
        .catch(() => {})
    }

    destroy() {
      this.destroyed = true
    }
  },
)

// The opening line of the fenced block under the mouse, or null. It goes by the whole line under the mouse,
// so the block's slim top and bottom edges (the hidden fences) count as much as its code lines.
function hoveredBlockLine(view, event) {
  const { doc } = view.state
  const lineDom = event.target instanceof Element ? event.target.closest('.cm-line') : null
  const line = lineDom
    ? doc.lineAt(view.posAtDOM(lineDom))
    : doc.lineAt(view.posAtCoords({ x: event.clientX, y: event.clientY }, false))
  let start = null
  syntaxTree(view.state).iterate({
    from: line.from,
    to: line.to,
    enter(node) {
      if (start !== null) return false
      if (node.name === 'FencedCode') {
        start = doc.lineAt(node.from).from
        return false
      }
      return undefined
    },
  })
  return start
}

// The copy button shows while the mouse is anywhere over its code block, not only over the line it sits on.
const copyOnHover = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.view = view
      this.line = null
    }

    update() {
      // Widgets may be redrawn by an edit; the shown one follows the block still under the mouse.
      this.apply()
    }

    hover(line) {
      if (line === this.line) return
      this.line = line
      this.apply()
    }

    apply() {
      const { view, line } = this
      for (const button of view.contentDOM.querySelectorAll('.cm-md-copy')) {
        const shown = line !== null && view.state.doc.lineAt(view.posAtDOM(button)).from === line
        button.classList.toggle('cm-md-copy-shown', shown)
      }
    }
  },
  {
    eventHandlers: {
      mousemove(event, view) {
        this.hover(hoveredBlockLine(view, event))
      },
      mouseleave() {
        this.hover(null)
      },
    },
  },
)

// Every token below exists on the editor panel (CodeEditor.module.css) or in the app's theme.
const richTheme = EditorView.baseTheme({
  '&.cm-md-visual .cm-md-frontmatter': {
    fontFamily: 'var(--mono)',
    fontSize: '12px',
    color: 'var(--mute)',
  },
  '&.cm-md-visual .cm-md-frontmatter-active': { color: 'var(--code-text)' },
  '&.cm-md-visual .cm-md-frontmatter-edge': { lineHeight: '0.5em' },
  '&.cm-md-visual .cm-md-html': {
    // The same side padding as the text lines, so the preview sits in the reading column.
    padding: '4px 16px',
    // The editor keeps every newline (pre-wrap); in HTML the line breaks between tags are not text.
    whiteSpace: 'normal',
    color: 'var(--ink)',
    fontFamily: 'var(--type)',
    cursor: 'text',
    overflowWrap: 'anywhere',
  },
  '&.cm-md-visual .cm-md-html img': { maxWidth: '100%' },
  '&.cm-md-visual .cm-md-html a': { color: 'inherit', textDecoration: 'underline' },
  '&.cm-md-visual .cm-md-html > :first-child': { marginTop: '0' },
  '&.cm-md-visual .cm-md-html > :last-child': { marginBottom: '0' },
  '&.cm-md-visual .cm-md-html p': { margin: '0.4em 0' },
  '&.cm-md-visual .cm-md-html summary': { cursor: 'pointer' },
  '&.cm-md-visual .cm-md-code-open': { position: 'relative' },
  '&.cm-md-visual .cm-md-copy': {
    position: 'absolute',
    top: '0',
    right: '8px',
    display: 'flex',
    padding: '4px',
    border: 'none',
    borderRadius: '4px',
    background: 'var(--overlay)',
    color: 'var(--mute)',
    cursor: 'pointer',
    opacity: '0',
    transition: 'opacity 0.15s',
  },
  '&.cm-md-visual .cm-md-copy-shown, &.cm-md-visual .cm-md-copy:focus-visible': { opacity: '1' },
  '&.cm-md-visual .cm-md-copy:hover': { color: 'var(--ink)' },
})

// Read-only editors keep the same rendering: nothing here writes to the document, so `editable` is not needed.
export function richBlocks() {
  return [richField, purifyLoader, copyOnHover, richTheme]
}
