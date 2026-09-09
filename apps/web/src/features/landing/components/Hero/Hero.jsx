import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ROUTES } from '../../../../shared/config/routes.js'
import styles from './Hero.module.css'

const rise = {
  hidden: { opacity: 0, y: 16 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function Hero() {
  return (
    <div className={styles.stage}>
      <div className={styles.copy}>
        <motion.h1 className={styles.title} variants={rise} initial="hidden" animate="show" custom={0.05}>
          Toda a nuvem,
          <br />
          num só lugar
        </motion.h1>
        <motion.p className={styles.lead} variants={rise} initial="hidden" animate="show" custom={0.16}>
          Login simples. Privacidade em ambientes empresariais.
        </motion.p>
        <motion.div className={styles.pills} variants={rise} initial="hidden" animate="show" custom={0.28}>
          <Link to={ROUTES.login} className={`${styles.pill} ${styles.ghost}`}>
            Entrar
          </Link>
          <Link to={ROUTES.register} className={`${styles.pill} ${styles.solid}`}>
            Criar conta
          </Link>
        </motion.div>
      </div>
    </div>
  )
}
