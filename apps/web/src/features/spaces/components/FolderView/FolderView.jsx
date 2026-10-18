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
export function TileContent({ art, title, subtitle }) {
  return (
    <>
      <span className={styles.face} aria-hidden="true">{art}</span>
      <span className={styles.meta}>
        <span className={styles.title}>{title}</span>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      </span>
    </>
  )
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
