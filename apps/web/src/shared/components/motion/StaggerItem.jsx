import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { entryDelay } from './stagger.js'

// Forwards its ref so AnimatePresence (popLayout) can measure a leaving item.
// Always a motion.div: switching to a plain div past the stagger limit remounted a tile whose index
// crossed it, so it blinked. Past the limit the tile just skips its entry animation.
// `leaving` plays the exit while the tile still holds its place, so the others move only once it is gone.
const StaggerItem = forwardRef(function StaggerItem(
  { index, base = 0.06, step = 0.03, variants, className, layout = false, leaving = false, children },
  ref,
) {
  const delay = entryDelay(index, base, step)
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={variants}
      initial={delay === null ? false : 'hidden'}
      animate={leaving && variants?.exit ? 'exit' : 'show'}
      exit={variants?.exit ? 'exit' : undefined}
      custom={delay ?? 0}
      layout={layout}
      transition={layout ? { layout: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } } : undefined}
    >
      {children}
    </motion.div>
  )
})

export default StaggerItem
