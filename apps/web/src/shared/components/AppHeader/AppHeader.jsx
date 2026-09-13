import { useId } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Search } from 'lucide-react'
import { ROUTES } from '../../config/routes.js'
import { settingsNavState } from '../../utils/settingsOverlay.js'
import styles from './AppHeader.module.css'

/**
 * @typedef {Object} AppHeaderProps
 * @property {string} [userName]
 */

export default function AppHeader({ userName = 'arthur' }) {
  const location = useLocation()
  const searchId = useId()
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <header className={styles.bar}>
      <Link to={ROUTES.spaces} className={styles.mark}>
        Bridgit
      </Link>

      <label className={styles.search} htmlFor={searchId}>
        <Search size={14} strokeWidth={1.6} aria-hidden="true" />
        <input id={searchId} type="search" placeholder="Buscar" autoComplete="off" aria-label="Buscar" />
      </label>

      <Link
        to={ROUTES.settings}
        state={settingsNavState(location)}
        className={styles.user}
        aria-label="Configurações"
      >
        <span className={styles.avatar} aria-hidden="true">
          {initials}
        </span>
        <span className={styles.meta}>{userName}</span>
      </Link>
    </header>
  )
}
