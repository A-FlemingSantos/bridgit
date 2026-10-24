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
    minHeight: '100%',
    backgroundColor: 'transparent',
    color: 'var(--code-text)',
    fontSize: '13px',
  },
  '&.cm-focused': { outline: 'none' },
  // The page around the editor scrolls (CustomScrollArea), not the editor itself.
  '.cm-scroller': {
    overflow: 'visible',
    fontFamily: 'var(--mono)',
    lineHeight: '20px',
  },
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

// Builds the editor into `parent`. `editable: false` keeps highlighting and bracket matching but no typing.
// The text shows at once; its grammar follows when loaded.
export function createCodeEditor({ parent, text, extension, editable }) {
  const language = new Compartment()
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        syntaxHighlighting(monochromeHighlight),
        editorTheme,
        EditorState.readOnly.of(!editable),
        EditorView.editable.of(editable),
        EditorView.contentAttributes.of({ 'aria-label': 'Código do arquivo' }),
        language.of([]),
      ],
    }),
  })

  void loadLanguage(extension)
    .then((grammar) => {
      // A closed editor has left the page by now.
      if (grammar && view.dom.isConnected) view.dispatch({ effects: language.reconfigure(grammar) })
    })
    .catch(() => {})

  return view
}
