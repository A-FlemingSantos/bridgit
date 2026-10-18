import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../shared/auth/SessionContext.jsx'
import { ROUTES } from '../../../shared/config/routes.js'
import { PixelUser } from '../components/SettingsIcons.jsx'
import styles from './SettingsPage.module.css'

export default function AccountTab() {
  const navigate = useNavigate()
  const usernameId = useId()
  const { user, logout, updateUsername } = useSession()
  const sessionUsername = user?.username ?? ''
  const [username, setUsername] = useState(sessionUsername)
  const [shown, setShown] = useState(sessionUsername)
  const [editing, setEditing] = useState(false)
  const editedRef = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Acompanha mudanças vindas da sessão (ex.: outra aba), sem sobrescrever edição em andamento.
    setShown(sessionUsername)
    if (!editedRef.current) setUsername(sessionUsername)
  }, [sessionUsername])

  async function saveProfile(event) {
    event.preventDefault()
    setError('')
    editedRef.current = false

    const data = new FormData(event.currentTarget)
    const next = String(data.get('username') ?? '').trim() || username
    const previous = shown

    setShown(next)
    setEditing(false)

    try {
      const session = await updateUsername(next)
      setShown(session.user.username)
      setUsername(session.user.username)
    } catch {
      setShown(previous)
      setUsername(next)
      setEditing(true)
      setError('Não foi possível salvar o usuário.')
    }
  }

  function cancelEdit() {
    editedRef.current = false
    setUsername(shown)
    setError('')
    setEditing(false)
  }

  async function handleLogout() {
    await logout()
    navigate(ROUTES.login, { replace: true })
  }

  return (
    <section className={styles.pane}>
      <h2 className={styles.visuallyHidden}>Conta</h2>

      <div className={styles.hero}>
        <PixelUser size={72} className={styles.heroIcon} />
        <p className={styles.heroName}>{shown}</p>
        <p className={styles.heroHint}>Conta Bridgit</p>
        <div className={styles.heroActions}>
          <button
            type="button"
            className={styles.pill}
            aria-expanded={editing}
            onClick={() => (editing ? cancelEdit() : setEditing(true))}
          >
            Editar usuário
          </button>
          <button type="button" className={styles.pill} onClick={handleLogout}>
            Sair
          </button>
        </div>
      </div>

      {editing ? (
        <form className={styles.sheet} onSubmit={saveProfile}>
          <div className={styles.field}>
            <label htmlFor={usernameId}>Usuário</label>
            <p className={styles.hint}>É o que você usa para entrar.</p>
            <input
              id={usernameId}
              name="username"
              type="text"
              value={username}
              autoComplete="username"
              autoFocus
              onChange={(event) => {
                editedRef.current = true
                setUsername(event.target.value)
              }}
            />
          </div>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.sheetActions}>
            <button type="button" className={styles.secondary} onClick={cancelEdit}>
              Cancelar
            </button>
            <button type="submit" className={styles.primary}>
              Salvar
            </button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
