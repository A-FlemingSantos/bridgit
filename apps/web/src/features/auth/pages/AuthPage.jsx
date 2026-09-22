import { ApiClientError } from '@bridgit/shared-client'
import { useId, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { useSession } from '../../../shared/auth/SessionContext.jsx'
import { ROUTES, sanitizeInternalAppRedirect } from '../../../shared/config/routes.js'
import atSign from '../assets/at-sign.svg'
import styles from './AuthPage.module.css'

export default function AuthPage() {
  const location = useLocation()
  const register = location.pathname === ROUTES.register
  const year = new Date().getFullYear()
  const usernameId = useId()
  const passwordId = useId()
  const confirmId = useId()
  const rememberId = useId()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login, register: registerAccount } = useSession()
  const redirectTo = sanitizeInternalAppRedirect(searchParams.get('from'))

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    const data = new FormData(event.currentTarget)
    const username = String(data.get('username') ?? '').trim()
    const password = String(data.get('password') ?? '')

    try {
      if (register) {
        const confirm = String(data.get('confirm') ?? '')
        if (password !== confirm) {
          setError('As senhas nao coincidem.')
          return
        }

        await registerAccount({ username, password })
      } else {
        const persistent = data.get('remember') === 'on'
        await login({ username, password, persistent })
      }

      navigate(redirectTo, { replace: true })
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Nao foi possivel concluir a operacao solicitada.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.visual}>
        <motion.div
          className={styles.figure}
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.86 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ '--auth-mark': `url("${atSign}")` }}
        />
        <Link to={ROUTES.landing} className={styles.brand}>
          Bridgit
        </Link>
        <p className={styles.credit}>© {year} Bridgit</p>
      </section>

      <section className={styles.pane}>
        <Link to={register ? ROUTES.login : ROUTES.register} className={styles.switch}>
          {register ? 'Entrar' : 'Criar conta'}
        </Link>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.copy}>
            <h1 className={styles.title}>{register ? 'Cadastro' : 'Entrar'}</h1>
          </div>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}

          <motion.div
            className={styles.fields}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.4 }}
          >
            <div className={styles.field}>
              <label htmlFor={usernameId}>Usuário</label>
              <input
                id={usernameId}
                name="username"
                type="text"
                autoComplete="username"
                required
                disabled={submitting}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor={passwordId}>Senha</label>
              <div className={styles.secret}>
                <input
                  id={passwordId}
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  className={styles.reveal}
                  onClick={() => setShowPassword((open) => !open)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={16} strokeWidth={1.6} /> : <Eye size={16} strokeWidth={1.6} />}
                </button>
              </div>
            </div>
          </motion.div>

          {register ? (
            <div className={styles.field}>
              <label htmlFor={confirmId}>Confirmar senha</label>
              <input
                id={confirmId}
                name="confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                disabled={submitting}
              />
            </div>
          ) : (
            <div className={styles.meta}>
              <label className={styles.remember} htmlFor={rememberId}>
                <input id={rememberId} name="remember" type="checkbox" />
                Lembrar-me
              </label>
              <button type="button" className={styles.forgot}>
                Esqueceu?
              </button>
            </div>
          )}

          <motion.button
            type="submit"
            className={styles.submit}
            aria-label={register ? 'Criar conta' : 'Entrar'}
            disabled={submitting}
            whileHover={{ x: 3 }}
            whileTap={{ x: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          >
            <svg className={styles.arrow} viewBox="0 0 48 48" aria-hidden="true">
              <line x1="8" y1="24" x2="40" y2="24" />
              <line x1="26" y1="10" x2="40" y2="24" />
              <line x1="26" y1="38" x2="40" y2="24" />
            </svg>
          </motion.button>
        </form>
      </section>
    </main>
  )
}
