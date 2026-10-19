'use client'

// The hero's Heat view (M12; decisions/2026-10-19-views-in-the-hero.md,
// decisions/2026-10-19-heat-measures-moves-in-sigma.md,
// decisions/2026-10-19-heat-diverges-blue-to-rust.md). Every row in the
// ledger's order, its Level cut into buckets by the range, each bucket
// tinted toward the accent (up) or the stock's down by its move over the
// row's own spread, with a dot beyond two. A real <table> of real buttons:
// one tab stop, arrows between cells, a pick opens Over time on the row and
// the bucket. Timing per the contract, through useMotionTokens():
//
//   reveal, left to right by a widening clip     slower / enter   (the draw-in's row)
//   re-bucket on a range change, a crossfade     base / standard
//   rows follow the ledger's sort                slow / standard  short stagger, capped at 8
//   a cell's tint on refresh                     slow / standard  (CSS, the figure tick's pair)
//   the 2σ dot appears / clears                  base / enter / exit
//   row and column pick-out                      fast / standard  (CSS, row hover)

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useMotionTokens } from '@/lib/motion/tokens'
import { formatValue } from '@/lib/format'
import { bucketLabel, headEvery, heatShare, shortLabel, type HeatGrid } from '@/lib/heat'
import { isoDate, type Window, type WindowMs } from '@/lib/diagnostics'
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

export function Heat({ rows, grid, window: win, hoveredId, onHover, onPick }: Props) {
  const { durations, easings, delays } = useMotionTokens()
  const [cursor, setCursor] = useState<{ row: number; col: number } | null>(null)
  // The one tab stop: the cell last reached, else the first with a value.
  const [stop, setStop] = useState<{ row: number; col: number } | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const every = headEvery(grid.buckets.length, MOST_HEADS)
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
              <table className={styles.table} onKeyDown={onKeyDown} onMouseLeave={leave} data-heat data-unit={grid.unit}>
                <caption className="sr-only">
                  Heat: each row&apos;s Level move per {grid.unit}, measured in its own volatility. Activate a cell to open Over time on that row and {grid.unit}.
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={styles.corner}>
                      <span className="sr-only">Row</span>
                    </th>
                    {grid.buckets.map((b, i) => (
                      <th key={b.fromMs} scope="col" className={`${styles.head} type-micro`} data-col-hover={cursor?.col === i || undefined} data-provisional={b.provisional || undefined}>
                        <span aria-hidden="true">{i % every === 0 || i === count - 1 ? (b.provisional && i === count - 1 ? 'prov.' : shortLabel(b, grid.unit)) : ''}</span>
                        <span className="sr-only">{bucketLabel(b, grid.unit)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => {
                    const cells = grid.cells[r.id] ?? []
                    // The gate flags a literal inside a timing value, so the
                    // index math stays out of the transition object.
                    const stagger = Math.min(ri, STAGGER_CAP - 1) * delays.short
                    return (
                      <motion.tr
                        key={r.id}
                        layout="position"
                        layoutDependency={ri}
                        transition={{ duration: durations.slow, ease: easings.standard, delay: stagger }}
                        className={styles.row}
                        data-hover={hoverRow === ri || undefined}
                        data-row={r.id}
                      >
                        <th scope="row" className={`${styles.name} type-label`}>
                          <Marker shape={r.marker} colors={r.colors} hollow={r.hollow} />
                          <span>{r.name}</span>
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
                </tbody>
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
            <span className={`${styles.statusMeta} type-micro`}>{read.when} · open in Over time</span>
          </>
        )}
      </p>
    </div>
  )
}

// Time arrives from the left: the grid is revealed by a clip widening
// across it, on the draw-in's row, as the line is. The clip is a style
// bound to a MotionValue Framer steps itself, as the ribbons' reveal is,
// not an animated `clipPath` handed to the browser: Safari painted the
// whole grid for a frame before such an animation took hold, so the map
// showed static and then revealed (David, 2026-10-19). Bound to a value,
// the first paint already carries the closed clip. The effect animates to
// open from wherever the value is, so Strict Mode's second run continues.
function Reveal({ play, children }: { play: boolean; children: ReactNode }) {
  const { durations, easings } = useMotionTokens()
  const progress = useMotionValue(play ? 0 : 1)
  const clipPath = useTransform(progress, p => `inset(0 ${((1 - p) * 100).toFixed(3)}% 0 0)`)
  useEffect(() => {
    if (!play) return
    const controls = animate(progress, 1, { duration: durations.slower, ease: easings.enter })
    return () => controls.stop()
  }, [play, progress, durations.slower, easings.enter])
  return (
    <motion.div className={styles.reveal} style={{ clipPath }}>
      {children}
    </motion.div>
  )
}

function describe(row: HeatRow, grid: HeatGrid, col: number): { row: HeatRow; text: string; when: string } | null {
  const cell = grid.cells[row.id]?.[col]
  const b = grid.buckets[col]
  if (!cell || !b) return null
  const sigma = cell.z === null ? 'spread unknown' : `${cell.z >= 0 ? '+' : '−'}${Math.abs(cell.z).toFixed(1)}σ`
  return { row, text: `${formatValue('percent', cell.move)} · ${sigma}${b.provisional ? ' · provisional' : ''}`, when: bucketLabel(b, grid.unit) }
}
