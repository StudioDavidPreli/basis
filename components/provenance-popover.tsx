'use client'

// Provenance, one hover or click away (docs/spec.md, Figure). role="tooltip"
// on hover, role="dialog" on click with focus moved inside, Escape closes
// and the Figure returns focus to its trigger. Every source lists the
// provider, the reference, the provider's own asOf, the cadence, and the
// actual request as a link that opens. Nothing here is fabricated: a
// source with no url renders none.

import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { FigureStatus, Source } from '@/lib/types'
import { ttlLabel } from '@/lib/describe'
import { useMotionTokens } from '@/lib/motion/tokens'
import styles from './provenance-popover.module.css'

type Props = {
  id: string
  mode: 'tooltip' | 'dialog'
  sources: Source[]
  status: FigureStatus
  updatedAt: string
  onClose: () => void
}

function when(asOf: string): string {
  return asOf.length === 10 ? asOf : `${asOf.slice(0, 10)} ${asOf.slice(11, 16)} UTC`
}

export function ProvenancePopover({ id, mode, sources, status, updatedAt, onClose }: Props) {
  const { transitions } = useMotionTokens()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mode !== 'dialog') return
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  const dialog = mode === 'dialog'
  return (
    <motion.div
      ref={panel}
      id={dialog ? `${id}-dialog` : `${id}-tip`}
      role={dialog ? 'dialog' : 'tooltip'}
      aria-modal={dialog ? false : undefined}
      aria-label={dialog ? 'Provenance' : undefined}
      tabIndex={dialog ? -1 : undefined}
      className={styles.panel}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transitions.enter}
    >
      <p className={`${styles.head} type-eyebrow`}>
        Provenance · {status}
      </p>
      <ol className={styles.list}>
        {sources.map((s, i) => (
          <li key={i} className={styles.source}>
            <span className={`${styles.provider} type-label`}>
              {s.provider}
              {s.fixture && <span className={`${styles.tag} type-micro`}> recorded fallback</span>}
            </span>
            <span className={`${styles.ref} type-micro`}>{s.ref}</span>
            <span className={`${styles.meta} type-micro`}>
              as of {when(s.asOf)} · {s.cadence} · stale after {ttlLabel(s.ttlMs)}
            </span>
            {s.url && (
              <a className={`${styles.link} type-micro`} href={s.url} target="_blank" rel="noreferrer">
                open the request ↗
              </a>
            )}
          </li>
        ))}
      </ol>
      <p className={`${styles.meta} type-micro`}>written {when(updatedAt)}</p>
      {dialog && (
        <button type="button" className={`${styles.close} type-action`} onClick={onClose}>
          [ Close ]
        </button>
      )}
    </motion.div>
  )
}
