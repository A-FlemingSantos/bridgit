import { ApiClientError } from '@bridgit/shared-client'
import { useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../shared/auth/SessionContext.jsx'
import { ROUTES } from '../../../shared/config/routes.js'
import Toggle from '../components/Toggle.jsx'
import BrowserMark from './BrowserMark.jsx'
import { formatSessionTime } from './formatSessionTime.js'
import styles from './SettingsPage.module.css'

export default function SecurityTab() {
  const navigate = useNavigate()
  const currentId = useId()
  const nextId = useId()
  const confirmId = useId()
  const { session, changePassword, deleteAccount, listSessions, revokeOtherSessions, setPersistent } = useSession()
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [sessions, setSessions] = useState([])
  const [sessionsClosed, setSessionsClosed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(session?.session?.persistent ?? true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true

    listSessions()
      .then((items) => {
        if (active) setSessions(Array.isArray(items) ? items : [])
      })
      .catch(() => {
        if (active) setSessions([])
      })

    return () => {
      active = false
    }
  }, [listSessions])

  async function handleChangePassword(event) {
    event.preventDefault()
    setError('')
    setPasswordSaved(false)

    const form = event.currentTarget
    const data = new FormData(form)
    const currentPassword = String(data.get('current') ?? '')
    const newPassword = String(data.get('next') ?? '')
    const confirmPassword = String(data.get('confirm') ?? '')

    if (newPassword !== confirmPassword) {
      setError('As senhas nao coincidem.')
      return
    }

    try {
      await changePassword(currentPassword, newPassword)
      setPasswordSaved(true)
      form.reset()
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Nao foi possivel alterar a senha.')
      }
    }
  }

  async function handleRememberDevice(nextValue) {
    const previous = rememberDevice
    setRememberDevice(nextValue)

    try {
      await setPersistent(nextValue)
    } catch {
      setRememberDevice(previous)
      setError('Nao foi possivel atualizar a sessao.')
    }
  }

  async function handleRevokeOthers() {
    setError('')

    try {
      await revokeOtherSessions()
      setSessionsClosed(true)
      const items = await listSessions()
      setSessions(Array.isArray(items) ? items : [])
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Nao foi possivel encerrar as outras sessoes.')
      }
    }
  }

  async function handleDeleteAccount() {
    setError('')
    setDeleting(true)

    try {
      await deleteAccount()
      navigate(ROUTES.login, { replace: true })
    } catch (err) {
      setDeleting(false)
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Nao foi possivel excluir a conta.')
      }
    }
  }

  return (
    <section className={styles.pane}>
      <h1>Segurança</h1>

      <form className={styles.card} onSubmit={handleChangePassword}>
        <h2>Senha</h2>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor={currentId}>Senha atual</label>
            <input id={currentId} name="current" type="password" autoComplete="current-password" required />
          </div>
          <div className={styles.field}>
            <label htmlFor={nextId}>Nova senha</label>
            <input id={nextId} name="next" type="password" autoComplete="new-password" required />
          </div>
          <div className={styles.field}>
            <label htmlFor={confirmId}>Confirmar senha</label>
            <input id={confirmId} name="confirm" type="password" autoComplete="new-password" required />
          </div>
        </div>
        {error ? <p className={styles.hint} role="alert">{error}</p> : null}
        <button type="submit" className={styles.primary}>
          {passwordSaved ? 'Senha alterada' : 'Salvar senha'}
        </button>
      </form>

      <div className={styles.cards}>
        <div className={styles.pref}>
          <span>
            <span className={styles.prefTitle}>Manter este dispositivo</span>
            <span className={styles.hint}>Não pede a senha de novo neste navegador.</span>
          </span>
          <Toggle label="Manter este dispositivo" checked={rememberDevice} onChange={handleRememberDevice} />
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Sessão</h2>
            <p className={styles.hint}>Encerra o acesso neste aparelho ou nos outros.</p>
          </div>
          <span className={styles.pair}>
            <button
              type="button"
              className={styles.secondary}
              onClick={handleRevokeOthers}
            >
              {sessionsClosed ? 'Encerradas' : 'Encerrar outras sessões'}
            </button>
          </span>
        </div>
        {sessions.length > 0 ? (
          <ul className={styles.sessions}>
            {sessions.map((item) => (
              <li key={item.id} className={styles.session}>
                <span className={styles.sessionMark}>
                  <BrowserMark browser={item.browser} />
                </span>
                <span>
                  <span className={styles.sessionName}>{item.browser}</span>
                  <span className={styles.sessionDevice}>{item.device}</span>
                </span>
                <time className={styles.sessionTime} dateTime={item.lastSeenAt}>
                  {formatSessionTime(item.lastSeenAt)}
                </time>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={styles.card}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Excluir conta</h2>
            <p className={styles.hint}>Os arquivos continuam nos provedores.</p>
          </div>
          {confirmDelete ? (
            <span className={styles.pair}>
              <button
                type="button"
                className={styles.primary}
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                Confirmar exclusão
              </button>
              <button type="button" className={styles.secondary} onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </span>
          ) : (
            <button type="button" className={styles.secondary} onClick={() => setConfirmDelete(true)}>
              Excluir conta
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
