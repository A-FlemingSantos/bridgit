import { syntaxTree } from '@codemirror/language'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import { touchesSelection } from './activeSelection.js'
import { closingTag, INLINE_HTML_CLASSES, openingTagName } from './inlineHtml.js'

// Inline half of the markdown "Visualizar" mode: it only decorates the tree the markdown grammar already
// built (hidden marks, styled spans, line classes), so the document text is never touched. Marks come back
// as soon as the selection touches their node, which is how the user edits them.

// Only these schemes ever open from a Ctrl/Cmd+click; `javascript:` and relative paths never do.
const OPEN_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

// Image, Table, HTML and front matter belong to the block units.
const SKIPPED = new Set(['Image', 'Table', 'HTMLBlock', 'FrontMatter', 'LinkReference'])

const HIDDEN = Decoration.replace({})
const ATX_HEADING = /^ATXHeading([1-6])$/
const SETEXT_HEADING = /^SetextHeading([12])$/

class BulletWidget extends WidgetType {
  eq() {
    return true
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-md-bullet'
    span.textContent = '•'
    return span
  }
}

const BULLET = Decoration.replace({ widget: new BulletWidget() })

function safeHref(raw) {
  const href = (raw || '').trim()
  try {
    return OPEN_PROTOCOLS.has(new URL(href).protocol) ? href : null
  } catch {
    return null
  }
}

// How many list items hold this one (1 for a top-level item).
function listDepth(item) {
  let depth = 0
  for (let node = item; node; node = node.parent) if (node.name === 'ListItem') depth++
  return depth
}

function buildDecorations(view) {
  const { state } = view
  const { doc } = state
  const items = []
  const lineClasses = new Map()
  // List lines laid out by depth (see the end): { depth, first, contentFrom } by line start.
  const listLines = new Map()

  const touches = (from, to) => touchesSelection(state, from, to)
  const touchesLines = (from, to) => touches(doc.lineAt(from).from, doc.lineAt(to).to)
  const addLineClass = (line, cls) => {
    const list = lineClasses.get(line.from)
    if (list) list.push(cls)
    else lineClasses.set(line.from, [cls])
  }
  // A replace decoration from a plugin cannot cross a line break, so marks spanning lines stay visible.
  const hide = (from, to) => {
    if (from < to && doc.lineAt(from).to >= to) items.push(HIDDEN.range(from, to))
  }
  const hideWithSpace = (from, to) => hide(from, doc.sliceString(to, to + 1) === ' ' ? to + 1 : to)
  const mark = (from, to, cls, attributes) => {
    if (from < to) items.push(Decoration.mark({ class: cls, attributes }).range(from, to))
  }
  const eachLine = (from, to, clipFrom, clipTo, fn) => {
    let pos = Math.max(from, clipFrom)
    const end = Math.min(to, clipTo)
    while (pos <= end) {
      const line = doc.lineAt(pos)
      fn(line)
      pos = line.to + 1
    }
  }

  const hideChildMarks = (node, markName) => {
    if (touches(node.from, node.to)) return
    for (const child of node.node.getChildren(markName)) hide(child.from, child.to)
  }

  const linkNode = (node, href) => {
    mark(node.from, node.to, 'cm-md-link', href ? { 'data-md-href': href } : undefined)
  }

  const urlOf = (node) => {
    const url = node.node.getChild('URL')
    if (!url) return null
    const text = doc.sliceString(url.from, url.to)
    return text.startsWith('<') && text.endsWith('>') ? text.slice(1, -1) : text
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter(node) {
        const { name } = node
        if (SKIPPED.has(name)) return false

        const atx = ATX_HEADING.exec(name)
        if (atx) {
          eachLine(node.from, node.to, from, to, (line) => addLineClass(line, `cm-md-h${atx[1]}`))
          if (!touchesLines(node.from, node.to)) {
            const marks = node.node.getChildren('HeaderMark')
            marks.forEach((m, i) => (i === 0 ? hideWithSpace(m.from, m.to) : hide(m.from, m.to)))
          }
          return
        }

        const setext = SETEXT_HEADING.exec(name)
        if (setext) {
          const underline = node.node.getChildren('HeaderMark').pop()
          const underlineLine = underline ? doc.lineAt(underline.from) : null
          eachLine(node.from, node.to, from, to, (line) => {
            if (underlineLine && line.from === underlineLine.from) return
            addLineClass(line, `cm-md-h${setext[1]}`)
          })
          if (underline && !touchesLines(node.from, node.to)) {
            hide(underline.from, underline.to)
            addLineClass(underlineLine, 'cm-md-setext-rule')
          }
          return
        }

        switch (name) {
          case 'Emphasis':
            mark(node.from, node.to, 'cm-md-em')
            hideChildMarks(node, 'EmphasisMark')
            break
          case 'StrongEmphasis':
            mark(node.from, node.to, 'cm-md-strong')
            hideChildMarks(node, 'EmphasisMark')
            break
          case 'Strikethrough':
            mark(node.from, node.to, 'cm-md-strike')
            hideChildMarks(node, 'StrikethroughMark')
            break
          case 'Insert':
            mark(node.from, node.to, 'cm-md-ins')
            hideChildMarks(node, 'InsertMark')
            break
          case 'InlineCode':
            mark(node.from, node.to, 'cm-md-code')
            hideChildMarks(node, 'CodeMark')
            break
          case 'Link': {
            linkNode(node, urlOf(node))
            if (touches(node.from, node.to)) break
            // Keep the text between the first two marks; everything from the closing bracket on goes away.
            const marks = node.node.getChildren('LinkMark')
            if (marks.length >= 2) {
              hide(marks[0].from, marks[0].to)
              hide(marks[1].from, node.to)
            }
            break
          }
          case 'Autolink':
            linkNode(node, urlOf(node))
            hideChildMarks(node, 'LinkMark')
            break
          case 'HTMLTag': {
            const name = openingTagName(doc.sliceString(node.from, node.to))
            const close = name ? closingTag(state, node.node, name) : null
            if (!close) break
            mark(node.to, close.from, INLINE_HTML_CLASSES[name])
            if (!touches(node.from, close.to)) {
              hide(node.from, node.to)
              hide(close.from, close.to)
            }
            break
          }
          case 'URL': {
            // A bare (GFM) URL has no Link around it; the ones inside links were handled with their parent.
            const parent = node.node.parent?.name
            if (parent !== 'Link' && parent !== 'Autolink') linkNode(node, doc.sliceString(node.from, node.to))
            break
          }
          case 'Blockquote':
            eachLine(node.from, node.to, from, to, (line) => addLineClass(line, 'cm-md-quote'))
            break
          case 'QuoteMark':
            if (!touchesLines(node.from, node.to)) hideWithSpace(node.from, node.to)
            break
          case 'ListItem': {
            const listMark = node.node.getChild('ListMark')
            const line = listMark && doc.lineAt(listMark.from)
            // Inside a quote the line starts with `>`: it stays as typed.
            if (!line || doc.sliceString(line.from, listMark.from).trim()) break
            listLines.set(line.from, { depth: listDepth(node.node), first: true, contentFrom: listMark.from })
            break
          }
          case 'Paragraph': {
            // The item's text carried onto more source lines lines up under its first line.
            const item = node.node.parent
            if (item?.name !== 'ListItem') break
            const depth = listDepth(item)
            eachLine(node.from, node.to, from, to, (line) => {
              if (listLines.has(line.from)) return
              const indent = /^\s*/.exec(doc.sliceString(line.from, line.to))[0].length
              listLines.set(line.from, { depth, first: false, contentFrom: line.from + indent })
            })
            break
          }
          case 'ListMark': {
            const item = node.node.parent
            const line = doc.lineAt(node.from)
            const aligned = !doc.sliceString(line.from, node.from).trim()
            const active = touchesLines(node.from, node.to)
            // Task items get their checkbox from another unit, so no bullet next to it.
            if (item?.getChild('Task')) {
              if (!active) hideWithSpace(node.from, node.to)
              break
            }
            const bullet = item?.parent?.name === 'BulletList'
            if (!aligned) {
              if (bullet && !active) items.push(BULLET.range(node.from, node.to))
              break
            }
            // The marker and its space fill a fixed box, so every item's text starts at the same place.
            const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
            if (bullet && !active) items.push(BULLET.range(node.from, end))
            else mark(node.from, end, 'cm-md-li-marker')
            break
          }
          case 'FencedCode':
          case 'CodeBlock': {
            const fenced = name === 'FencedCode'
            const closed = fenced && node.node.getChildren('CodeMark').length > 1
            // Off the cursor the fences (and the language after them) go, leaving their lines as the block's
            // slim top and bottom edges; the copy button sits on the top one.
            const showFences = touches(node.from, node.to)
            eachLine(node.from, node.to, from, to, (line) => {
              addLineClass(line, 'cm-md-codeblock')
              if (line.from <= doc.lineAt(node.from).from) addLineClass(line, 'cm-md-codeblock-first')
              if (line.to >= doc.lineAt(node.to).to) addLineClass(line, 'cm-md-codeblock-last')
              if (fenced && (line.from === doc.lineAt(node.from).from || (closed && line.to >= doc.lineAt(node.to).to))) {
                addLineClass(line, 'cm-md-fence')
                if (!showFences) {
                  hide(line.from, line.to)
                  addLineClass(line, 'cm-md-fence-hidden')
                }
              }
            })
            // The grammar highlights the code text itself; nothing inside needs decorating.
            return false
          }
          default:
        }
      },
    })
  }

  // Lists: the typed indentation goes, and the depth sets a fixed indent with the marker hanging in front.
  for (const [lineFrom, info] of listLines) {
    const line = doc.lineAt(lineFrom)
    hide(line.from, info.contentFrom)
    addLineClass(line, `cm-md-li cm-md-li-d${Math.min(info.depth, 6)}`)
    if (info.first) addLineClass(line, 'cm-md-li-first')
  }

  for (const [lineFrom, classes] of lineClasses) {
    // A nested quote marks its lines once per level; the count is the depth, drawn as one bar per level.
    const quotes = classes.filter((cls) => cls === 'cm-md-quote').length
    const rest = classes.filter((cls) => cls !== 'cm-md-quote')
    if (quotes) rest.push('cm-md-quote', `cm-md-quote-d${Math.min(quotes, 4)}`)
    items.push(Decoration.line({ class: rest.join(' ') }).range(lineFrom))
  }
  return Decoration.set(items, true)
}

const inlinePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.dirty = false
      this.decorations = buildDecorations(view)
    }

    update(update) {
      // Dead keys and IME rewrite the text under the cursor; rebuilding mid-composition would break them.
      if (update.view.composing) {
        this.dirty = true
        if (update.docChanged) this.decorations = this.decorations.map(update.changes)
        return
      }
      if (
        this.dirty ||
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.focusChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.dirty = false
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      click(event) {
        if (!event.ctrlKey && !event.metaKey) return false
        const el = event.target?.closest?.('[data-md-href]')
        const href = el && safeHref(el.getAttribute('data-md-href'))
        if (!href) return false
        window.open(href, '_blank', 'noopener,noreferrer')
        event.preventDefault()
        return true
      },
    },
    eventObservers: {
      // No transaction follows the end of a composition, so nudge the plugin to rebuild what it skipped.
      compositionend(_event, view) {
        setTimeout(() => {
          if (view.composing || !view.dom.isConnected) return
          if (view.plugin(inlinePlugin)?.dirty) view.dispatch({})
        }, 100)
      },
    },
  },
)

// One bar per quote level, 15px apart, from the start of the text column.
const QUOTE_BAR = 'linear-gradient(var(--code-comment), var(--code-comment))'
function quoteLevel(depth) {
  const bars = Array.from({ length: depth }, (_, level) => level)
  return {
    paddingLeft: `${16 + depth * 15}px`,
    backgroundImage: bars.map(() => QUOTE_BAR).join(', '),
    backgroundPosition: bars.map((level) => `${16 + level * 15}px 0`).join(', '),
    backgroundSize: '3px 100%',
    backgroundRepeat: 'no-repeat',
  }
}

// Each list level indents by the marker box, so a nested marker sits under its parent's text.
const LIST_STEP = 1.5
function listLevel(depth) {
  return { paddingLeft: `calc(16px + ${depth * LIST_STEP}em)` }
}

// Colors come only from the editor panel's Monochrome tokens; descendants of headings/fences are forced
// because the syntax highlighter wraps the same text in spans with their own colors.
const visualTheme = EditorView.baseTheme({
  '&.cm-md-visual': { fontSize: '15px' },
  '&.cm-md-visual .cm-scroller': { fontFamily: 'var(--type)', lineHeight: '1.7' },
  '&.cm-md-visual .cm-content': { maxWidth: '720px', margin: '0 auto', padding: '24px 0 48px' },
  '&.cm-md-visual .cm-line': { padding: '0 16px' },

  '&.cm-md-visual .cm-md-h1, &.cm-md-visual .cm-md-h2, &.cm-md-visual .cm-md-h3, &.cm-md-visual .cm-md-h4, &.cm-md-visual .cm-md-h5, &.cm-md-visual .cm-md-h6':
    { fontWeight: '700', lineHeight: '1.35', color: 'var(--ink)' },
  '&.cm-md-visual .cm-md-h1 span, &.cm-md-visual .cm-md-h2 span, &.cm-md-visual .cm-md-h3 span, &.cm-md-visual .cm-md-h4 span, &.cm-md-visual .cm-md-h5 span, &.cm-md-visual .cm-md-h6 span':
    { color: 'var(--ink)' },
  '&.cm-md-visual .cm-md-h1': { fontSize: '1.875em', paddingTop: '0.4em' },
  '&.cm-md-visual .cm-md-h2': { fontSize: '1.5em', paddingTop: '0.35em' },
  '&.cm-md-visual .cm-md-h3': { fontSize: '1.375em', paddingTop: '0.3em' },
  '&.cm-md-visual .cm-md-h4': { fontSize: '1.25em', paddingTop: '0.25em' },
  '&.cm-md-visual .cm-md-h5': { fontSize: '1.125em' },
  '&.cm-md-visual .cm-md-h6': { fontSize: '1em' },
  // The setext underline collapses to nothing when hidden; its line still exists in the document.
  '&.cm-md-visual .cm-md-setext-rule': { height: '0', lineHeight: '0', overflow: 'hidden', padding: '0' },

  '&.cm-md-visual .cm-md-strong': { fontWeight: '700' },
  '&.cm-md-visual .cm-md-em': { fontStyle: 'italic' },
  '&.cm-md-visual .cm-md-strike': { textDecoration: 'line-through', color: 'var(--code-comment)' },
  '&.cm-md-visual .cm-md-ins': { textDecoration: 'underline', textUnderlineOffset: '3px' },
  '&.cm-md-visual .cm-md-link': { textDecoration: 'underline', textUnderlineOffset: '2px' },
  '&.cm-md-visual .cm-md-mark': { backgroundColor: 'color-mix(in srgb, var(--ink) 18%, transparent)', borderRadius: '2px' },
  '&.cm-md-visual .cm-md-sub': { verticalAlign: 'sub', fontSize: '0.8em' },
  '&.cm-md-visual .cm-md-sup': { verticalAlign: 'super', fontSize: '0.8em' },
  '&.cm-md-visual .cm-md-small': { fontSize: '0.85em' },
  '&.cm-md-visual .cm-md-kbd': {
    fontFamily: 'var(--mono)',
    fontSize: '0.85em',
    padding: '0 4px',
    border: '1px solid var(--code-line-number)',
    borderBottomWidth: '2px',
    borderRadius: '4px',
  },
  '&.cm-md-visual .cm-md-code': {
    fontFamily: 'var(--mono)',
    fontSize: '0.9em',
    padding: '1px 4px',
    borderRadius: '3px',
    backgroundColor: 'color-mix(in srgb, var(--ink) 8%, transparent)',
  },

  '&.cm-md-visual .cm-md-quote-d1': quoteLevel(1),
  '&.cm-md-visual .cm-md-quote-d2': quoteLevel(2),
  '&.cm-md-visual .cm-md-quote-d3': quoteLevel(3),
  '&.cm-md-visual .cm-md-quote-d4': quoteLevel(4),
  '&.cm-md-visual .cm-md-bullet': { display: 'inline-block', width: '1ch', textAlign: 'center', color: 'var(--code-keyword)' },

  '&.cm-md-visual .cm-md-li-d1': listLevel(1),
  '&.cm-md-visual .cm-md-li-d2': listLevel(2),
  '&.cm-md-visual .cm-md-li-d3': listLevel(3),
  '&.cm-md-visual .cm-md-li-d4': listLevel(4),
  '&.cm-md-visual .cm-md-li-d5': listLevel(5),
  '&.cm-md-visual .cm-md-li-d6': listLevel(6),
  '&.cm-md-visual .cm-md-li-first': { textIndent: `-${LIST_STEP}em` },
  '&.cm-md-visual .cm-md-li .cm-md-bullet, &.cm-md-visual .cm-md-li-marker': {
    display: 'inline-block',
    minWidth: `${LIST_STEP}em`,
    textAlign: 'left',
    textIndent: '0',
  },
  // The checkbox stands in for the marker: same box, so task text lines up with the other items.
  '&.cm-md-visual .cm-md-li .cm-md-task': { width: '13px', margin: `0 calc(${LIST_STEP}em - 13px) 0 0` },

  '&.cm-md-visual .cm-md-codeblock': {
    fontFamily: 'var(--mono)',
    fontSize: '0.9em',
    lineHeight: '1.6',
    backgroundColor: 'color-mix(in srgb, var(--ink) 6%, transparent)',
  },
  '&.cm-md-visual .cm-md-codeblock-first': { borderTopLeftRadius: '6px', borderTopRightRadius: '6px', paddingTop: '4px' },
  '&.cm-md-visual .cm-md-codeblock-last': { borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px', paddingBottom: '4px' },
  '&.cm-md-visual .cm-md-fence, &.cm-md-visual .cm-md-fence span': { color: 'var(--code-comment)' },
  '&.cm-md-visual .cm-md-fence-hidden': { lineHeight: '0.75em' },
})

export function inlinePreview() {
  return [inlinePlugin, EditorView.editorAttributes.of({ class: 'cm-md-visual' }), visualTheme]
}
