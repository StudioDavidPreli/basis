'use client'

// The client boundary (docs/spec.md, "State"). One reducer for the sheet's
// state, one snapshot from the server, a light poll so the board follows the
// cron, and the pieces of the sheet laid out on the hero map
// (decisions/2026-09-16-passbook-visual-language.md).

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { usePathname } from 'next/navigation'
import { config } from '@/lib/config'
import { entityName, mutationSentence } from '@/lib/describe'
import { entityHref } from '@/lib/entity-detail'
import type { StoredSnapshot } from '@/worker/refresh'
import type { FigureValue } from '@/lib/types'
import { initialState, reduce, sortIds } from './surface-state'
import { defaultMetric, encodeUrlState, type UrlState } from './surface-url'
import { useNow } from './use-now'
import { Header } from './header'
import { Margin } from './margin'
import { InterruptionBanner } from './interruption-banner'
import { ChartHero } from './chart-hero'
import { DataTable, type Row } from './data-table'
import { Footnotes } from './footnotes'
import { LiveRegion, useAnnouncer } from './live-region'
import styles from './surface.module.css'

const POLL_MS = 60_000

type Props = { snapshot: StoredSnapshot | null; cold: boolean; renderedAt: string; initial: UrlState }

export function Surface({ snapshot: served, cold, renderedAt, initial }: Props) {
  // Seeded from the URL the server parsed, so the first client render is
  // the server's render and a deep link has nothing to reconcile.
  const [state, dispatch] = useReducer(reduce, initial, seed => ({ ...initialState(seed.dataset, seed.metric), ...seed }))
  const [snapshot, setSnapshot] = useState(served)
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

  // The shareable slice mirrors to the URL (docs/spec.md, "State"), with
  // defaults omitted, through replaceState so it never adds history. Only
  // while the sheet's own path is current: with the drawer open the URL is
  // the entity's, and the sheet's entry is rewritten when back returns to
  // it, which is why the pathname is a dependency.
  const pathname = usePathname()
  const search = encodeUrlState(state)
  useEffect(() => {
    if (pathname !== '/') return
    const next = `${pathname}${search}${window.location.hash}`
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (next !== current) window.history.replaceState(null, '', next)
  }, [pathname, search])

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
        return { id: e.id, name: entityName(e.id), href: entityHref(e.id), colors: { light: e.color, dark: e.colorDark }, marker: e.marker, cells }
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
          onDataset={id => dispatch({ type: 'dataset', dataset: id, defaultMetric: defaultMetric(config.datasets[id]!) })}
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
