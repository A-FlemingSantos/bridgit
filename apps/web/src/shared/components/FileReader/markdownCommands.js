import { EditorSelection, Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'

// Asterisks around the position, up to three (bold and italic together).
function starsBefore(doc, pos) {
  let count = 0
  while (count < 3 && pos - count > 0 && doc.sliceString(pos - count - 1, pos - count) === '*') count += 1
  return count
}

function starsAfter(doc, pos) {
  let count = 0
  while (count < 3 && pos + count < doc.length && doc.sliceString(pos + count, pos + count + 1) === '*') count += 1
  return count
}

// `**` is on when two asterisks sit on both sides; `*` when an odd number does (`***x***` is both).
function marked(stars, size) {
  return size === 2 ? stars >= 2 : stars % 2 === 1
}

// Wraps every selection in `size` asterisks, or takes them off when they are already there: either around
// the selection or just inside it. Nothing selected inserts the pair with the cursor between.
function toggleMark(size) {
  const mark = '*'.repeat(size)

  return (view) => {
    if (view.state.readOnly) return false
    const doc = view.state.doc

    view.dispatch(
      view.state.changeByRange((range) => {
        const { from, to } = range
        if (range.empty) return { changes: { from, insert: mark + mark }, range: EditorSelection.cursor(from + size) }

        const text = doc.sliceString(from, to)
        const inside = Math.min(text.match(/^\*{0,3}/)[0].length, text.match(/\*{0,3}$/)[0].length)
        if (text.length > inside * 2 && marked(inside, size)) {
          return {
            changes: [
              { from, to: from + size },
              { from: to - size, to },
            ],
            range: EditorSelection.range(from, to - size * 2),
          }
        }

        if (marked(Math.min(starsBefore(doc, from), starsAfter(doc, to)), size)) {
          return {
            changes: [
              { from: from - size, to: from },
              { from: to, to: to + size },
            ],
            range: EditorSelection.range(from - size, to - size),
          }
        }

        return {
          changes: [
            { from, insert: mark },
            { from: to, insert: mark },
          ],
          range: EditorSelection.range(from + size, to + size),
        }
      }),
      { scrollIntoView: true, userEvent: 'input' },
    )
    return true
  }
}

export const toggleBold = toggleMark(2)
export const toggleItalic = toggleMark(1)

// The markdown shortcuts, live in both modes. Mod-/ switches between Visualizar and the source (it takes the
// place of CodeMirror's comment toggle, which would write an HTML comment); `getToggle` is read on each press so
// a callback that changed since the editor opened is the one that runs. Bold and italic only write when editable.
export function markdownKeymap({ editable, getToggle }) {
  return Prec.high(
    keymap.of([
      {
        key: 'Mod-/',
        run: () => {
          getToggle?.()?.()
          return true
        },
      },
      ...(editable
        ? [
            { key: 'Mod-b', run: toggleBold },
            { key: 'Mod-i', run: toggleItalic },
          ]
        : []),
    ]),
  )
}
