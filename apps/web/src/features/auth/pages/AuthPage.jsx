import { useId, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { ROUTES } from '../../../shared/config/routes.js'
import styles from './AuthPage.module.css'

export default function AuthPage() {
  const location = useLocation()
  const register = location.pathname === ROUTES.register
  const year = new Date().getFullYear()
  const emailId = useId()
  const passwordId = useId()
  const confirmId = useId()
  const rememberId = useId()
  const [showPassword, setShowPassword] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()
  }

  return (
    <main className={styles.shell}>
      <section className={styles.visual}>
        <svg className={styles.construction} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="50" y1="0" x2="50" y2="100" />
          <line x1="0" y1="50" x2="100" y2="50" />
          <line x1="8" y1="8" x2="92" y2="92" />
          <line x1="92" y1="8" x2="8" y2="92" />
        </svg>
        <motion.svg
          className={styles.star}
          viewBox="0 0 120 120"
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.86 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <line x1="60" y1="8" x2="60" y2="112" />
          <line x1="8" y1="60" x2="112" y2="60" />
          <line x1="23.2" y1="23.2" x2="96.8" y2="96.8" />
          <line x1="96.8" y1="23.2" x2="23.2" y2="96.8" />
        </motion.svg>
        <Link to={ROUTES.home} className={styles.brand}>
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

          <motion.div
            className={styles.fields}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.4 }}
          >
            <div className={styles.field}>
              <label htmlFor={emailId}>E-mail</label>
              <input
                id={emailId}
                name="email"
                type="email"
                autoComplete="email"
                required
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
