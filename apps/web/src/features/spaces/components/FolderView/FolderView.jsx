import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import styles from './FolderView.module.css'

export { styles as folderViewStyles }

// Folders and files laid out in tiles. `fill` stretches the columns to the width (dialogs);
// otherwise the tiles keep the page's fixed width.
export function ItemGrid({ label, fill = false, tileWidth, children }) {
  return (
    <section aria-label={label}>
      <div
        className={[styles.grid, fill ? styles.fill : ''].filter(Boolean).join(' ')}
        style={tileWidth ? { '--tile-width': tileWidth } : undefined}
      >
        {children}
      </div>
    </section>
  )
}

// What a tile shows: the folder drawing or file sheet, then the name and one line under it.
// The tile itself (a link on the pages, a button in the picker) uses `folderViewStyles.tile`.
// The drawing and the name are marked as the parts that open the item (see useTileSelection).
export function TileContent({ art, title, subtitle }) {
  return (
    <>
      <span className={styles.face} aria-hidden="true">
        <span className={styles.hit} data-tile-hit="">{art}</span>
      </span>
      <span className={styles.meta}>
        <span className={styles.title}><span data-tile-hit="">{title}</span></span>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      </span>
    </>
  )
}

// A click on a tile's drawing or name opens it; a click elsewhere in its highlight selects it, or
// unselects it if it already was, so several tiles can be picked one by one. Shift adds the range from
// the last one clicked (`order` is the tiles' order on screen). Keyboard activation keeps opening.
// Pressing outside the tiles, Escape or a new `resetKey` (another folder) clears the selection.
// The fill and the colors on it swap in one frame: the tiles skip their transitions until it is painted.
function settleInstantly() {
  const tiles = document.querySelectorAll('[data-selectable]')
  tiles.forEach((tile) => tile.setAttribute('data-instant', ''))
  requestAnimationFrame(() => requestAnimationFrame(() => tiles.forEach((tile) => tile.removeAttribute('data-instant'))))
}

export function useTileSelection(resetKey, order = []) {
  const [selected, setSelected] = useState(() => new Set())
  const anchorRef = useRef(null)
  useEffect(() => {
    setSelected(new Set())
    anchorRef.current = null
  }, [resetKey])
  const hasSelection = selected.size > 0
  useEffect(() => {
    if (!hasSelection) return undefined
    function clear() {
      settleInstantly()
      setSelected(new Set())
    }
    function handlePointerDown(event) {
      if (!event.target.closest?.('[data-selectable]')) clear()
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') clear()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [hasSelection])

  function select(key, event) {
    settleInstantly()
    const from = order.indexOf(anchorRef.current)
    const to = order.indexOf(key)
    if (event.shiftKey && from >= 0 && to >= 0) {
      const range = order.slice(Math.min(from, to), Math.max(from, to) + 1)
      setSelected((previous) => new Set([...previous, ...range]))
      return
    }
    anchorRef.current = key
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function tileProps(key) {
    return {
      'data-selectable': '',
      'data-selected': selected.has(key) ? 'true' : undefined,
      onClick: (event) => {
        if (event.detail === 0 || event.button !== 0) return
        if (event.target.closest('[data-tile-hit]')) return
        event.preventDefault()
        select(key, event)
      },
    }
  }

  return { selected, tileProps }
}

// The path to the current folder. Ancestors are { label, to, state } links on a page or
// { label, onSelect } buttons in a dialog; the current folder closes the path in bold.
export function FolderTrail({ ancestors, current, size = 'page', currentAs: Current = 'span' }) {
  return (
    <div className={styles.trail} data-size={size}>
      {ancestors.length > 0 ? (
        <nav className={styles.trailNav} aria-label="Localização atual">
          {ancestors.map((crumb, index) => (
            <span key={`${crumb.label}-${crumb.to ?? index}`} className={styles.trailSegment}>
              {crumb.to ? (
                <Link to={crumb.to} state={crumb.state} className={styles.trailLink}>
                  {crumb.label}
                </Link>
              ) : (
                <button type="button" className={styles.trailLink} onClick={crumb.onSelect}>
                  {crumb.label}
                </button>
              )}
              <ChevronRight
                className={styles.trailSeparator}
                size={size === 'compact' ? 14 : 16}
                strokeWidth={1.6}
                aria-hidden="true"
              />
            </span>
          ))}
        </nav>
      ) : null}
      <Current className={styles.trailCurrent} aria-current="location">{current}</Current>
    </div>
  )
}
