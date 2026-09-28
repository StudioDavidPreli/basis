'use client'

// The ledger (docs/spec.md, DataTable). Generic: it knows nothing about
// finance or weather. A real <table> with <th scope="col" aria-sort>, real
// checkboxes with Shift-range and a tri-state header, one Figure per value
// cell, dotted leaders so every row is a full line, row numbers in the first
// column aligned to the margin. Row reorder on sort is a layout animation on
// slow / standard with a short stagger capped at eight
// (decisions/2026-09-16-row-reorder-not-spring.md).

import { useEffect, useMemo, useRef, useState } from 'react'
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
}

const SPARK = { width: 64, height: 18 }

const STAGGER_CAP = 8

export function DataTable({ rows, order, columns, sort, onSort, selection, onToggle, onSelectAll, onClear, hoveredId, onHover, parentheses, phase, now, openId, metric, range, series }: Props) {
  const { durations, easings, delays } = useMotionTokens()
  const router = useRouter()
  const byId = new Map(rows.map(r => [r.id, r]))
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
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = some
  }, [some])

  // The order of the previous committed render, kept beside the current
  // one, so a row can tell a reorder (it changed index: the layout
  // animation on slow / standard, staggered) from a resize of the whole
  // ledger, as when the drawer opens beside it (every row keeps its index:
  // no layout animation, the rows follow the reflow, which runs on the
  // drawer's spring).
  const [orders, setOrders] = useState({ prev: order, current: order })
  if (orders.current !== order) setOrders({ prev: orders.current, current: order })
  const prevOrder = orders.current === order ? orders.prev : orders.current

  return (
    <div className={styles.wrap}>
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
              <button type="button" className={styles.sortButton} onClick={() => onSort('name')}>
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
                  <button type="button" className={styles.sortButton} onClick={() => onSort(c.key)}>
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
            onBlur={e => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHover(null)
            }}
          >
            {order.map((id, i) => {
              const row = byId.get(id)!
              const selected = selection.includes(id)
              // The gate flags a literal inside a timing value, so the index math
              // stays out of the transition object.
              const moved = prevOrder[i] !== id
              const stagger = Math.min(i, STAGGER_CAP - 1)
              return (
                <motion.tr
                  key={id}
                  layout={moved ? 'position' : false}
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
