'use client'

// The welcome (docs/spec.md, "Welcome";
// decisions/2026-10-15-a-welcome-on-landing.md): a modal <dialog> the sheet
// opens on landing, over the chart, the rest of the sheet dimmed behind its
// backdrop. The Basis title, four lines on how to use the sheet, then "Don't
// show again" beside Close. It is built as the command palette is: opened
// with showModal(), so nothing behind it is reachable and closing it hands
// focus back natively; the panel inside enters and exits on the palette's
// tokens, and the element closes only once the exit has run.
//
// Closing stores the box's state: ticked, the flag is set and the sheet does
// not open the welcome again; unticked, it is cleared. Escape and a click on
// the backdrop close it as Close does. The palette's "Show the welcome"
// reopens it with the box as stored.

import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { motion } from 'framer-motion'
import { useMotionTokens } from '@/lib/motion/tokens'
import { WELCOME_KEY } from '@/app/theme-script'
import { BasisTitle } from './basis-title'
import styles from './welcome.module.css'

// The stored flag, read as an external store like the theme
// (use-theme.ts). The server snapshot is "dismissed", so nothing renders a
// dialog before hydration; storing notifies this tab's readers, and another
// tab's change arrives as a storage event.
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

function getSnapshot(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === 'dismissed'
  } catch {
    return false // blocked storage: the welcome opens on every visit
  }
}

export function useWelcomeDismissed(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}

function storeDismissed(dismissed: boolean) {
  try {
    if (dismissed) localStorage.setItem(WELCOME_KEY, 'dismissed')
    else localStorage.removeItem(WELCOME_KEY)
  } catch {
    // Blocked storage: nothing to keep.
  }
  for (const l of listeners) l()
}

// The chart the dialog sits over (components/chart-hero.tsx).
function chartBox(): DOMRect | null {
  return document.querySelector('section[aria-labelledby="chart-title"]')?.getBoundingClientRect() ?? null
}

type Props = {
  open: boolean
  dismissed: boolean // the stored flag, which the box starts as on every open
  onClose: () => void
}

export function Welcome({ open, dismissed, onClose }: Props) {
  const { durations, easings } = useMotionTokens()
  // The welcome is a scene change, not a summoned tool, so it does not share
  // the palette's enter. Panel and backdrop move as one object: in on slow
  // and standard, out on base and exit, the stylesheet's ::backdrop on the
  // same tokens (decisions/2026-10-16-the-backdrop-arrives-with-the-panel.md).
  const enter = { duration: durations.slow, ease: easings.standard }
  const exit = { duration: durations.base, ease: easings.exit }
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const headingId = useId()

  // Mounted from an open until its exit has finished; the box starts as
  // stored on every open. Decided while rendering, from the values.
  const [wasOpen, setWasOpen] = useState(open)
  const [mounted, setMounted] = useState(open)
  const [dontShow, setDontShow] = useState(dismissed)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setMounted(true)
      setDontShow(dismissed)
    }
  }

  // Open and place, before paint. Open is decided from the element, so
  // Strict Mode's second run finds it open and leaves focus where the first
  // put it, on Close. The dialog sits over the chart's box when it fits
  // there whole and the box is on screen; otherwise the stylesheet centres
  // it on the viewport. Re-placed whenever the chart or the window resizes.
  useLayoutEffect(() => {
    const d = dialog.current
    if (!open || !d) return
    if (!d.open) {
      d.showModal()
      close.current?.focus()
    }
    const place = () => {
      const box = chartBox()
      const w = d.offsetWidth
      const h = d.offsetHeight
      const fits = box !== null && w <= box.width && h <= box.height && box.top >= 0 && box.bottom <= window.innerHeight
      d.dataset.placement = fits ? 'chart' : 'centred'
      d.style.left = fits ? `${box.left + (box.width - w) / 2}px` : ''
      d.style.top = fits ? `${box.top + (box.height - h) / 2}px` : ''
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(d)
    const hero = document.querySelector('section[aria-labelledby="chart-title"]')
    if (hero) observer.observe(hero)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [open])

  const dismiss = () => {
    storeDismissed(dontShow)
    onClose()
  }

  // The exit has run (or was skipped under reduced motion): close the
  // element, which returns focus.
  const finish = () => {
    if (open) return
    dialog.current?.close()
    setMounted(false)
  }

  if (!mounted) return null
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={headingId}
      data-welcome
      // The stylesheet fades the backdrop out with the panel's exit; the
      // element itself stays open until finish() closes it.
      data-open={open ? 'true' : 'false'}
      onCancel={e => {
        e.preventDefault()
        dismiss()
      }}
      onClose={() => {
        if (open) dismiss()
      }}
      // A click on the backdrop lands on the dialog itself.
      onClick={e => {
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <motion.div
        className={styles.panel}
        initial={{ opacity: 0, y: -4 }}
        animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
        transition={open ? enter : exit}
        onAnimationComplete={finish}
      >
        <h2 id={headingId} className="sr-only">
          Basis, sourced-data surface
        </h2>
        <BasisTitle />
        <ol className={`${styles.steps} type-body`}>
          <li>
            <span className={`${styles.number} type-figure`}>01</span>
            <span>Tick a row to chart it. Four are charted to start.</span>
          </li>
          <li>
            <span className={`${styles.number} type-figure`}>02</span>
            <span>Click a name to open its drawer.</span>
          </li>
          <li>
            <span className={`${styles.number} type-figure`}>03</span>
            <span>Hover any figure to see its source and when it was read.</span>
          </li>
          <li>
            <span className={`${styles.number} type-figure`}>04</span>
            <span>Use Diagnostics to test the charted rows: click a tool to pin it, drag across the plot to set its window.</span>
          </li>
        </ol>
        <div className={styles.actions}>
          <label className={`${styles.dontShow} type-label`}>
            <input type="checkbox" checked={dontShow} onChange={e => setDontShow(e.target.checked)} />
            Don&rsquo;t show again
          </label>
          <button ref={close} type="button" className={`${styles.close} type-action`} onClick={dismiss}>
            [ Close ]
          </button>
        </div>
      </motion.div>
    </dialog>
  )
}
