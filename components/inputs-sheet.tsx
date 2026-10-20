'use client'

// The ledger on a phone (docs/spec.md, phone;
// decisions/2026-10-20-the-ledger-is-a-sheet-on-a-phone.md): a modal
// <dialog> at the bottom of the viewport, opened by the Inputs chip, as
// tall as its content up to 80% of the viewport and scrolling inside past
// that. The ledger itself is the children, mounted only while the sheet is.
//
// It lifts and lowers on the drawer's spring, on its translate on y
// (contract, "Inputs sheet open" / "close"). The open continues from the
// translate a previous run left, read from the element, so Strict Mode's
// mount replay continues the lift instead of restarting it
// (decisions/2026-10-19-the-drawer-open-continues-mid-flight.md); at rest
// the inline transform is cleared, and an empty one means the sheet is
// below the edge or in place, never part way.
//
// Escape, the close control, and a tap on the backdrop all lower it. A
// close with `handoff` lowers it as the drawer opens: a name in the ledger
// was tapped. The sheet first leaves the top layer (closed, then shown
// without a modal), so the drawer opening under it is not inert and its
// heading can take focus; the backdrop goes with the modal state, and the
// sheet lowers over the opening drawer.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { animate } from 'framer-motion'
import { useMotionTokens } from '@/lib/motion/tokens'
import { CloseIcon, IconButton } from './icon-button'
import styles from './inputs-sheet.module.css'

export const INPUTS_SHEET_HEADING_ID = 'inputs-sheet-heading'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  handoff: boolean
  summary: string // "12 rows · 4 selected"
  // Where focus goes after a close that lowered the sheet: the chip. A tap
  // does not focus a button in every browser, so the dialog's own return
  // could land on the body.
  returnFocus: () => HTMLElement | null
  children: ReactNode
}

function translateOf(d: HTMLElement): number | null {
  const m = /translateY\((-?[\d.]+)px\)/.exec(d.style.transform)
  return m ? parseFloat(m[1]!) : null
}

export function InputsSheet({ open, onOpenChange, handoff, summary, returnFocus: returnFocusProp, children }: Props) {
  const { springDamped } = useMotionTokens()
  const dialog = useRef<HTMLDialogElement>(null)

  // Mounted from an open until the exit has run.
  const [wasOpen, setWasOpen] = useState(open)
  const [mounted, setMounted] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setMounted(true)
  }

  // Read at the moment a motion starts, as the drawer reads it, so a
  // reduced-motion flip mid-flight changes the next motion, not this one.
  const spring = useRef(springDamped)
  const returnFocus = useRef(returnFocusProp)
  useEffect(() => {
    spring.current = springDamped
    returnFocus.current = returnFocusProp
  }, [springDamped, returnFocusProp])

  useLayoutEffect(() => {
    const d = dialog.current
    if (!mounted || !d) return
    // Open is decided from the element: a second run finds it open. It
    // opens before the measure, since a closed dialog has no height.
    if (open && !d.open) d.showModal()
    const height = d.getBoundingClientRect().height
    const at = translateOf(d)
    const move = (from: number, to: number, done: () => void) => {
      d.style.transform = `translateY(${from}px)`
      // `reduceMotion: false`: the flag on <html>, carried by the tokens,
      // is the only source of truth for reduced motion here.
      const controls = animate(from, to, {
        ...spring.current,
        reduceMotion: false,
        onUpdate: v => {
          d.style.transform = `translateY(${v}px)`
        },
      })
      controls.then(done)
      return () => controls.stop()
    }
    if (open) {
      return move(at ?? height, 0, () => {
        d.style.transform = ''
      })
    }
    const finish = () => {
      d.style.transform = ''
      d.close()
      setMounted(false)
    }
    if (handoff) {
      // Decided from the element: a second run finds it no longer modal.
      if (d.matches(':modal')) {
        d.close()
        d.show()
      }
      return move(at ?? 0, height, finish)
    }
    return move(at ?? 0, height, () => {
      finish()
      returnFocus.current()?.focus()
    })
  }, [open, mounted, handoff])

  if (!mounted) return null
  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      aria-labelledby={INPUTS_SHEET_HEADING_ID}
      data-inputs-sheet
      // Escape: the exit animates instead of the element vanishing.
      onCancel={e => {
        e.preventDefault()
        onOpenChange(false)
      }}
      onClose={() => {
        if (open) onOpenChange(false)
      }}
      // A tap on the backdrop lands on the dialog itself.
      onClick={e => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <div className={styles.head}>
        <span className={styles.grab} aria-hidden="true" />
        <h2 id={INPUTS_SHEET_HEADING_ID} className={`${styles.title} type-eyebrow`}>
          Inputs
        </h2>
        <span className={`${styles.summary} type-micro`}>{summary}</span>
        <IconButton onClick={() => onOpenChange(false)} aria-label="Close Inputs">
          <CloseIcon />
        </IconButton>
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  )
}
