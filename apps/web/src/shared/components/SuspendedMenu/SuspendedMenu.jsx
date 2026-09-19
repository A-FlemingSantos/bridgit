import { extrasPanelClassName } from './useSuspendedMenu.js'
import styles from './SuspendedMenu.module.css'

export default function SuspendedMenu({
  open,
  closing,
  items,
  id,
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
        {items.map((item, index) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={[styles.item, item.danger ? styles.itemDanger : ''].filter(Boolean).join(' ')}
              style={{ '--i': index, '--n': items.length }}
              tabIndex={open ? 0 : -1}
              disabled={item.disabled}
              onClick={item.onSelect}
            >
              {Icon ? <Icon size={15} strokeWidth={1.6} aria-hidden="true" /> : null}
              {item.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
