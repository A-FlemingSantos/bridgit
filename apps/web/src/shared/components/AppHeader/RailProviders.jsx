import { Link, useLocation } from 'react-router-dom'
import {
  LinkWindowsIcon,
  useWindowsDevice,
  WindowsLogo,
  WINDOWS_DEVICE_NAME,
} from '../../../features/home/components/HomeSidebar/windowsDevice.jsx'
import ProviderMark from '../../../features/spaces/components/ProviderMark.jsx'
import { providerUrl, ROUTES } from '../../config/routes.js'
import { useProviders } from '../../hub/index.js'
import { settingsNavState } from '../../utils/settingsOverlay.js'
import styles from './AppHeader.module.css'

const EXPIRED = 'RECONEXAO_NECESSARIA'

// Icon-only devices and providers shown under the home button while the side
// panel is collapsed. The Windows link is the same one as the open panel.
// Connected providers open their root; expired or disconnected ones lead to settings.
function WindowsRailButton() {
  const [linked, link] = useWindowsDevice()
  const label = linked ? `Windows 10 ${WINDOWS_DEVICE_NAME}` : 'Vincular ao Windows'

  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-pressed={linked}
      aria-label={label}
      title={linked ? 'Windows 10' : 'Vincular ao Windows'}
      onClick={link}
    >
      {linked ? <WindowsLogo /> : <LinkWindowsIcon />}
    </button>
  )
}

export default function RailProviders() {
  const { providers, status } = useProviders()

  return (
    <div className={styles.railProviders}>
      <hr className={styles.divider} />
      <nav className={styles.railGroup} aria-label="Dispositivos">
        <WindowsRailButton />
      </nav>
      {status === 'ready' ? <ProviderLinks providers={providers} /> : null}
    </div>
  )
}

function ProviderLinks({ providers }) {
  const location = useLocation()

  return (
    <nav className={styles.railGroup} aria-label="Provedores">
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
            <ProviderMark id={provider.id} size={24} />
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
