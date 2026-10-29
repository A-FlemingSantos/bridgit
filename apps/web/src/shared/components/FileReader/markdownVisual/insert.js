import { tags as t } from '@lezer/highlight'

const PLUS = 43
const INSERT = { resolve: 'Insert', mark: 'InsertMark' }
const PUNCTUATION = /[\p{P}\p{S}]/u

// `++text++` (inserted, read as underline), which some editors write for underlined text. Same delimiter
// rules as GFM's `~~`: it opens before a word and closes after one, so a lone `++` (as in `c++`) stays text.
export const insert = {
  defineNodes: [
    { name: 'Insert', style: { 'Insert/...': t.special(t.content) } },
    { name: 'InsertMark', style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: 'Insert',
      parse(cx, next, pos) {
        if (next !== PLUS || cx.char(pos + 1) !== PLUS || cx.char(pos + 2) === PLUS) return -1
        const before = cx.slice(pos - 1, pos)
        const after = cx.slice(pos + 2, pos + 3)
        const spaceBefore = /\s|^$/.test(before)
        const spaceAfter = /\s|^$/.test(after)
        const punctBefore = PUNCTUATION.test(before)
        const punctAfter = PUNCTUATION.test(after)
        return cx.addDelimiter(
          INSERT,
          pos,
          pos + 2,
          !spaceAfter && (!punctAfter || spaceBefore || punctBefore),
          !spaceBefore && (!punctBefore || spaceAfter || punctAfter),
        )
      },
      after: 'Emphasis',
    },
  ],
}
