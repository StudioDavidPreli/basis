'use client'

// The client boundary (docs/spec.md, "State"). One reducer for the sheet's
// state, one snapshot from the server, a light poll so the board follows the
// cron, and the pieces of the sheet laid out on the hero map
// (decisions/2026-09-16-passbook-visual-language.md).

import { useCallback, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react'
import { config } from '@/lib/config'
import { companyName, regionName } from '@/lib/describe'
import type { StoredSnapshot } from '@/worker/refresh'
import type { FigureValue, Mutation } from '@/lib/types'
import { formatValue } from '@/lib/format'
import { initialState, reduce, sortIds } from './surface-state'
import { Header } from './header'
import { Margin } from './margin'
import { InterruptionBanner } from './interruption-banner'
import { ChartHero } from './chart-hero'
import { DataTable, type Row } from './data-table'
import { Footnotes } from './footnotes'
import { LiveRegion, useAnnouncer } from './live-region'
import styles from './surface.module.css'

const POLL_MS = 60_000

type Props = { snapshot: StoredSnapshot | null; cold: boolean; renderedAt: string }

// The reader's clock as an external store, in half-minute ticks: the server
// snapshot is the render time, so hydration matches the HTML byte for byte,
// and the client snapshot takes over after, so stale ages and TTLs age on
// screen. Same pattern as the theme and the reduced-motion flag.
const TICK_MS = 30_000
function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, TICK_MS)
  return () => clearInterval(id)
}
function useNow(renderedAt: string): Date {
  const server = Math.floor(Date.parse(renderedAt) / TICK_MS)
  const tick = useSyncExternalStore(subscribeClock, () => Math.floor(Date.now() / TICK_MS), () => server)
  return useMemo(() => new Date(tick * TICK_MS), [tick])
}

function mutationSentence(m: Mutation): string {
  const dataset = config.companies.some(c => c.id === m.entity) ? 'comps' : 'regions'
  const column = config.datasets[dataset]!.columns.find(c => c.key === m.metric)
  const name = entityName(m.entity)
  const label = column?.label ?? m.metric
  const fmt = (v: number) => formatValue(column?.format ?? 'number', v, { parentheses: dataset === 'comps' })
  const providers = [...new Set(m.sources.map(s => s.provider))].join(' and ')
  return `${label} for ${name} updated to ${fmt(m.value)} from ${fmt(m.prev)}, source ${providers}`
}

export function entityName(id: string): string {
  const c = config.companies.find(x => x.id === id)
  if (c) return companyName(c)
  const r = config.regions.find(x => x.id === id)
  return r ? regionName(r) : id
}

export function Surface({ snapshot: initial, cold, renderedAt }: Props) {
  const firstDataset = Object.keys(config.datasets)[0]!
  const [state, dispatch] = useReducer(reduce, initialState(firstDataset, config.datasets[firstDataset]!.columns.find(c => c.derive !== 'field')!.key))
  const [snapshot, setSnapshot] = useState(initial)
  const [busy, setBusy] = useState(false)
  const now = useNow(renderedAt)
  const { message, announce } = useAnnouncer()

  // Follow the cron: read the stored snapshot every minute, announce what
  // changed since the one on screen. Values tick through useAnimatedNumber
  // because the Figure's value prop changes; nothing else re-renders.
  const load = useCallback(async () => {
    const res = await fetch('/api/refresh', { cache: 'no-store' })
    if (!res.ok) return
    const next = (await res.json()) as StoredSnapshot
    setSnapshot(prev => {
      if (prev && next.at > prev.at) {
        for (const m of next.mutations.filter(m => m.at > prev.at).slice(0, 5)) announce(mutationSentence(m))
      }
      return next
    })
  }, [announce])

  useEffect(() => {
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  const refresh = useCallback(async () => {
    setBusy(true)
    announce('Refresh started')
    try {
      await fetch('/api/refresh', { method: 'POST' })
      await load()
      announce('Refresh finished')
    } finally {
      setBusy(false)
    }
  }, [load, announce])

  const dataset = config.datasets[state.dataset]!
  const columns = dataset.columns
  const entities = dataset.entities === 'companies' ? config.companies : config.regions

  const rows: Row[] = useMemo(
    () =>
      entities.map(e => {
        const snap = snapshot?.entities[e.id]
        const cells: Record<string, FigureValue | string | undefined> = {}
        for (const col of columns) {
          if (col.derive === 'field') cells[col.key] = (e as unknown as Record<string, string>)[col.field!]
          else cells[col.key] = snap?.metrics[col.key]
        }
        return { id: e.id, name: entityName(e.id), colors: { light: e.color, dark: e.colorDark }, marker: e.marker, cells }
      }),
    [entities, columns, snapshot],
  )

  const order = useMemo(
    () =>
      sortIds(
        rows.map(r => r.id),
        state.sort,
        id => {
          const cell = rows.find(r => r.id === id)?.cells[state.sort?.key ?? '']
          return typeof cell === 'object' ? cell?.value : cell
        },
      ),
    [rows, state.sort],
  )

  const onSort = useCallback(
    (key: string) => {
      dispatch({ type: 'sort', key })
      const col = columns.find(c => c.key === key)
      const next = !state.sort || state.sort.key !== key ? 'ascending' : state.sort.dir === 'asc' ? 'descending' : 'file order'
      announce(`Sorted by ${col?.label ?? key}, ${next}`)
    },
    [columns, state.sort, announce],
  )

  const phase = snapshot?.agent.phase ?? 'idle'

  return (
    <div className={styles.sheet} data-busy={busy || undefined}>
      <Margin date={snapshot?.at ?? renderedAt} dataset={dataset.label} />
      <main className={styles.content}>
        <Header
          datasets={Object.entries(config.datasets).map(([id, d]) => ({ id, label: d.label }))}
          active={state.dataset}
          onDataset={id => dispatch({ type: 'dataset', dataset: id, defaultMetric: config.datasets[id]!.columns.find(c => c.derive !== 'field')!.key })}
          busy={busy}
          onRefresh={refresh}
          date={snapshot?.at ?? renderedAt}
        />
        <InterruptionBanner agent={snapshot?.agent ?? null} cold={cold} onRetry={refresh} busy={busy} />
        <ChartHero
          columns={columns.filter(c => c.derive !== 'field' && c.derive !== 'driver')}
          metric={state.metric}
          onMetric={m => dispatch({ type: 'metric', metric: m })}
          range={state.range}
          onRange={r => dispatch({ type: 'range', range: r })}
          selection={state.selection.map(id => rows.find(r => r.id === id)!).filter(Boolean)}
          onDeselect={id => dispatch({ type: 'toggle', id, order })}
          onClear={() => dispatch({ type: 'clear' })}
          hoveredId={state.hoveredId}
          phase={phase}
        />
        <DataTable
          rows={rows}
          order={order}
          columns={columns}
          sort={state.sort}
          onSort={onSort}
          selection={state.selection}
          onToggle={(id, range) => dispatch({ type: 'toggle', id, order, range })}
          onSelectAll={() => dispatch({ type: 'selectAll', ids: order })}
          onClear={() => dispatch({ type: 'clear' })}
          hoveredId={state.hoveredId}
          onHover={id => dispatch({ type: 'hover', id })}
          parentheses={state.dataset === 'comps'}
          phase={phase}
          now={now}
        />
        <Footnotes snapshot={snapshot} now={now} />
      </main>
      <LiveRegion message={message} />
    </div>
  )
}
