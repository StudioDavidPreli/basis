'use client'

// The hero's plot (docs/spec.md, TimeSeriesChart). SVG, scales and paths
// from lib/chart.ts, transitions from Framer through useMotionTokens():
//
//   ribbon draw-in / out     slower / base   enter / exit   short stagger by selection order
//   domain rescale           slow            standard
//   ribbon hover highlight   fast            standard       (CSS, the stylesheet)
//
// The domain is four MotionValues. A range or metric change animates them
// to the new window and every ribbon's `d`, every tick's position, and the
// provisional band follow through useTransform, so a rescale is one
// animation and no React render per frame. Under reduced motion the
// durations are 10 ms and both are instant.
//
// The plot's width changes on every frame of the drawer's spring
// (decisions/2026-09-16-drawer-resizes-the-layout.md). The SVG stretches
// through its viewBox (preserveAspectRatio none) for the duration, and the
// frame is re-measured and redrawn once, when the width has held still.
// Nothing with text is inside the SVG: the ticks, the endpoint markers, and
// the readout are HTML positioned by percentage of the box, so they move
// with it and never distort. The server renders the first frame at a
// nominal size; the client measures on mount.
//
// role="img" with the regenerated summary; the table is the accessible
// alternative. The readout is a live region so keyboard focus on a row
// reads the point.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform, type MotionValue } from 'framer-motion'
import { useMotionTokens } from '@/lib/motion/tokens'
import { dateMs, domainFor, formatDateTick, NOMINAL, PAD, pathFor, pct, xScale, xTicks, yScale, yTicks, type Domain, type Frame, type Point } from '@/lib/chart'
import type { Range } from './surface-state'
import { Marker, entityStyle, type EntityColors } from './marker'
import styles from './time-series-chart.module.css'

export type ChartRow = {
  id: string
  name: string
  colors: EntityColors
  marker: string
  points: Point[]
  hollow: boolean // the endpoint marker: hollow for a stale or unverified figure
}

export type Readout = { name: string; value: string; date: string; status: string; colors: EntityColors; marker: string } | null

type Props = {
  rows: ChartRow[] // the charted rows, in selection order
  range: Range
  format: (v: number) => string
  provisionalFrom: string | null // ISO date; the band from here to the end
  hoveredId: string | null
  openId: string | null
  onHover: (id: string | null) => void
  summary: string
  readout: Readout
}

// A measurement debounce, not a motion value: the frame is committed once
// the box's width has held still this long, which is after the drawer's
// spring has settled and never during it.
const SETTLE_MS = 120
const X_TICKS = 5
const Y_TICKS = 4

type DomainValues = { x0: MotionValue<number>; x1: MotionValue<number>; y0: MotionValue<number>; y1: MotionValue<number> }

export function TimeSeriesChart({ rows, range, format, provisionalFrom, hoveredId, openId, onHover, summary, readout }: Props) {
  const { durations, easings } = useMotionTokens()
  const target = domainFor(
    rows.map(r => r.points),
    range,
  )

  // The frame: nominal on the server and at hydration, measured on mount,
  // re-measured once a resize has settled.
  const [frame, setFrame] = useState<Frame>(NOMINAL)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let measured = false
    const commit = () => {
      const r = el.getBoundingClientRect()
      const next = { width: Math.round(r.width), height: Math.round(r.height) }
      if (next.width === 0 || next.height === 0) return
      setFrame(f => (f.width === next.width && f.height === next.height ? f : next))
    }
    const observer = new ResizeObserver(() => {
      if (!measured) {
        measured = true
        commit()
        return
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(commit, SETTLE_MS)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [])

  // The animated domain. The first window is set, not animated; every
  // later change runs on slow / standard; the values themselves live in
  // MotionValues so a change never renders per frame.
  const x0 = useMotionValue(target?.[0] ?? 0)
  const x1 = useMotionValue(target?.[1] ?? 1)
  const y0 = useMotionValue(target?.[2] ?? 0)
  const y1 = useMotionValue(target?.[3] ?? 1)
  const dom: DomainValues = { x0, x1, y0, y1 }
  const svg = useRef<SVGSVGElement>(null)
  const targetKey = target ? target.join(',') : ''
  const hadDomain = useRef(false)
  // A layout effect, so the first domain is in place before the ticks and
  // gridlines that read it are painted; the values were initialised on the
  // server's target, so on mount there is nothing to jump.
  useLayoutEffect(() => {
    if (!targetKey) {
      hadDomain.current = false
      return
    }
    const next = targetKey.split(',').map(Number) as Domain
    const values = [x0, x1, y0, y1]
    // Already there: the mount, the second run under development Strict
    // Mode, and the re-run when the reduced-motion flag settles after
    // hydration all land here. Decided from the values, not from history.
    if (values.every((v, i) => v.get() === next[i])) {
      hadDomain.current = true
      return
    }
    // A domain after none (the series arrived) is set, not animated. The
    // flag records the target's history, which the values cannot: they
    // still hold the last window, or the nominal one.
    if (!hadDomain.current) {
      hadDomain.current = true
      values.forEach((v, i) => v.jump(next[i]!))
      return
    }
    const el = svg.current
    el?.setAttribute('data-animating', '')
    const controls = values.map((v, i) => animate(v, next[i]!, { duration: durations.slow, ease: easings.standard }))
    Promise.all(controls).then(() => el?.removeAttribute('data-animating'))
    return () => {
      // A stopped animation never resolves, so the cleanup owns the flag:
      // a rescale cut short by a clear or a dataset switch left it set. On
      // a rapid re-target the next run sets it again in the same task.
      controls.forEach(c => c.stop())
      el?.removeAttribute('data-animating')
    }
  }, [targetKey, x0, x1, y0, y1, durations.slow, easings.standard])

  // Draw-in stagger by selection order among the ribbons arriving together:
  // a single toggle draws at once, a Shift-range or select-all cascades.
  // The previous committed set is kept beside the current one, as the
  // ledger keeps its previous order, so an arrival is a ribbon that was not
  // in the last render.
  const key = rows.map(r => r.id).join('|')
  const [keys, setKeys] = useState({ prev: key, current: key })
  if (keys.current !== key) setKeys({ prev: keys.current, current: key })
  const prevIds = new Set((keys.current === key ? keys.prev : keys.current).split('|').filter(Boolean))
  const arriving = rows.map(r => r.id).filter(id => !prevIds.has(id))

  const focusId = hoveredId && rows.some(r => r.id === hoveredId) ? hoveredId : null
  const provisionalMs = provisionalFrom ? dateMs(provisionalFrom) : null
  const span = target ? target[1] - target[0] : 0

  return (
    <div className={styles.wrap}>
      <div className={styles.plot} role="img" aria-label={summary} data-focus={focusId ?? undefined}>
        <div className={styles.yAxis} aria-hidden="true">
          {target && yTicks(target, Y_TICKS).map(v => <YTick key={v} value={v} dom={dom} frame={frame} label={format(v)} />)}
        </div>
        <div ref={box} className={styles.box}>
          <svg ref={svg} className={styles.svg} viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {target && yTicks(target, Y_TICKS).map(v => <GridLine key={v} value={v} dom={dom} frame={frame} />)}
            {target && provisionalMs !== null && <Provisional from={provisionalMs} dom={dom} frame={frame} />}
            <AnimatePresence>
              {rows.map(r => (
                <Ribbon
                  key={r.id}
                  row={r}
                  dom={dom}
                  frame={frame}
                  delayIndex={Math.max(0, arriving.indexOf(r.id))}
                  hover={hoveredId === r.id}
                  muted={openId !== null && openId !== r.id}
                  onHover={onHover}
                />
              ))}
            </AnimatePresence>
          </svg>
          {rows.map(r => (
            <Endpoint key={r.id} row={r} dom={dom} frame={frame} delayIndex={Math.max(0, arriving.indexOf(r.id))} />
          ))}
          {rows.length === 0 && <p className={`${styles.empty} type-micro`}>Select rows below to chart them.</p>}
        </div>
        <div className={styles.xAxis} aria-hidden="true">
          {target && xTicks(target, X_TICKS).map(t => <XTick key={t} value={t} dom={dom} frame={frame} label={formatDateTick(t, span)} />)}
        </div>
      </div>
      <div className={`${styles.readout} type-figure`} role="status" data-testid="chart-readout">
        {readout && (
          <>
            <span className={`${styles.readoutName} type-label`}>
              <Marker shape={readout.marker} colors={readout.colors} hollow={readout.status === 'stale' || readout.status === 'unverified'} />
              {readout.name}
            </span>
            <span>{readout.value}</span>
            <span className={`${styles.readoutMeta} type-micro`}>
              {readout.date} · {readout.status}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Parts. Each reads the animated domain and writes one attribute. ────

type Part = { dom: DomainValues; frame: Frame }

function domainList(dom: DomainValues) {
  return [dom.x0, dom.x1, dom.y0, dom.y1]
}

function Ribbon({ row, dom, frame, delayIndex, hover, muted, onHover }: Part & { row: ChartRow; delayIndex: number; hover: boolean; muted: boolean; onHover: (id: string | null) => void }) {
  const { durations, easings, delays } = useMotionTokens()
  const d = useTransform(domainList(dom), (v: number[]) => pathFor(row.points, v as Domain, frame))
  const [drawn, setDrawn] = useState(false)
  const delay = delayIndex * delays.short
  return (
    <g className="entity" style={entityStyle(row.colors)}>
      <motion.path
        className={styles.ribbon}
        d={d}
        data-series={row.id}
        data-hover={hover || undefined}
        data-muted={muted || undefined}
        data-drawn={drawn || undefined}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        exit={{ pathLength: 0, transition: { duration: durations.base, ease: easings.exit } }}
        transition={{ duration: durations.slower, ease: easings.enter, delay }}
        onAnimationComplete={() => setDrawn(true)}
      />
      <motion.path className={styles.hit} d={d} onMouseEnter={() => onHover(row.id)} onMouseLeave={() => onHover(null)} />
    </g>
  )
}

function Endpoint({ row, dom, frame, delayIndex }: Part & { row: ChartRow; delayIndex: number }) {
  const { durations, easings, delays } = useMotionTokens()
  const last = row.points[row.points.length - 1] ?? null
  const left = useTransform([dom.x0, dom.x1], ([a, b]: number[]) => pct(xScale([a!, b!, 0, 1], frame)(last?.[0] ?? 0), frame.width))
  const top = useTransform([dom.y0, dom.y1], ([a, b]: number[]) => pct(yScale([0, 1, a!, b!], frame)(last?.[1] ?? 0), frame.height))
  // The marker lands as its ribbon's draw-in reaches it.
  const delay = delayIndex * delays.short + durations.slower
  if (!last) return null
  return (
    <motion.span
      className={styles.endpoint}
      style={{ left, top }}
      data-endpoint={row.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: durations.base, ease: easings.enter, delay }}
    >
      <Marker shape={row.marker} colors={row.colors} hollow={row.hollow} />
    </motion.span>
  )
}

function GridLine({ value, dom, frame }: Part & { value: number }) {
  const y = useTransform([dom.y0, dom.y1], ([a, b]: number[]) => yScale([0, 1, a!, b!], frame)(value))
  return <motion.line className={styles.grid} x1={PAD.left} x2={frame.width - PAD.right} y1={y} y2={y} />
}

function Provisional({ from, dom, frame }: Part & { from: number }) {
  const right = frame.width - PAD.right
  const x = useTransform([dom.x0, dom.x1], ([a, b]: number[]) => Math.min(right, Math.max(PAD.left, xScale([a!, b!, 0, 1], frame)(from))))
  const width = useTransform(x, v => right - v)
  return <motion.rect className={styles.provisional} x={x} y={0} width={width} height={frame.height} />
}

function YTick({ value, dom, frame, label }: Part & { value: number; label: string }) {
  const top = useTransform([dom.y0, dom.y1], ([a, b]: number[]) => pct(yScale([0, 1, a!, b!], frame)(value), frame.height))
  return (
    <motion.span className={`${styles.yTick} type-micro`} style={{ top }}>
      {label}
    </motion.span>
  )
}

function XTick({ value, dom, frame, label }: Part & { value: number; label: string }) {
  const left = useTransform([dom.x0, dom.x1], ([a, b]: number[]) => pct(xScale([a!, b!, 0, 1], frame)(value), frame.width))
  return (
    <motion.span className={`${styles.xTick} type-micro`} style={{ left }}>
      {label}
    </motion.span>
  )
}
