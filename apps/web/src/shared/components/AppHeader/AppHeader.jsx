import { Link, useLocation } from 'react-router-dom'
import { ROUTES } from '../../config/routes.js'
import {
  isSettingsPath,
  resolveSettingsBackground,
  settingsNavState,
} from '../../utils/settingsOverlay.js'
import BrandMark from '../BrandMark/BrandMark.jsx'
import styles from './AppHeader.module.css'
import RailProviders from './RailProviders.jsx'

function isHomeNavActive(pathname) {
  return pathname === ROUTES.home
    || pathname.startsWith('/providers/')
}

function railClass(active) {
  return [styles.iconButton, active ? styles.iconButtonActive : ''].filter(Boolean).join(' ')
}

// Vertical navigation rail of the authenticated app. `panel` is passed when the
// page has a collapsible sidebar, so the rail can offer its toggle.
export default function AppHeader({ panel = null }) {
  const location = useLocation()
  const settingsActive = isSettingsPath(location.pathname)
  const pagePathname = settingsActive
    ? resolveSettingsBackground(location).pathname
    : location.pathname
  const homeActive = isHomeNavActive(pagePathname)
  const settingsState = settingsNavState(location)

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
        </nav>

        {panel?.collapsed ? <RailProviders /> : null}
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              fill="currentColor"
              viewBox="0 0 24 24"
              shapeRendering="crispEdges"
              className={panel.collapsed ? styles.pixelIcon : `${styles.pixelIcon} ${styles.flipped}`}
              aria-hidden="true"
            >
              <path d="M20 4v16h2V4zM2 11v2h16v-2zm12 2v2h2v-2zm-2 2v2h2v-2zm-2 2v2h2v-2zm4-8v2h2V9zm-2-2v2h2V7zm-2-2v2h2V5z" />
            </svg>
          </button>
        ) : null}

        <Link
          to={ROUTES.settings}
          state={settingsState}
          className={railClass(settingsActive)}
          aria-label="Configurações"
          aria-current={settingsActive ? 'page' : undefined}
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
            <path d="M10 22H6v-2h4v2Zm-4-2H4v-2H2v-2h2v-2h2v6Zm6-4h10v2H12v2h-2v-6h2v2Zm-2-2H6v-2h4v2Zm8-2h-4v-2h4v2Zm-6-4H2V6h10V4h2v6h-2V8Zm8-2h2v2h-2v2h-2V4h2v2Zm-2-2h-4V2h4v2Z" />
          </svg>
        </Link>

        <hr className={styles.divider} />

        <Link
          to={ROUTES.settings}
          state={settingsState}
          className={styles.accountButton}
          aria-label="Conta"
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
            <path d="M6 2h8v2H6zm0 18h12v2H6zM4 4h2v2H4zM2 6h2v12H2zm20 4h-2v8h2zM4 18h2v2H4zm16 0h-2v2h2zM10 6h4v2h-4zM8 8h2v4H8zm2 4h4v2h-4zm4-4h2v4h-2zm-8 8h12v2H6zM18 2h2v2h-2zm-2 2h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2z" />
          </svg>
        </Link>
      </div>
    </header>
  )
}
