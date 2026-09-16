'use client'

// The live region (docs/spec.md, Accessibility): polite, visually hidden,
// announcing sort changes, refresh start and end, and each agent mutation
// in the spec's sentence form. Messages queue so a burst of mutations is
// read one at a time rather than the last one overwriting the rest.

import { useEffect, useRef, useState } from 'react'

const GAP_MS = 1_200

export function useAnnouncer() {
  const [message, setMessage] = useState('')
  const queue = useRef<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Declarations, not const arrows: drain refers to itself from the timer,
  // and a hoisted function can. The React Compiler memoizes both.
  function drain() {
    const next = queue.current.shift()
    if (next === undefined) {
      timer.current = null
      return
    }
    setMessage(next)
    timer.current = setTimeout(drain, GAP_MS)
  }

  function announce(text: string) {
    queue.current.push(text)
    if (!timer.current) drain()
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return { message, announce }
}

export function LiveRegion({ message }: { message: string }) {
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="live-region">
      {message}
    </div>
  )
}
