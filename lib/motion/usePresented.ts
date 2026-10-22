'use client'

// Whether the page is being presented: true once two animation frames have
// run after the mount, however far apart (contract, the second scoped
// exception). A motion's clock started at mount runs while a browser has
// painted nothing; Safari's first frame showed the top line half drawn
// (David, 2026-10-21). Frames run only while the page is presented, so two
// of them mean a reader is seeing it, and the wait never stalls on a slow
// machine. Set once, and decided from the value, so Strict Mode's second
// run finds it set or starts its own wait. `skip` (reduced motion) means
// there is nothing to wait for.

import { useEffect, useState } from 'react'

export function usePresented(skip: boolean): boolean {
  const [presented, setPresented] = useState(false)
  const ready = presented || skip
  useEffect(() => {
    if (ready) return
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => setPresented(true))
    })
    return () => cancelAnimationFrame(id)
  }, [ready])
  return ready
}
