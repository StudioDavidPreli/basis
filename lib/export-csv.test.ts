import { describe, expect, it } from 'vitest'
import { chartCsv, chartCsvName, type CsvRow } from './export-csv'
import type { Source } from './types'

const day = (d: string) => Date.parse(`${d}T00:00:00Z`)

const fx: Source = { kind: 'api', provider: 'Frankfurter', ref: 'ECB EUR/USD reference rate', url: 'https://api.frankfurter.app/latest', asOf: '2026-10-14', cadence: 'business-daily', ttlMs: 1 }
const meteo: Source = { kind: 'api', provider: 'Open-Meteo', ref: '2 m temperature at Tokyo', asOf: '2026-10-14T21:00', cadence: 'hourly', ttlMs: 1, fixture: true }

const rows: CsvRow[] = [
  { name: 'Anchor Kaze', points: [[day('2026-06-01'), 100], [day('2026-09-01'), 101.25], [day('2026-10-14'), 108.3125]], sources: [meteo, fx], provisionalFrom: '2026-10-10' },
  { name: 'Plumb, "Varsha"', points: [[day('2026-09-01'), 125.1], [day('2026-10-13'), 0.1 + 0.2]], sources: [], provisionalFrom: null },
]

function parse(csv: string) {
  const lines = csv.trimEnd().split('\n')
  return { comments: lines.filter(l => l.startsWith('#')), table: lines.filter(l => !l.startsWith('#')) }
}

describe('chartCsv', () => {
  it('holds the view range: 3M ends at the latest point and reaches back 91 days', () => {
    const { table } = parse(chartCsv({ label: 'Level', range: '3M', rows, exportedAt: '2026-10-15T12:00:00.000Z' }))
    expect(table[0]).toBe('date,Anchor Kaze,"Plumb, ""Varsha""",provisional')
    // June is outside the view; one line per date, a blank where a row has none.
    expect(table.slice(1)).toEqual(['2026-09-01,101.25,125.1,no', '2026-10-13,,0.3,yes', '2026-10-14,108.3125,,yes'])
  })

  it('Max reaches back to the earliest point', () => {
    const { table } = parse(chartCsv({ label: 'Level', range: 'Max', rows, exportedAt: '2026-10-15T12:00:00.000Z' }))
    expect(table[1]).toBe('2026-06-01,100,,no')
  })

  it('carries provenance above the header: real sources, or unsourced, never a guess', () => {
    const { comments } = parse(chartCsv({ label: 'Level', range: '3M', rows, exportedAt: '2026-10-15T12:00:00.000Z' }))
    expect(comments).toEqual([
      '# Basis · Level over 3M, 2026-09-01 to 2026-10-14',
      '# Exported 2026-10-15T12:00:00.000Z',
      '# Anchor Kaze, latest figure: Open-Meteo · recorded fallback · 2 m temperature at Tokyo · as of 2026-10-14T21:00',
      '# Anchor Kaze, latest figure: Frankfurter · ECB EUR/USD reference rate · as of 2026-10-14 · https://api.frankfurter.app/latest',
      '# Plumb, "Varsha", latest figure: unsourced',
      '# Values from 2026-10-10 are provisional: a source may still revise them.',
      '# Companies and regions are simulated; their drivers are real.',
    ])
  })

  it('names the file by metric, range, and day', () => {
    expect(chartCsvName('level', '3M', '2026-10-15T12:00:00.000Z')).toBe('basis-level-3M-2026-10-15.csv')
  })
})
