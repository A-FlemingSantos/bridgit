import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { ROUTES } from '../../config/routes.js'
import styles from './AppHeader.module.css'

/**
 * @typedef {Object} AppHeaderProps
 * @property {string} [userName]
 * @property {string} [userRole]
 */

export default function AppHeader({ userName = 'Arthur Fleming', userRole = 'Admin' }) {
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
      <Link to={ROUTES.files} className={styles.mark}>
        Bridgit
      </Link>

      <label className={styles.search} htmlFor={searchId}>
        <Search size={14} strokeWidth={1.6} aria-hidden="true" />
        <input id={searchId} type="search" placeholder="Buscar" autoComplete="off" aria-label="Buscar" />
      </label>

      <div className={styles.user}>
        <span className={styles.avatar} aria-hidden="true">
          {initials}
        </span>
        <span className={styles.meta}>
          <span className={styles.name}>{userName}</span>
          <span className={styles.role}>{userRole}</span>
        </span>
      </div>
    </header>
  )
}
