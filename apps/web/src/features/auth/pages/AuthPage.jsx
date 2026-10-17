import { useId, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import BrandMark from '../../../shared/components/BrandMark/BrandMark.jsx'
import { useSession } from '../../../shared/auth/SessionContext.jsx'
import { ROUTES, sanitizeInternalAppRedirect } from '../../../shared/config/routes.js'
import { apiErrorMessage } from '../../../shared/state/hubErrorMessage.js'
import atSign from '../assets/at-sign.svg'
import styles from './AuthPage.module.css'

const rise = {
  hidden: { opacity: 0, y: 12 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

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
          setError('As senhas não coincidem.')
          return
        }

        await registerAccount({ username, password })
      } else {
        const persistent = data.get('remember') === 'on'
        await login({ username, password, persistent })
      }

      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível concluir a operação solicitada.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.bar}>
          <Link to={ROUTES.landing} className={styles.mark} aria-label="Bridgit">
            <BrandMark />
          </Link>
          <Link to={register ? ROUTES.login : ROUTES.register} className={styles.switch}>
            {register ? 'Entrar' : 'Criar conta'}
          </Link>
        </header>

        <main className={styles.layout}>
          <form className={styles.form} onSubmit={handleSubmit}>
            <motion.p className={styles.hello} variants={rise} initial="hidden" animate="show" custom={0}>
              {register ? 'Bem-vindo ao Bridgit.' : 'Bem-vindo de volta.'}
            </motion.p>
            <motion.h1 className={styles.title} variants={rise} initial="hidden" animate="show" custom={0.06}>
              {register ? 'Cadastro' : 'Entrar'}
            </motion.h1>
            <motion.p className={styles.lead} variants={rise} initial="hidden" animate="show" custom={0.12}>
              {register
                ? 'Um usuário e uma senha para reunir OneDrive, Google Drive e Dropbox.'
                : 'Suas três nuvens, atrás de um único usuário e senha.'}
            </motion.p>

            {error ? <p className={styles.error} role="alert">{error}</p> : null}

            <motion.div
              className={styles.fields}
              variants={rise}
              initial="hidden"
              animate="show"
              custom={0.18}
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
                    Lembrar-se de mim
                  </label>
                  <button type="button" className={styles.forgot}>
                    Esqueceu?
                  </button>
                </div>
              )}

              <button
                type="submit"
                className={styles.submit}
                aria-label={register ? 'Criar conta' : 'Entrar'}
                disabled={submitting}
              >
                {submitting ? 'Aguarde' : register ? 'Criar conta' : 'Entrar'}
                <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </motion.div>
          </form>

          <motion.div
            className={styles.art}
            aria-hidden="true"
            style={{ '--auth-mark': `url("${atSign}")` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          />
        </main>

        <footer className={styles.legal}>
          <p>© {year} Bridgit</p>
          <div className={styles.links}>
            <Link to={ROUTES.privacy}>Privacidade</Link>
            <Link to={ROUTES.terms}>Termos</Link>
          </div>
        </footer>
      </div>
    </div>
  )
}
