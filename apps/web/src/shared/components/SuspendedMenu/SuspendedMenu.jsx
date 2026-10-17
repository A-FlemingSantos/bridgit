import { Fragment } from 'react'
import { extrasPanelClassName } from './useSuspendedMenu.js'
import styles from './SuspendedMenu.module.css'

// A single card that unrolls from its top edge. Destructive items sit after a
// divider at the end, so they are never the first thing under the pointer.
export default function SuspendedMenu({
  open,
  closing,
  items,
  id,
  title = null,
  stretch = false,
  align = 'end',
  labelledBy,
  panelRef = null,
  anchored = false,
  style,
}) {
  const menuVisible = open || closing
  const className = [
    extrasPanelClassName(styles, open, closing),
    stretch ? styles.stretch : '',
    !anchored && align === 'start' ? styles.start : '',
    anchored ? styles.fixed : '',
  ]
    .filter(Boolean)
    .join(' ')
  const regular = items.filter((item) => !item.danger)
  const destructive = items.filter((item) => item.danger)

  function renderItem(item) {
    const Icon = item.icon
    return (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        className={[styles.item, item.danger ? styles.itemDanger : ''].filter(Boolean).join(' ')}
        tabIndex={open ? 0 : -1}
        disabled={item.disabled}
        onClick={item.onSelect}
      >
        <span className={styles.icon} aria-hidden="true">
          {Icon ? <Icon size={15} strokeWidth={1.7} /> : null}
        </span>
        <span className={styles.label}>{item.label}</span>
      </button>
    )
  }

  return (
    <div
      ref={panelRef}
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
    </div>
  )
}
