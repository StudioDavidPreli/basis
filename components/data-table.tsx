'use client'

// The ledger (docs/spec.md, DataTable). Generic: it knows nothing about
// finance or weather. A real <table> with <th scope="col" aria-sort>, real
// checkboxes with Shift-range and a tri-state header, one Figure per value
// cell, dotted leaders so every row is a full line, row numbers in the first
// column aligned to the margin. Row reorder on sort is a layout animation on
// slow / standard with a short stagger capped at eight
// (decisions/2026-09-16-row-reorder-not-spring.md).

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LayoutGroup, motion } from 'framer-motion'
import type { ColumnConfig } from '@/lib/config'
import type { FigureValue, SeriesSnapshot } from '@/lib/types'
import { sparkPath, toPoints } from '@/lib/chart'
import { seriesFor } from '@/lib/series'
import { useMotionTokens } from '@/lib/motion/tokens'
import type { AgentPhase } from '@/worker/refresh'
import type { Range, Sort } from './surface-state'
import { Figure } from './figure'
import { CompanyLogo } from './company-logo'
import { entityStyle } from './marker'
import styles from './data-table.module.css'

export type Row = {
  id: string
  name: string
  href: string // the row's own page; a client navigation opens the drawer
  colors: { light: string; dark: string }
  marker: string
  // This entity's latest mutation `at`, or null: the mark pulses on it.
  pulseKey: string | null
  cells: Record<string, FigureValue | string | undefined>
}

type Props = {
  rows: Row[]
  order: string[]
  columns: ColumnConfig[]
  sort: Sort
  onSort: (key: string) => void
  selection: string[]
  onToggle: (id: string, range: boolean) => void
  onSelectAll: () => void
  onClear: () => void
  hoveredId: string | null
  onHover: (id: string | null) => void
  parentheses: boolean
  phase: AgentPhase
  now: Date
  openId: string | null // the entity whose drawer is open, if one is
  // The narrow viewport's sparkline: the chart's metric over the chart's
  // range, from the series the chart already holds.
  metric: string
  range: Range
  series: SeriesSnapshot | null
  // False in the table-sort embed: a name there is text, because following
  // it would load the full company page inside the host's frame.
  links?: boolean
}

const SPARK = { width: 64, height: 18 }

const STAGGER_CAP = 8

export function DataTable({ rows, order, columns, sort, onSort, selection, onToggle, onSelectAll, onClear, hoveredId, onHover, parentheses, phase, now, openId, metric, range, series, links = true }: Props) {
  const { durations, easings, delays } = useMotionTokens()
  const router = useRouter()
  const byId = new Map(rows.map(r => [r.id, r]))
  // The stacking order for a sort (contracts/cadence-basis.md, "Rows are
  // opaque, and the shortest move stacks on top"): the rows that barely
  // move stay on top and legible, the long movers pass beneath them, ties
  // broken by name. The order of the previous render is kept beside the
  // current one, set while rendering from the values themselves, so the
  // distance is known in the render that moves the rows.
  const [orders, setOrders] = useState({ prev: order, current: order })
  if (orders.current !== order) setOrders({ prev: orders.current, current: order })
  const prevOrder = orders.current === order ? orders.prev : orders.current
  const level = useMemo(() => {
    const n = order.length
    const alpha = new Map([...rows].sort((a, b) => a.name.localeCompare(b.name)).map((r, k) => [r.id, n - k]))
    return new Map(
      order.map((id, i) => {
        const from = prevOrder.indexOf(id)
        const distance = from < 0 ? 0 : Math.abs(i - from)
        return [id, (n - distance) * (n + 1) + alpha.get(id)!]
      }),
    )
  }, [order, prevOrder, rows])
  // Every row's path, once per series, metric, or range: a hover re-renders
  // the ledger, and deriving twelve series on each one is wasted work.
  const sparks = useMemo(() => {
    const column = columns.find(c => c.key === metric)
    const out: Record<string, string> = {}
    if (!column || !series) return out
    for (const [id, stored] of Object.entries(series.entities)) out[id] = sparkPath(toPoints(seriesFor(stored, column)), range, SPARK)
    return out
  }, [columns, metric, range, series])
  const all = selection.length === rows.length && rows.length > 0
  const some = selection.length > 0 && !all
  const headerBox = useRef<HTMLInputElement>(null)
  const wrap = useRef<HTMLDivElement>(null)

  // A sort must not move the page. React moves the rows in one commit, and
  // WebKit, at a rendering update after a batch of moved table rows, moved
  // the scroll toward the top: the page jumped on every sort in Safari
  // (David, 2026-10-05; deployed since M4; Chromium never did). Measured,
  // not explained: holding the wrapper's height from the click through two
  // frames prevents it, and a hold released any earlier does not. The hold
  // is the table's own height, so nothing on screen changes. Released from
  // the value every time, so a second Strict Mode run finds nothing to undo.
  const sortBy = (key: string) => {
    const el = wrap.current
    if (el) el.style.minHeight = `${el.offsetHeight}px`
    onSort(key)
  }
  useLayoutEffect(() => {
    const el = wrap.current
    if (!el || !el.style.minHeight) return
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => (el.style.minHeight = ''))
    })
    return () => cancelAnimationFrame(id)
  }, [order])
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = some
  }, [some])


  return (
    <div ref={wrap} className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={`${styles.num} type-eyebrow`}>
              <span className="sr-only">Row</span>
            </th>
            <th scope="col" className={styles.check}>
              <input
                ref={headerBox}
                type="checkbox"
                checked={all}
                onChange={() => (all || some ? onClear() : onSelectAll())}
                aria-label={all || some ? 'Deselect all rows' : 'Select all rows'}
              />
            </th>
            <th scope="col" className={`${styles.name} type-label`} aria-sort={sort?.key === 'name' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" className={styles.sortButton} onClick={() => sortBy('name')}>
                Name
                <SortMark active={sort?.key === 'name'} dir={sort?.dir} />
              </button>
            </th>
            {/* Narrow viewports only (docs/spec.md): the stylesheet shows
                this column and keeps one figure, the chart's metric, beside
                it. The line is decoration; the kept figure is the reading. */}
            <th scope="col" className={styles.spark}>
              <span className="sr-only">Trend</span>
            </th>
            {columns.map(c => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={`${c.format === 'text' ? styles.text : styles.figureCol} type-label`}
                  data-metric={c.key === metric || undefined}
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <button type="button" className={styles.sortButton} onClick={() => sortBy(c.key)}>
                    {c.label}
                    <SortMark active={active} dir={sort?.dir} />
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <LayoutGroup id="ledger">
          {/* Keyboard focus inside a row is the row's hover: the chart lifts
              its ribbon and the hero's readout reads the point. Focus
              leaving the body clears it. */}
          <tbody
            className={styles.body}
            onBlur={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHover(null)
            }}
          >
            {order.map((id, i) => {
              const row = byId.get(id)!
              const selected = selection.includes(id)
              // The gate flags a literal inside a timing value, so the index math
              // stays out of the transition object.
              const stagger = Math.min(i, STAGGER_CAP - 1)
              return (
                <motion.tr
                  key={id}
                  // A reorder animates; a resize of the whole ledger, as when
                  // the drawer opens beside it, does not: the rows follow the
                  // reflow, which runs on the drawer's spring. Framer measures
                  // and animates a layout change only when layoutDependency
                  // changes, and a row's index changes on a sort and never on
                  // a resize. Layout stays on in every render, because Framer
                  // takes the before-position from the render before: turning
                  // it on in the render that moves the row (as this did from
                  // 2026-09-16 to 2026-10-05) left nothing to animate from, and
                  // the reorder jumped.
                  layout="position"
                  layoutDependency={i}
                  style={{ '--row-z': level.get(id) } as CSSProperties}
                  transition={{ duration: durations.slow, ease: easings.standard, delay: stagger * delays.short }}
                  className={styles.row}
                  data-selected={selected || undefined}
                  data-hover={hoveredId === id || undefined}
                  onMouseEnter={() => onHover(id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(id)}
                >
                  <td className={`${styles.num} type-eyebrow`} aria-hidden="true">
                    ▸ {String(i + 1).padStart(2, '0')}
                  </td>
                  <td className={styles.check}>
                    <input
                      type="checkbox"
                      checked={selected}
                      aria-label={`Chart ${row.name}`}
                      onClick={e => onToggle(id, e.shiftKey)}
                      onChange={() => {}}
                    />
                  </td>
                  <th scope="row" className={styles.name}>
                    <span className={styles.nameInner}>
                      {/* A real link: click or Enter opens the drawer through
                          the router, and the drawer finds the row to return
                          focus to by data-entity-link. With a drawer open the
                          links replace history, so back closes it rather than
                          stepping through entities; the open entity's own link
                          closes it, the way the drawer's X does, by going back
                          (a same-URL navigation is not intercepted and would
                          swap the sheet for the full page). Focus returns to
                          this link as on every close. */}
                      {links ? (
                        <Link
                          href={row.href}
                          className={styles.nameLink}
                          data-entity-link={id}
                          replace={openId !== null}
                          aria-current={id === openId ? 'page' : undefined}
                          onClick={e => {
                            if (id !== openId) return
                            e.preventDefault()
                            router.back()
                          }}
                        >
                          <CompanyLogo entityId={row.id} pulseKey={row.pulseKey} />
                          <span className="type-label">{row.name}</span>
                        </Link>
                      ) : (
                        <span className={styles.nameLink}>
                          <CompanyLogo entityId={row.id} pulseKey={row.pulseKey} />
                          <span className="type-label">{row.name}</span>
                        </span>
                      )}
                      <span className={styles.leader} aria-hidden="true" />
                    </span>
                  </th>
                  <td className={styles.spark}>
                    <Sparkline d={sparks[id] ?? ''} colors={row.colors} />
                  </td>
                  {columns.map(c => {
                    const cell = row.cells[c.key]
                    if (c.format === 'text' || typeof cell === 'string') {
                      return (
                        <td key={c.key} className={`${styles.text} type-micro`}>
                          {typeof cell === 'string' ? cell : ''}
                        </td>
                      )
                    }
                    return (
                      <td key={c.key} className={styles.figureCol} data-metric={c.key === metric || undefined}>
                        {cell ? (
                          <Figure figure={cell} column={c} parentheses={parentheses} phase={phase} now={now} entityName={row.name} />
                        ) : (
                          <span className={`${styles.empty} type-figure`}>—</span>
                        )}
                      </td>
                    )
                  })}
                </motion.tr>
              )
            })}
          </tbody>
        </LayoutGroup>
      </table>
    </div>
  )
}

function Sparkline({ d, colors }: { d: string; colors: Row['colors'] }) {
  return (
    <svg data-sparkline className={`entity ${styles.sparkLine}`} width={SPARK.width} height={SPARK.height} viewBox={`0 0 ${SPARK.width} ${SPARK.height}`} aria-hidden="true" focusable="false" style={entityStyle(colors)}>
      {d && <path d={d} />}
    </svg>
  )
}

function SortMark({ active, dir }: { active: boolean; dir?: 'asc' | 'desc' }) {
  return (
    <span className={styles.sortMark} aria-hidden="true" data-active={active || undefined}>
      {active ? (dir === 'asc' ? '▴' : '▾') : '▵'}
    </span>
  )
}
