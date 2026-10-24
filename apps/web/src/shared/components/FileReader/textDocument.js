// A text file as the editor sees it, and how to write it back the way it came: the editor only knows "\n",
// so the file's own line break and byte-order mark are kept aside and restored on save.

const MAX_TEXT_BYTES = 2 * 1024 * 1024

export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer)
  const truncated = bytes.byteLength > MAX_TEXT_BYTES
  const slice = truncated ? bytes.subarray(0, MAX_TEXT_BYTES) : bytes
  const bom = slice[0] === 0xef && slice[1] === 0xbb && slice[2] === 0xbf

  let text
  let utf8 = true
  try {
    // A cut file may end mid-character, so only a whole one is held to strict UTF-8.
    text = new TextDecoder('utf-8', { fatal: !truncated }).decode(slice)
  } catch {
    text = new TextDecoder('utf-8').decode(slice)
    utf8 = false
  }

  const crlf = (text.match(/\r\n/g) ?? []).length
  const lf = (text.match(/\n/g) ?? []).length - crlf
  return { text, bom, eol: crlf > lf ? '\r\n' : '\n', utf8, truncated }
}

export function encodeText(doc, { bom = false, eol = '\n' } = {}) {
  return (bom ? '﻿' : '') + (eol === '\n' ? doc : doc.replace(/\n/g, eol))
}
