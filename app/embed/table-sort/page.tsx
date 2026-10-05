import { loadSnapshot } from '@/worker/read'
import { config } from '@/lib/config'
import { TableSortStage } from './stage'

// Chromeless: the ledger alone, sortable, for the Cadence "In Practice" page
// (plan.md, M10). Its figures are the stored snapshot's, so every
// provenance link is the real request the agent made.
//   /embed/table-sort?dataset=comps|regions&theme=passbook|operate&reduce=1
//   &preset=standard|snappy|cinematic
// Theme, reduce and preset are read by the inline script in the layout, as
// on every page; the preset only on /embed/*
// (decisions/2026-10-05-presets-for-the-embeds.md).

export const dynamic = 'force-dynamic'

export default async function EmbedTableSort({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ snapshot }, params] = await Promise.all([loadSnapshot(), searchParams])
  const requested = typeof params['dataset'] === 'string' ? params['dataset'] : undefined
  const dataset = requested && config.datasets[requested] ? requested : 'comps'
  return <TableSortStage snapshot={snapshot} dataset={dataset} renderedAt={new Date().toISOString()} />
}
