import { House, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { ROUTES } from '../../config/routes.js'
import {
  isSettingsPath,
  resolveSettingsBackground,
  settingsNavState,
} from '../../utils/settingsOverlay.js'
import { resolveAppHeaderBreadcrumb } from './resolveAppHeaderBreadcrumb.js'
import styles from './AppHeader.module.css'

function isSpacesNavActive(pathname) {
  return pathname === ROUTES.spaces
    || pathname.startsWith(`${ROUTES.spaces}/`)
    || pathname.startsWith('/providers/')
}

function BreadcrumbItem({ item }) {
  if (item.current || !item.to) {
    return (
      <span className={styles.breadcrumbCurrent} aria-current="page">
        {item.label}
      </span>
    )
  }

  return (
    <Link className={styles.breadcrumbLink} to={item.to}>
      {item.label}
    </Link>
  )
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
  const spacesActive = isSpacesNavActive(pagePathname)
  const { items } = resolveAppHeaderBreadcrumb(pagePathname)
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
            to={ROUTES.spaces}
            className={[styles.iconButton, spacesActive ? styles.iconButtonActive : '']
              .filter(Boolean)
              .join(' ')}
            aria-label="Spaces"
            aria-current={spacesActive ? 'page' : undefined}
          >
            <House size={16} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </nav>

        <span className={styles.pipe} aria-hidden="true">|</span>

        <nav className={styles.breadcrumb} aria-label="Localização atual">
          {items.map((crumb, index) => (
            <span key={`${crumb.label}-${crumb.to ?? 'current'}`} className={styles.breadcrumbSegment}>
              {index > 0 ? (
                <span className={styles.separator} aria-hidden="true">/</span>
              ) : null}
              <BreadcrumbItem item={crumb} />
            </span>
          ))}
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
