// M1 acceptance: the one planted literal. Expected: 1 error.
import { motion } from 'framer-motion'

export function Planted() {
  return <motion.div animate={{ opacity: 1 }} transition={{ duration: 0.3 }} />
}
