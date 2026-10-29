import { StateEffect, StateField } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

// The raw markdown only shows around a cursor the user put there. A file opens with the selection at 0, so
// without this its first line (usually a title, or front matter) would open as raw text; it also renders
// again when the editor loses focus, and a read-only page that is never clicked stays fully rendered.
const focusChanged = StateEffect.define()

const selectionActive = StateField.define({
  create: () => false,
  update(active, tr) {
    for (const effect of tr.effects) if (effect.is(focusChanged)) return effect.value
    // A selection someone set (a click, the keyboard, a widget) counts even before the focus event lands.
    return tr.selection ? true : active
  },
})

export const activeSelection = [
  selectionActive,
  EditorView.focusChangeEffect.of((state, focusing) => focusChanged.of(focusing)),
]

// True when a transaction turned the selection on or off, so the previews rebuild on focus changes too.
export function activeSelectionChanged(tr) {
  return tr.state.field(selectionActive, false) !== tr.startState.field(selectionActive, false)
}

// Whether a selection range touches [from, to]. Each preview asks this before showing raw text. Without the
// field (a preview tested on its own) every selection counts.
export function touchesSelection(state, from, to) {
  if (state.field(selectionActive, false) === false) return false
  return state.selection.ranges.some((range) => range.from <= to && range.to >= from)
}
