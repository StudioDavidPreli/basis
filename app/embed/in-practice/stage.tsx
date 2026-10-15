'use client'

import { useMemo, useState } from 'react'
import { config } from '@/lib/config'
import { agentPhase } from '@/lib/agent'
import { formatValue } from '@/lib/format'
import { present } from '@/lib/present'
import { seriesFor } from '@/lib/series'
import { summarize, toPoints, viewPoints } from '@/lib/chart'
import type { SeriesSnapshot } from '@/lib/types'
import type { StoredSnapshot } from '@/worker/refresh'
import { DataTable } from '@/components/data-table'
import { LiveRegion, useAnnouncer } from '@/components/live-region'
import { entityRows, rowOrder } from '@/components/rows'
import { initialState, reduce, type Range } from '@/components/surface-state'
import { TimeSeriesChart, type ChartRow, type Readout } from '@/components/time-series-chart'
import { CHARTED } from './charted'
import styles from './stage.module.css'

// The sheet's chart over the sheet's ledger, simplified (David, 2026-10-15):
// four companies (./charted.ts), their Level over one year, no controls and
// no legend: the endpoint markers and the ledger's rows name the lines. A row
// and its line light together both ways; the sort and the selection are the
// ledger's own and never touch the lines.
const DATASET = 'comps'
const METRIC = 'level'
const RANGE: Range = '1Y'

// The snapshot's own moment, as "15 Oct 2026, 14:00 UTC".
function stamp(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
  return `${day}, ${time} UTC`
}

export function InPracticeStage({ snapshot, series }: { snapshot: StoredSnapshot; series: SeriesSnapshot }) {
  const ds = config.datasets[DATASET]!
  const column = ds.columns.find(c => c.key === METRIC)!
  const [state, setState] = useState(() => initialState(DATASET, METRIC))
  const { message, announce } = useAnnouncer()
  // The figures are read at the moment the snapshot was written, not
  // against the reader's clock: a frozen copy aged to today would show
  // every figure stale for a reason that is the copy's, not the source's.
  // The stage says when that moment was.
  const now = useMemo(() => new Date(snapshot.at), [snapshot.at])
  const phase = agentPhase(snapshot.agent, now, false)
  const rows = useMemo(() => entityRows(DATASET, snapshot), [snapshot])
  const order = useMemo(() => rowOrder(rows, state.sort), [rows, state.sort])
  const format = (v: number) => formatValue(column.format, v, { parentheses: true })

  const statusOf = (id: string) => {
    const cell = rows.find(r => r.id === id)?.cells[METRIC]
    return cell && typeof cell === 'object' ? present(cell, phase, now).status : 'unverified'
  }

  const charted = CHARTED.map(id => rows.find(r => r.id === id)!)
  const chartRows: ChartRow[] = charted.map(r => {
    const stored = series.entities[r.id]
    const status = statusOf(r.id)
    return {
      id: r.id,
      name: r.name,
      colors: r.colors,
      marker: r.marker,
      points: stored ? viewPoints(toPoints(seriesFor(stored, column)), RANGE) : [],
      hollow: status === 'stale' || status === 'unverified',
    }
  })

  const provisionalFrom = CHARTED.map(id => series.entities[id]?.provisionalFrom).filter((d): d is string => !!d).sort()[0] ?? null
  const summary = summarize({
    label: column.label,
    range: RANGE,
    charted: chartRows.map(r => {
      const last = r.points[r.points.length - 1]
      return { name: r.name, endpoint: last ? format(last[1]) : null }
    }),
    selected: chartRows.length,
    historyFrom: null,
    provisionalFrom,
  })

  // The hovered or focused row's point, as on the sheet: the row's own
  // figure, which the refresh wrote as the series' last point.
  const hovered = state.hoveredId ? rows.find(r => r.id === state.hoveredId) : undefined
  let readout: Readout = null
  if (hovered) {
    const cell = hovered.cells[METRIC]
    const figure = cell && typeof cell === 'object' ? cell : null
    const stored = series.entities[hovered.id]
    readout = {
      name: hovered.name,
      value: figure ? format(figure.value) : '—',
      date: stored?.dates[stored.dates.length - 1] ?? figure?.updatedAt.slice(0, 10) ?? '',
      status: statusOf(hovered.id),
      colors: hovered.colors,
      marker: hovered.marker,
    }
  }
  const onHover = (id: string | null) => setState(s => reduce(s, { type: 'hover', id }))

  return (
    <main className={styles.stage}>
      <h1 className="sr-only">
        {column.label} over one year for four companies, above the {ds.label} ledger
      </h1>
      <p className={`${styles.caption} type-micro`}>
        {column.label}, one year · snapshot of {stamp(snapshot.at)}
      </p>
      <div className={styles.chart}>
        <TimeSeriesChart
          rows={chartRows}
          range={RANGE}
          format={format}
          provisionalFrom={provisionalFrom}
          hoveredId={state.hoveredId}
          openId={null}
          onHover={onHover}
          summary={summary}
          readout={readout}
          window={null}
        />
      </div>
      <DataTable
        rows={rows}
        order={order}
        columns={ds.columns}
        sort={state.sort}
        onSort={key => {
          const next = reduce(state, { type: 'sort', key })
          setState(next)
          const label = key === 'name' ? 'Name' : (ds.columns.find(c => c.key === key)?.label ?? key)
          announce(`Sorted by ${label}, ${next.sort ? (next.sort.dir === 'asc' ? 'ascending' : 'descending') : 'file order'}`)
        }}
        selection={state.selection}
        onToggle={(id, range) => setState(s => reduce(s, { type: 'toggle', id, order, range }))}
        onSelectAll={() => setState(s => reduce(s, { type: 'selectAll', ids: order }))}
        onClear={() => setState(s => reduce(s, { type: 'clear' }))}
        hoveredId={state.hoveredId}
        onHover={onHover}
        parentheses
        phase={phase}
        now={now}
        openId={null}
        metric={METRIC}
        range={RANGE}
        series={series}
        links={false}
      />
      <LiveRegion message={message} />
    </main>
  )
}
