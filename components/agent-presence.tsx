'use client'

import type { AgentPhase } from '@/worker/refresh'
import { agentProgress } from '@/lib/agent'
import { useMotionTokens } from '@/lib/motion/tokens'
import { useTheme } from './use-theme'
import styles from './agent-presence.module.css'

// The mark at the right end of the legend strip (contracts/agent-presence.md):
// one abstract instrument, six phases, no numbers. Numbers live in the DOM and
// this is not one of them.
//
// There is no Rive here yet, and no import of the runtime. That lands with the
// artboards (decisions/2026-09-18-wrappers-before-artboards.md), and this file
// is the only one that will import it. What is real today is the interface,
// the label, and the fallback — the text mark this component was lifted out of
// chart-hero.tsx to become, moved without changing a pixel of it.
//
// Reduced motion and the theme are read rather than passed, so no call site
// can disagree with itself. Neither is a view-model value: under reduced
// motion the canvas will never mount and the mark is a poster, and the theme
// picks an instance, `lightMode` or `darkMode` (contracts/agent-presence.md).
// `progress` is coarse and therefore a function of `phase`.

export const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: 'Agent idle',
  reading: 'Agent reading sources',
  building: 'Agent building',
  waiting: 'Agent waiting for a manual refresh',
  done: 'Agent done',
  error: 'Agent error',
}

type Props = {
  phase: AgentPhase
  // The latest mutation's timestamp, or the snapshot's for the presence mark.
  // Changing it fires the view model's `pulse` trigger once the artboard is
  // here; until then it rides on the element so a test can prove the wiring is
  // live without a canvas to watch.
  pulseKey?: string | null
}

export function AgentPresence({ phase, pulseKey = null }: Props) {
  const { reducedMotion } = useMotionTokens()
  const theme = useTheme()
  return (
    <span
      className={`${styles.agent} type-micro`}
      role="img"
      aria-label={PHASE_LABEL[phase]}
      data-phase={phase}
      data-progress={agentProgress(phase)}
      data-theme-variant={theme}
      data-reduced={reducedMotion || undefined}
      data-pulse-key={pulseKey ?? undefined}
    >
      <span className={styles.agentDot} aria-hidden="true" />
      {phase}
    </span>
  )
}
