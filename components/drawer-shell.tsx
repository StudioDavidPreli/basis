'use client'

// The persistent half of the drawer (docs/spec.md, "Drawer";
// decisions/2026-09-16-drawer-non-modal-dialog.md,
// decisions/2026-09-16-drawer-resizes-the-layout.md): a non-modal <dialog>,
// open through the `open` attribute (the declarative show(), never
// showModal()), in the right gutter of the layout's grid. It lives in the
// slot's layout, which Next keeps across entity switches of one kind
// (company to company) while it remounts the [id] segment beneath it; a
// switch changes the content in place. Company to region remounts the
// shell too, so the old dialog exits while the new one opens.
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

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
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

  // The spring is read through a ref at the moment the open starts, so a
  // reduced-motion flip while the drawer is open (the palette's toggle)
  // changes the tokens without re-running the open from zero.
  const spring = useRef(springDamped)
  useEffect(() => {
    spring.current = springDamped
  }, [springDamped])

  useLayoutEffect(() => {
    const d = dialog.current
    if (!open || !d) return
    // Measure with no inline width, so the stylesheet's rule is what is
    // read. Under React's development Strict Mode this effect runs, is
    // cleaned up, and runs again on the same element; the first run had
    // set the inline width to zero, and the second measured that zero and
    // sprang from nothing to nothing, which read as a drawer that snapped
    // into place. Production runs the effect once; this makes both agree.
    d.style.width = ''
    const width = d.getBoundingClientRect().width
    d.style.width = '0px'
    // `reduceMotion: false`: width is a positional key, and without it
    // Framer consults prefers-reduced-motion itself and makes the spring
    // instant. The flag on <html> is the only source of truth for reduced
    // motion here (contracts/cadence-basis.md); the tokens carry it.
    const controls = animate(d, { width: [0, width] }, { ...spring.current, reduceMotion: false })
    controls.then(() => {
      d.style.width = ''
    })
    return () => controls.stop()
    // Runs whenever the dialog appears, whether or not the shell remounted.
  }, [open])

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
