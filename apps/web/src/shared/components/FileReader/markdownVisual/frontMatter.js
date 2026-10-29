import { styleTags, tags as t } from '@lezer/highlight'

const DELIMITER = /^---[ \t]*$/
const CLOSER = /^(?:---|\.\.\.)[ \t]*$/
// Past this the opening `---` is just a rule: an unclosed block must never swallow a long document.
const MAX_FRONT_MATTER = 64 * 1024

// True when a closing line follows the opening one. Reads ahead without consuming, because a block parser
// cannot give lines back once it moved past them.
function isClosed(cx, openEnd) {
  const limit = Math.min(cx.input.length, openEnd + MAX_FRONT_MATTER)
  const rest = cx.input.read(openEnd, limit)
  return rest.split(/\r?\n/).slice(1).some((line) => CLOSER.test(line))
}

// YAML front matter (Jekyll style): only when the document starts with `---` at line 1 and a `---` or `...`
// line closes it. Without this the opening line parses as a rule or a setext heading. The YAML inside stays
// plain text; the visual mode only dims it.
export const frontMatter = {
  defineNodes: [
    { name: 'FrontMatter', block: true },
    { name: 'FrontMatterMark' },
  ],
  // Tag only the delimiters; the highlight style has no entry for it, so source mode keeps plain colors.
  props: [styleTags({ FrontMatterMark: t.processingInstruction })],
  parseBlock: [
    {
      name: 'FrontMatter',
      before: 'HorizontalRule',
      parse(cx, line) {
        // Only the very first line of the document, outside any container (quote, list).
        if (cx.lineStart !== 0 || line.pos !== 0 || !DELIMITER.test(line.text)) return false
        const start = cx.lineStart
        if (!isClosed(cx, start + line.text.length)) return false

        const open = cx.elt('FrontMatterMark', start, start + 3)
        while (cx.nextLine()) {
          if (!CLOSER.test(line.text)) continue
          const closeStart = cx.lineStart
          const close = cx.elt('FrontMatterMark', closeStart, closeStart + 3)
          const end = closeStart + line.text.length
          cx.nextLine()
          cx.addElement(cx.elt('FrontMatter', start, end, [open, close]))
          return true
        }
        return false
      },
    },
  ],
}
