'use client'

// The hero's Risk / return view (M12; decisions/2026-10-19-views-in-the-
// hero.md, decisions/2026-10-19-risk-return-reads-level.md). Every row of
// the dataset placed by its Level over the analysis window: realized
// volatility across, annualized change up, both from lib/risk-return.ts.
// The frame is the chart's (its plot, axes, card, and readout styles), so
// the two views are one box. Timing per the contract, through
// useMotionTokens():
//
//   charted marker travels from its endpoint   slow / standard   short stagger by selection order, capped at 8
//   a row not charted appears at its point     base / enter      short stagger by ledger order, capped at 8
//   points answer a window set or reset        base / standard
//   points answer a range change (rescale)     slow / standard
//   hover ring and card                        transitions.enter / exit
//
// The travel is Framer's shared layout: a charted row's marker carries the
// same layoutId here and at its line's endpoint, inside the hero's
// LayoutGroup, so it moves between the two rather than vanishing and
// reappearing. Numbers are in the DOM: the card, the readout, and a
// visually hidden table, which is the plot's text alternative (the ledger
// carries neither volatility nor change).

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useMotionTokens } from '@/lib/motion/tokens'
import { formatValue } from '@/lib/format'
import { formatAxisPct, formatVol, medianVol, placeLabels, riskDomain, riskTicks, type RiskPoint } from '@/lib/risk-return'
import { isoDate, type WindowMs } from '@/lib/diagnostics'
import type { Range } from './surface-state'
import { Marker, entityStyle, type EntityColors } from './marker'
import chart from './time-series-chart.module.css'
import styles from './risk-return.module.css'

export type RiskRow = { id: string; name: string; colors: EntityColors; marker: string; hollow: boolean }

type Props = {
  rows: RiskRow[] // every row of the dataset, in ledger order
  points: RiskPoint[] // the rows that could be placed
  charted: string[] // the charted rows' ids, in selection order: their markers travel
  window: WindowMs
  range: Range
  hoveredId: string | null
  onHover: (id: string | null) => void
  // True when the hero arrived here from Over time: the charted markers are
  // travelling in, so they are not faded in as well.
  travel: boolean
}

const STAGGER_CAP = 8
const INSET = 4 // percent of the box kept clear at each edge, so a marker is never cut
const LABEL_GAP = 10
const LABEL_HEIGHT = 16
const CHAR_WIDTH = 6.6 // the label face at its size; only for deciding a side
const HIT = 28 // px: how near the pointer must be to take a point

const pctX = (v: number, x: [number, number]) => INSET + ((v - x[0]) / (x[1] - x[0])) * (100 - 2 * INSET)
const pctY = (v: number, y: [number, number]) => 100 - INSET - ((v - y[0]) / (y[1] - y[0])) * (100 - 2 * INSET)

export function RiskReturn({ rows, points, charted, window: win, range, hoveredId, onHover, travel }: Props) {
  const { durations, easings, delays, transitions } = useMotionTokens()
  const domain = riskDomain(points)
  const byId = new Map(points.map(p => [p.id, p]))
  const median = medianVol(points)

  // The box's width, for placing labels only: points are percentages.
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      setSize(s => (s && s.width === Math.round(r.width) && s.height === Math.round(r.height) ? s : { width: Math.round(r.width), height: Math.round(r.height) }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // A range change rescales on the rescale's pair; anything else that moves
  // a point (a window set or reset, a refresh) on the window's. The range
  // of the render before is kept beside this one, set while rendering.
  const [ranges, setRanges] = useState({ prev: range, current: range })
  if (ranges.current !== range) setRanges({ prev: ranges.current, current: range })
  const rescaling = ranges.current === range ? ranges.prev !== range : true
  const move = rescaling ? { duration: durations.slow, ease: easings.standard } : { duration: durations.base, ease: easings.standard }

  const sides =
    domain && size
      ? placeLabels(
          points.map(p => {
            const row = rows.find(r => r.id === p.id)!
            return { id: p.id, x: (pctX(p.vol, domain.x) / 100) * size.width, y: (pctY(p.change, domain.y) / 100) * size.height, width: row.name.length * CHAR_WIDTH, height: LABEL_HEIGHT }
          }),
          size.width,
          LABEL_GAP,
        )
      : {}

  // The pointer takes the nearest point within reach; the ledger's hover
  // rings it the same way.
  const [pointerId, setPointerId] = useState<string | null>(null)
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = box.current
    if (!el || !domain) return
    const r = el.getBoundingClientRect()
    let best: { id: string; d: number } | null = null
    for (const p of points) {
      const dx = (pctX(p.vol, domain.x) / 100) * r.width - (e.clientX - r.left)
      const dy = (pctY(p.change, domain.y) / 100) * r.height - (e.clientY - r.top)
      const d = Math.hypot(dx, dy)
      if (d <= HIT && (!best || d < best.d)) best = { id: p.id, d }
    }
    const id = best?.id ?? null
    if (id === pointerId) return
    setPointerId(id)
    onHover(id)
  }
  const onPointerLeave = () => {
    if (pointerId === null) return
    setPointerId(null)
    onHover(null)
  }
  const focus = hoveredId && byId.has(hoveredId) ? hoveredId : null
  const focusRow = focus ? rows.find(r => r.id === focus) : undefined
  const focusPoint = focus ? byId.get(focus)! : null

  const days = Math.max(1, Math.round((win.toMs - win.fromMs) / 86_400_000))
  const summary = points.length
    ? `Risk and return over ${days} days, ${points.length} rows, from Level: volatility across, annualized change up. Highest volatility ${nameOf(rows, maxBy(points, p => p.vol))}; best change ${nameOf(rows, maxBy(points, p => p.change))}.`
    : 'Risk and return: no row has two points in the window.'

  return (
    <div className={chart.wrap}>
      <div className={chart.plot} role="img" aria-label={summary} data-focus={focus ?? undefined}>
        <div className={chart.yAxis} aria-hidden="true">
          {domain &&
            riskTicks(domain.y, 4).map(v => (
              <motion.span key={v} className={`${chart.yTick} type-micro`} initial={false} animate={{ top: `${pctY(v, domain.y)}%` }} transition={move}>
                {formatAxisPct(v)}
              </motion.span>
            ))}
        </div>
        <div ref={box} className={`${chart.box} ${styles.box}`} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} data-risk-return>
          {domain && (
            <motion.div className={styles.guides} aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: durations.base, ease: easings.enter }}>
              {riskTicks(domain.y, 4).map(v => (
                <motion.span key={v} className={v === 0 ? styles.zero : styles.gridY} initial={false} animate={{ top: `${pctY(v, domain.y)}%` }} transition={move} />
              ))}
              {median !== null && (
                <motion.span className={styles.median} initial={false} animate={{ left: `${pctX(median, domain.x)}%` }} transition={move}>
                  <span className={`${styles.medianLabel} type-micro`}>median volatility</span>
                </motion.span>
              )}
              <span className={`${styles.quadrant} ${styles.topLeft} type-micro`}>steadier, gaining</span>
              <span className={`${styles.quadrant} ${styles.bottomRight} type-micro`}>more volatile, losing</span>
            </motion.div>
          )}
          {domain &&
            points.map(p => {
              const row = rows.find(r => r.id === p.id)!
              const chartedAt = charted.indexOf(p.id)
              const travels = chartedAt >= 0 && chartedAt < STAGGER_CAP
              // The gate flags a literal inside a timing value, so the index
              // math stays out of the transition objects.
              const travelDelay = Math.min(Math.max(0, chartedAt), STAGGER_CAP - 1) * delays.short
              const appearDelay = Math.min(rows.findIndex(r => r.id === p.id), STAGGER_CAP - 1) * delays.short
              const side = sides[p.id] ?? null
              return (
                <motion.span
                  key={p.id}
                  className={styles.point}
                  style={entityStyle(row.colors) as CSSProperties}
                  data-point={p.id}
                  data-hover={focus === p.id || undefined}
                  data-charted={chartedAt >= 0 || undefined}
                  initial={travels && travel ? false : { opacity: 0, left: `${pctX(p.vol, domain.x)}%`, top: `${pctY(p.change, domain.y)}%` }}
                  animate={{ opacity: 1, left: `${pctX(p.vol, domain.x)}%`, top: `${pctY(p.change, domain.y)}%` }}
                  transition={{ ...move, opacity: { duration: durations.base, ease: easings.enter, delay: appearDelay } }}
                >
                  {/* The marker itself is the shared element; the span above
                      places and centres it, so Framer's layout transform
                      never fights the centring one. */}
                  <motion.span
                    className={styles.mark}
                    data-mark
                    layoutId={travels ? `hero-marker-${p.id}` : undefined}
                    layoutDependency="risk"
                    transition={{ layout: { duration: durations.slow, ease: easings.standard, delay: travelDelay } }}
                  >
                    <Marker shape={row.marker} colors={row.colors} hollow={row.hollow} />
                  </motion.span>
                  {side && (
                    <span className={`${styles.label} type-micro`} data-side={side} aria-hidden="true">
                      {row.name}
                    </span>
                  )}
                </motion.span>
              )
            })}
          <AnimatePresence>
            {focusRow && focusPoint && domain && (
              <motion.div
                key="card"
                className={chart.card}
                style={{ left: `${pctX(focusPoint.vol, domain.x)}%`, top: `${pctY(focusPoint.change, domain.y)}%` }}
                data-side={pctX(focusPoint.vol, domain.x) > 65 ? 'left' : 'right'}
                data-edge={pctY(focusPoint.change, domain.y) < 30 ? 'top' : pctY(focusPoint.change, domain.y) > 70 ? 'bottom' : undefined}
                data-testid="risk-card"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: transitions.exit }}
                transition={transitions.enter}
              >
                <span className={`${chart.cardName} type-label`}>
                  <Marker shape={focusRow.marker} colors={focusRow.colors} hollow={focusRow.hollow} />
                  {focusRow.name}
                </span>
                <span className={`${chart.cardValue} type-figure`}>
                  {formatValue('percent', focusPoint.change)} a year · vol {formatVol(focusPoint.vol)}
                </span>
                <span className={`${chart.cardMeta} type-micro`}>
                  Level, {isoDate(win.fromMs)} – {isoDate(win.toMs)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {points.length === 0 && <p className={`${chart.empty} type-micro`}>No row has two points in the window.</p>}
        </div>
        <div className={chart.xAxis} aria-hidden="true">
          {domain &&
            riskTicks(domain.x, 5).map(v => (
              <motion.span key={v} className={`${chart.xTick} type-micro`} initial={false} animate={{ left: `${pctX(v, domain.x)}%` }} transition={move}>
                {formatVol(v).replace('.0%', '%')}
              </motion.span>
            ))}
        </div>
      </div>
      <div className={`${chart.readout} type-figure`} role="status" data-testid="risk-readout">
        {focusRow && focusPoint && (
          <>
            <span className={`${chart.readoutName} type-label`}>
              <Marker shape={focusRow.marker} colors={focusRow.colors} hollow={focusRow.hollow} />
              {focusRow.name}
            </span>
            <span>
              {formatValue('percent', focusPoint.change)} a year · vol {formatVol(focusPoint.vol)}
            </span>
            <span className={`${chart.readoutMeta} type-micro`}>{days} d · Level</span>
          </>
        )}
      </div>
      <table className="sr-only" data-risk-table>
        <caption>
          Risk and return from Level, {isoDate(win.fromMs)} to {isoDate(win.toMs)}
        </caption>
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">Annualized change</th>
            <th scope="col">Volatility, annualized</th>
            <th scope="col">Points in the window</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const p = byId.get(r.id)
            return (
              <tr key={r.id}>
                <th scope="row">{r.name}</th>
                <td>{p ? formatValue('percent', p.change) : 'too few points'}</td>
                <td>{p ? formatVol(p.vol) : '—'}</td>
                <td>{p ? p.n : 0}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function maxBy(points: RiskPoint[], f: (p: RiskPoint) => number): RiskPoint {
  return points.reduce((a, b) => (f(b) > f(a) ? b : a))
}

function nameOf(rows: RiskRow[], p: RiskPoint): string {
  return rows.find(r => r.id === p.id)?.name ?? p.id
}
