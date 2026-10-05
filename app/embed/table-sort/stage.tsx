'use client'

import { useMemo, useState } from 'react'
import { config } from '@/lib/config'
import { agentPhase } from '@/lib/agent'
import type { StoredSnapshot } from '@/worker/refresh'
import { DataTable } from '@/components/data-table'
import { LiveRegion, useAnnouncer } from '@/components/live-region'
import { entityRows, rowOrder } from '@/components/rows'
import { initialState, reduce } from '@/components/surface-state'
import { defaultMetric } from '@/components/surface-url'
import { useNow } from '@/components/use-now'
import styles from './stage.module.css'

// The sheet's ledger and the sheet's sort, nothing else: the same rows
// (components/rows.ts), the same reducer for the asc → desc → off cycle, the
// same row reorder on slow / standard with its short stagger. Selection
// works and charts nothing; names are text, not links.
export function TableSortStage({ snapshot, dataset, renderedAt }: { snapshot: StoredSnapshot | null; dataset: string; renderedAt: string }) {
  const ds = config.datasets[dataset]!
  const [state, setState] = useState(() => initialState(dataset, defaultMetric(ds)))
  const now = useNow(renderedAt)
  const { message, announce } = useAnnouncer()
  const rows = useMemo(() => entityRows(dataset, snapshot), [dataset, snapshot])
  const order = useMemo(() => rowOrder(rows, state.sort), [rows, state.sort])
  const phase = agentPhase(snapshot?.agent ?? null, now, false)

  return (
    <main className={styles.stage}>
      <h1 className="sr-only">{ds.label}, sortable</h1>
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
        onHover={id => setState(s => reduce(s, { type: 'hover', id }))}
        parentheses={dataset === 'comps'}
        phase={phase}
        now={now}
        openId={null}
        metric={state.metric}
        range={state.range}
        series={null}
        links={false}
      />
      <LiveRegion message={message} />
    </main>
  )
}
