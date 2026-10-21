'use client'

// The atom (docs/spec.md, "Components"). A number in the DOM, its status as
// a print mark, its provenance one hover or click away. Timing per the
// contract's assignment table, all through useMotionTokens():
//
//   value tick              slow / standard      useAnimatedNumber
//   direction color decay   slower / exit        CSS animation, .fresh
//   shimmer (refreshing)    slower, looped       CSS animation, linear
//   stale desaturate        base / standard      CSS transition on color
//
// The status marks never rely on color alone: stale carries an age label,
// agent-updated an arrow glyph, unverified a hollow mark, refreshing the
// moving shimmer and an aria label.

import { useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ColumnConfig } from '@/lib/config'
import type { FigureValue } from '@/lib/types'
import { formatValue } from '@/lib/format'
import { present } from '@/lib/present'
import { useAnimatedNumber } from '@/lib/motion/useAnimatedNumber'
import type { AgentPhase } from '@/worker/refresh'
import { ProvenancePopover } from './provenance-popover'
import styles from './figure.module.css'

type Props = {
  figure: FigureValue
  column: ColumnConfig
  parentheses: boolean
  phase: AgentPhase
  now: Date
  entityName: string
  // The diagnostics panel: many figures share one status, so the panel
  // states the age once in its head and each figure keeps only its mark.
  compact?: boolean
}

export function Figure({ figure, column, parentheses, phase, now, entityName, compact = false }: Props) {
  const p = present(figure, phase, now)
  const text = useAnimatedNumber(figure.value, v => formatValue(column.format, v, { parentheses }))
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState(false)
  // Closing the pinned panel (× or Escape) hands focus back to the trigger,
  // and the trigger's focus shows the tooltip: the panel went and another
  // came straight back (David, 2026-10-21). The focus that a close sends is
  // marked, and shows nothing; the next hover or focus does. A ref, read
  // only in event handlers, because the focus lands inside the same handler
  // that closed the panel, before any state from it has rendered.
  const closing = useRef(false)

  // Fresh ink: on an agent update the value takes the accent and decays
  // back to ink over duration.slower (a one-shot CSS animation on
  // --cadence-duration-slower / --cadence-ease-exit). The span is keyed on
  // the value, so each new value remounts it and the animation runs once,
  // with no state and no effect. Under reduced motion the duration is 10 ms
  // and there is no flash.
  const inkKey = p.status === 'agent-updated' ? `fresh-${figure.value}` : 'still'

  const label = `${column.label} for ${entityName}: ${formatValue(column.format, figure.value, { parentheses })}, ${p.status}${p.age ? `, ${p.age}` : ''}. Provenance.`

  return (
    <span className={styles.figure} data-status={p.status} data-direction={p.direction ?? undefined}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} type-figure`}
        aria-label={label}
        aria-describedby={hover && !open ? `${id}-tip` : undefined}
        aria-expanded={open}
        aria-controls={open ? `${id}-dialog` : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => {
          if (!closing.current) setHover(true)
        }}
        onBlur={() => setHover(false)}
        onClick={() => setOpen(o => !o)}
      >
        <span key={inkKey} className={p.status === 'agent-updated' ? `${styles.value} ${styles.fresh}` : styles.value}>
          <motion.span>{text}</motion.span>
        </span>
        {p.status === 'agent-updated' && (
          <span className={styles.mark} aria-hidden="true">
            {p.direction === 'down' ? '▾' : '▴'}
          </span>
        )}
        {p.status === 'unverified' && (
          <span className={styles.mark} aria-hidden="true">
            ◦
          </span>
        )}
      </button>
      {p.age && !compact && <span className={`${styles.age} type-micro`}>{p.age}</span>}
      {/* The popover leaves on transitions.exit (contract, "Provenance popover
          enter / exit"). One key for both modes: a click turns the tooltip
          into the dialog in place, and a hover back during the exit takes
          the leaving panel back instead of mounting a second one. */}
      <AnimatePresence>
        {(hover || open) && (
          <ProvenancePopover
            key="provenance"
            id={id}
            mode={open ? 'dialog' : 'tooltip'}
            sources={p.sources}
            status={p.status}
            updatedAt={figure.updatedAt}
            onClose={() => {
              setOpen(false)
              setHover(false)
              closing.current = true
              triggerRef.current?.focus()
              closing.current = false
            }}
          />
        )}
      </AnimatePresence>
    </span>
  )
}
