import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FiMinus, FiPlus } from 'react-icons/fi'
import AccountAvatar from '../../../shared/components/AccountAvatar/AccountAvatar.jsx'
import AddAccountMenu from '../../../shared/components/AddAccountMenu/AddAccountMenu.jsx'
import { ROUTES, sanitizeInternalAppRedirect } from '../../../shared/config/routes.js'
import { resolveSettingsBackground } from '../../../shared/utils/settingsOverlay.js'
import { useConnections } from '../../../shared/hub/hooks.js'
import { hubErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import styles from './SettingsPage.module.css'

const PROVIDER_LABELS = {
  onedrive: 'OneDrive',
  'google-drive': 'Google Drive',
  dropbox: 'Dropbox',
}

const BANNER_SUCCESS_MS = 6000

const OAUTH_ERROR_MESSAGES = {
  PROVEDOR_RECUSOU: 'O provedor recusou a autorização.',
  OAUTH_STATE_EXPIRADO: 'A autorização expirou. Tente conectar novamente.',
  OAUTH_STATE_INVALIDO: 'A autorização é inválida. Tente conectar novamente.',
  REFRESH_TOKEN_AUSENTE: 'Não foi possível manter a conexão. Reconecte o provedor.',
  OAUTH_TROCA_FALHOU: 'Não foi possível concluir a conexão.',
  OAUTH_CODE_AUSENTE: 'O provedor não devolveu a autorização. Tente conectar de novo.',
  OAUTH_TROCA_TEMPORARIA: 'O provedor não respondeu. Tente conectar de novo.',
  PROVEDOR_NAO_CONFIGURADO: 'Este provedor ainda não foi configurado no servidor.',
}

function mapOAuthError(code) {
  if (!code) return 'Não foi possível conectar o provedor.'
  return OAUTH_ERROR_MESSAGES[code] ?? 'Não foi possível conectar o provedor.'
}

function accountLabel(connection) {
  return connection.account?.email ?? connection.account?.name ?? connection.providerName
}

function toBackgroundLocation(value) {
  const url = new URL(value, 'http://localhost')
  return { pathname: url.pathname, search: url.search, hash: url.hash, state: null }
}

export default function ProvidersTab() {
  const location = useLocation()
  const navigate = useNavigate()
  const { status, connections, error, connect, disconnect } = useConnections()
  const [confirmSignOutId, setConfirmSignOutId] = useState(null)
  const [banner, setBanner] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState(null)

  // OAuth comes back to the page behind the settings overlay, not to the overlay itself.
  const background = resolveSettingsBackground(location)
  const redirectTo = `${background.pathname}${background.search ?? ''}${background.hash ?? ''}`

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const providerId = params.get('provider')
    const oauthStatus = params.get('status')
    if (!providerId || !oauthStatus) return

    if (oauthStatus === 'connected') {
      const label = PROVIDER_LABELS[providerId] ?? providerId
      setBanner({ type: 'success', message: `${label} conectado` })
    } else {
      setBanner({ type: 'error', message: mapOAuthError(params.get('error')) })
    }

    const backgroundLocation = toBackgroundLocation(sanitizeInternalAppRedirect(params.get('background')))
    navigate(ROUTES.settingsProviders, { replace: true, state: { backgroundLocation } })
  }, [location.search, navigate])

  useEffect(() => {
    if (banner?.type !== 'success') return undefined
    const timer = window.setTimeout(() => setBanner(null), BANNER_SUCCESS_MS)
    return () => window.clearTimeout(timer)
  }, [banner])

  async function handleReconnect(connection) {
    const { connectionId } = connection
    setPendingId(connectionId)
    setActionError((prev) => (prev?.connectionId === connectionId ? null : prev))
    try {
      await connect(connection.provider, redirectTo)
    } catch (err) {
      setActionError({ connectionId, message: hubErrorMessage(err, 'Não foi possível conectar o provedor.') })
    } finally {
      setPendingId((current) => (current === connectionId ? null : current))
    }
  }

  async function handleSignOut(connectionId) {
    setPendingId(connectionId)
    setActionError((prev) => (prev?.connectionId === connectionId ? null : prev))
    try {
      await disconnect(connectionId)
      setConfirmSignOutId(null)
    } catch (err) {
      setActionError({ connectionId, message: hubErrorMessage(err, 'Não foi possível sair desta conta.') })
    } finally {
      setPendingId((current) => (current === connectionId ? null : current))
    }
  }

  return (
    <section id="settings-providers" className={styles.pane}>
      <h2 className={styles.paneTitle}>Minhas contas</h2>
      <p className={styles.lead}>A conexão vale para todo o Bridgit.</p>

      {banner ? (
        <div className={styles.banner}>
          <p className={styles.bannerText} role={banner.type === 'error' ? 'alert' : 'status'}>
            {banner.message}
          </p>
          <button type="button" className={styles.bannerClose} onClick={() => setBanner(null)}>
            Dispensar
          </button>
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error.message}
        </p>
      ) : null}

      {status === 'loading' && connections.length === 0 ? (
        <p className={styles.hint}>Carregando contas…</p>
      ) : null}

      <ul className={styles.list}>
        {connections.map((connection) => {
          const { connectionId } = connection
          const label = accountLabel(connection)
          const expired = connection.lastError === 'RECONEXAO_NECESSARIA'
          const confirming = confirmSignOutId === connectionId
          const busy = pendingId === connectionId
          const failure = actionError?.connectionId === connectionId ? actionError.message : null

          return (
            <li key={connectionId} className={styles.row} data-static="">
              <AccountAvatar connection={connection} size={28} />
              <span className={styles.rowBody}>
                <span className={`${styles.rowTitle} ${styles.rowClip}`}>{label}</span>
                {confirming ? (
                  <span className={styles.rowHint}>Sair desta conta? Os arquivos continuam no provedor.</span>
                ) : expired ? (
                  <span className={styles.rowHint} data-expired="">Acesso expirado</span>
                ) : null}
                {failure ? (
                  <span className={styles.rowHint} data-error="" role="alert">
                    {failure}
                  </span>
                ) : null}
              </span>
              {confirming ? (
                <span className={styles.pair}>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={busy}
                    onClick={() => setConfirmSignOutId(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={busy}
                    onClick={() => void handleSignOut(connectionId)}
                  >
                    Sair
                  </button>
                </span>
              ) : (
                <>
                  {expired ? (
                    <button
                      type="button"
                      className={styles.secondary}
                      disabled={busy}
                      onClick={() => void handleReconnect(connection)}
                    >
                      Reconectar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={styles.rowAction}
                    aria-label={`Sair de ${label}`}
                    title="Sair"
                    disabled={busy}
                    onClick={() => setConfirmSignOutId(connectionId)}
                  >
                    <FiMinus size={18} aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          )
        })}
        <li>
          <AddAccountMenu
            className={styles.row}
            label="Adicionar conta"
            redirectTo={redirectTo}
            onError={(err) => setBanner({ type: 'error', message: hubErrorMessage(err, 'Não foi possível conectar o provedor.') })}
          >
            <FiPlus size={20} className={styles.rowIcon} aria-hidden="true" />
            <span className={styles.rowBody}>
              <span className={styles.rowTitle}>Adicionar conta</span>
            </span>
          </AddAccountMenu>
        </li>
      </ul>
    </section>
  )
}
