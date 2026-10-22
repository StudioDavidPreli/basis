'use client'

import { useSyncExternalStore } from 'react'
import { ageMinutes, formatAge } from '@/lib/age'
import { ScrambleText } from './scramble-text'
import styles from './margin.module.css'

// The left margin: the document label and the date, rotated, the way the
// Operate reference and the passbook annotate their sheets. Row numbers
// live in the table's first column, aligned to this edge.
//
// Under the date it counts the data's age to the second, from the
// snapshot's own time (decisions/2026-10-21-the-margin-counts-the-datas-
// age.md); a refresh starts it again from zero, and with no snapshot it
// shows nothing. "Basis" scrambles into itself each time the count passes a
// whole minute, on Cinematic: the period is the clock's.

// A seconds clock as an external store, ticking on the wall clock's
// seconds. The server snapshot is null, so the server's HTML and hydration
// show no count and agree; the client's takes over after.
function subscribeSeconds(onChange: () => void) {
  let id: ReturnType<typeof setTimeout>
  const next = () => {
    id = setTimeout(() => {
      onChange()
      next()
    }, 1000 - (Date.now() % 1000))
  }
  next()
  return () => clearTimeout(id)
}
const nowSeconds = () => Math.floor(Date.now() / 1000)
const noSeconds = () => null

export function Margin({ date, dataset, at }: { date: string; dataset: string; at: string | null }) {
  const day = date.slice(0, 10)
  const seconds = useSyncExternalStore(subscribeSeconds, nowSeconds, noSeconds)
  const age = at !== null && seconds !== null ? seconds * 1000 - Date.parse(at) : null
  return (
    <aside className={styles.margin} aria-hidden="true">
      <span className={`${styles.label} type-eyebrow`}>
        {/* Keyed on the snapshot: a refresh starts the count again, and a
            reset is not a minute passing, so it mounts a fresh scramble
            rather than beating one. */}
        <ScrambleText key={at ?? 'none'} text="Basis" beat={age === null ? undefined : ageMinutes(age)} preset="cinematic" schedule="linear" /> · {dataset}
      </span>
      <span className={styles.foot}>
        <span className={`${styles.date} type-eyebrow`}>{day}</span>
        <span className={`${styles.date} ${styles.age} type-eyebrow`} data-age>
          {age === null ? '' : formatAge(age)}
        </span>
      </span>
    </aside>
  )
}
