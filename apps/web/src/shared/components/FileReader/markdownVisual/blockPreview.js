import { syntaxTree } from '@codemirror/language'
import { StateField } from '@codemirror/state'
import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { activeSelectionChanged, touchesSelection } from './activeSelection.js'
import { closingTag, openingTagName } from './inlineHtml.js'

// Rendered elements for the Visualizar mode: rule, task checkbox, image and table. Each one shows only while no
// selection range touches its node and gives way to the raw markdown when the cursor comes in. The text is never
// rewritten here, except by the explicit click on a checkbox.

const SVG_NS = 'http://www.w3.org/2000/svg'

// Only absolute https URLs are loaded: the file lives in the cloud, so relative paths have nothing to resolve
// against, and http:/data: would leak requests or inline payloads.
const SECURE_URL = /^https:\/\//i

function child(node, name) {
  for (let current = node.firstChild; current; current = current.nextSibling) {
    if (current.name === name) return current
  }
  return null
}

class RuleWidget extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    // Padding, not margin: block widgets are measured by their box, and margins would not count.
    const box = document.createElement('div')
    box.className = 'cm-md-hr'
    const line = document.createElement('div')
    line.className = 'cm-md-hr-line'
    box.append(line)
    return box
  }
}

class TaskWidget extends WidgetType {
  constructor(checked, interactive) {
    super()
    this.checked = checked
    // Not `editable`: that name is a getter on WidgetType.
    this.interactive = interactive
  }

  eq(other) {
    return other.checked === this.checked && other.interactive === this.interactive
  }

  toDOM(view) {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-md-task'
    box.checked = this.checked
    box.disabled = !this.interactive
    box.setAttribute('aria-label', 'Tarefa')
    // The editor must not move the cursor into the marker (that would bring the raw text back) on a click.
    box.addEventListener('mousedown', (event) => event.preventDefault())
    box.addEventListener('click', (event) => {
      // The document decides the state; the widget is redrawn from it.
      event.preventDefault()
      if (!this.interactive) return
      const at = view.posAtDOM(box)
      if (!/^\[[ xX]\]$/.test(view.state.sliceDoc(at, at + 3))) return
      view.dispatch({ changes: { from: at + 1, to: at + 2, insert: this.checked ? ' ' : 'x' } })
    })
    return box
  }

  ignoreEvent() {
    return true
  }
}

// Lucide shapes drawn inline, so no icon dependency is needed: [element, attributes] pairs.
const ALERT_SHAPES = [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['line', { x1: '12', x2: '12', y1: '8', y2: '12' }],
  ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16' }],
]
const TRASH_SHAPES = [
  ['path', { d: 'M3 6h18' }],
  ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
  ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
  ['line', { x1: '10', x2: '10', y1: '11', y2: '17' }],
  ['line', { x1: '14', x2: '14', y1: '11', y2: '17' }],
]

function icon(shapes) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  const attributes = { viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor' }
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value)
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  for (const [name, shape] of shapes) {
    const element = document.createElementNS(SVG_NS, name)
    for (const [key, value] of Object.entries(shape)) element.setAttribute(key, value)
    svg.append(element)
  }
  return svg
}

// Takes the image's markdown out of the document; its line goes too when nothing else was on it. A normal
// transaction, so it can be undone and is saved like any edit.
function removeImage(view, at) {
  let node = syntaxTree(view.state).resolveInner(at, 1)
  while (node && node.name !== 'Image') node = node.parent
  if (!node) return
  const { doc } = view.state
  const line = doc.lineAt(node.from)
  const alone = !doc.sliceString(line.from, node.from).trim() && !doc.sliceString(node.to, line.to).trim()
  let from = node.from
  let to = node.to
  if (alone) {
    from = line.from
    to = line.to < doc.length ? line.to + 1 : line.to
    if (to === line.to && line.from > 0) from = line.from - 1
  }
  view.dispatch({ changes: { from, to }, userEvent: 'delete' })
  view.focus()
}

// What shows instead of an image that does not load (not https, or broken): a bar across the column, with a
// trash button on hover that removes the image when the file can be edited.
function imagePlaceholder(view, alt, removable) {
  const box = document.createElement('div')
  box.className = 'cm-md-image-missing'
  if (alt) box.title = alt
  const label = document.createElement('span')
  label.className = 'cm-md-image-missing-label'
  label.textContent = 'Não foi possível carregar a imagem'
  box.append(icon(ALERT_SHAPES), label)
  if (removable) {
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'cm-md-image-remove'
    remove.setAttribute('aria-label', 'Remover imagem')
    remove.title = 'Remover imagem'
    remove.append(icon(TRASH_SHAPES))
    remove.addEventListener('mousedown', (event) => event.preventDefault())
    remove.addEventListener('click', (event) => {
      event.preventDefault()
      removeImage(view, view.posAtDOM(box))
    })
    box.append(remove)
  }
  return box
}

class ImageWidget extends WidgetType {
  // `url` is null for anything that is not a plain https image, and then the placeholder shows.
  constructor(url, alt, removable) {
    super()
    this.url = url
    this.alt = alt
    this.removable = removable
  }

  eq(other) {
    return other.url === this.url && other.alt === this.alt && other.removable === this.removable
  }

  toDOM(view) {
    if (!this.url) return imagePlaceholder(view, this.alt, this.removable)
    const image = document.createElement('img')
    image.className = 'cm-md-image'
    image.setAttribute('loading', 'lazy')
    image.setAttribute('referrerpolicy', 'no-referrer')
    image.alt = this.alt
    image.src = this.url
    // A broken link reads the same as a blocked one.
    image.addEventListener('error', () => image.replaceWith(imagePlaceholder(view, this.alt, this.removable)), { once: true })
    return image
  }

  // The trash button handles its own clicks; anywhere else the editor places the cursor (showing the source).
  ignoreEvent(event) {
    return Boolean(event.target instanceof Element && event.target.closest('.cm-md-image-remove'))
  }
}

class TableWidget extends WidgetType {
  // `rows` is [{ header, cells: [{ parts, offset }] }], offsets counted from the start of the table's source;
  // `parts` are [{ text, tags }] runs of the cell's text with the inline formatting around each one.
  constructor(rows, aligns) {
    super()
    this.rows = rows
    this.aligns = aligns
    this.key = JSON.stringify([rows, aligns])
  }

  eq(other) {
    return other.key === this.key
  }

  toDOM(view) {
    const wrap = document.createElement('div')
    wrap.className = 'cm-md-table-wrap'
    const table = document.createElement('table')
    table.className = 'cm-md-table'
    const head = document.createElement('thead')
    const body = document.createElement('tbody')
    const offsets = new Map()

    for (const row of this.rows) {
      const tr = document.createElement('tr')
      row.cells.forEach((cell, index) => {
        const td = document.createElement(row.header ? 'th' : 'td')
        // Elements built here, text only through textContent: what the author typed never becomes markup.
        for (const part of cell.parts) {
          let host = td
          for (const tag of part.tags) host = host.appendChild(document.createElement(tag))
          host.append(document.createTextNode(part.text))
        }
        if (this.aligns[index]) td.style.textAlign = this.aligns[index]
        offsets.set(td, cell.offset)
        tr.append(td)
      })
      ;(row.header ? head : body).append(tr)
    }
    table.append(head, body)
    wrap.append(table)

    // A click opens the source at the clicked cell (the cursor entering turns the table back into text).
    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault()
      const cell = event.target instanceof Element ? event.target.closest('td, th') : null
      const at = view.posAtDOM(wrap) + (cell ? (offsets.get(cell) ?? 0) : 0)
      view.dispatch({ selection: { anchor: Math.min(at, view.state.doc.length) }, scrollIntoView: true })
      view.focus()
    })
    return wrap
  }

  ignoreEvent() {
    return true
  }
}

// Inline formatting a cell keeps, as the element each node becomes; links read as underlined text.
const CELL_TAGS = {
  Emphasis: 'em',
  StrongEmphasis: 'strong',
  InlineCode: 'code',
  Strikethrough: 's',
  Insert: 'u',
  Link: 'u',
}
const CELL_MARKS = /^(EmphasisMark|CodeMark|StrikethroughMark|InsertMark|LinkMark|URL|LinkTitle|LinkLabel)$/

// The text of a cell in runs, without its inline markers (emphasis, code ticks, link syntax, escapes).
function cellParts(state, cell) {
  const parts = []
  const push = (from, to, tags) => {
    if (from < to) parts.push({ text: state.sliceDoc(from, to), tags })
  }
  // Walks the nodes from `first` within [from, to]; a bare inline HTML pair (`<b>…</b>`) wraps what it holds
  // in an element of the same (known, fixed) name, and its tags go.
  const walk = (first, from, to, tags) => {
    let at = from
    for (let child = first; child && child.from < to; child = child.nextSibling) {
      push(at, child.from, tags)
      const name = child.name === 'HTMLTag' ? openingTagName(state.sliceDoc(child.from, child.to)) : null
      const close = name ? closingTag(state, child, name) : null
      if (close) {
        walk(child.nextSibling, child.to, close.from, [...tags, name])
        child = close
      } else if (child.name === 'Escape') {
        push(child.from + 1, child.to, tags)
      } else if (!CELL_MARKS.test(child.name)) {
        walk(child.firstChild, child.from, child.to, CELL_TAGS[child.name] ? [...tags, CELL_TAGS[child.name]] : tags)
      }
      at = child.to
    }
    push(at, to, tags)
  }
  walk(cell.firstChild, cell.from, cell.to, [])
  if (parts.length) {
    parts[0].text = parts[0].text.trimStart()
    parts[parts.length - 1].text = parts[parts.length - 1].text.trimEnd()
  }
  return parts.filter((part) => part.text)
}

// Column alignment from the delimiter row (`:--`, `:-:`, `--:`).
function columnAligns(text) {
  return text
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => {
      const mark = cell.trim()
      if (mark.startsWith(':') && mark.endsWith(':')) return 'center'
      if (mark.endsWith(':')) return 'right'
      if (mark.startsWith(':')) return 'left'
      return ''
    })
}

function tableWidget(state, table, origin) {
  const rows = []
  let aligns = []
  for (let part = table.firstChild; part; part = part.nextSibling) {
    if (part.name === 'TableDelimiter') {
      aligns = columnAligns(state.sliceDoc(part.from, part.to))
    } else if (part.name === 'TableHeader' || part.name === 'TableRow') {
      const cells = []
      for (let cell = part.firstChild; cell; cell = cell.nextSibling) {
        if (cell.name === 'TableCell') cells.push({ parts: cellParts(state, cell), offset: cell.from - origin })
      }
      rows.push({ header: part.name === 'TableHeader', cells })
    }
  }
  return new TableWidget(rows, aligns)
}

function imageParts(state, image) {
  const marks = []
  for (let part = image.firstChild; part; part = part.nextSibling) {
    if (part.name === 'LinkMark') marks.push(part)
  }
  const alt = marks.length > 1 ? state.sliceDoc(marks[0].to, marks[1].from).replace(/\s+/g, ' ').trim() : ''
  const target = child(image, 'URL')
  // Reference-style images (`![a][ref]`) have no URL of their own to load.
  const url = target ? state.sliceDoc(target.from, target.to).replace(/^<|>$/g, '') : ''
  return { alt, url: SECURE_URL.test(url) ? url : null }
}

function buildDecorations(state, editable) {
  const ranges = []

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === 'HorizontalRule') {
        const line = state.doc.lineAt(node.from)
        // Inside a list or quote there is a prefix on the line that a block replacement would swallow.
        if (state.sliceDoc(line.from, node.from).trim() === '' && !touchesSelection(state, line.from, line.to)) {
          ranges.push(Decoration.replace({ widget: new RuleWidget(), block: true }).range(line.from, line.to))
        }
        return false
      }

      if (node.name === 'Table') {
        const first = state.doc.lineAt(node.from)
        const last = state.doc.lineAt(node.to)
        if (state.sliceDoc(first.from, node.from).trim() === '' && !touchesSelection(state, first.from, last.to)) {
          const widget = tableWidget(state, node.node, first.from)
          ranges.push(Decoration.replace({ widget, block: true }).range(first.from, last.to))
        }
        // Its cells are plain text either way: an image inside raw table text stays raw.
        return false
      }

      if (node.name === 'TaskMarker') {
        const checked = /[xX]/.test(state.sliceDoc(node.from, node.to))
        if (!touchesSelection(state, node.from, node.to)) {
          ranges.push(Decoration.replace({ widget: new TaskWidget(checked, editable) }).range(node.from, node.to))
        }
        const task = node.node.parent
        if (checked && task && task.to > node.to) ranges.push(Decoration.mark({ class: 'cm-md-task-done' }).range(node.to, task.to))
        return false
      }

      if (node.name === 'Image') {
        if (!touchesSelection(state, node.from, node.to)) {
          const { alt, url } = imageParts(state, node.node)
          ranges.push(Decoration.replace({ widget: new ImageWidget(url, alt, editable) }).range(node.from, node.to))
        }
        return false
      }
    },
  })

  return Decoration.set(ranges, true)
}

const previewTheme = EditorView.baseTheme({
  '&.cm-md-visual .cm-md-hr': { padding: '9px 16px' },
  '&.cm-md-visual .cm-md-hr-line': { height: '1px', backgroundColor: 'var(--code-line-number)' },

  '&.cm-md-visual .cm-md-task': {
    margin: '0 6px 0 0',
    verticalAlign: 'middle',
    accentColor: 'var(--ink)',
    cursor: 'pointer',
  },
  '&.cm-md-visual .cm-md-task:disabled': { cursor: 'default' },
  // Opacity rather than color: the syntax highlight sets its own colors on the inner spans.
  '&.cm-md-visual .cm-md-task-done': { opacity: '0.55' },

  '&.cm-md-visual .cm-md-image': { maxWidth: '100%', height: 'auto', verticalAlign: 'middle' },
  '&.cm-md-visual .cm-md-image-missing': {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    boxSizing: 'border-box',
    margin: '4px 0',
    padding: '10px 12px 10px 14px',
    borderRadius: '6px',
    backgroundColor: 'color-mix(in srgb, var(--ink) 6%, transparent)',
    color: 'var(--mute)',
    fontFamily: 'var(--type)',
    fontSize: '13px',
    lineHeight: '20px',
  },
  '&.cm-md-visual .cm-md-image-missing-label': { flex: '1 1 auto', color: 'var(--ink)' },
  '&.cm-md-visual .cm-md-image-remove': {
    display: 'flex',
    padding: '2px',
    border: 'none',
    background: 'none',
    color: 'var(--mute)',
    cursor: 'pointer',
    opacity: '0',
    transition: 'opacity 0.15s',
  },
  '&.cm-md-visual .cm-md-image-missing:hover .cm-md-image-remove, &.cm-md-visual .cm-md-image-remove:focus-visible': {
    opacity: '1',
  },
  '&.cm-md-visual .cm-md-image-remove:hover': { color: 'var(--ink)' },

  // Padding, not margin, for the same measuring reason as the rule.
  '&.cm-md-visual .cm-md-table-wrap': { padding: '4px 16px', overflowX: 'auto', cursor: 'text' },
  '&.cm-md-visual .cm-md-table': { borderCollapse: 'collapse', color: 'var(--code-text)' },
  '&.cm-md-visual .cm-md-table th, &.cm-md-visual .cm-md-table td': {
    padding: '4px 12px',
    // Faint rules, and every cell (the header row too) on the page's own background.
    border: '1px solid color-mix(in srgb, var(--ink) 12%, transparent)',
    textAlign: 'left',
  },
  '&.cm-md-visual .cm-md-table th': { fontWeight: 'bold' },
  '&.cm-md-visual .cm-md-table code': {
    fontFamily: 'var(--mono)',
    fontSize: '0.9em',
    padding: '1px 4px',
    borderRadius: '3px',
    backgroundColor: 'color-mix(in srgb, var(--ink) 8%, transparent)',
  },
  '&.cm-md-visual .cm-md-table s': { color: 'var(--code-comment)' },
  '&.cm-md-visual .cm-md-table u, &.cm-md-visual .cm-md-table ins': { textUnderlineOffset: '3px' },
  '&.cm-md-visual .cm-md-table kbd': {
    fontFamily: 'var(--mono)',
    fontSize: '0.85em',
    padding: '0 4px',
    border: '1px solid var(--code-line-number)',
    borderBottomWidth: '2px',
    borderRadius: '4px',
  },
})

// Block and height-changing decorations must come from a StateField (a ViewPlugin may not provide them).
export function blockPreview({ editable }) {
  const field = StateField.define({
    create: (state) => buildDecorations(state, editable),
    update(decorations, transaction) {
      // The parse also moves on in the background, so a changed tree rebuilds too.
      const moved =
        transaction.docChanged ||
        transaction.selection ||
        activeSelectionChanged(transaction) ||
        syntaxTree(transaction.state) !== syntaxTree(transaction.startState)
      return moved ? buildDecorations(transaction.state, editable) : decorations
    },
    provide: (self) => EditorView.decorations.from(self),
  })
  return [field, previewTheme]
}
