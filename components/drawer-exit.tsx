'use client'

// The drawer's exit (contract, "Drawer close"). The drawer is an
// intercepting route: on every close path (Escape, the close control, the
// back button) Next removes it from the tree at once, its slot's layout
// included, so nothing inside the slot can hold it for an exit. This
// lives in the root layout, which outlives the slot, and works on the DOM
// React has already let go of: it watches the frame for a removed drawer
// element, puts that element back in its grid column, springs its width
// to zero so the sheet widens on the same curve it narrowed on, and
// removes it when the spring settles. The element is inert during the
// exit, which is what an exit is for; history has already moved. Under
// reduced motion the spring is the 10 ms branch and the exit is at once.

import { useEffect } from 'react'
import { animate } from 'framer-motion'
import { useMotionTokens } from '@/lib/motion/tokens'

export const EXITING = 'data-exiting'

export function DrawerExit() {
  const { springDamped } = useMotionTokens()

  useEffect(() => {
    const frame = document.getElementById('frame')
    if (!frame) return
    const observer = new MutationObserver(records => {
      for (const r of records) {
        for (const node of r.removedNodes) {
          if (!(node instanceof HTMLDialogElement) || !node.hasAttribute('data-entity') || node.hasAttribute(EXITING)) continue
          node.setAttribute(EXITING, '')
          node.removeAttribute('aria-labelledby')
          node.setAttribute('aria-hidden', 'true')
          node.setAttribute('inert', '')
          // Back into its cell (the stylesheet places it), where a drawer
          // opening meanwhile overlaps it rather than stacking below.
          frame.appendChild(node)
          const width = node.getBoundingClientRect().width
          // The dialog itself, never a motion element: Framer's imperative
          // animate would otherwise pick up an unmounted visual element and
          // go nowhere.
          // `reduceMotion: false` for the same reason as the open: Framer
          // would otherwise read prefers-reduced-motion itself for a
          // positional key; the tokens already carry the flag.
          animate(node, { width: [width, 0] }, { ...springDamped, reduceMotion: false }).then(() => node.remove())
        }
      }
    })
    observer.observe(frame, { childList: true })
    return () => observer.disconnect()
  }, [springDamped])

  return null
}
