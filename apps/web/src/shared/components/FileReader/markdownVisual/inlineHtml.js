// Inline HTML that only formats text (`<u>`, `<kbd>`…), shared by the inline preview and the table cells.
// Only bare tags (no attributes) count, and nothing is ever parsed as HTML: the tags are hidden and the text
// between them styled like its markdown twin.
export const INLINE_HTML_CLASSES = {
  u: 'cm-md-ins',
  ins: 'cm-md-ins',
  b: 'cm-md-strong',
  strong: 'cm-md-strong',
  i: 'cm-md-em',
  em: 'cm-md-em',
  s: 'cm-md-strike',
  del: 'cm-md-strike',
  strike: 'cm-md-strike',
  code: 'cm-md-code',
  kbd: 'cm-md-kbd',
  mark: 'cm-md-mark',
  sub: 'cm-md-sub',
  sup: 'cm-md-sup',
  small: 'cm-md-small',
}

const BARE_TAG = /^<(\/?)([a-z]+)\s*>$/i

// The name of a bare opening tag this module knows (`<u>` → 'u'), or null.
export function openingTagName(text) {
  const tag = BARE_TAG.exec(text)
  const name = tag && !tag[1] ? tag[2].toLowerCase() : null
  return name && INLINE_HTML_CLASSES[name] ? name : null
}

// The closing sibling of an opening inline tag, counting nested tags of the same name.
export function closingTag(state, open, name) {
  let depth = 0
  for (let next = open.nextSibling; next; next = next.nextSibling) {
    if (next.name !== 'HTMLTag') continue
    const tag = BARE_TAG.exec(state.sliceDoc(next.from, next.to))
    if (!tag || tag[2].toLowerCase() !== name) continue
    if (!tag[1]) depth++
    else if (depth) depth--
    else return next
  }
  return null
}
