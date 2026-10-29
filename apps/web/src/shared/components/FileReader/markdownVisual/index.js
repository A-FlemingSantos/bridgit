import { activeSelection } from './activeSelection.js'
import { blockPreview } from './blockPreview.js'
import { inlinePreview } from './inlinePreview.js'
import { richBlocks } from './richBlocks.js'

// The markdown "Visualizar" mode: it only decorates the text, never rewrites it, so what is saved is what was
// typed. Inline marks come from a ViewPlugin; elements that change line height (rules, images, tables, HTML)
// come from StateFields. `editable: false` (public links, read-only files) keeps the rendering but no clicks
// that write (task checkboxes).
export function markdownVisual({ editable = false } = {}) {
  return [activeSelection, inlinePreview({ editable }), blockPreview({ editable }), richBlocks({ editable })]
}
