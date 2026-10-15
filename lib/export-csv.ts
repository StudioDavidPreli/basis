// The chart as a CSV (decisions/2026-10-15-export-the-chart-as-csv.md): what
// the chart shows, the active metric over the view range, one line per date
// and one column per charted row, from the stored points rather than the
// thinned ones the plot draws. Provenance travels in `#` lines above the
// header: the sources of each row's latest figure as the ledger shows them,
// or "unsourced", never a guess (CLAUDE.md, provenance is real or absent).

import type { Source } from './types'
import { RANGE_DAYS, type Point } from './chart'

const DAY_MS = 86_400_000

export type CsvRow = {
  name: string
  points: Point[] // the row's whole stored series for the metric
  sources: Source[] // the latest figure's
  provisionalFrom: string | null
}

export type CsvInput = {
  label: string // the metric's label, "Level"
  range: keyof typeof RANGE_DAYS
  rows: CsvRow[]
  exportedAt: string // ISO
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// RFC 4180: a field with a comma, a quote, or a line break is quoted, and a
// quote inside it doubled.
function field(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Enough digits for any figure Basis shows, none of the float noise.
function number(v: number): string {
  return String(Number(v.toFixed(6)))
}

function sourceLine(s: Source): string {
  return [s.provider, s.fixture ? 'recorded fallback' : null, s.ref, `as of ${s.asOf}`, s.url].filter(Boolean).join(' · ')
}

export function chartCsv({ label, range, rows, exportedAt }: CsvInput): string {
  const filled = rows.filter(r => r.points.length > 0)
  // The view as the chart sets it (lib/chart.ts, domainFor): it ends at the
  // latest point any row has and reaches back the range's days, or to the
  // earliest point on Max.
  const end = filled.length ? Math.max(...filled.map(r => r.points[r.points.length - 1]![0])) : 0
  const days = RANGE_DAYS[range]
  const start = days === null ? Math.min(...filled.map(r => r.points[0]![0])) : end - days * DAY_MS

  const byDate = new Map<string, Array<number | undefined>>()
  rows.forEach((r, i) => {
    for (const [t, v] of r.points) {
      if (t < start || t > end) continue
      const d = isoDate(t)
      const line = byDate.get(d) ?? new Array<number | undefined>(rows.length).fill(undefined)
      line[i] = v
      byDate.set(d, line)
    }
  })
  const dates = [...byDate.keys()].sort()
  const provisionalFrom = rows.map(r => r.provisionalFrom).filter((d): d is string => d !== null).sort()[0] ?? null

  const head = [
    `# Basis · ${label} over ${range}${dates.length ? `, ${dates[0]} to ${dates[dates.length - 1]}` : ''}`,
    `# Exported ${exportedAt}`,
    ...rows.flatMap(r => (r.sources.length ? r.sources.map(s => `# ${r.name}, latest figure: ${sourceLine(s)}`) : [`# ${r.name}, latest figure: unsourced`])),
    ...(provisionalFrom ? [`# Values from ${provisionalFrom} are provisional: a source may still revise them.`] : []),
    '# Companies and regions are simulated; their drivers are real.',
  ]
  const header = ['date', ...rows.map(r => r.name), 'provisional'].map(field).join(',')
  const lines = dates.map(d => {
    const values = byDate.get(d)!.map(v => (v === undefined ? '' : number(v)))
    return [d, ...values, provisionalFrom !== null && d >= provisionalFrom ? 'yes' : 'no'].join(',')
  })
  return [...head, header, ...lines].join('\n') + '\n'
}

// "basis-level-3M-2026-10-15.csv"
export function chartCsvName(metric: string, range: string, exportedAt: string): string {
  return `basis-${metric}-${range}-${exportedAt.slice(0, 10)}.csv`
}
