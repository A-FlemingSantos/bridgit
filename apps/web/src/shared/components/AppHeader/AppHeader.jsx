import { Link, useLocation } from 'react-router-dom'
import { ROUTES } from '../../config/routes.js'
import {
  isSettingsPath,
  settingsNavState,
} from '../../utils/settingsOverlay.js'
import BrandMark from '../BrandMark/BrandMark.jsx'
import styles from './AppHeader.module.css'

function railClass(active) {
  return [styles.iconButton, active ? styles.iconButtonActive : ''].filter(Boolean).join(' ')
}

export function PanelIcon({ collapsed }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      className={collapsed ? styles.pixelIcon : `${styles.pixelIcon} ${styles.flipped}`}
      aria-hidden="true"
    >
      <path d="M20 4v16h2V4zM2 11v2h16v-2zm12 2v2h2v-2zm-2 2v2h2v-2zm-2 2v2h2v-2zm4-8v2h2V9zm-2-2v2h2V7zm-2-2v2h2V5z" />
    </svg>
  )
}

// Shared horizontal header of the authenticated app.
export default function AppHeader({ children = null }) {
  const location = useLocation()
  const settingsActive = isSettingsPath(location.pathname)
  const settingsState = settingsNavState(location)

  return (
    <header className={styles.header} data-authenticated-app-header>
      <div className={styles.leading}>
        <Link to={ROUTES.home} className={styles.brand} aria-label="Bridgit">
          <BrandMark />
        </Link>
        <div className={styles.modePill} role="group" aria-label="Tipo de conteúdo">
          <span className={[styles.modeOption, styles.modeOptionActive].join(' ')}>Arquivos</span>
          <span className={styles.modeOption}>Fotos</span>
        </div>
      </div>

      {children ? <div className={styles.pageHeader}>{children}</div> : null}

      <div className={styles.trailing}>
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
