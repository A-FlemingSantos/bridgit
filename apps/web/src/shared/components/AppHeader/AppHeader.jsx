import { Layers, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useSession } from '../../auth/SessionContext.jsx'
import { ROUTES } from '../../config/routes.js'
import {
  isSettingsPath,
  resolveSettingsBackground,
  settingsNavState,
} from '../../utils/settingsOverlay.js'
import BrandMark from '../BrandMark/BrandMark.jsx'
import styles from './AppHeader.module.css'

function isHomeNavActive(pathname) {
  return pathname === ROUTES.home
    || pathname.startsWith('/providers/')
}

function isSpacesNavActive(pathname) {
  return pathname === ROUTES.spaces
    || pathname.startsWith(`${ROUTES.spaces}/`)
    || pathname.startsWith('/s/')
}

function railClass(active) {
  return [styles.iconButton, active ? styles.iconButtonActive : ''].filter(Boolean).join(' ')
}

// Vertical navigation rail of the authenticated app. `panel` is passed when the
// page has a collapsible sidebar, so the rail can offer its toggle.
export default function AppHeader({ panel = null }) {
  const location = useLocation()
  const { user } = useSession()
  const settingsActive = isSettingsPath(location.pathname)
  const pagePathname = settingsActive
    ? resolveSettingsBackground(location).pathname
    : location.pathname
  const homeActive = isHomeNavActive(pagePathname)
  const spacesActive = isSpacesNavActive(pagePathname)
  const settingsState = settingsNavState(location)
  const initials = (user?.username ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <header className={styles.header} data-authenticated-app-header>
      <div className={styles.leading}>
        <Link to={ROUTES.home} className={styles.brand} aria-label="Bridgit">
          <BrandMark />
        </Link>

        <nav className={styles.primaryNav} aria-label="Navegação principal">
          <Link
            to={ROUTES.home}
            className={railClass(homeActive)}
            aria-label="Início"
            aria-current={homeActive ? 'page' : undefined}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              fill="currentColor"
              viewBox="0 0 24 24"
              shapeRendering="crispEdges"
              className={styles.pixelIcon}
              aria-hidden="true"
            >
              <path d="M10 20h4v-6h2v6h4v2H4v-2h4v-6h2v6Zm-6 0H2V10h2v10Zm18 0h-2V10h2v10Zm-8-6h-4v-2h4v2Zm-8-4H4V8h2v2Zm14 0h-2V8h2v2ZM8 8H6V6h2v2Zm10 0h-2V6h2v2Zm-8-2H8V4h2v2Zm6 0h-2V4h2v2Zm-2-2h-4V2h4v2Z" />
            </svg>
          </Link>
          <Link
            to={ROUTES.spaces}
            className={railClass(spacesActive)}
            aria-label="Spaces"
            aria-current={spacesActive ? 'page' : undefined}
          >
            <Layers size={16} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </nav>
      </div>

      <div className={styles.trailing}>
        {panel ? (
          <button
            type="button"
            className={styles.iconButton}
            onClick={panel.onToggle}
            aria-label={panel.collapsed ? 'Expandir painel' : 'Recolher painel'}
            aria-expanded={!panel.collapsed}
            aria-controls={panel.id}
          >
            {panel.collapsed
              ? <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden="true" />
              : <PanelLeftClose size={16} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        ) : null}

        <Link
          to={ROUTES.settings}
          state={settingsState}
          className={railClass(settingsActive)}
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
