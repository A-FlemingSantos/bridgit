import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { ROUTES } from '../../../../shared/config/routes.js'
import styles from './Hero.module.css'

const rise = {
  hidden: { opacity: 0, y: 12 },
  show: (delay) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
  }),
}

export default function Hero() {
  return (
    <section className={styles.hero}>
      <motion.p className={styles.hello} variants={rise} initial="hidden" animate="show" custom={0}>
        Olá, este é o Bridgit.
      </motion.p>
      <motion.h1 className={styles.title} variants={rise} initial="hidden" animate="show" custom={0.08}>
        Toda a nuvem,
        <br />
        num só lugar.
      </motion.h1>
      <motion.p className={styles.lead} variants={rise} initial="hidden" animate="show" custom={0.16}>
        OneDrive, Google Drive e Dropbox reunidos em uma única conta. Organize, busque e compartilhe
        seus arquivos com login simples e privacidade pensada para ambientes empresariais.
      </motion.p>
      <motion.div className={styles.actions} variants={rise} initial="hidden" animate="show" custom={0.24}>
        <Link to={ROUTES.register} className={styles.primary}>
          Criar conta
          <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
        </Link>
        <Link to={ROUTES.login} className={styles.secondary}>
          Entrar
        </Link>
      </motion.div>
    </section>
  )
}
