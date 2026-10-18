import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../shared/auth/SessionContext.jsx'
import { ROUTES } from '../../../shared/config/routes.js'
import { apiErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import { PixelKey, PixelTrash, PixelUnlink } from '../components/SettingsIcons.jsx'
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
  const [changingPassword, setChangingPassword] = useState(false)
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

  const others = sessions.filter((item) => !item.current)

  return (
    <section id="settings-security" className={styles.pane}>
      <h2 className={styles.paneTitle}>Segurança</h2>

      <div className={styles.list}>
        <button
          type="button"
          className={styles.row}
          aria-expanded={changingPassword}
          onClick={() => {
            setChangingPassword((open) => !open)
            setError('password')
            setPasswordSaved(false)
          }}
        >
          <PixelKey size={20} className={styles.rowIcon} />
          <span className={styles.rowBody}>
            <span className={styles.rowTitle}>Alterar senha</span>
            {passwordSaved ? <span className={styles.rowHint}>Senha alterada.</span> : null}
          </span>
        </button>
        {changingPassword ? (
          <form className={styles.rowPanel} onSubmit={handleChangePassword}>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor={currentId}>Senha atual</label>
                <input id={currentId} name="current" type="password" autoComplete="current-password" required autoFocus />
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
            {errors.password ? <p className={styles.error} role="alert">{errors.password}</p> : null}
            <div className={styles.sheetActions}>
              <button type="button" className={styles.secondary} onClick={() => setChangingPassword(false)}>
                Cancelar
              </button>
              <button type="submit" className={styles.primary}>
                Salvar senha
              </button>
            </div>
          </form>
        ) : null}

        <div className={styles.row} data-static="">
          <span className={styles.rowSpacer} aria-hidden="true" />
          <span className={styles.rowBody}>
            <span className={styles.rowTitle}>Manter este dispositivo</span>
            <span className={styles.rowHint}>Não pede a senha de novo neste navegador.</span>
          </span>
          <Toggle label="Manter este dispositivo" checked={rememberDevice} onChange={handleRememberDevice} />
        </div>
        {errors.device ? <p className={styles.rowError} role="alert">{errors.device}</p> : null}

        <button
          type="button"
          className={styles.row}
          data-danger=""
          aria-expanded={confirmDelete}
          onClick={() => {
            setConfirmDelete((open) => !open)
            setError('delete')
          }}
        >
          <PixelTrash size={20} className={styles.rowIcon} />
          <span className={styles.rowBody}>
            <span className={styles.rowTitle}>Excluir conta</span>
          </span>
        </button>
        {confirmDelete ? (
          <form className={styles.rowPanel} onSubmit={handleDeleteAccount}>
            <p className={styles.hint}>Apaga seus dados do Bridgit de vez. Os arquivos continuam nos provedores.</p>
            <div className={styles.field}>
              <label htmlFor={deletePasswordId}>Confirme com sua senha</label>
              <input id={deletePasswordId} name="password" type="password" autoComplete="current-password" required />
            </div>
            {errors.delete ? <p className={styles.error} role="alert">{errors.delete}</p> : null}
            <div className={styles.sheetActions}>
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
              <button type="submit" className={styles.danger} disabled={deleting}>
                Confirmar exclusão
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <h3 className={styles.sectionTitle}>Sessões</h3>
      {sessions.length > 0 ? (
        <ul className={styles.list}>
          {sessions.map((item) => (
            <li key={item.id} className={styles.row} data-static="" aria-current={item.current ? 'true' : undefined}>
              <span className={styles.sessionMark}>
                <BrowserMark browser={item.browser} device={item.device} size={28} />
              </span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle}>
                  {item.browser}
                  {item.current ? <span className={styles.sessionBadge}>Sessão atual</span> : null}
                </span>
                <span className={styles.rowHint}>{item.device}</span>
              </span>
              <time className={styles.sessionTime} dateTime={item.lastSeenAt}>
                {formatSessionTime(item.lastSeenAt)}
              </time>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.list}>
        <button
          type="button"
          className={styles.row}
          disabled={!sessionsClosed && sessions.length > 0 && others.length === 0}
          onClick={handleRevokeOthers}
        >
          <PixelUnlink size={20} className={styles.rowIcon} />
          <span className={styles.rowBody}>
            <span className={styles.rowTitle}>{sessionsClosed ? 'Encerradas' : 'Encerrar outras sessões'}</span>
          </span>
        </button>
      </div>
      {errors.sessions ? <p className={styles.error} role="alert">{errors.sessions}</p> : null}
    </section>
  )
}
