'use client'

import type { ColumnConfig } from '@/lib/config'
import type { AgentPhase } from '@/worker/refresh'
import type { SeriesSnapshot } from '@/lib/types'
import { formatTick, formatValue } from '@/lib/format'
import { present } from '@/lib/present'
import { seriesFor } from '@/lib/series'
import { domainFor, summarize, toPoints, viewPoints } from '@/lib/chart'
import { config } from '@/lib/config'
import { sourcesOf } from '@/lib/diff'
import { chartCsv, chartCsvName } from '@/lib/export-csv'
import { windowDays, windowMs, type DiagnosticSeries, type EntityFacts, type Window } from '@/lib/diagnostics'
import { riskReturn } from '@/lib/risk-return'
import { heatGrid } from '@/lib/heat'
import { dateMs } from '@/lib/chart'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useState } from 'react'
import { useMotionTokens } from '@/lib/motion/tokens'
import { CHART_CAP, RANGES, VIEWS, VIEW_LABELS, type Range, type View } from './surface-state'
import { RiskReturn, type RiskRow } from './risk-return'
import { Heat } from './heat'
import type { Row } from './data-table'
import { Marker } from './marker'
import { TimeSeriesChart, type ChartRow, type Readout } from './time-series-chart'
import { AgentPresence } from './agent-presence'
import { DiagnosticsStrip } from './diagnostics-strip'
import styles from './chart-hero.module.css'

// The hero's frame: the view switch, the metric selector, the range
// control, the plot, and the legend strip that doubles as the deselect
// control, with the agent mark at its right end. The plot is one of two
// views (decisions/2026-10-19-views-in-the-hero.md): Over time, or Risk /
// return, which reads Level for every row and puts a caption where the
// metric chips stand (decisions/2026-10-19-risk-return-reads-level.md). The
// outgoing view leaves on fast / exit while the incoming one arrives; the
// charted rows' markers travel between the two inside one LayoutGroup. The plot is TimeSeriesChart; this assembles what it draws
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
  order: string[] // the ledger's order: Risk / return's points appear in it
  view: View
  onView: (view: View) => void
  // A Heat cell: chart its row first, take its bucket as the window, and
  // open Over time (decisions/2026-10-19-heat-measures-moves-in-sigma.md).
  onPick: (id: string, window: Window) => void
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

export function ChartHero({ columns, metric, onMetric, range, onRange, rows, order, view: heroView, onView, onPick, selection, onDeselect, onClear, hoveredId, onHover, openId, window: win, onWindow, tool, onTool, series, parentheses, phase, pulseKey, now }: Props) {
  const charted = selection.slice(0, CHART_CAP)
  const waiting = selection.length - charted.length
  const column = columns.find(c => c.key === metric) ?? columns[0]!
  const format = (v: number) => formatValue(column.format, v, { parentheses })
  const tickFormat = (v: number) => formatTick(column.format, v, { parentheses })
  const { durations, easings } = useMotionTokens()

  // The view of the render before, kept beside this one and set while
  // rendering, so the view arriving knows the markers are travelling in.
  const [views, setViews] = useState({ prev: heroView, current: heroView })
  if (views.current !== heroView) setViews({ prev: views.current, current: heroView })
  const cameFrom = views.current === heroView ? views.prev : views.current
  // Markers travel only between the two views that draw them.
  const travelled = (cameFrom === 'time' && heroView === 'risk') || (cameFrom === 'risk' && heroView === 'time')

  // Risk / return: every row's Level over the analysis window, or over the
  // view of every row when no window is set.
  const levelColumn = columns.find(c => c.derive === 'level') ?? column
  const levelRows = rows.map(r => {
    const stored = series?.entities[r.id]
    return { id: r.id, points: stored ? toPoints(seriesFor(stored, levelColumn)) : [] }
  })
  const allView = domainFor(
    levelRows.map(r => r.points),
    range,
  )
  const riskWindow = allView ? windowMs(win, [allView[0], allView[1]]) : null
  const riskPoints = heroView === 'risk' && riskWindow ? riskReturn(levelRows, riskWindow) : []
  // Heat: every row's Level over the view of every row, in buckets.
  const allProvisional = rows.map(r => series?.entities[r.id]?.provisionalFrom).filter((d): d is string => !!d).sort()[0] ?? null
  const grid = heroView === 'heat' && allView ? heatGrid(levelRows, [allView[0], allView[1]], range, allProvisional ? dateMs(allProvisional) : null) : null
  const leave = { opacity: 0, transition: { duration: durations.fast, ease: easings.exit } }

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
      points: stored ? viewPoints(toPoints(seriesFor(stored, column)), range) : [],
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

  // The chart as a CSV (decisions/2026-10-15-export-the-chart-as-csv.md):
  // built and handed to the browser on the click, from what the page holds.
  const exportCsv = () => {
    const exportedAt = new Date().toISOString()
    const csv = chartCsv({
      label: column.label,
      range,
      rows: diagnostics.map(d => ({ name: d.name, points: d.points, sources: d.sources, provisionalFrom: series?.entities[d.id]?.provisionalFrom ?? null })),
      exportedAt,
    })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = chartCsvName(column.key, range, exportedAt)
    a.click()
    URL.revokeObjectURL(url)
  }

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

  // Risk / return's and Heat's rows, in the ledger's order, marked as their
  // figures are.
  const ordered = order.map(id => rows.find(r => r.id === id)).filter((r): r is Row => r !== undefined)
  const viewRows: RiskRow[] = ordered.map(r => {
    const status = statusOf(r)
    return { id: r.id, name: r.name, colors: r.colors, marker: r.marker, hollow: status === 'stale' || status === 'unverified' }
  })

  return (
    <section className={styles.hero} aria-labelledby="chart-title">
      <div className={styles.controls}>
        <h2 id="chart-title" className="sr-only">
          Chart
        </h2>
        <div className={styles.lead}>
          <div className={`${styles.group} ${styles.views}`} role="group" aria-label="Chart view">
            {VIEWS.map(v => (
              <button key={v} type="button" className={`${styles.chip} type-label`} aria-pressed={v === heroView} onClick={() => onView(v)}>
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
          {heroView === 'time' ? (
            <div className={`${styles.group} ${styles.metric}`} role="group" aria-label="Metric">
              {columns.map(c => (
                <button key={c.key} type="button" className={`${styles.chip} type-label`} aria-pressed={c.key === metric} onClick={() => onMetric(c.key)}>
                  {c.label}
                </button>
              ))}
            </div>
          ) : heroView === 'risk' ? (
            <p className={`${styles.caption} type-micro`} data-risk-caption>
              from {levelColumn.label} · {riskWindow ? windowDays(riskWindow) : 0} d · volatility across, change over the window up
            </p>
          ) : (
            <p className={`${styles.caption} type-micro`} data-heat-caption>
              from {levelColumn.label} · each {grid?.unit ?? 'week'}&apos;s move in the row&apos;s own volatility
              <span className={styles.key} aria-hidden="true">
                <span>−3σ</span>
                {[-1, -0.5, 0, 0.5, 1].map(t => (
                  <span key={t} className={styles.keySwatch} style={{ '--tint': `${Math.abs(t) * 100}%`, '--toward': t < 0 ? 'var(--down)' : 'var(--accent)' } as React.CSSProperties} />
                ))}
                <span>+3σ</span>
              </span>
              <span>● beyond 2σ</span>
            </p>
          )}
        </div>
        <div className={styles.group} role="group" aria-label="Time range">
          {RANGES.map(r => (
            <button key={r} type="button" className={`${styles.chip} type-label`} aria-pressed={r === range} onClick={() => onRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <LayoutGroup id="hero">
        <div className={styles.stage}>
          <AnimatePresence initial={false} mode="popLayout">
            {heroView === 'time' ? (
              <motion.div key="time" className={styles.view} exit={leave}>
                <TimeSeriesChart
                  rows={chartRows}
                  range={range}
                  format={format}
                  tickFormat={tickFormat}
                  provisionalFrom={provisionalFrom}
                  hoveredId={hoveredId}
                  openId={openId}
                  onHover={onHover}
                  summary={summary}
                  readout={readout}
                  window={viewMs && win ? windowMs(win, viewMs) : null}
                  onWindow={onWindow}
                  metric={column.key}
                  shareMarkers
                  travelled={travelled}
                />
              </motion.div>
            ) : heroView === 'heat' ? (
              <motion.div key="heat" className={styles.view} exit={leave}>
                {grid ? (
                  <Heat rows={viewRows} grid={grid} window={allView && win ? windowMs(win, [allView[0], allView[1]]) : null} hoveredId={hoveredId} onHover={onHover} onPick={onPick} />
                ) : (
                  <p className={`${styles.caption} type-micro`}>Heat needs a series; it is still loading.</p>
                )}
              </motion.div>
            ) : (
              <motion.div key="risk" className={styles.view} exit={leave}>
                {riskWindow ? (
                  <RiskReturn rows={viewRows} points={riskPoints} charted={charted.map(r => r.id)} window={riskWindow} range={range} hoveredId={hoveredId} onHover={onHover} travel={travelled} />
                ) : (
                  <p className={`${styles.caption} type-micro`}>Risk and return need a series; it is still loading.</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>
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
          {charted.length > 0 && (
            <li>
              <button type="button" className={`${styles.legendClear} type-action`} onClick={exportCsv} aria-label={`Export the chart as CSV: ${column.label} over ${range}`}>
                [ Export ]
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
        note={heroView !== 'time' ? `tools cover the ${charted.length} charted ${charted.length === 1 ? 'row' : 'rows'}` : undefined}
        now={now}
        phase={phase}
        parentheses={parentheses}
      />
    </section>
  )
}
