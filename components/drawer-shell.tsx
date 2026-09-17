'use client'

// The persistent half of the drawer (docs/spec.md, "Drawer";
// decisions/2026-09-16-drawer-non-modal-dialog.md,
// decisions/2026-09-16-drawer-resizes-the-layout.md): a non-modal <dialog>,
// open through the `open` attribute (the declarative show(), never
// showModal()), in the right gutter of the layout's grid. It mounts once
// in the slot's layout and stays across entity switches, because Next
// remounts the [id] segment beneath it on every param change; a switch
// changes the content in place.
//
// Open animates the dialog's width, zero to its CSS width, on the damped
// spring. The dialog is the grid column, so the sheet beside it resizes on
// the same curve; the panel inside keeps its full width and is clipped, so
// nothing in it rewraps. A layout effect sets the width to zero before the
// first paint, so no full-width frame shows ahead of the motion. When the
// spring settles the inline width is cleared and the stylesheet's rule
// takes over, so a viewport resize is honored.
//
// Escape here goes through router.back(), the same path as the back
// button. On every close path Next removes the drawer from the tree at
// once, this shell included; the exit is DrawerExit's, in the root layout,
// which outlives the slot (contract, "Drawer close"). Focus return on
// close is the content's job (drawer.tsx).

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { useRouter, useSelectedLayoutSegments } from 'next/navigation'
import { animate } from 'framer-motion'
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

  useLayoutEffect(() => {
    const d = dialog.current
    if (!d) return
    const width = d.getBoundingClientRect().width
    d.style.width = '0px'
    const controls = animate(d, { width: [0, width] }, springDamped)
    controls.then(() => {
      d.style.width = ''
    })
    return () => controls.stop()
    // Runs once per mount: the spring token is stable between renders.
  }, [springDamped])

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
      <div className={styles.panel}>{children}</div>
    </dialog>
  )
}
