'use client'

// The persistent half of the drawer (docs/spec.md, "Drawer";
// decisions/2026-09-16-drawer-non-modal-dialog.md): a non-modal <dialog>,
// open through the `open` attribute (the declarative show(), never
// showModal()), in the right gutter of the layout's grid. It mounts once
// in the slot's layout and stays across entity switches, because Next
// remounts the [id] segment beneath it on every param change. So: the
// panel comes in once, on the critically damped Cadence spring, the same
// spring the ledger's rows shift on beside it when the sheet has to give
// it room; a switch changes the content in place.
//
// Escape here goes through router.back(), the same path as the back
// button. On every close path Next removes the drawer from the tree at
// once, this shell included; the exit is DrawerExit's, in the root layout,
// which outlives the slot (contract, "Drawer close"). Focus return on
// close is the content's job (drawer.tsx).

import { useRef, type ReactNode } from 'react'
import { useRouter, useSelectedLayoutSegments } from 'next/navigation'
import { motion } from 'framer-motion'
import { useMotionTokens } from '@/lib/motion/tokens'
import styles from './drawer.module.css'

export const DRAWER_HEADING_ID = 'drawer-heading'
export const DRAWER_SCRAMBLE_KEY = 'drawer'

export function rowLinkSelector(id: string): string {
  return `a[data-entity-link="${CSS.escape(id)}"]`
}

export function DrawerShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { springDamped } = useMotionTokens()
  const segments = useSelectedLayoutSegments()
  // ['(.)company', 'ou-tokyo'] with an entity open; empty, or the default
  // marker, on the sheet.
  const open = segments.length > 0 && !segments.some(s => s.startsWith('__'))
  const id = open ? decodeURIComponent(segments[segments.length - 1]!) : null
  const dialog = useRef<HTMLDialogElement>(null)

  if (!open) return <>{children}</>

  return (
    <dialog
      ref={dialog}
      open
      className={styles.drawer}
      aria-labelledby={DRAWER_HEADING_ID}
      data-entity={id ?? undefined}
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        // A provenance dialog inside the drawer owns its own Escape.
        if (dialog.current?.querySelector('[role="dialog"]')) return
        e.preventDefault()
        router.back()
      }}
    >
      <motion.div className={styles.panel} initial={{ x: '100%' }} animate={{ x: 0 }} transition={springDamped}>
        {children}
      </motion.div>
    </dialog>
  )
}
