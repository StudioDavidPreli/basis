'use client'

// The analysis window on a phone (docs/spec.md, phone;
// decisions/2026-10-20-the-ledger-is-a-sheet-on-a-phone.md): the strip's
// calendar button opens this modal <dialog> with the window's two real
// date inputs, the day count, Reset to the view, and Done. A date sets the
// window as it changes, as the strip's own inputs do above 640px; Done
// only closes. It enters and exits as the welcome does, on
// transitions.enter / transitions.exit (contract, "Analysis window dialog").

import { useEffect, useId, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useMotionTokens } from '@/lib/motion/tokens'
import { normalizeWindow, windowDays, type Window, type WindowMs } from '@/lib/diagnostics'
import { CloseIcon, IconButton } from './icon-button'
import styles from './window-dialog.module.css'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  window: Window | null // null: the window follows the view
  fromValue: string
  toValue: string
  span: WindowMs
  onWindow: (window: Window | null) => void
  // Where focus goes after the close: the calendar button.
  returnFocus: () => HTMLElement | null
}

export function WindowDialog({ open, onOpenChange, window: win, fromValue, toValue, span, onWindow, returnFocus }: Props) {
  const { transitions } = useMotionTokens()
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()

  const [wasOpen, setWasOpen] = useState(open)
  const [mounted, setMounted] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setMounted(true)
  }

  // Open is decided from the element: a second run finds it open.
  useEffect(() => {
    const d = dialog.current
    if (open && d && !d.open) d.showModal()
  }, [open, mounted])

  const finish = () => {
    if (open) return
    dialog.current?.close()
    setMounted(false)
    returnFocus()?.focus()
  }

  const setDates = (from: string, to: string) => onWindow(normalizeWindow(from, to))

  if (!mounted) return null
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      data-window-dialog
      onCancel={e => {
        e.preventDefault()
        onOpenChange(false)
      }}
      onClose={() => {
        if (open) onOpenChange(false)
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <motion.div
        className={styles.panel}
        initial={{ opacity: 0, y: -4 }}
        animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
        transition={open ? transitions.enter : transitions.exit}
        onAnimationComplete={finish}
      >
        <div className={styles.head}>
          <h2 id={`${id}-title`} className={`${styles.title} type-eyebrow`}>
            Analysis window
          </h2>
          <IconButton onClick={() => onOpenChange(false)} aria-label="Close the analysis window">
            <CloseIcon />
          </IconButton>
        </div>
        <label className={styles.field}>
          <span className="type-micro">From</span>
          <input
            type="date"
            className={`${styles.date} type-figure`}
            data-follows={win ? undefined : ''}
            value={fromValue}
            onChange={e => setDates(e.target.value, toValue)}
          />
        </label>
        <label className={styles.field}>
          <span className="type-micro">To</span>
          <input
            type="date"
            className={`${styles.date} type-figure`}
            data-follows={win ? undefined : ''}
            value={toValue}
            onChange={e => setDates(fromValue, e.target.value)}
          />
        </label>
        <p className={`${styles.note} type-micro`} data-window-dialog-days>
          {windowDays(span)} days · {win ? 'set by hand' : 'follows the view'}. The tools compute over this window.
        </p>
        <div className={styles.actions}>
          <button type="button" className={`${styles.reset} type-action`} onClick={() => onWindow(null)}>
            [ Reset to the view ]
          </button>
          <button type="button" className={`${styles.done} type-action`} onClick={() => onOpenChange(false)}>
            [ Done ]
          </button>
        </div>
      </motion.div>
    </dialog>
  )
}
