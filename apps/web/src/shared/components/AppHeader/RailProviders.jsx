import { Link, useLocation } from 'react-router-dom'
import ProviderMark from '../../../features/spaces/components/ProviderMark.jsx'
import { providerUrl, ROUTES } from '../../config/routes.js'
import { useProviders } from '../../hub/index.js'
import { settingsNavState } from '../../utils/settingsOverlay.js'
import styles from './AppHeader.module.css'

const EXPIRED = 'RECONEXAO_NECESSARIA'

// Icon-only provider list shown under the home button while the side panel is
// collapsed. Mirrors the panel's links: connected providers open their root,
// expired or disconnected ones lead to the providers settings.
export default function RailProviders() {
  const location = useLocation()
  const { providers, status } = useProviders()

  if (status !== 'ready') return null

  return (
    <nav className={styles.railProviders} aria-label="Provedores">
      <hr className={styles.divider} />
      {providers.map((provider) => {
        const expired = provider.connected && provider.lastError === EXPIRED
        const connected = provider.connected && !expired
        const label = `${provider.name} ${connected ? 'Conectado' : expired ? 'Acesso expirado' : 'Desconectado'}`

        return (
          <Link
            key={provider.id}
            to={connected ? providerUrl(provider.id) : ROUTES.settingsProviders}
            state={connected ? undefined : settingsNavState(location)}
            className={[styles.iconButton, connected ? '' : styles.railProviderOff].filter(Boolean).join(' ')}
            aria-label={label}
            title={provider.name}
          >
            <ProviderMark id={provider.id} size={20} />
          </Link>
        )
      })}
      <Link
        to={ROUTES.settingsProviders}
        state={settingsNavState(location)}
        className={styles.iconButton}
        aria-label="Nova conta"
        title="Nova conta"
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
          <path d="M13 11h7v2h-7v7h-2v-7H4v-2h7V4h2v7Z" />
        </svg>
      </Link>
    </nav>
  )
}
