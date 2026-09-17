'use client'

// The ledger (docs/spec.md, DataTable). Generic: it knows nothing about
// finance or weather. A real <table> with <th scope="col" aria-sort>, real
// checkboxes with Shift-range and a tri-state header, one Figure per value
// cell, dotted leaders so every row is a full line, row numbers in the first
// column aligned to the margin. Row reorder on sort is a layout animation on
// slow / standard with a short stagger capped at eight
// (decisions/2026-09-16-row-reorder-not-spring.md).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LayoutGroup, motion } from 'framer-motion'
import type { ColumnConfig } from '@/lib/config'
import type { FigureValue } from '@/lib/types'
import { useMotionTokens } from '@/lib/motion/tokens'
import type { AgentPhase } from '@/worker/refresh'
import type { Sort } from './surface-state'
import { Figure } from './figure'
import { Marker } from './marker'
import styles from './data-table.module.css'

export type Row = {
  id: string
  name: string
  href: string // the row's own page; a client navigation opens the drawer
  colors: { light: string; dark: string }
  marker: string
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
}

const STAGGER_CAP = 8

export function DataTable({ rows, order, columns, sort, onSort, selection, onToggle, onSelectAll, onClear, hoveredId, onHover, parentheses, phase, now, openId }: Props) {
  const { durations, easings, delays } = useMotionTokens()
  const byId = new Map(rows.map(r => [r.id, r]))
  const all = selection.length === rows.length && rows.length > 0
  const some = selection.length > 0 && !all
  const headerBox = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (headerBox.current) headerBox.current.indeterminate = some
  }, [some])

  // The order of the previous committed render, kept beside the current
  // one, so a row can tell a reorder (it changed index: staggered) from a
  // shift of the whole ledger, as when the drawer opens beside it (every
  // row keeps its index: they move as one, on the drawer's own timing).
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
            {columns.map(c => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={`${c.format === 'text' ? styles.text : styles.figureCol} type-label`}
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
          <tbody>
            {order.map((id, i) => {
              const row = byId.get(id)!
              const selected = selection.includes(id)
              // The gate flags a literal inside a timing value, so the index math
              // stays out of the transition object.
              const moved = prevOrder[i] !== id
              const stagger = moved ? Math.min(i, STAGGER_CAP - 1) : 0
              return (
                <motion.tr
                  key={id}
                  layout="position"
                  transition={{ duration: durations.slow, ease: easings.standard, delay: stagger * delays.short }}
                  className={styles.row}
                  data-selected={selected || undefined}
                  data-hover={hoveredId === id || undefined}
                  onMouseEnter={() => onHover(id)}
                  onMouseLeave={() => onHover(null)}
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
                          goes nowhere (a same-URL navigation is not intercepted
                          and would swap the sheet for the full page) and hands
                          focus to the drawer instead. */}
                      <Link
                        href={row.href}
                        className={styles.nameLink}
                        data-entity-link={id}
                        replace={openId !== null}
                        aria-current={id === openId ? 'page' : undefined}
                        onClick={e => {
                          if (id !== openId) return
                          e.preventDefault()
                          document.querySelector<HTMLElement>('dialog [data-drawer-heading]')?.focus()
                        }}
                      >
                        <Marker shape={row.marker} colors={row.colors} />
                        <span className="type-label">{row.name}</span>
                      </Link>
                      <span className={styles.leader} aria-hidden="true" />
                    </span>
                  </th>
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
                      <td key={c.key} className={styles.figureCol}>
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

function SortMark({ active, dir }: { active: boolean; dir?: 'asc' | 'desc' }) {
  return (
    <span className={styles.sortMark} aria-hidden="true" data-active={active || undefined}>
      {active ? (dir === 'asc' ? '▴' : '▾') : '▵'}
    </span>
  )
}
