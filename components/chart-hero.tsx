'use client'

import type { ColumnConfig } from '@/lib/config'
import type { AgentPhase } from '@/worker/refresh'
import type { SeriesSnapshot } from '@/lib/types'
import { formatValue } from '@/lib/format'
import { present } from '@/lib/present'
import { seriesFor } from '@/lib/series'
import { downsample } from '@/lib/downsample'
import { domainFor, summarize, toPoints } from '@/lib/chart'
import { config } from '@/lib/config'
import { sourcesOf } from '@/lib/diff'
import { windowMs, type DiagnosticSeries, type EntityFacts, type Window } from '@/lib/diagnostics'
import { CHART_CAP, RANGES, type Range } from './surface-state'
import type { Row } from './data-table'
import { Marker } from './marker'
import { TimeSeriesChart, type ChartRow, type Readout } from './time-series-chart'
import { AgentPresence } from './agent-presence'
import { DiagnosticsStrip } from './diagnostics-strip'
import styles from './chart-hero.module.css'

// The hero's frame: metric selector, range control, the plot, and the
// legend strip that doubles as the deselect control, with the agent mark at
// its right end. The plot is TimeSeriesChart; this assembles what it draws
// from the rows and the dataset's series (lib/series.ts) and writes the
// summary and the readout, which are text and so belong to the hero.
//
// The selection is not capped; the chart is. The first CHART_CAP selected
// rows are charted, the rest wait, and the legend says so.

type Props = {
  columns: ColumnConfig[]
  metric: string
  onMetric: (key: string) => void
  range: Range
  onRange: (r: Range) => void
  rows: Row[] // every row of the dataset, for the readout
  selection: Row[]
  onDeselect: (id: string) => void
  onClear: () => void
  hoveredId: string | null
  onHover: (id: string | null) => void
  openId: string | null
  window: Window | null
  onWindow: (window: Window | null) => void
  tool: string | null
  onTool: (tool: string | null) => void
  series: SeriesSnapshot | null
  parentheses: boolean
  phase: AgentPhase
  // The snapshot's `at`: the mark pulses when a run lands.
  pulseKey: string | null
  now: Date
}

export function ChartHero({ columns, metric, onMetric, range, onRange, rows, selection, onDeselect, onClear, hoveredId, onHover, openId, window: win, onWindow, tool, onTool, series, parentheses, phase, pulseKey, now }: Props) {
  const charted = selection.slice(0, CHART_CAP)
  const waiting = selection.length - charted.length
  const column = columns.find(c => c.key === metric) ?? columns[0]!
  const format = (v: number) => formatValue(column.format, v, { parentheses })

  const statusOf = (row: Row) => {
    const cell = row.cells[column.key]
    return cell && typeof cell === 'object' ? present(cell, phase, now).status : 'unverified'
  }

  const chartRows: ChartRow[] = charted.map(r => {
    const stored = series?.entities[r.id]
    const status = statusOf(r)
    return {
      id: r.id,
      name: r.name,
      colors: r.colors,
      marker: r.marker,
      points: stored ? downsample(toPoints(seriesFor(stored, column))) : [],
      hollow: status === 'stale' || status === 'unverified',
    }
  })

  // The diagnostics' inputs (docs/spec.md, Diagnostics): each charted row's
  // full series, the metric figure's inputs, and what the config knows.
  const view = domainFor(
    chartRows.map(r => r.points),
    range,
  )
  const viewMs: [number, number] | null = view ? [view[0], view[1]] : null
  const diagnostics: DiagnosticSeries[] = charted.map(r => {
    const cell = r.cells[column.key]
    const figure = cell && typeof cell === 'object' ? cell : null
    const stored = series?.entities[r.id]
    return {
      id: r.id,
      name: r.name,
      points: stored ? toPoints(seriesFor(stored, column)) : [],
      sources: figure ? sourcesOf(figure.source) : [],
      updatedAt: figure?.updatedAt ?? now.toISOString(),
      // The panel's row marks, read by the panel through the same object.
      colors: r.colors,
      marker: r.marker,
    } as DiagnosticSeries & { colors: Row['colors']; marker: string }
  })
  const facts: Record<string, EntityFacts> = {}
  for (const r of charted) {
    const entity = [...config.companies, ...config.regions].find(e => e.id === r.id)
    if (entity) facts[r.id] = { process: entity.process, exposures: entity.exposures, stored: series?.entities[r.id] ?? null, baseLevel: config.base.level }
  }

  // The earliest date any charted series has reached, and the earliest
  // date any of their sources may still revise.
  const stored = charted.map(r => series?.entities[r.id]).filter(s => s !== undefined)
  const historyFrom = stored.map(s => s.coveredFrom ?? s.dates[0] ?? null).filter((d): d is string => d !== null).sort()[0] ?? null
  const provisionalFrom = stored.map(s => s.provisionalFrom).sort()[0] ?? null

  const summary = summarize({
    label: column.label,
    range,
    charted: chartRows.map(r => {
      const last = r.points[r.points.length - 1]
      return { name: r.name, endpoint: last ? format(last[1]) : null }
    }),
    selected: selection.length,
    historyFrom,
    provisionalFrom,
  })

  // The hovered or focused row's point: the row's own figure, which the
  // refresh wrote as the series' last point, so the two cannot disagree.
  const hovered = hoveredId ? rows.find(r => r.id === hoveredId) : undefined
  let readout: Readout = null
  if (hovered) {
    const cell = hovered.cells[column.key]
    const figure = cell && typeof cell === 'object' ? cell : null
    const stored = series?.entities[hovered.id]
    readout = {
      name: hovered.name,
      value: figure ? format(figure.value) : '—',
      date: stored?.dates[stored.dates.length - 1] ?? figure?.updatedAt.slice(0, 10) ?? '',
      status: statusOf(hovered),
      colors: hovered.colors,
      marker: hovered.marker,
    }
  }

  return (
    <section className={styles.hero} aria-labelledby="chart-title">
      <div className={styles.controls}>
        <h2 id="chart-title" className="sr-only">
          Chart
        </h2>
        <div className={`${styles.group} ${styles.metric}`} role="group" aria-label="Metric">
          {columns.map(c => (
            <button key={c.key} type="button" className={`${styles.chip} type-label`} aria-pressed={c.key === metric} onClick={() => onMetric(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className={styles.group} role="group" aria-label="Time range">
          {RANGES.map(r => (
            <button key={r} type="button" className={`${styles.chip} type-label`} aria-pressed={r === range} onClick={() => onRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <TimeSeriesChart
        rows={chartRows}
        range={range}
        format={format}
        provisionalFrom={provisionalFrom}
        hoveredId={hoveredId}
        openId={openId}
        onHover={onHover}
        summary={summary}
        readout={readout}
        window={viewMs && win ? windowMs(win, viewMs) : null}
        onWindow={onWindow}
      />
      <div className={styles.strip}>
        <ul className={styles.legend} aria-label="Selected rows">
          {charted.map(r => (
            <li key={r.id}>
              <button
                type="button"
                className={`${styles.legendItem} type-label`}
                data-hover={hoveredId === r.id || undefined}
                onClick={() => onDeselect(r.id)}
                onMouseEnter={() => onHover(r.id)}
                onMouseLeave={() => onHover(null)}
                aria-label={`Remove ${r.name} from the chart`}
              >
                <Marker shape={r.marker} colors={r.colors} />
                {r.name}
              </button>
            </li>
          ))}
          {waiting > 0 && (
            <li className={`${styles.waiting} type-micro`}>
              {waiting} more selected, not charted: the chart holds {CHART_CAP}
            </li>
          )}
          {selection.length > 1 && (
            <li>
              <button type="button" className={`${styles.legendClear} type-action`} onClick={onClear}>
                [ Clear ]
              </button>
            </li>
          )}
        </ul>
        <AgentPresence phase={phase} pulseKey={pulseKey} />
      </div>
      <DiagnosticsStrip
        series={diagnostics}
        facts={facts}
        metric={{ key: column.key, label: column.label, derive: column.derive }}
        view={viewMs}
        window={win}
        onWindow={onWindow}
        tool={tool}
        onTool={onTool}
        now={now}
        phase={phase}
        parentheses={parentheses}
      />
    </section>
  )
}
