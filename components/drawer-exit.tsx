'use client'

// The drawer's exit (contract, "Drawer close"). The drawer is an
// intercepting route: on every close path (Escape, the close control, the
// back button) Next removes it from the tree at once, its slot's layout
// included, so nothing inside the slot can hold it for an exit. This
// lives in the root layout, which outlives the slot, and works on the DOM
// React has already let go of: it watches the frame for a removed drawer
// element, puts that element back out of flow at the viewport's right
// edge, slides its panel out on the damped spring, and removes it when
// the spring settles. The element is inert during the exit, which is what
// an exit is for; history has already moved. Under reduced motion the
// spring is the 10 ms branch and the exit is at once.

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
          const panel = node.firstElementChild as HTMLElement | null
          if (!panel) continue
          node.setAttribute(EXITING, '')
          node.removeAttribute('aria-labelledby')
          node.setAttribute('aria-hidden', 'true')
          node.setAttribute('inert', '')
          // Out of flow, so the grid's drawer column collapses at once and
          // the sheet reflows on its own spring while this slides away.
          Object.assign(node.style, { position: 'fixed', top: '0', right: '0', left: 'auto', zIndex: '4' })
          frame.appendChild(node)
          animate(panel, { x: '100%' }, springDamped).then(() => node.remove())
        }
      }
    })
    observer.observe(frame, { childList: true })
    return () => observer.disconnect()
  }, [springDamped])

  return null
}
