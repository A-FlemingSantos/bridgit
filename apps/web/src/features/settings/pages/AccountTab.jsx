import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../../shared/auth/SessionContext.jsx'
import { ROUTES } from '../../../shared/config/routes.js'
import styles from './SettingsPage.module.css'

export default function AccountTab() {
  const navigate = useNavigate()
  const usernameId = useId()
  const { user, logout, updateUsername } = useSession()
  const [username, setUsername] = useState(user?.username ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const initial = username.slice(0, 1).toUpperCase()

  async function saveProfile(event) {
    event.preventDefault()
    setError('')

    const data = new FormData(event.currentTarget)
    const next = String(data.get('username') ?? '').trim() || username
    const previous = username

    setUsername(next)
    setSaved(true)

    try {
      const session = await updateUsername(next)
      setUsername(session.user.username)
    } catch {
      setUsername(previous)
      setSaved(false)
      setError('Nao foi possivel salvar o usuario.')
    }
  }

  async function handleLogout() {
    await logout()
    navigate(ROUTES.login, { replace: true })
  }

  return (
    <section className={styles.pane}>
      <h1>Conta</h1>

      <div className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        <div className={styles.who}>
          <p className={styles.whoName}>{username}</p>
          <p className={styles.whoHint}>Usuário do hub</p>
        </div>
        <button type="button" className={styles.secondary} onClick={handleLogout}>
          Sair
        </button>
      </div>

      <form className={styles.card} onSubmit={saveProfile}>
        <div className={styles.field}>
          <label htmlFor={usernameId}>Usuário</label>
          <p className={styles.hint}>É o que você usa para entrar.</p>
          <input
            id={usernameId}
            name="username"
            type="text"
            value={username}
            autoComplete="username"
            onChange={(event) => {
              setUsername(event.target.value)
              setSaved(false)
            }}
          />
        </div>
        {error ? <p className={styles.hint} role="alert">{error}</p> : null}
        <button type="submit" className={styles.primary}>
          {saved ? 'Salvo' : 'Salvar'}
        </button>
      </form>
    </section>
  )
}
