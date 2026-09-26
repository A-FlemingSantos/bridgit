import { motion } from 'framer-motion'
import { entryDelay } from './stagger.js'

export default function StaggerItem({ index, base = 0.06, step = 0.03, variants, className, children }) {
  const delay = entryDelay(index, base, step)
  if (delay === null) {
    return <div className={className}>{children}</div>
  }
  return (
    <motion.div className={className} variants={variants} initial="hidden" animate="show" custom={delay}>
      {children}
    </motion.div>
  )
}
