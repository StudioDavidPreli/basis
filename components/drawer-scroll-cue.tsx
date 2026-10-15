'use client'

// The drawer's scrollbar is hidden; this arrow stands in for it
// (decisions/2026-10-15-drawer-scroll-cue.md; contract, "Drawer scroll
// cue"). It shows while the drawer has more below and clears at the bottom.
// It is not a control: aria-hidden, no focus stop, nothing on click. The
// drawer already scrolls by wheel, trackpad, and the keys.
//
// Whether there is more is read from the scroll container's own numbers on
// every scroll and every resize of the drawer or its panel (an entity
// switch changes the panel's height), never remembered from a previous
// run, so Strict Mode's second run of the effect decides the same.

import { useEffect, useRef, useState } from 'react'
import styles from './drawer.module.css'

// A sub-pixel remainder at the bottom is not more to read.
const SLACK_PX = 2

export function DrawerScrollCue() {
  const cue = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    const scroller = cue.current?.parentElement
    if (!scroller) return
    const update = () => setMore(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > SLACK_PX)
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    const resize = new ResizeObserver(update)
    resize.observe(scroller)
    for (const child of scroller.children) if (child !== cue.current) resize.observe(child)
    return () => {
      scroller.removeEventListener('scroll', update)
      resize.disconnect()
    }
  }, [])

  return (
    <div ref={cue} className={styles.scrollCue} data-more={more || undefined} aria-hidden="true" data-drawer-scroll-cue>
      <span className={styles.scrollPad}>
        <span className={`${styles.scrollArrow} type-figure-lg`}>↓</span>
      </span>
    </div>
  )
}
