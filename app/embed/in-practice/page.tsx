import frozen from '@/data/in-practice.json'
import type { StoredSnapshot } from '@/worker/refresh'
import type { SeriesSnapshot } from '@/lib/types'
import { InPracticeStage } from './stage'

// Chromeless: the chart over the ledger, for the Cadence "In Practice" page
// (decisions/2026-10-15-the-in-practice-stage.md).
//   /embed/in-practice?theme=passbook|operate|cadence-*&reduce=1|0
//   &preset=standard|snappy|cinematic
// Theme, reduce and preset are read by the inline script in the layout, as
// on every embed. The figures are a committed copy of a live snapshot
// (scripts/freeze-in-practice.mjs): the frame reads no Worker, runs no
// refresh, and asks nothing of a source.

export default function EmbedInPractice() {
  return <InPracticeStage snapshot={frozen.snapshot as unknown as StoredSnapshot} series={frozen.series as SeriesSnapshot} />
}
