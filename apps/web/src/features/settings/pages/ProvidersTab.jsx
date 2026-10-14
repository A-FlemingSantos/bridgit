import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ProviderMark from '../../spaces/components/ProviderMark.jsx'
import { ROUTES, sanitizeInternalAppRedirect } from '../../../shared/config/routes.js'
import { resolveSettingsBackground } from '../../../shared/utils/settingsOverlay.js'
import { useProviders } from '../../../shared/hub/hooks.js'
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

// The API refuses to replace the connected account without an explicit confirmation.
const ACCOUNT_CHANGE_ERROR = 'OAUTH_CONTA_DIFERENTE'

function mapOAuthError(code) {
  if (!code) return 'Não foi possível conectar o provedor.'
  return OAUTH_ERROR_MESSAGES[code] ?? 'Não foi possível conectar o provedor.'
}

function providerAccountLabel(provider) {
  if (!provider.connected) return 'Não conectado'
  if (provider.lastError === 'RECONEXAO_NECESSARIA') return 'Acesso expirado. Reconecte para atualizar os arquivos.'
  return provider.account?.email ?? provider.account?.name ?? 'Conectado'
}

function toBackgroundLocation(value) {
  const url = new URL(value, 'http://localhost')
  return { pathname: url.pathname, search: url.search, hash: url.hash, state: null }
}

export default function ProvidersTab() {
  const location = useLocation()
  const navigate = useNavigate()
  const { status, providers, error, connect, disconnect } = useProviders()
  const [confirmDisconnectId, setConfirmDisconnectId] = useState(null)
  const [banner, setBanner] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [accountChangeId, setAccountChangeId] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const providerId = params.get('provider')
    const oauthStatus = params.get('status')
    if (!providerId || !oauthStatus) return

    if (oauthStatus === 'connected') {
      const label = PROVIDER_LABELS[providerId] ?? providerId
      setBanner({ type: 'success', message: `${label} conectado` })
      setAccountChangeId(null)
    } else if (params.get('error') === ACCOUNT_CHANGE_ERROR) {
      setBanner(null)
      setAccountChangeId(providerId)
    } else {
      setBanner({ type: 'error', message: mapOAuthError(params.get('error')) })
    }

    const background = toBackgroundLocation(sanitizeInternalAppRedirect(params.get('background')))
    navigate(ROUTES.settingsProviders, { replace: true, state: { backgroundLocation: background } })
  }, [location.search, navigate])

  useEffect(() => {
    if (banner?.type !== 'success') return undefined
    const timer = window.setTimeout(() => setBanner(null), BANNER_SUCCESS_MS)
    return () => window.clearTimeout(timer)
  }, [banner])

  async function handleConnect(providerId, options) {
    const background = resolveSettingsBackground(location)
    const redirectTo = `${background.pathname}${background.search ?? ''}${background.hash ?? ''}`
    setPendingId(providerId)
    setActionError((prev) => (prev?.providerId === providerId ? null : prev))
    try {
      await connect(providerId, redirectTo, options)
    } catch (err) {
      setActionError({
        providerId,
        action: 'connect',
        message: hubErrorMessage(err, 'Não foi possível conectar o provedor.'),
      })
    } finally {
      setPendingId((current) => (current === providerId ? null : current))
    }
  }

  function handleConfirmAccountChange() {
    const providerId = accountChangeId
    setAccountChangeId(null)
    void handleConnect(providerId, { allowAccountChange: true })
  }

  async function handleDisconnect(providerId) {
    setPendingId(providerId)
    setActionError((prev) => (prev?.providerId === providerId ? null : prev))
    try {
      await disconnect(providerId)
      setConfirmDisconnectId(null)
    } catch (err) {
      setActionError({
        providerId,
        action: 'disconnect',
        message: hubErrorMessage(err, 'Não foi possível desconectar o provedor.'),
      })
    } finally {
      setPendingId((current) => (current === providerId ? null : current))
    }
  }

  return (
    <section className={styles.pane}>
      <h1>Provedores</h1>
      <p className={styles.lead}>A conexão é global. Cada space só escolhe o que entra nele.</p>

      {banner ? (
        <div className={styles.banner}>
          <p className={styles.hint} role={banner.type === 'error' ? 'alert' : 'status'}>
            {banner.message}
          </p>
          <button type="button" className={styles.bannerClose} onClick={() => setBanner(null)}>
            Dispensar
          </button>
        </div>
      ) : null}

      {accountChangeId ? (
        <div className={styles.banner} role="alertdialog" aria-labelledby="account-change-text">
          <p id="account-change-text" className={styles.hint}>
            Você entrou com outra conta do {PROVIDER_LABELS[accountChangeId] ?? accountChangeId}. Continuar troca a
            conta conectada e apaga recentes, atalhos, links públicos e o catálogo ligados à conta anterior.
          </p>
          <span className={styles.pair}>
            <button type="button" className={styles.secondary} onClick={() => setAccountChangeId(null)}>
              Cancelar
            </button>
            <button type="button" className={styles.primary} onClick={handleConfirmAccountChange}>
              Trocar de conta
            </button>
          </span>
        </div>
      ) : null}

      {error ? (
        <p className={styles.hint} role="alert">
          {error.message}
        </p>
      ) : null}

      <div className={styles.cards}>
        {status === 'loading' && providers.length === 0 ? (
          <p className={styles.hint}>Carregando provedores…</p>
        ) : null}

        {providers.map((provider) => {
          const needsReconnect = provider.lastError === 'RECONEXAO_NECESSARIA'
          const unavailable = !provider.configured
          const connected = provider.connected
          const confirming = confirmDisconnectId === provider.id
          const busy = pendingId === provider.id

          let action = null
          if (unavailable) {
            action = (
              <button type="button" className={styles.secondary} disabled>
                Indisponível
              </button>
            )
          } else if (confirming) {
            action = (
              <span className={styles.pair}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => setConfirmDisconnectId(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={() => void handleDisconnect(provider.id)}
                >
                  Confirmar
                </button>
              </span>
            )
          } else if (needsReconnect) {
            action = (
              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() => void handleConnect(provider.id)}
              >
                Reconectar
              </button>
            )
          } else if (connected) {
            action = (
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => setConfirmDisconnectId(provider.id)}
              >
                Desconectar
              </button>
            )
          } else {
            action = (
              <button
                type="button"
                className={styles.primary}
                disabled={busy}
                onClick={() => void handleConnect(provider.id)}
              >
                Conectar
              </button>
            )
          }

          return (
            <div key={provider.id} className={styles.service}>
              <span className={styles.serviceMark} data-off={!connected || undefined}>
                <ProviderMark id={provider.id} size={36} />
              </span>
              <div className={styles.who}>
                <p className={styles.whoName}>{provider.name}</p>
                <p className={styles.whoHint}>{providerAccountLabel(provider)}</p>
                {actionError?.providerId === provider.id ? (
                  <p className={styles.hint} role="alert">
                    {actionError.message}
                  </p>
                ) : null}
              </div>
              {action}
            </div>
          )
        })}
      </div>
    </section>
  )
}
