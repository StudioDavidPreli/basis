'use client'

// The live region (docs/spec.md, Accessibility): polite, visually hidden,
// announcing sort changes, refresh start and end, and each agent mutation
// in the spec's sentence form. Messages queue so a burst of mutations is
// read one at a time rather than the last one overwriting the rest. The
// region is emptied once the queue drains, and before a repeat, because a
// text node that does not change is not read: "Refresh started" twice in a
// row was silent the second time.

import { useEffect, useRef, useState } from 'react'

const GAP_MS = 1_200
// How long the region stays empty before a repeated sentence: long enough
// for the empty node to be a change of its own.
const CLEAR_MS = 100

export function useAnnouncer() {
  const [message, setMessage] = useState('')
  const queue = useRef<string[]>([])
  const shown = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Declarations, not const arrows: drain refers to itself from the timer,
  // and a hoisted function can. The React Compiler memoizes both.
  function show(text: string) {
    shown.current = text
    setMessage(text)
  }
  function drain() {
    const next = queue.current.shift()
    if (next === undefined) {
      show('')
      timer.current = null
      return
    }
    if (next === shown.current) {
      // Empty the node first, then say it again.
      queue.current.unshift(next)
      show('')
      timer.current = setTimeout(drain, CLEAR_MS)
      return
    }
    show(next)
    timer.current = setTimeout(drain, GAP_MS)
  }

  function announce(text: string) {
    queue.current.push(text)
    if (!timer.current) drain()
  }

  // The cleanup leaves the announcer usable: the ref that gates draining is
  // cleared with the timer, so a run after this one (development Strict
  // Mode) is not left with a pending flag and a queue nothing drains.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    queue.current = []
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
