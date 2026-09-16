import { param, type Adapter } from './types'

const BASE =
  'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny'

// Debt to the Penny, business-daily (no weekend rows, so a Friday value has
// to hold until Monday). `fields=` keeps a year of rows under 70 KB.
// `record_date` is a date, passed through as sent.
export const treasury: Adapter = {
  id: 'treasury',
  provider: 'US Treasury Fiscal Data',
  cadence: 'business-daily',
  ttlMs: 259_200_000,
  historyDepthDays: 1826,
  historyChunkDays: 365,
  trailingDays: 7,
  fixtures: { latest: 'treasury-debt-latest-2026-09-16.json', range: 'treasury-debt-range-2026-09-16.json' },
  latestUrl: p => `${BASE}?fields=record_date,${param(p, 'field')}&sort=-record_date&page[size]=1`,
  rangeUrl: (p, from, to) =>
    `${BASE}?fields=record_date,${param(p, 'field')}&filter=record_date:gte:${from},record_date:lte:${to}&sort=record_date&page[size]=400`,
  parseLatest(text, p) {
    const j = JSON.parse(text) as { data: Array<Record<string, string>> }
    const row = j.data[0]
    const raw = row?.[param(p, 'field')]
    if (!row || raw === undefined) throw new Error('treasury: empty data')
    return { value: Number(raw), asOf: row['record_date']! }
  },
  parseRange(text, p) {
    const j = JSON.parse(text) as { data: Array<Record<string, string>> }
    const field = param(p, 'field')
    return j.data
      .filter(r => r['record_date'] && r[field] !== undefined)
      .map(r => [r['record_date']!, Number(r[field])] as [string, number])
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  },
}
