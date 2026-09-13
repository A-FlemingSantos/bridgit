import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '../../../shared/config/routes.js'
import { profile as initialProfile } from '../data/mock.js'
import styles from './SettingsPage.module.css'

export default function AccountTab() {
  const navigate = useNavigate()
  const usernameId = useId()
  const [username, setUsername] = useState(initialProfile.username)
  const [saved, setSaved] = useState(false)
  const initial = username.slice(0, 1).toUpperCase()

  function saveProfile(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next = String(data.get('username') ?? '').trim() || username
    setUsername(next)
    setSaved(true)
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
        <button type="button" className={styles.secondary} onClick={() => navigate(ROUTES.login)}>
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
            defaultValue={username}
            autoComplete="username"
            onChange={() => setSaved(false)}
          />
        </div>
        <button type="submit" className={styles.primary}>
          {saved ? 'Salvo' : 'Salvar'}
        </button>
      </form>
    </section>
  )
}
