import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { extrasPanelClassName } from './useSuspendedMenu.js'
import styles from './SuspendedMenu.module.css'

const FLYOUT_GAP = 4
const VIEW_PAD = 8
// Keep in sync with the .itemFilled / .itemFading transitions in SuspendedMenu.module.css.
const FILL_MS = 420
const FADE_MS = 260

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

// A single card that unrolls from its top edge. Destructive items sit after a
// divider at the end, so they are never the first thing under the pointer.
// An item with a `panel` (render function) opens it in a card docked beside the
// menu, level with the item, and may show a `swatch` color next to its label.
export default function SuspendedMenu({
  open,
  closing,
  items,
  id,
  title = null,
  stretch = false,
  attached = false,
  align = 'end',
  labelledBy,
  panelRef = null,
  anchored = false,
  style,
}) {
  const [expandedId, setExpandedId] = useState(null)
  const [filled, setFilled] = useState(null)
  const [flyoutPlace, setFlyoutPlace] = useState(null)
  const rootRef = useRef(null)
  const itemRefs = useRef(new Map())
  const flyoutRef = useRef(null)
  const expandedItem = items.find((item) => item.id === expandedId && typeof item.panel === 'function') ?? null

  useEffect(() => {
    if (!open) {
      setExpandedId(null)
      setFilled(null)
    }
  }, [open])

  // A `fill` item keeps the menu open and fills while its action runs. Once both the fill and the
  // action are done it fades back to its resting look; a failure empties it at once.
  function selectFill(item) {
    const clear = () => setFilled((current) => (current?.id === item.id ? null : current))
    setFilled({ id: item.id, fading: false })
    Promise.all([Promise.resolve().then(() => item.onSelect?.()), wait(FILL_MS)])
      .then(() => {
        setFilled((current) => (current?.id === item.id ? { id: item.id, fading: true } : current))
        return wait(FADE_MS).then(clear)
      })
      .catch(clear)
  }

  // Dock the flyout on the side with room, level with its item, kept inside the viewport.
  useLayoutEffect(() => {
    if (!expandedItem) {
      setFlyoutPlace(null)
      return
    }
    const root = rootRef.current
    const row = itemRefs.current.get(expandedItem.id)
    const flyout = flyoutRef.current
    if (!root || !row || !flyout) return
    const rootRect = root.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    const width = flyout.offsetWidth
    const height = flyout.offsetHeight
    const roomAfter = window.innerWidth - VIEW_PAD - (rootRect.right + FLYOUT_GAP)
    const roomBefore = rootRect.left - FLYOUT_GAP - VIEW_PAD
    const side = roomAfter >= width || roomAfter >= roomBefore ? 'after' : 'before'
    // On narrow screens neither side may fit; the card then slides over the menu but stays on screen.
    const desiredX = side === 'after' ? rootRect.right + FLYOUT_GAP : rootRect.left - FLYOUT_GAP - width
    const x = Math.max(VIEW_PAD, Math.min(desiredX, window.innerWidth - VIEW_PAD - width))
    let top = rowRect.top - rootRect.top - 7
    const overflow = rootRect.top + top + height - (window.innerHeight - VIEW_PAD)
    if (overflow > 0) top -= overflow
    setFlyoutPlace({ side, top, left: x - rootRect.left })
  }, [expandedItem])

  function setRootRef(node) {
    rootRef.current = node
    if (typeof panelRef === 'function') panelRef(node)
    else if (panelRef) panelRef.current = node
  }

  const menuVisible = open || closing
  const className = [
    extrasPanelClassName(styles, open, closing),
    stretch ? styles.stretch : '',
    attached ? styles.attached : '',
    !anchored && align === 'start' ? styles.start : '',
    anchored ? styles.fixed : '',
    expandedItem && open ? styles.extrasDocked : '',
  ]
    .filter(Boolean)
    .join(' ')
  const regular = items.filter((item) => !item.danger)
  const destructive = items.filter((item) => item.danger)

  function renderItem(item) {
    const Icon = item.icon
    const expandable = typeof item.panel === 'function'
    const expanded = expandable && expandedId === item.id

    return (
      <button
        key={item.id}
        ref={(node) => {
          if (node) itemRefs.current.set(item.id, node)
          else itemRefs.current.delete(item.id)
        }}
        type="button"
        role="menuitem"
        className={[
          styles.item,
          item.danger ? styles.itemDanger : '',
          expanded ? styles.itemActive : '',
          item.fill ? styles.itemFill : '',
          item.fill && filled?.id === item.id ? styles.itemFilled : '',
          item.fill && filled?.id === item.id && filled.fading ? styles.itemFading : '',
        ].filter(Boolean).join(' ')}
        tabIndex={open ? 0 : -1}
        disabled={item.disabled}
        aria-haspopup={expandable ? 'true' : undefined}
        aria-expanded={expandable ? expanded : undefined}
        aria-controls={expanded ? `${id}-flyout` : undefined}
        onClick={
          expandable
            ? () => setExpandedId(expanded ? null : item.id)
            : item.fill
              ? () => selectFill(item)
              : item.onSelect
        }
      >
        <span className={styles.icon} aria-hidden="true">
          {Icon ? <Icon size={15} strokeWidth={1.7} /> : null}
        </span>
        <span className={styles.label}>{item.label}</span>
        {item.swatch ? (
          <span className={styles.swatch} style={{ background: item.swatch }} aria-hidden="true" />
        ) : null}
        {expandable ? (
          <ChevronRight className={styles.disclosure} size={14} strokeWidth={1.7} aria-hidden="true" />
        ) : null}
      </button>
    )
  }

  return (
    <div
      ref={setRootRef}
      className={className}
      id={id}
      role="menu"
      aria-labelledby={labelledBy}
      aria-hidden={!menuVisible}
      style={style}
    >
      <div className={styles.inner}>
        {title ? (
          <p className={styles.title} title={title}>
            {title}
          </p>
        ) : null}
        {regular.map(renderItem)}
        {destructive.length > 0 ? (
          <Fragment>
            {regular.length > 0 ? <div className={styles.divider} role="separator" /> : null}
            {destructive.map(renderItem)}
          </Fragment>
        ) : null}
      </div>
      {expandedItem && open ? (
        <div
          ref={flyoutRef}
          id={`${id}-flyout`}
          className={[
            styles.flyout,
            flyoutPlace?.side === 'before' ? styles.flyoutBefore : '',
            flyoutPlace ? styles.flyoutShown : '',
          ].filter(Boolean).join(' ')}
          style={{ top: flyoutPlace?.top ?? 0, left: flyoutPlace?.left ?? '100%' }}
        >
          {expandedItem.panel()}
        </div>
      ) : null}
    </div>
  )
}
