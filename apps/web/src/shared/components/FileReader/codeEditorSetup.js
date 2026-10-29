import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { loadLanguage } from './codeLanguages.js'
import { markdownKeymap } from './markdownCommands.js'

// Token colors follow the Monochrome theme for VS Code (anotherglitchinthematrix/monochrome, MIT): every
// color is a blend from the page's background to its text. The blends live in CodeEditor.module.css as
// --code-* properties over the app's own tokens, so the editor follows the light and dark themes.
// In VS Code, names (variables, calls, properties) carry no scope of their own and read as plain text.
// Tones alone sit too close at this size, so keywords are also bold, strings and comments italic.
const monochromeHighlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  {
    tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier, t.self],
    color: 'var(--code-keyword)',
    fontWeight: 'bold',
  },
  { tag: [t.operator, t.operatorKeyword, t.punctuation, t.separator, t.bracket], color: 'var(--code-text)' },
  { tag: [t.variableName, t.propertyName, t.function(t.variableName), t.function(t.propertyName)], color: 'var(--code-text)' },
  { tag: [t.tagName, t.link, t.url, t.deleted, t.list], color: 'var(--code-variable)' },
  { tag: t.heading, color: 'var(--code-function)' },
  { tag: t.standard(t.variableName), color: 'var(--code-support)' },
  { tag: [t.className, t.typeName, t.definition(t.typeName), t.namespace], color: 'var(--code-class)' },
  { tag: [t.string, t.special(t.string), t.character], color: 'var(--code-string)', fontStyle: 'italic' },
  { tag: [t.inserted, t.monospace], color: 'var(--code-string)' },
  { tag: [t.regexp, t.escape, t.color], color: 'var(--code-support)' },
  { tag: [t.number, t.bool, t.null, t.atom, t.constant(t.variableName), t.unit, t.attributeName, t.quote], color: 'var(--code-constant)' },
  { tag: t.strong, color: 'var(--code-class)', fontWeight: 'bold' },
  { tag: t.emphasis, color: 'var(--code-keyword)', fontStyle: 'italic' },
  { tag: t.changed, color: 'var(--code-keyword)' },
  { tag: t.invalid, color: 'var(--code-invalid)' },
])

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--code-text)',
    fontSize: '13px',
  },
  '&.cm-focused': { outline: 'none' },
  // The editor scrolls itself (the minimap reads and moves its scroll); the project's thin thumbs follow it
  // from CustomScrollArea, so the browser's own bars stay hidden.
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--mono)',
    lineHeight: '20px',
    scrollbarWidth: 'none',
  },
  '.cm-scroller::-webkit-scrollbar': { display: 'none' },
  '.cm-minimap-gutter': { backgroundColor: 'var(--overlay)' },
  '.cm-content': {
    padding: '12px 0',
    caretColor: 'var(--code-text)',
    userSelect: 'text',
  },
  '.cm-line': { padding: '0 24px 0 8px' },
  '.cm-gutters': {
    backgroundColor: 'var(--overlay)',
    color: 'var(--code-line-number)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 16px' },
  '.cm-activeLine': { backgroundColor: 'var(--code-active-line)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--code-line-number-active)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--code-text)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--code-selection)',
  },
  '&.cm-focused .cm-matchingBracket, .cm-matchingBracket': {
    backgroundColor: 'transparent',
    outline: '1px solid var(--code-bracket)',
  },
  '.cm-nonmatchingBracket': { backgroundColor: 'transparent', color: 'var(--code-invalid)' },
})

async function loadMinimap() {
  const { showMinimap } = await import('@replit/codemirror-minimap')
  return showMinimap.compute(['doc'], () => ({
    create: () => ({ dom: document.createElement('div') }),
    displayText: 'characters',
    showOverlay: 'mouse-over',
  }))
}

const codeLabel = EditorView.contentAttributes.of({ 'aria-label': 'Código do arquivo' })
const textLabel = EditorView.contentAttributes.of({ 'aria-label': 'Texto do arquivo' })

// What each editor remembers for its mode switches (see setSourceView). Markdown files are the only ones with
// two modes; the rest stay in the code mode for good.
const states = new WeakMap()

// Visualizar is a markdown file outside its source view.
function isVisual(state) {
  return state.markdown && !state.sourceView
}

// The pieces that change with the mode. Code and the markdown source view carry line numbers, the active line
// and the minimap; Visualizar swaps them for the rendering, which wraps lines like prose.
function modeParts(state) {
  const visual = isVisual(state)
  if (visual && !state.visualExtension) {
    state.visualExtension = [state.markdownVisual?.({ editable: state.editable }) ?? [], EditorView.lineWrapping]
  }

  return {
    gutter: visual ? [] : [lineNumbers(), highlightActiveLineGutter()],
    overview: !visual && state.minimapExtension ? state.minimapExtension : [],
    activeLine: visual ? [] : highlightActiveLine(),
    visual: state.markdown ? (visual ? [state.visualExtension, textLabel] : codeLabel) : [],
  }
}

function loadMinimapInto(view, state) {
  if (!state.minimap || state.minimapLoading) return
  state.minimapLoading = true
  void loadMinimap()
    .then((extension) => {
      state.minimapExtension = extension
      // A closed editor has left the page by now.
      if (view.dom.isConnected && !isVisual(state)) view.dispatch({ effects: state.compartments.overview.reconfigure(extension) })
    })
    .catch(() => {})
}

// Switches a markdown editor between Visualizar (`sourceView` false) and the source view, in one dispatch, so the
// document, selection, scroll, undo history and the autosave carry over. Other files ignore it.
export function setSourceView(view, sourceView) {
  const state = states.get(view)
  if (!state?.markdown || state.sourceView === Boolean(sourceView)) return
  state.sourceView = Boolean(sourceView)

  const parts = modeParts(state)
  const { compartments } = state
  view.dispatch({
    effects: [
      compartments.gutter.reconfigure(parts.gutter),
      compartments.overview.reconfigure(parts.overview),
      compartments.activeLine.reconfigure(parts.activeLine),
      compartments.visual.reconfigure(parts.visual),
    ],
  })
  if (!isVisual(state)) loadMinimapInto(view, state)
}

// Builds the editor into `parent`. `editable: false` keeps highlighting and bracket matching but no typing.
// The text shows at once; its grammar and the minimap follow when loaded. `onDocChanged` hears every edit.
// Markdown files pass `markdown: { sourceView, getToggle }`: they open in Visualizar unless `sourceView`, and
// since that must not flash raw text, the grammar and the rendering load before the editor is built (hence the
// promise); `getToggle()` gives the callback that Mod-/ calls.
export async function createCodeEditor({ parent, text, extension, editable, minimap = false, onDocChanged, markdown }) {
  const language = new Compartment()
  const compartments = {
    gutter: new Compartment(),
    overview: new Compartment(),
    activeLine: new Compartment(),
    visual: new Compartment(),
  }
  const state = {
    markdown: Boolean(markdown),
    sourceView: Boolean(markdown?.sourceView),
    editable,
    minimap,
    compartments,
    markdownVisual: null,
    visualExtension: null,
    minimapExtension: null,
    minimapLoading: false,
  }

  let grammar = null
  if (markdown) {
    // Neither may stop the file from opening: without them it reads as plain text.
    const [loaded, visual] = await Promise.all([
      loadLanguage(extension).catch(() => null),
      import('./markdownVisual/index.js').catch(() => null),
    ])
    grammar = loaded
    state.markdownVisual = visual?.markdownVisual ?? null
  }

  const parts = modeParts(state)
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        compartments.gutter.of(parts.gutter),
        compartments.activeLine.of(parts.activeLine),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        markdown ? markdownKeymap({ editable, getToggle: markdown.getToggle }) : [],
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onDocChanged?.()
        }),
        syntaxHighlighting(monochromeHighlight),
        editorTheme,
        EditorState.readOnly.of(!editable),
        EditorView.editable.of(editable),
        markdown ? compartments.visual.of(parts.visual) : codeLabel,
        language.of(grammar ?? []),
        compartments.overview.of(parts.overview),
      ],
    }),
  })
  states.set(view, state)

  if (!markdown) {
    void loadLanguage(extension)
      .then((loaded) => {
        // A closed editor has left the page by now.
        if (loaded && view.dom.isConnected) view.dispatch({ effects: language.reconfigure(loaded) })
      })
      .catch(() => {})
  }

  if (!isVisual(state)) loadMinimapInto(view, state)

  return view
}
