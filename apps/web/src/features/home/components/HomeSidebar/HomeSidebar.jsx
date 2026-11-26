import { useContext, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import AccountAvatar from '../../../../shared/components/AccountAvatar/AccountAvatar.jsx'
import AddAccountMenu from '../../../../shared/components/AddAccountMenu/AddAccountMenu.jsx'
import { SidebarCollapsedContext } from '../../../../shared/components/AppShell/SidebarCollapsedContext.js'
import { PixelHome } from '../../../../shared/components/PixelIcons/PixelIcons.jsx'
import { driveUrl, ROUTES } from '../../../../shared/config/routes.js'
import { useProviders } from '../../../../shared/hub/index.js'
import { useSession } from '../../../../shared/auth/SessionContext.jsx'
import { hubErrorMessage } from '../../../../shared/state/hubErrorMessage.js'
import { settingsNavState } from '../../../../shared/utils/settingsOverlay.js'
import { usePageLocation } from '../../../../shared/utils/fileOverlay.js'
import ProviderMark from '../../../spaces/components/ProviderMark.jsx'
import styles from './HomeSidebar.module.css'
import { LinkWindowsIcon, useWindowsDevice, WindowsLogo, WINDOWS_DEVICE_NAME } from './windowsDevice.jsx'

const EXPIRED = 'RECONEXAO_NECESSARIA'

function WindowsDeviceButton() {
  const [linked, link] = useWindowsDevice()

  return (
    <button
      type="button"
      className={[styles.item, styles.deviceItem].join(' ')}
      aria-pressed={linked}
      onClick={link}
      hidden
    >
      <span className={styles.deviceMark}>
        {linked ? <WindowsLogo /> : <LinkWindowsIcon />}
      </span>
      <span className={styles.itemMeta}>
        <span className={styles.itemName}>{linked ? 'Windows 10' : 'Vincular ao Windows'}</span>
        {linked ? <span className={styles.itemSub}>{WINDOWS_DEVICE_NAME}</span> : null}
      </span>
    </button>
  )
}

// One connected account. Name falls back to the email, then to the provider's name.
function accountLabels(connection) {
  const { account, providerName } = connection
  const name = account?.name || account?.email || providerName
  const sub = account?.email && account.email !== name ? account.email : providerName
  return { name, sub }
}

function ConnectionLink({ connection }) {
  const { name, sub } = accountLabels(connection)

  if (connection.lastError === EXPIRED) {
    return (
      <Link
        to={ROUTES.settingsProviders}
        state={settingsNavState({ pathname: ROUTES.home })}
        className={styles.item}
        aria-label={`${connection.providerName} ${name} Acesso expirado`}
      >
        <AccountAvatar connection={connection} size={24} />
        <span className={styles.itemMeta}>
          <span className={styles.itemName}>{name}</span>
          <span className={styles.itemSub}>Acesso expirado · Reconectar</span>
        </span>
      </Link>
    )
  }

  return (
    <Link
      to={driveUrl(connection.connectionId)}
      className={styles.item}
      aria-label={`${connection.providerName} ${name} Conectado`}
    >
      <AccountAvatar connection={connection} size={24} />
      <span className={styles.itemMeta}>
        <span className={styles.itemName}>{name}</span>
        <span className={styles.itemSub}>{sub}</span>
      </span>
    </Link>
  )
}

// A provider with no account yet.
function ProviderGhostLink({ provider }) {
  return (
    <Link
      to={ROUTES.settingsProviders}
      state={settingsNavState({ pathname: ROUTES.home })}
      className={[styles.item, styles.itemGhost].join(' ')}
      aria-label={`${provider.name} Desconectado`}
    >
      <ProviderMark id={provider.id} size={24} />
      <span className={styles.itemMeta}>
        <span className={styles.itemName}>{provider.name}</span>
        <span className={styles.itemSub}>Conectar</span>
      </span>
    </Link>
  )
}

// The app-wide side panel. HomePage passes its own handlers so errors surface in
// the page; elsewhere the panel is self-contained and reports errors itself.
export default function HomeSidebar({ onConnect, onError }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useSession()
  const { providers, status: providersStatus } = useProviders()
  const collapsed = useContext(SidebarCollapsedContext)
  const [localError, setLocalError] = useState(null)
  const homeActive = usePageLocation().pathname === ROUTES.home

  const handleError = onError ?? ((error) => setLocalError(hubErrorMessage(error)))
  // Only the provider-list error state uses this; adding an account opens the menu below.
  const handleConnect = onConnect
    ?? (() => navigate(ROUTES.settingsProviders, { state: settingsNavState(location) }))

  return (
    <div className={[styles.panel, collapsed ? styles.panelCollapsed : ''].filter(Boolean).join(' ')}>
      <p className={styles.title}>{user?.username ?? 'Início'}</p>

      {localError ? (
        <p className={styles.empty} role="alert">
          {localError}
        </p>
      ) : null}

      <nav className={styles.rail} aria-label="Navegação principal">
        <Link
          to={ROUTES.home}
          className={[styles.item, homeActive ? styles.itemActive : ''].filter(Boolean).join(' ')}
          aria-current={homeActive ? 'page' : undefined}
        >
          <PixelHome size={24} className={styles.itemIcon} />
          <span className={styles.itemName}>Início</span>
        </Link>

        <WindowsDeviceButton />

        {providersStatus === 'loading' || providersStatus === 'idle' ? (
          <p className={styles.empty}>Carregando…</p>
        ) : providersStatus === 'error' ? (
          <>
            <p className={styles.empty} role="alert">
              Não foi possível carregar os provedores.
            </p>
            <button type="button" className={styles.inlineAction} onClick={handleConnect}>
              Conectar
            </button>
          </>
        ) : (
          providers.flatMap((provider) =>
            provider.connections?.length > 0
              ? provider.connections.map((connection) => (
                  <ConnectionLink key={connection.connectionId} connection={connection} />
                ))
              : [<ProviderGhostLink key={provider.id} provider={provider} />],
          )
        )}

        <AddAccountMenu className={[styles.item, styles.addItem].join(' ')} onError={handleError}>
          <Plus className={styles.itemIcon} size={24} strokeWidth={1.7} aria-hidden="true" />
          <span className={styles.itemName}>Nova conta</span>
        </AddAccountMenu>
      </nav>
    </div>
  )
}
