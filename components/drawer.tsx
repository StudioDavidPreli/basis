'use client'

// The drawer (docs/spec.md, "Drawer"; decisions/2026-09-16-drawer-non-modal-
// dialog.md): a non-modal <dialog>, opened through the `open` attribute,
// which is the declarative form of show() and never showModal(). No
// backdrop, no focus trap: the sheet behind it stays live, rows hover and
// select, another name click switches the entity in place. It is a column
// of the layout's grid, so the sheet narrows beside it.
//
// Focus goes to the heading on open and back to the originating row's link
// on close, both done here. Escape and the close control go through
// router.back(), the same path as the browser's back button, so history
// stays honest. Open is the Cadence spring on the panel; close is instant,
// because the route unmounts the moment history moves (the contract's
// "Drawer close" row).

import { useEffect, useId, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import type { EntityDetail } from '@/lib/entity-detail'
import { useMotionTokens } from '@/lib/motion/tokens'
import type { AgentPhase } from '@/worker/refresh'
import { EntityDetailBody } from './entity-detail-body'
import { Marker } from './marker'
import { useNow } from './use-now'
import styles from './drawer.module.css'

type Props = { detail: EntityDetail; renderedAt: string; phase: AgentPhase }

export function rowLinkSelector(id: string): string {
  return `a[data-entity-link="${CSS.escape(id)}"]`
}

export function Drawer({ detail, renderedAt, phase }: Props) {
  const router = useRouter()
  const { spring } = useMotionTokens()
  const now = useNow(renderedAt)
  const heading = useRef<HTMLHeadingElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  // The entity on screen, for the row to return focus to. Updated by the
  // per-entity effect, read once by the unmount cleanup.
  const current = useRef(detail.id)
  const headingId = useId()

  useEffect(() => {
    return () => {
      document.querySelector<HTMLElement>(rowLinkSelector(current.current))?.focus()
    }
  }, [])

  useEffect(() => {
    current.current = detail.id
    heading.current?.focus()
  }, [detail.id])

  const close = () => router.back()

  return (
    <dialog
      ref={dialog}
      open
      className={styles.drawer}
      aria-labelledby={headingId}
      data-entity={detail.id}
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        // A provenance dialog inside the drawer owns its own Escape.
        if (dialog.current?.querySelector('[role="dialog"]')) return
        e.preventDefault()
        close()
      }}
    >
      <motion.div key={detail.id} className={styles.panel} initial={{ x: '100%' }} animate={{ x: 0 }} transition={spring}>
        <header className={styles.head}>
          <p className={`${styles.kind} type-eyebrow`}>
            {detail.kind === 'company' ? 'Company' : 'Region'} · {detail.datasetLabel}
          </p>
          <div className={styles.titleRow}>
            <h2 id={headingId} ref={heading} tabIndex={-1} className={`${styles.title} type-figure-lg`}>
              <Marker shape={detail.marker} colors={detail.colors} />
              {detail.name}
            </h2>
            <button type="button" className={`${styles.close} type-action`} onClick={close} aria-label={`Close ${detail.name}`}>
              [ Close ]
            </button>
          </div>
        </header>
        <EntityDetailBody detail={detail} now={now} phase={phase} headings="h3" />
      </motion.div>
    </dialog>
  )
}
