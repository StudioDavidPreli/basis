import { loadSnapshot } from '@/worker/read'
import { parseUrlState } from '@/components/surface-url'
import { Surface } from '@/components/surface'

// The server component (docs/spec.md, "Server / client boundary"): reads
// the KV snapshot and the URL's shareable state, and passes plain data to
// <Surface>, the client boundary. Nothing below Surface does IO except
// POST /api/refresh, the poll of the stored snapshot, and GET /api/series
// after hydration and when the dataset switches. The URL is parsed here so a deep link renders
// its state server-side and the client hydrates the same thing.

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ snapshot, cold }, params] = await Promise.all([loadSnapshot(), searchParams])
  const initial = parseUrlState(params)
  // No series in the page: five years of every entity was three quarters of
  // the HTML, parsed before first paint, for a sheet that opens with nothing
  // charted. Surface reads them after hydration
  // (decisions/2026-09-28-series-after-hydration.md).
  return <Surface snapshot={snapshot} cold={cold} renderedAt={new Date().toISOString()} initial={initial} />
}
