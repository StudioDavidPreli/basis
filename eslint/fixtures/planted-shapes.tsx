// Every shape the rule must catch beyond the flat prop. Expected: 7 errors.
import { motion, animate } from 'framer-motion'

const variants = {
  open: { opacity: 1, transition: { delay: 0.05 } }, // 1: nested in a variants object
}

export function Shapes({ durations }: { durations: { base: number } }) {
  animate('#x', { x: 0 }, { duration: 0.2 }) // 2: animate() options
  return (
    <>
      <motion.div animate={{ x: 0, transition: { stiffness: 300, damping: 20 } }} /> {/* 3, 4: nested in animate */}
      <motion.div exit={{ opacity: 0, transition: { ease: 'easeOut' } }} /> {/* 5: ease string */}
      <motion.div transition={{ ease: [0.4, 0, 0.2, 1] }} /> {/* 6: ease array */}
      <motion.div transition={{ duration: durations.base * 2 }} /> {/* 7: a literal inside a derived value */}
      <motion.div variants={variants} />
    </>
  )
}
