// The shapes Basis actually writes. Expected: 0 errors.
import { motion, animate, useMotionValue } from 'framer-motion'
import { useMotionTokens } from '@/lib/motion/tokens'

export function Clean() {
  const { durations, delays, easings, spring, transitions } = useMotionTokens()
  const x = useMotionValue(0)
  animate(x, 100, { duration: durations.slow, ease: easings.standard })
  const variants = {
    open: { opacity: 1, transition: { delay: delays.short, duration: durations.base, ease: easings.enter } },
  }
  return (
    <>
      <motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }} transition={transitions.enter} />
      <motion.div transition={spring} />
      <motion.div transition={{ ...spring, delay: delays.none }} />
      <motion.div variants={variants} />
      <motion.div transition={{ duration: durations.fast, ease: easings.exit }} exit={{ opacity: 0 }} />
    </>
  )
}
