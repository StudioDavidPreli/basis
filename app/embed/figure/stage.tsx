'use client'

import { useEffect, useState } from 'react'
import { config } from '@/lib/config'
import { companyName } from '@/lib/describe'
import type { FigureStatus, FigureValue, Source } from '@/lib/types'
import type { AgentPhase } from '@/worker/refresh'
import { Figure } from '@/components/figure'
import styles from './stage.module.css'

// Real conditions, composed: each status is produced by the inputs that
// produce it on the board (a fixture flag, an expired TTL, a changed value,
// an agent phase), never by setting the status directly. present() derives
// the status from these the same way it does for a live figure.

const company = config.companies[0]!
const column = config.datasets['comps']!.columns.find(c => c.key === 'level')!
const NOW = new Date('2026-09-16T16:30:00Z')

function source(over: Partial<Source> = {}): Source {
  const d = config.drivers['temp-tokyo']!
  return {
    kind: 'api',
    provider: d.provider,
    ref: d.ref,
    url: 'https://api.open-meteo.com/v1/forecast?latitude=35.68&longitude=139.69&current=temperature_2m&timezone=UTC',
    asOf: '2026-09-16T16:15:00Z',
    cadence: d.cadence,
    ttlMs: d.ttlMs,
    ...over,
  }
}

function compose(status: string): { figure: FigureValue; phase: AgentPhase; now: Date } {
  const base: FigureValue = { value: 104.21, source: [source()], status: 'current', updatedAt: NOW.toISOString() }
  switch (status as FigureStatus) {
    case 'stale':
      return { figure: { ...base, source: [source({ fixture: true })] }, phase: 'done', now: NOW }
    case 'refreshing':
      return { figure: base, phase: 'reading', now: NOW }
    case 'agent-updated':
      return { figure: { ...base, prev: 101.9, status: 'agent-updated' }, phase: 'done', now: NOW }
    case 'unverified':
      return { figure: { ...base, source: [], status: 'unverified' }, phase: 'done', now: NOW }
    default:
      return { figure: base, phase: 'done', now: NOW }
  }
}

export function FigureStage({ status }: { status: string }) {
  const composed = compose(status)
  // agent-updated is a transition: the figure arrives at its previous value
  // and ticks to the new one after mount, so the screenshot and the eye
  // both see the fresh-ink decay the board shows. Until the tick, the
  // figure is what it was on the board before the run: current, with no
  // fresh ink and no arrow on the old value.
  const [value, setValue] = useState(composed.figure.prev ?? composed.figure.value)
  useEffect(() => {
    const t = setTimeout(() => setValue(composed.figure.value), 300)
    return () => clearTimeout(t)
  }, [composed.figure.value])
  const arrived = value === composed.figure.value
  const figure: FigureValue = arrived ? { ...composed.figure, value } : { ...composed.figure, value, status: 'current' }
  return (
    <main className={styles.stage} data-status={status}>
      <h1 className="sr-only">Figure, {status}</h1>
      <Figure figure={figure} column={column} parentheses phase={composed.phase} now={composed.now} entityName={companyName(company)} />
      <p className={`${styles.caption} type-eyebrow`}>{status}</p>
    </main>
  )
}
