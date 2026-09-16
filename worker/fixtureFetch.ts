// A fetch that answers every adapter URL with that adapter's recorded
// fixture, so the live code path (real statuses, real history merging, real
// interruption records) runs without a network. Used by the unit tests and
// by the refresh route's `?fail=` switch under the fixtures environment,
// which is how the e2e suite reaches the banner's three levels from
// fixtures, never from a live outage.

import type { Adapter } from '@/sources'

function hostOf(url: string): string {
  return new URL(url).host
}

export function fixtureFetchFor(
  adapters: Record<string, Adapter>,
  loadFixture: (name: string) => Promise<string>,
  fail: (adapterId: string, url: string) => boolean = () => false,
): (url: string) => Promise<string> {
  // Each adapter's latest and range hosts, from URLs built with throwaway
  // params: the host and the path shape are what identify an adapter, not
  // the coordinates in the query.
  const probe = { base: 'EUR', symbol: 'USD', latitude: 0, longitude: 0, minMagnitude: 2.5, station: '0', datum: 'MLLW' }
  const table = Object.values(adapters).map(a => ({
    adapter: a,
    latestHost: hostOf(a.latestUrl(probe)),
    latestPath: new URL(a.latestUrl(probe)).pathname,
    rangeHost: hostOf(a.rangeUrl(probe, '2026-01-01', '2026-01-02')),
  }))
  return async (url: string) => {
    const host = hostOf(url)
    const path = new URL(url).pathname
    for (const t of table) {
      const isLatest = host === t.latestHost && path === t.latestPath
      const isRange = host === t.rangeHost && !isLatest
      if (!isLatest && !isRange) continue
      if (fail(t.adapter.id, url)) throw new Error('HTTP 503')
      return loadFixture(isLatest ? t.adapter.fixtures.latest : t.adapter.fixtures.range)
    }
    throw new Error(`no fixture for ${url}`)
  }
}
