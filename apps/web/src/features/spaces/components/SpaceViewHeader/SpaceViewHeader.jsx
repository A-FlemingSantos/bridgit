import { Link, useLocation } from 'react-router-dom'
import {
  isSettingsPath,
  resolveSettingsBackground,
} from '../../../../shared/utils/settingsOverlay.js'
import ProviderMark from '../ProviderMark.jsx'
import { resolveSpaceViewBreadcrumb } from './resolveSpaceViewBreadcrumb.js'
import styles from './SpaceViewHeader.module.css'

export default function SpaceViewHeader({ trailing = null }) {
  const location = useLocation()
  const pagePathname = isSettingsPath(location.pathname)
    ? resolveSettingsBackground(location).pathname
    : location.pathname
  const { items } = resolveSpaceViewBreadcrumb(pagePathname)
  const ancestors = items.filter((crumb) => !crumb.current)
  const current = items.find((crumb) => crumb.current) ?? items[items.length - 1]

  return (
    <header className={styles.band}>
      {ancestors.length > 0 ? (
        <nav className={styles.crumbs} aria-label="Localização atual">
          {ancestors.map((crumb, index) => (
            <span key={`${crumb.label}-${crumb.to ?? index}`} className={styles.crumbSegment}>
              <Link to={crumb.to} className={styles.crumb}>
                {crumb.label}
              </Link>
              <span className={styles.separator} aria-hidden="true">/</span>
            </span>
          ))}
        </nav>
      ) : null}
      <div className={styles.titleRow}>
        <h1>
          {current?.label}
          {current?.providerId ? (
            <ProviderMark id={current.providerId} size={36} />
          ) : null}
        </h1>
        {trailing}
      </div>
    </header>
  )
}
