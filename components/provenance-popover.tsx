'use client'

// Provenance, one hover or click away (docs/spec.md, Figure). role="tooltip"
// on hover, role="dialog" on click with focus moved inside, Escape closes
// and the Figure returns focus to its trigger. The sources themselves are
// the SourceList the drawer shares.

import { useEffect, useLayoutEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import type { FigureStatus, Source } from '@/lib/types'
import { SourceList, when } from './source-list'
import { CloseIcon, IconButton } from './icon-button'
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

export function ProvenancePopover({ id, mode, sources, status, updatedAt, onClose }: Props) {
  const { transitions } = useMotionTokens()
  const panel = useRef<HTMLDivElement>(null)

  // Focus moves into the dialog once, when it becomes one. This is kept
  // apart from the Escape listener below on purpose: that effect depends on
  // `onClose`, which the compiler re-creates whenever the Figure re-renders
  // (a hover on the trigger, the minute poll), and a focus call in the same
  // effect pulled focus back from the Close button on every such render.
  useEffect(() => {
    if (mode === 'dialog') panel.current?.focus()
  }, [mode])

  useEffect(() => {
    if (mode !== 'dialog') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  // Below the figure, unless that would make the document longer: in a
  // frame of fixed height (the embeds) the bottom rows' panels would
  // otherwise scroll the frame, so there they open above. On the sheet the
  // footnotes follow the ledger and nothing flips. Decided from the
  // measurement each time, after clearing what a previous run set.
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    el.removeAttribute('data-above')
    if (el.getBoundingClientRect().bottom > document.body.getBoundingClientRect().bottom) el.setAttribute('data-above', '')
  }, [])

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
      <SourceList sources={sources} />
      <p className={`${styles.meta} type-micro`}>written {when(updatedAt)}</p>
      {dialog && (
        <IconButton className={styles.close} onClick={onClose} aria-label="Close provenance">
          <CloseIcon />
        </IconButton>
      )}
    </motion.div>
  )
}
