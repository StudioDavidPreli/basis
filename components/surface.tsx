'use client'

// The client boundary (docs/spec.md, "State"). One reducer for the sheet's
// state, one snapshot from the server, a light poll so the board follows the
// cron, and the pieces of the sheet laid out on the hero map
// (decisions/2026-09-16-passbook-visual-language.md).

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { config } from '@/lib/config'
import { mutationSentence } from '@/lib/describe'
import type { StoredSnapshot } from '@/worker/refresh'
import type { SeriesSnapshot } from '@/lib/types'
import { initialState, reduce, RANGES } from './surface-state'
import { entityRows, rowOrder } from './rows'
import { defaultMetric, encodeUrlState, mergeUrlSearch, type UrlState } from './surface-url'
import { useNow } from './use-now'
import { agentPhase } from '@/lib/agent'
import { Header } from './header'
import { Margin } from './margin'
import { InterruptionBanner } from './interruption-banner'
import { ChartHero } from './chart-hero'
import { DataTable, type Row } from './data-table'
import { Footnotes } from './footnotes'
import { CommandPalette, type PaletteItem } from './command-palette'
import { Marker } from './marker'
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
  const activeDataset = state.dataset
  const now = useNow(renderedAt)
  const { message, announce } = useAnnouncer()

  // The chart's series, by dataset (decisions/2026-09-16-series-in-their-
  // own-key.md). None ship with the page
  // (decisions/2026-09-28-series-after-hydration.md): the active dataset's
  // are read once hydrated (the effect below), another when its tab is
  // first switched to (the tab's handler), and the active one again when
  // the poll sees a newer snapshot, so the endpoints follow the figures.
  const [seriesByDataset, setSeriesByDataset] = useState<Record<string, SeriesSnapshot | null>>({})
  const loadSeries = useCallback(async (dataset: string) => {
    const res = await fetch(`/api/series?dataset=${encodeURIComponent(dataset)}`, { cache: 'no-store' })
    if (!res.ok) return
    const next = (await res.json()) as SeriesSnapshot
    setSeriesByDataset(prev => ({ ...prev, [dataset]: next }))
  }, [])
  // The read is the effect's own, with the state set in its callback and
  // the request aborted on cleanup: under Strict Mode the first run's read
  // is cancelled and the second's lands, never a first-run flag. A failed
  // read leaves the chart empty until the poll or a tab switch reads again.
  const openedOn = initial.dataset
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/series?dataset=${encodeURIComponent(openedOn)}`, { cache: 'no-store', signal: controller.signal })
      .then(res => (res.ok ? (res.json() as Promise<SeriesSnapshot>) : null))
      .then(next => {
        if (next) setSeriesByDataset(prev => ({ ...prev, [openedOn]: next }))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [openedOn])
  const latestAt = useRef(served?.at ?? null)
  // The dataset on screen when a poll completes, not when it started: a
  // tab switch during the fetch would otherwise reload the old dataset's
  // series and leave the new one behind.
  const activeRef = useRef(activeDataset)
  useEffect(() => {
    activeRef.current = activeDataset
  }, [activeDataset])

  // Follow the cron: read the stored snapshot every minute, announce what
  // changed since the one on screen. Values tick through useAnimatedNumber
  // because the Figure's value prop changes; nothing else re-renders. A
  // failed read (offline, the dev server restarting) is a skipped poll.
  const load = useCallback(async (signal?: AbortSignal) => {
    let next: StoredSnapshot
    try {
      const res = await fetch('/api/refresh', { cache: 'no-store', signal })
      if (!res.ok) return
      next = (await res.json()) as StoredSnapshot
    } catch {
      return
    }
    // The diff runs against the ref, never inside the state updater: React
    // may call an updater more than once (it does, under development Strict
    // Mode), and an announcement is a side effect.
    const prevAt = latestAt.current
    if (prevAt !== null && next.at > prevAt) {
      for (const m of next.mutations.filter(m => m.at > prevAt).slice(0, 5)) announce(mutationSentence(m))
    }
    setSnapshot(next)
    if (prevAt === null || next.at > prevAt) {
      latestAt.current = next.at
      const active = activeRef.current
      // The other dataset's series are now behind the figures: forget
      // them, so the tab handler reads them fresh on the next switch.
      setSeriesByDataset(prev => ({ [active]: prev[active] ?? null }))
      void loadSeries(active)
    }
  }, [announce, loadSeries])

  // The poll follows the cron, but only while someone is looking. A hidden
  // tab reads two KV keys a minute for a page nobody is on, which on the free
  // tier is the largest avoidable cost Basis has
  // (decisions/2026-09-18-the-write-budget.md). Coming back reads once
  // immediately, because a tab returning is behind by however long it was
  // away.
  //
  // The clock is decided from `visibilityState` every time, never from
  // whether this effect has run before: Strict Mode runs it twice on the same
  // element, and `stop()` before each start is what makes the second run
  // land where the first did.
  useEffect(() => {
    const controller = new AbortController()
    let id: ReturnType<typeof setInterval> | null = null
    const stop = () => {
      if (id !== null) clearInterval(id)
      id = null
    }
    const sync = () => {
      stop()
      if (document.visibilityState === 'hidden') return
      id = setInterval(() => void load(controller.signal), POLL_MS)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void load(controller.signal)
      sync()
    }
    sync()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
      controller.abort()
    }
  }, [load])

  // The shareable slice mirrors to the URL (docs/spec.md, "State"), with
  // defaults omitted, through replaceState so it never adds history. Only
  // while the sheet's own path is current: with the drawer open the URL is
  // the entity's, and the sheet's entry is rewritten when back returns to
  // it, which is why the pathname is a dependency. Keys the codec does not
  // own (`?reduce=1`, `?theme=`) are kept, not rebuilt away.
  const pathname = usePathname()
  // With a drawer open the path is the entity's; the ledger marks that row.
  const openMatch = pathname.match(/^\/(?:company|region)\/([^/]+)$/)
  const openId = openMatch ? decodeURIComponent(openMatch[1]!) : null
  const search = encodeUrlState(state)
  useEffect(() => {
    if (pathname !== '/') return
    const next = `${pathname}${mergeUrlSearch(window.location.search, search)}${window.location.hash}`
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

  const rows: Row[] = useMemo(() => entityRows(state.dataset, snapshot), [state.dataset, snapshot])
  const order = useMemo(() => rowOrder(rows, state.sort), [rows, state.sort])

  const onSort = useCallback(
    (key: string) => {
      dispatch({ type: 'sort', key })
      const col = columns.find(c => c.key === key)
      const next = !state.sort || state.sort.key !== key ? 'ascending' : state.sort.dir === 'asc' ? 'descending' : 'file order'
      announce(`Sorted by ${col?.label ?? key}, ${next}`)
    },
    [columns, state.sort, announce],
  )

  // The phase the reader sees, not only the phase the handler stored:
  // `idle` is a function of the reader's clock, and `reading` is this
  // client's own refresh, which it knows about before KV does (lib/agent.ts,
  // contracts/agent-presence.md). `busy` reaching it is what finally makes
  // `refreshing` figures reachable outside the embed stage.
  const phase = agentPhase(snapshot?.agent ?? null, now, busy)

  const onDataset = (id: string) => {
    dispatch({ type: 'dataset', dataset: id, defaultMetric: defaultMetric(config.datasets[id]!) })
    // A dataset the page did not ship: read its series now, before a
    // row is selected.
    if (!(id in seriesByDataset)) void loadSeries(id)
  }

  // The palette's list: the sheet's entities, datasets, metrics, and ranges; the
  // palette adds its own View group. A jump is the name cell's link by
  // other means: it replaces history while a drawer is open, and the open
  // entity's own jump hands focus to the drawer.
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const paletteItems: PaletteItem[] = [
    ...order.map(id => {
      const row = rows.find(r => r.id === id)!
      return {
        id: `go:${id}`,
        group: 'Go to',
        label: row.name,
        keywords: Object.values(row.cells).filter(c => typeof c === 'string').join(' '),
        tag: id === openId ? 'open' : undefined,
        leading: <Marker shape={row.marker} colors={row.colors} />,
        run: () => {
          if (id === openId) document.querySelector<HTMLElement>('dialog [data-drawer-heading]')?.focus()
          else if (openId !== null) router.replace(row.href)
          else router.push(row.href)
        },
      }
    }),
    ...Object.entries(config.datasets).map(([id, d]) => ({
      id: `dataset:${id}`,
      group: 'Dataset',
      label: `Show ${d.label}`,
      keywords: 'dataset tab',
      tag: id === state.dataset ? 'current' : undefined,
      run: () => onDataset(id),
    })),
    // The metric chips hide on a narrow viewport (docs/spec.md); here the
    // metric stays one keystroke away at any width.
    ...columns
      .filter(c => c.derive !== 'field' && c.derive !== 'driver')
      .map(c => ({
        id: `metric:${c.key}`,
        group: 'Chart metric',
        label: `Chart ${c.label}`,
        keywords: 'metric measure',
        tag: c.key === state.metric ? 'current' : undefined,
        run: () => dispatch({ type: 'metric', metric: c.key }),
      })),
    ...RANGES.map(r => ({
      id: `range:${r}`,
      group: 'Time range',
      label: r === 'Max' ? 'Whole history' : `Last ${r}`,
      keywords: `range period ${r}`,
      tag: r === state.range ? 'current' : undefined,
      run: () => dispatch({ type: 'range', range: r }),
    })),
  ]

  return (
    <div className={styles.sheet} data-busy={busy || undefined}>
      <Margin date={snapshot?.at ?? renderedAt} dataset={dataset.label} />
      <main className={styles.content}>
        <Header
          datasets={Object.entries(config.datasets).map(([id, d]) => ({ id, label: d.label }))}
          active={state.dataset}
          onDataset={onDataset}
          onPalette={() => setPaletteOpen(true)}
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
          window={state.window}
          onWindow={w => dispatch({ type: 'window', window: w })}
          tool={state.tool}
          onTool={t => dispatch({ type: 'tool', tool: t })}
          rows={rows}
          selection={state.selection.map(id => rows.find(r => r.id === id)!).filter(Boolean)}
          onDeselect={id => dispatch({ type: 'toggle', id, order })}
          onClear={() => dispatch({ type: 'clear' })}
          hoveredId={state.hoveredId}
          onHover={id => dispatch({ type: 'hover', id })}
          openId={openId}
          series={seriesByDataset[state.dataset] ?? null}
          parentheses={state.dataset === 'comps'}
          phase={phase}
          pulseKey={snapshot?.at ?? null}
          now={now}
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
          openId={openId}
          metric={state.metric}
          range={state.range}
          series={seriesByDataset[state.dataset] ?? null}
        />
        <Footnotes snapshot={snapshot} now={now} />
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} />
      <LiveRegion message={message} />
    </div>
  )
}
