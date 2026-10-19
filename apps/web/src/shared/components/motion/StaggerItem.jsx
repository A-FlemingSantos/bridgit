import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { entryDelay } from './stagger.js'

// Forwards its ref so AnimatePresence (popLayout) can measure a leaving item.
const StaggerItem = forwardRef(function StaggerItem(
  { index, base = 0.06, step = 0.03, variants, className, layout = false, children },
  ref,
) {
  const delay = entryDelay(index, base, step)
  if (delay === null) {
    return <div ref={ref} className={className}>{children}</div>
  }
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={variants}
      initial="hidden"
      animate="show"
      exit={variants?.exit ? 'exit' : undefined}
      custom={delay}
      layout={layout}
      transition={layout ? { layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } } : undefined}
    >
      {children}
    </motion.div>
  )
})

export default StaggerItem
