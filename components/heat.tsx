'use client'

// The hero's Heat view (M12; decisions/2026-10-19-views-in-the-hero.md,
// decisions/2026-10-19-heat-measures-moves-in-sigma.md,
// decisions/2026-10-19-heat-diverges-blue-to-rust.md). Every charted row
// (decisions/2026-10-20-the-views-draw-the-selection.md) in the ledger's
// order, its Level cut into buckets by the range, each bucket
// tinted toward the accent (up) or the stock's down by its move over the
// row's own spread, with a dot beyond two. A real <table> of real buttons:
// one tab stop, arrows between cells, a pick opens Trend on the row and
// the bucket. Timing per the contract, through useMotionTokens():
//
//   reveal, left to right by a widening clip     slower / enter   (the draw-in's row)
//   re-bucket on a range change, a crossfade     base / standard
//   rows follow the ledger's sort                slow / standard  short stagger by the top of each move, capped at 8
//   a cell's tint on refresh                     slow / standard  (CSS, the figure tick's pair)
//   the 2σ dot appears / clears                  base / enter / exit
//   row and column pick-out                      fast / standard  (CSS, row hover)

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useMotionTokens } from '@/lib/motion/tokens'
import { staggerSlot } from '@/lib/stagger'
import { formatValue } from '@/lib/format'
import { bucketLabel, headEvery, heatShare, shortLabel, type HeatGrid } from '@/lib/heat'
import { isoDate, type Window, type WindowMs } from '@/lib/diagnostics'
import { entityShortName } from '@/lib/describe'
import { Marker, type EntityColors } from './marker'
import styles from './heat.module.css'

export type HeatRow = { id: string; name: string; colors: EntityColors; marker: string; hollow: boolean }

type Props = {
  rows: HeatRow[] // in ledger order
  grid: HeatGrid
  window: WindowMs | null // the analysis window when set: buckets outside it recede
  hoveredId: string | null
  onHover: (id: string | null) => void
  onPick: (id: string, window: Window) => void
}

const STAGGER_CAP = 8
const MOST_HEADS = 8
// A phone's column is narrow: fewer labels, every third bucket at 3M.
const MOST_HEADS_PHONE = 5

export function Heat({ rows, grid, window: win, hoveredId, onHover, onPick }: Props) {
  const { durations, easings, delays } = useMotionTokens()
  const [cursor, setCursor] = useState<{ row: number; col: number } | null>(null)
  // The order of the previous render beside the current one, as the ledger
  // keeps it, so a row's sort stagger reads the top of its move and the
  // rows trade places as the ledger's do. Set while rendering, from the
  // values.
  const ids = rows.map(r => r.id).join(' ')
  const [orders, setOrders] = useState({ prev: ids, current: ids })
  if (orders.current !== ids) setOrders({ prev: orders.current, current: ids })
  const prevIds = (orders.current === ids ? orders.prev : orders.current).split(' ')
  // The one tab stop: the cell last reached, else the first with a value.
  const [stop, setStop] = useState<{ row: number; col: number } | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const every = headEvery(grid.buckets.length, MOST_HEADS)
  const everyPhone = headEvery(grid.buckets.length, MOST_HEADS_PHONE)
  const count = grid.buckets.length
  const firstStop = (() => {
    for (let r = 0; r < rows.length; r++) {
      const c = grid.cells[rows[r]!.id]?.findIndex(x => x !== null) ?? -1
      if (c >= 0) return { row: r, col: c }
    }
    return null
  })()
  const tab = stop && grid.cells[rows[stop.row]?.id ?? '']?.[stop.col] ? stop : firstStop

  const focusCell = (row: number, col: number) => {
    const id = rows[row]?.id
    if (!id) return
    buttons.current.get(`${id}:${col}`)?.focus()
  }
  // Arrows walk the grid, skipping empty cells in the direction of travel.
  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (!cursor) return
    const step: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    const d = step[e.key]
    let row = cursor.row
    let col = cursor.col
    if (d) {
      for (;;) {
        row += d[0]
        col += d[1]
        if (row < 0 || row >= rows.length || col < 0 || col >= count) return
        if (grid.cells[rows[row]!.id]?.[col]) break
      }
    } else if (e.key === 'Home' || e.key === 'End') {
      const cells = grid.cells[rows[row]!.id] ?? []
      const idx = e.key === 'Home' ? cells.findIndex(x => x !== null) : cells.length - 1 - [...cells].reverse().findIndex(x => x !== null)
      if (idx < 0 || idx >= count) return
      col = idx
    } else return
    e.preventDefault()
    focusCell(row, col)
  }

  const enter = (row: number, col: number) => {
    setCursor({ row, col })
    setStop({ row, col })
    onHover(rows[row]!.id)
  }
  const leave = () => {
    setCursor(null)
    onHover(null)
  }

  const read = cursor ? describe(rows[cursor.row]!, grid, cursor.col) : null
  const hoverRow = cursor ? cursor.row : rows.findIndex(r => r.id === hoveredId)
  const fade = { duration: durations.base, ease: easings.standard }
  // The first grid this view shows reveals from the left; a later one, from
  // a range change, crossfades in without revealing again. Decided from the
  // key itself, so Strict Mode's second render decides the same.
  const gridKey = `${grid.unit}:${count}`
  const [firstKey] = useState(gridKey)
  const first = gridKey === firstKey

  if (rows.length === 0) {
    return (
      <div className={styles.wrap}>
        <div className={styles.frame}>
          <p className={`${styles.empty} type-micro`} data-heat-empty>
            Select rows in the table to see their moves.
          </p>
        </div>
        <p className={`${styles.status} type-figure`} role="status" data-testid="heat-readout" />
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.frame}>
        <AnimatePresence mode="popLayout">
          <motion.div
            key={gridKey}
            className={styles.layer}
            initial={first ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: fade }}
            transition={fade}
          >
            <Reveal play={first}>
              <table className={styles.table} style={{ '--rows': rows.length } as CSSProperties} onKeyDown={onKeyDown} onMouseLeave={leave} data-heat data-unit={grid.unit}>
                <caption className="sr-only">
                  Heat: each row&apos;s Level move per {grid.unit}, measured in its own volatility. Activate a cell to open Trend on that row and {grid.unit}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={styles.corner}>
                      <span className="sr-only">Row</span>
                    </th>
                    {grid.buckets.map((b, i) => (
                      <th
                        key={b.fromMs}
                        scope="col"
                        className={`${styles.head} type-micro`}
                        data-col-hover={cursor?.col === i || undefined}
                        data-provisional={b.provisional || undefined}
                        data-label-wide={i % every === 0 || i === count - 1 || undefined}
                        data-label-phone={i % everyPhone === 0 || i === count - 1 || undefined}
                      >
                        <span className={styles.headLabel} aria-hidden="true">
                          {i % every === 0 || i % everyPhone === 0 || i === count - 1 ? (b.provisional && i === count - 1 ? 'prov.' : shortLabel(b, grid.unit)) : ''}
                        </span>
                        <span className="sr-only">{bucketLabel(b, grid.unit)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                {/* The rows' own layout group, not the hero's: inside the
                    hero's, the outgoing view's pop re-measured them on mount
                    and they slid in from wrong places. They move for a sort
                    and for nothing else. */}
                <LayoutGroup id="heat-rows" inherit={false}>
                <tbody>
                  {/* The rows are the charted ones
                      (decisions/2026-10-20-the-views-draw-the-selection.md):
                      a row charted later fades in on base / enter, an
                      unticked one out on fast / exit; the rows there on
                      arrival are uncovered by the reveal instead. */}
                  <AnimatePresence initial={false}>
                  {rows.map((r, ri) => {
                    const cells = grid.cells[r.id] ?? []
                    // The gate flags a literal inside a timing value, so the
                    // index math stays out of the transition object.
                    const stagger = staggerSlot(prevIds.indexOf(r.id), ri, STAGGER_CAP) * delays.short
                    return (
                      <motion.tr
                        key={r.id}
                        layout="position"
                        layoutDependency={ri}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: durations.fast, ease: easings.exit } }}
                        transition={{ duration: durations.slow, ease: easings.standard, delay: stagger, opacity: { duration: durations.base, ease: easings.enter } }}
                        className={styles.row}
                        data-hover={hoverRow === ri || undefined}
                        data-row={r.id}
                      >
                        <th scope="row" className={`${styles.name} type-label`}>
                          <Marker shape={r.marker} colors={r.colors} hollow={r.hollow} />
                          {/* A phone shows the one word; the full name stays
                              for a screen reader either way. */}
                          <span className={styles.fullName}>{r.name}</span>
                          <span className={styles.shortName} aria-hidden="true">
                            {entityShortName(r.id)}
                          </span>
                        </th>
                        {grid.buckets.map((b, ci) => {
                          const cell = cells[ci] ?? null
                          const out = win !== null && (b.toMs < win.fromMs || b.fromMs > win.toMs)
                          if (!cell) return <td key={b.fromMs} className={styles.cell} data-empty />
                          const z = cell.z
                          const tint: CSSProperties = {
                            '--tint': z === null ? '0%' : `${Math.round(heatShare(z) * 100)}%`,
                            '--toward': z !== null && z < 0 ? 'var(--down)' : 'var(--accent)',
                          } as CSSProperties
                          const outlier = z !== null && Math.abs(z) >= 2
                          return (
                            <td key={b.fromMs} className={styles.cell} data-col-hover={cursor?.col === ci || undefined} data-out={out || undefined} data-provisional={b.provisional || undefined}>
                              <button
                                type="button"
                                ref={el => {
                                  if (el) buttons.current.set(`${r.id}:${ci}`, el)
                                  else buttons.current.delete(`${r.id}:${ci}`)
                                }}
                                className={styles.swatch}
                                style={tint}
                                tabIndex={tab && tab.row === ri && tab.col === ci ? 0 : -1}
                                aria-label={`${r.name}, ${bucketLabel(b, grid.unit)}: ${describe(r, grid, ci)!.text}`}
                                data-cell={`${r.id}:${ci}`}
                                data-z={z === null ? undefined : z.toFixed(2)}
                                onMouseEnter={() => enter(ri, ci)}
                                onFocus={() => enter(ri, ci)}
                                onBlur={leave}
                                onClick={() => onPick(r.id, { from: isoDate(b.fromMs), to: isoDate(b.toMs) })}
                              >
                                <AnimatePresence initial={false}>
                                  {outlier && (
                                    <motion.span
                                      key="dot"
                                      className={styles.dot}
                                      aria-hidden="true"
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0, transition: { duration: durations.base, ease: easings.exit } }}
                                      transition={{ duration: durations.base, ease: easings.enter }}
                                    />
                                  )}
                                </AnimatePresence>
                              </button>
                            </td>
                          )
                        })}
                      </motion.tr>
                    )
                  })}
                  </AnimatePresence>
                </tbody>
                </LayoutGroup>
              </table>
            </Reveal>
          </motion.div>
        </AnimatePresence>
      </div>
      <p className={`${styles.status} type-figure`} role="status" data-testid="heat-readout">
        {read && (
          <>
            <span className={`${styles.statusName} type-label`}>
              <Marker shape={read.row.marker} colors={read.row.colors} hollow={read.row.hollow} />
              {read.row.name}
            </span>
            <span>{read.text}</span>
            <span className={`${styles.statusMeta} type-micro`}>{read.when} · open in Trend</span>
          </>
        )}
      </p>
    </div>
  )
}

// Time arrives from the left: the grid is uncovered left to right, on the
// draw-in's row, as the line is. A cover in the paper slides off it rather
// than a clip opening on it. Safari painted the grid whole for a frame
// before either an animated `clipPath` or one bound to a value took hold,
// most likely because the grid's rows and dots are composited layers an
// ancestor's clip reaches a frame late; the map showed static, then
// revealed (David, 2026-10-19, twice). A cover is painted with the grid in
// its first frame, by any engine. Its scale is bound to a MotionValue
// Framer steps; the effect runs it from wherever it is, so Strict Mode's
// second run continues rather than restarts.
function Reveal({ play, children }: { play: boolean; children: ReactNode }) {
  const { durations, easings } = useMotionTokens()
  const progress = useMotionValue(play ? 0 : 1)
  const scaleX = useTransform(progress, p => 1 - p)
  useEffect(() => {
    if (!play) return
    const controls = animate(progress, 1, { duration: durations.slower, ease: easings.enter })
    return () => controls.stop()
  }, [play, progress, durations.slower, easings.enter])
  return (
    <div className={styles.reveal}>
      {children}
      {play && <motion.div className={styles.cover} style={{ scaleX, originX: 1 }} aria-hidden="true" data-reveal-cover />}
    </div>
  )
}

function describe(row: HeatRow, grid: HeatGrid, col: number): { row: HeatRow; text: string; when: string } | null {
  const cell = grid.cells[row.id]?.[col]
  const b = grid.buckets[col]
  if (!cell || !b) return null
  const sigma = cell.z === null ? 'spread unknown' : `${cell.z >= 0 ? '+' : '−'}${Math.abs(cell.z).toFixed(1)}σ`
  return { row, text: `${formatValue('percent', cell.move)} · ${sigma}${b.provisional ? ' · provisional' : ''}`, when: bucketLabel(b, grid.unit) }
}
