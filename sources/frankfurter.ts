import { param, type Adapter } from './types'

// Frankfurter serves the ECB reference rates. The `.dev` host is called
// directly (the `.app` host answers 301). `date` is a date, not a
// timestamp, and is passed through as sent.
export const frankfurter: Adapter = {
  id: 'frankfurter',
  provider: 'Frankfurter',
  cadence: 'business-daily',
  ttlMs: 259_200_000,
  historyDepthDays: 1826,
  historyChunkDays: 1826,
  trailingDays: 7,
  fixtures: { latest: 'frankfurter-latest-2026-09-16.json', range: 'frankfurter-range-2026-09-16.json' },
  latestUrl: p => `https://api.frankfurter.dev/v1/latest?base=${param(p, 'base')}&symbols=${param(p, 'symbol')}`,
  rangeUrl: (p, from, to) =>
    `https://api.frankfurter.dev/v1/${from}..${to}?base=${param(p, 'base')}&symbols=${param(p, 'symbol')}`,
  parseLatest(text, p) {
    const j = JSON.parse(text) as { date: string; rates: Record<string, number> }
    const value = j.rates[param(p, 'symbol')]
    if (typeof value !== 'number') throw new Error('frankfurter: no rate in response')
    return { value, asOf: j.date }
  },
  parseRange(text, p) {
    const j = JSON.parse(text) as { rates: Record<string, Record<string, number>> }
    const symbol = param(p, 'symbol')
    return Object.entries(j.rates)
      .map(([date, r]) => [date, r[symbol]] as [string, number | undefined])
      .filter((x): x is [string, number] => typeof x[1] === 'number')
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  },
}
