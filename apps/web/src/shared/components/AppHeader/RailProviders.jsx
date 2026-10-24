import { Link, useLocation } from 'react-router-dom'
import {
  LinkWindowsIcon,
  useWindowsDevice,
  WindowsLogo,
  WINDOWS_DEVICE_NAME,
} from '../../../features/home/components/HomeSidebar/windowsDevice.jsx'
import ProviderMark from '../../../features/spaces/components/ProviderMark.jsx'
import { driveUrl, ROUTES } from '../../config/routes.js'
import { useProviders } from '../../hub/index.js'
import { settingsNavState } from '../../utils/settingsOverlay.js'
import AccountAvatar from '../AccountAvatar/AccountAvatar.jsx'
import AddAccountMenu from '../AddAccountMenu/AddAccountMenu.jsx'
import styles from './AppHeader.module.css'

const EXPIRED = 'RECONEXAO_NECESSARIA'

// Icon-only devices and providers shown under the home button while the side
// panel is collapsed. The Windows link is the same one as the open panel.
// Each connected account (avatar with its provider badge) opens its root; expired accounts and
// providers with no account lead to settings.
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

function accountName(connection) {
  return connection.account?.name || connection.account?.email || connection.providerName
}

function ProviderLinks({ providers }) {
  const location = useLocation()
  const settingsState = settingsNavState(location)

  return (
    <nav className={styles.railGroup} aria-label="Minhas contas">
      {providers.flatMap((provider) => {
        if (!(provider.connections?.length > 0)) {
          return [
            <Link
              key={provider.id}
              to={ROUTES.settingsProviders}
              state={settingsState}
              className={[styles.iconButton, styles.railProviderOff].join(' ')}
              aria-label={`${provider.name} Desconectado`}
              title={provider.name}
            >
              <ProviderMark id={provider.id} size={24} />
            </Link>,
          ]
        }

        return provider.connections.map((connection) => {
          const expired = connection.lastError === EXPIRED
          const name = accountName(connection)

          return (
            <Link
              key={connection.connectionId}
              to={expired ? ROUTES.settingsProviders : driveUrl(connection.connectionId)}
              state={expired ? settingsState : undefined}
              className={[styles.iconButton, expired ? styles.railProviderOff : ''].filter(Boolean).join(' ')}
              aria-label={`${connection.providerName} ${name} ${expired ? 'Acesso expirado' : 'Conectado'}`}
              title={`${name} · ${connection.providerName}`}
            >
              <AccountAvatar connection={connection} size={24} />
            </Link>
          )
        })
      })}
      <AddAccountMenu className={styles.iconButton} title="Nova conta" prefer="beside">
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
      </AddAccountMenu>
    </nav>
  )
}
