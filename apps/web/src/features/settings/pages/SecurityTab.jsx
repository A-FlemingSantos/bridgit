import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../shared/auth/SessionContext.jsx'
import { ROUTES } from '../../../shared/config/routes.js'
import { apiErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import Toggle from '../components/Toggle.jsx'
import BrowserMark from './BrowserMark.jsx'
import { formatSessionTime } from './formatSessionTime.js'
import styles from './SettingsPage.module.css'

const SESSIONS_CLOSED_MS = 4000

export default function SecurityTab() {
  const navigate = useNavigate()
  const currentId = useId()
  const nextId = useId()
  const confirmId = useId()
  const deletePasswordId = useId()
  const { session, changePassword, deleteAccount, listSessions, revokeOtherSessions, setPersistent } = useSession()
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [sessions, setSessions] = useState([])
  const [sessionsClosed, setSessionsClosed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rememberDevice, setRememberDevice] = useState(session?.session?.persistent ?? true)
  const [errors, setErrors] = useState({})
  const [deleting, setDeleting] = useState(false)
  const closedTimerRef = useRef(null)

  function setError(key, message = '') {
    setErrors((current) => ({ ...current, [key]: message }))
  }

  useEffect(() => () => window.clearTimeout(closedTimerRef.current), [])

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
    setError('password')
    setPasswordSaved(false)

    const form = event.currentTarget
    const data = new FormData(form)
    const currentPassword = String(data.get('current') ?? '')
    const newPassword = String(data.get('next') ?? '')
    const confirmPassword = String(data.get('confirm') ?? '')

    if (newPassword !== confirmPassword) {
      setError('password', 'As senhas não coincidem.')
      return
    }

    try {
      await changePassword(currentPassword, newPassword)
      setPasswordSaved(true)
      form.reset()
    } catch (err) {
      setError('password', apiErrorMessage(err, 'Não foi possível alterar a senha.'))
    }
  }

  async function handleRememberDevice(nextValue) {
    const previous = rememberDevice
    setRememberDevice(nextValue)
    setError('device')

    try {
      await setPersistent(nextValue)
    } catch {
      setRememberDevice(previous)
      setError('device', 'Não foi possível atualizar a sessão.')
    }
  }

  async function handleRevokeOthers() {
    setError('sessions')

    try {
      await revokeOtherSessions()
      setSessionsClosed(true)
      window.clearTimeout(closedTimerRef.current)
      closedTimerRef.current = window.setTimeout(() => setSessionsClosed(false), SESSIONS_CLOSED_MS)
      const items = await listSessions()
      setSessions(Array.isArray(items) ? items : [])
    } catch (err) {
      setError('sessions', apiErrorMessage(err, 'Não foi possível encerrar as outras sessões.'))
    }
  }

  async function handleDeleteAccount(event) {
    event.preventDefault()
    setError('delete')
    const password = String(new FormData(event.currentTarget).get('password') ?? '')
    if (!password) {
      setError('delete', 'Informe sua senha para excluir a conta.')
      return
    }
    setDeleting(true)

    try {
      await deleteAccount(password)
      navigate(ROUTES.login, { replace: true })
    } catch (err) {
      setDeleting(false)
      setError('delete', apiErrorMessage(err, 'Não foi possível excluir a conta.'))
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
        {errors.password ? <p className={styles.hint} role="alert">{errors.password}</p> : null}
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
        {errors.device ? <p className={styles.hint} role="alert">{errors.device}</p> : null}
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
        {errors.sessions ? <p className={styles.hint} role="alert">{errors.sessions}</p> : null}
        {sessions.length > 0 ? (
          <ul className={styles.sessions}>
            {sessions.map((item) => (
              <li
                key={item.id}
                className={[styles.session, item.current ? styles.sessionCurrent : ''].filter(Boolean).join(' ')}
                aria-current={item.current ? 'true' : undefined}
              >
                <span className={styles.sessionMark}>
                  <BrowserMark browser={item.browser} device={item.device} />
                </span>
                <span>
                  <span className={styles.sessionName}>
                    {item.browser}
                    {item.current ? <span className={styles.sessionBadge}>Sessão atual</span> : null}
                  </span>
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
          {confirmDelete ? null : (
            <button type="button" className={styles.secondary} onClick={() => setConfirmDelete(true)}>
              Excluir conta
            </button>
          )}
        </div>
        {confirmDelete ? (
          <form className={styles.deleteForm} onSubmit={handleDeleteAccount}>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor={deletePasswordId}>Confirme com sua senha</label>
                <input
                  id={deletePasswordId}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            <span className={styles.pair}>
              <button type="submit" className={styles.primary} disabled={deleting}>
                Confirmar exclusão
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  setConfirmDelete(false)
                  setError('delete')
                }}
              >
                Cancelar
              </button>
            </span>
          </form>
        ) : null}
        {errors.delete ? <p className={styles.hint} role="alert">{errors.delete}</p> : null}
      </div>
    </section>
  )
}
