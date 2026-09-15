import { House, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { ROUTES } from '../../config/routes.js'
import {
  isSettingsPath,
  resolveSettingsBackground,
  settingsNavState,
} from '../../utils/settingsOverlay.js'
import styles from './AppHeader.module.css'

function isHomeNavActive(pathname) {
  return pathname === ROUTES.home
    || pathname.startsWith('/providers/')
}

/**
 * @typedef {Object} AppHeaderProps
 * @property {string} [userName]
 */

export default function AppHeader({ userName = 'arthur' }) {
  const location = useLocation()
  const settingsActive = isSettingsPath(location.pathname)
  const pagePathname = settingsActive
    ? resolveSettingsBackground(location).pathname
    : location.pathname
  const homeActive = isHomeNavActive(pagePathname)
  const settingsState = settingsNavState(location)
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <header className={styles.header} data-authenticated-app-header>
      <div className={styles.leading}>
        <nav className={styles.primaryNav} aria-label="Navegação principal">
          <Link
            to={ROUTES.home}
            className={[styles.iconButton, homeActive ? styles.iconButtonActive : '']
              .filter(Boolean)
              .join(' ')}
            aria-label="Início"
            aria-current={homeActive ? 'page' : undefined}
          >
            <House size={16} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </nav>
      </div>

      <div className={styles.trailing}>
        <Link
          to={ROUTES.settings}
          state={settingsState}
          className={[styles.iconButton, settingsActive ? styles.iconButtonActive : '']
            .filter(Boolean)
            .join(' ')}
          aria-label="Configurações"
          aria-current={settingsActive ? 'page' : undefined}
        >
          <Settings size={16} strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <Link
          to={ROUTES.settings}
          state={settingsState}
          className={styles.accountButton}
          aria-label="Conta"
        >
          <span className={styles.avatar} aria-hidden="true">
            {initials}
          </span>
        </Link>
      </div>
    </header>
  )
}
