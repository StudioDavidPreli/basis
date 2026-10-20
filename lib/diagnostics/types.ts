// The diagnostics (docs/spec.md, Diagnostics): six tools, each a pure
// function over the charted rows' series clipped to the analysis window.
// Every number a tool answers is a FigureValue whose sources are the union
// of the inputs' sources and whose status is the worst input's, so the
// Figure atom renders it with its provenance popover and nothing here has
// to know how. Sentences are templates. No IO anywhere under this folder.

import type { Point } from '@/lib/chart'
import type { EntitySeries, FigureStatus, FigureValue, Source } from '@/lib/types'
import type { Exposure, ProcessConfig } from '@/lib/config'

export type ToolKey = 'summary' | 'relate' | 'attribution' | 'model' | 'quality' | 'anomalies'
export const TOOLS: Array<{ key: ToolKey; label: string }> = [
  { key: 'summary', label: 'Range summary' },
  { key: 'relate', label: 'Relationships' },
  { key: 'attribution', label: 'Attribution' },
  { key: 'model', label: 'Model check' },
  { key: 'quality', label: 'Data quality' },
  { key: 'anomalies', label: 'Anomalies' },
]

// A charted row as the tools see it: the metric's full series, the metric
// figure's inputs, and what the figure was written from.
export type DiagnosticSeries = {
  id: string
  name: string
  points: Point[] // [ms, value], ascending, the whole series; the tools clip
  sources: Source[]
  updatedAt: string
}

// What the config knows about an entity, for attribution and the model
// check: its generating process and the stored series the level rides on.
export type EntityFacts = {
  process: ProcessConfig
  exposures: Exposure[]
  stored: EntitySeries | null
  baseLevel: number
}

export type WindowMs = { fromMs: number; toMs: number }

export type ToolInput = {
  series: DiagnosticSeries[]
  window: WindowMs
  now: Date
  metric: { key: string; label: string; derive: string }
  facts: Record<string, EntityFacts>
}

// A derived number: the Figure atom takes the figure and formats it by the
// format key; the label is the column label the atom names it by.
export type DerivedFormat = 'number' | 'bps' | 'percent' | 'days' | 'integer'
export type Cell = { kind: 'figure'; label: string; figure: FigureValue; format: DerivedFormat; note?: string } | { kind: 'text'; text: string } | { kind: 'empty' }

export type Bar = { label: string; share: number; tone: 'ink' | 'entity' | 'accent' }

// Attribution's picture: the window's start, each step in order, the end;
// the steps sum to end − start.
export type Waterfall = { start: number; end: number; steps: Array<{ label: string; value: number }> }

export type ReportRow = { id: string; name: string; cells: Cell[]; bars?: Bar[]; waterfall?: Waterfall }

export type Report = {
  tool: ToolKey
  title: string
  scope: string
  head: string[] // column labels; head[0] is the row's own column
  rows: ReportRow[]
  foot: string[] // template sentences under the table
}

export type StatusOf = (sources: Source[]) => FigureStatus
