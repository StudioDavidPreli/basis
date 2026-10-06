// The ledger's rows, from the config and a stored snapshot: the sheet's and
// the table-sort embed's, so the two cannot disagree. Pure.

import { config } from '@/lib/config'
import { entityName } from '@/lib/describe'
import { entityHref } from '@/lib/entity-detail'
import type { FigureValue } from '@/lib/types'
import type { StoredSnapshot } from '@/worker/refresh'
import { sortIds, type Sort } from './surface-state'
import type { Row } from './data-table'

export function entityRows(datasetId: string, snapshot: StoredSnapshot | null): Row[] {
  const dataset = config.datasets[datasetId]!
  const entities = dataset.entities === 'companies' ? config.companies : config.regions
  return entities.map(e => {
    const snap = snapshot?.entities[e.id]
    const cells: Record<string, FigureValue | string | undefined> = {}
    for (const col of dataset.columns) {
      if (col.derive === 'field') cells[col.key] = (e as unknown as Record<string, string>)[col.field!]
      else cells[col.key] = snap?.metrics[col.key]
    }
    return { id: e.id, name: entityName(e.id), href: entityHref(e.id), colors: { light: e.color, dark: e.colorDark }, marker: e.marker, cells }
  })
}

export function rowOrder(rows: Row[], sort: Sort): string[] {
  return sortIds(
    rows.map(r => r.id),
    sort,
    id => {
      const row = rows.find(r => r.id === id)
      // The name is the row's own, not a column of the dataset.
      if (sort?.key === 'name') return row?.name
      const cell = row?.cells[sort?.key ?? '']
      return typeof cell === 'object' ? cell?.value : cell
    },
  )
}
