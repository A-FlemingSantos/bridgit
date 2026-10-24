import { useId, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, FileText, LayoutDashboard, Plus } from 'lucide-react'
import AccountAvatar from '../../../../shared/components/AccountAvatar/AccountAvatar.jsx'
import AddAccountMenu from '../../../../shared/components/AddAccountMenu/AddAccountMenu.jsx'
import OverflowMenu from '../../../../shared/components/OverflowMenu/OverflowMenu.jsx'
import { PixelCopy, PixelFolder, PixelLink, PixelUnlink } from '../../../../shared/components/PixelIcons/PixelIcons.jsx'
import { driveFileUrl, driveUrl, ROUTES } from '../../../../shared/config/routes.js'
import { useHubActions, useProviders, usePublicLinks, useShortcuts } from '../../../../shared/hub/index.js'
import { hubErrorMessage } from '../../../../shared/state/hubErrorMessage.js'
import { useHub } from '../../../../shared/state/HubState.jsx'
import { fileNavState, usePageLocation } from '../../../../shared/utils/fileOverlay.js'
import { settingsNavState } from '../../../../shared/utils/settingsOverlay.js'
import ProviderMark from '../../../spaces/components/ProviderMark.jsx'
import { fileMenuItems } from '../../../spaces/components/entryActions.jsx'
import { formatRelativeTime } from '../../formatRelativeTime.js'
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

const PROVIDER_LABELS = {
  onedrive: 'OneDrive',
  'google-drive': 'Google Drive',
  dropbox: 'Dropbox',
}

function Group({ title, children }) {
  const [open, setOpen] = useState(true)
  const bodyId = useId()

  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>
        <button
          type="button"
          className={styles.groupToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronRight
            className={[styles.chevron, open ? styles.chevronOpen : ''].filter(Boolean).join(' ')}
            size={14}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          {title}
        </button>
      </h2>
      <div id={bodyId} className={styles.groupBody} hidden={!open}>
        {children}
      </div>
    </section>
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

function PublicLinkRow({ link, onError }) {
  const actions = useHubActions()
  const providerName = PROVIDER_LABELS[link.provider] ?? link.provider

  const items = [
    {
      id: 'copy',
      label: 'Copiar link',
      icon: PixelCopy,
      onSelect: () => {
        void navigator.clipboard?.writeText(link.url).catch((error) => onError?.(error))
      },
    },
    {
      id: 'disable',
      label: 'Desativar link',
      icon: PixelUnlink,
      danger: true,
      onSelect: () => {
        void actions
          .disablePublicLink({ connectionId: link.connectionId, ref: link.ref })
          .catch((error) => onError?.(error))
      },
    },
  ]

  return (
    <div className={styles.itemWrap}>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.item}
        aria-label={`Link público de ${link.name}`}
      >
        <span className={styles.itemIcon} aria-hidden="true">
          {link.kind === 'folder' ? <PixelFolder /> : <PixelLink />}
        </span>
        <span className={styles.itemMeta}>
          <span className={styles.itemName}>{link.name}</span>
          <span className={styles.itemSub}>
            {providerName}
            {link.createdAt ? ` · ${formatRelativeTime(link.createdAt)}` : ''}
          </span>
        </span>
      </a>
      <OverflowMenu
        ghost
        hoverReveal
        label={`Ações do link de ${link.name}`}
        title={link.name}
        items={items}
      />
    </div>
  )
}

// The app-wide side panel. HomePage passes its own handlers so errors surface in
// the page; elsewhere the panel is self-contained and reports errors itself.
export default function HomeSidebar({ menuContext, onConnect, onError }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { openOverlay } = useHub()
  const actions = useHubActions()
  const { providers, status: providersStatus } = useProviders()
  const shortcutsQuery = useShortcuts()
  const linksQuery = usePublicLinks()
  const [localError, setLocalError] = useState(null)
  const shortcuts = shortcutsQuery.entries
  const links = linksQuery.entries
  const homeActive = usePageLocation().pathname === ROUTES.home

  const handleError = onError ?? ((error) => setLocalError(hubErrorMessage(error)))
  // Only the provider-list error state uses this; adding an account opens the menu below.
  const handleConnect = onConnect
    ?? (() => navigate(ROUTES.settingsProviders, { state: settingsNavState(location) }))
  const fileMenuContext = menuContext
    ?? ((file) => ({
      openOverlay,
      actions,
      isShortcut: shortcutsQuery.isShortcut,
      hasPublicLink: linksQuery.isPublic,
      navigate,
      location,
      providerName: PROVIDER_LABELS[file.provider] ?? file.provider,
      onError: handleError,
    }))

  return (
    <div className={styles.panel}>
      <p className={styles.title}>Início</p>

      {localError ? (
        <p className={styles.empty} role="alert">
          {localError}
        </p>
      ) : null}

      <nav className={styles.primary} aria-label="Seções">
        <Link
          to={ROUTES.home}
          className={[styles.item, homeActive ? styles.itemActive : ''].filter(Boolean).join(' ')}
          aria-current={homeActive ? 'page' : undefined}
        >
          <LayoutDashboard className={styles.itemIcon} size={16} strokeWidth={1.7} aria-hidden="true" />
          <span className={styles.itemName}>Visão geral</span>
        </Link>
      </nav>

      <Group title="Dispositivos">
        <WindowsDeviceButton />
      </Group>

      <Group title="Minhas contas">
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
          <nav className={styles.list} aria-label="Minhas contas">
            {providers.flatMap((provider) =>
              provider.connections?.length > 0
                ? provider.connections.map((connection) => (
                    <ConnectionLink key={connection.connectionId} connection={connection} />
                  ))
                : [<ProviderGhostLink key={provider.id} provider={provider} />],
            )}
          </nav>
        )}
        <AddAccountMenu className={[styles.item, styles.addItem].join(' ')} onError={handleError}>
          <Plus className={styles.itemIcon} size={16} strokeWidth={1.7} aria-hidden="true" />
          <span className={styles.itemName}>Nova conta</span>
        </AddAccountMenu>
      </Group>

      <Group title="Links públicos">
        {linksQuery.status === 'loading' || linksQuery.status === 'idle' ? (
          <p className={styles.empty}>Carregando…</p>
        ) : linksQuery.status === 'error' ? (
          <p className={styles.empty} role="alert">
            {hubErrorMessage(linksQuery.error)}
          </p>
        ) : links.length === 0 ? (
          <p className={styles.empty}>Nenhum link. Publique um arquivo ou uma pasta pelo menu ⋯.</p>
        ) : (
          <div className={styles.list}>
            {links.map((link) => (
              <PublicLinkRow key={`${link.connectionId}-${link.ref}`} link={link} onError={handleError} />
            ))}
          </div>
        )}
      </Group>

      <Group title="Atalhos">
        {shortcutsQuery.status === 'loading' ? (
          <p className={styles.empty}>Carregando…</p>
        ) : shortcutsQuery.status === 'error' ? (
          <p className={styles.empty} role="alert">
            {hubErrorMessage(shortcutsQuery.error)}
          </p>
        ) : shortcuts.length === 0 ? (
          <p className={styles.empty}>Fixe arquivos pelo menu ⋯ para tê-los aqui.</p>
        ) : (
          <div className={styles.list}>
            {shortcuts.map((file) => (
              <div key={`${file.connectionId}-${file.ref}`} className={styles.itemWrap}>
                <Link
                  to={driveFileUrl(file.connectionId, file.ref)}
                  state={fileNavState(location)}
                  className={styles.item}
                  aria-label={file.name}
                >
                  <FileText className={styles.itemIcon} size={16} strokeWidth={1.6} aria-hidden="true" />
                  <span className={styles.itemName}>{file.name}</span>
                </Link>
                <OverflowMenu
                  ghost
                  hoverReveal
                  label={`Ações de ${file.name}`}
                  title={file.name}
                  items={fileMenuItems(
                    {
                      connectionId: file.connectionId,
                      provider: file.provider,
                      ref: file.ref,
                      name: file.name,
                      parentRef: undefined,
                      mimeType: file.mimeType,
                      extension: file.extension,
                    },
                    fileMenuContext(file),
                  )}
                />
              </div>
            ))}
          </div>
        )}
      </Group>
    </div>
  )
}
