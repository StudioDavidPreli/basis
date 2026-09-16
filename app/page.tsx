import { loadSnapshot } from '@/worker/read'
import { parseUrlState } from '@/components/surface-url'
import { Surface } from '@/components/surface'

// The server component (docs/spec.md, "Server / client boundary"): reads
// the KV snapshot and the URL's shareable state, and passes plain data to
// <Surface>, the client boundary. Nothing below Surface does IO except
// POST /api/refresh. The URL is parsed here so a deep link renders its
// state server-side and the client hydrates the same thing.

export const dynamic = 'force-dynamic'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ snapshot, cold }, params] = await Promise.all([loadSnapshot(), searchParams])
  return <Surface snapshot={snapshot} cold={cold} renderedAt={new Date().toISOString()} initial={parseUrlState(params)} />
}
