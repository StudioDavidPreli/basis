// The URL codec for the reducer's shareable slice (docs/spec.md, "State":
// range, dataset, metric, sort mirror to the URL). Pure, so the server
// parses the same search params the client later writes, and a deep link
// renders the same state on both sides with nothing to reconcile.
//
//   /?dataset=regions&sort=level&dir=desc&metric=index&range=5Y&from=2026-06-12&to=2026-08-30&tool=summary
//
// Defaults are omitted, so the sheet's own URL is bare. An unknown value
// falls back to the default rather than throwing: a stale link still opens
// the sheet.

import { config as defaultConfig, type Config, type DatasetConfig } from '@/lib/config'
import { DEFAULT_RANGE, RANGES, type Range, type Sort, type SurfaceState } from './surface-state'
import { normalizeWindow, TOOLS } from '@/lib/diagnostics'

export type UrlState = Pick<SurfaceState, 'dataset' | 'sort' | 'metric' | 'range' | 'window' | 'tool'>

type Params = URLSearchParams | Record<string, string | string[] | undefined>

// The metric the chart opens on: the first column that is a figure the
// chart can draw. `field` columns are text, `driver` is the raw input.
export function chartMetrics(dataset: DatasetConfig): string[] {
  return dataset.columns.filter(c => c.derive !== 'field' && c.derive !== 'driver').map(c => c.key)
}

export function defaultMetric(dataset: DatasetConfig): string {
  return chartMetrics(dataset)[0]!
}

export function defaultDataset(config: Config = defaultConfig): string {
  return Object.keys(config.datasets)[0]!
}

function read(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  const v = params[key]
  return typeof v === 'string' ? v : undefined
}

export function parseUrlState(params: Params, config: Config = defaultConfig): UrlState {
  const datasetKey = read(params, 'dataset')
  const dataset = datasetKey && config.datasets[datasetKey] ? datasetKey : defaultDataset(config)
  const ds = config.datasets[dataset]!

  const metricKey = read(params, 'metric')
  const metric = metricKey && chartMetrics(ds).includes(metricKey) ? metricKey : defaultMetric(ds)

  const sortKey = read(params, 'sort')
  const sortable = sortKey === 'name' || ds.columns.some(c => c.key === sortKey)
  const dir = read(params, 'dir') === 'desc' ? 'desc' : 'asc'
  const sort: Sort = sortKey && sortable ? { key: sortKey, dir } : null

  const rangeKey = read(params, 'range')
  const range: Range = RANGES.includes(rangeKey as Range) ? (rangeKey as Range) : DEFAULT_RANGE

  const window = normalizeWindow(read(params, 'from'), read(params, 'to'))
  const toolKey = read(params, 'tool')
  const tool = toolKey && TOOLS.some(t => t.key === toolKey) ? toolKey : null

  return { dataset, sort, metric, range, window, tool }
}

// The search string for a state, '' when everything is the default.
export function encodeUrlState(state: UrlState, config: Config = defaultConfig): string {
  const q = new URLSearchParams()
  if (state.dataset !== defaultDataset(config)) q.set('dataset', state.dataset)
  if (state.sort) {
    q.set('sort', state.sort.key)
    if (state.sort.dir === 'desc') q.set('dir', 'desc')
  }
  const ds = config.datasets[state.dataset]
  if (ds && state.metric !== defaultMetric(ds)) q.set('metric', state.metric)
  if (state.range !== DEFAULT_RANGE) q.set('range', state.range)
  if (state.window) {
    q.set('from', state.window.from)
    q.set('to', state.window.to)
  }
  if (state.tool) q.set('tool', state.tool)
  const s = q.toString()
  return s ? `?${s}` : ''
}

// The keys this codec owns. Everything else in a URL belongs to someone
// else: `?reduce=1` and `?theme=` to the inline script in app/layout.tsx.
const OWNED = ['dataset', 'sort', 'dir', 'metric', 'range', 'from', 'to', 'tool'] as const

// The search string to write: the current one with this codec's keys
// replaced by `owned` (an encodeUrlState result) and every other key kept.
// Rebuilding from state alone erased the reduce and theme overrides on the
// first mirror, so a reload or a copied link lost them.
export function mergeUrlSearch(current: string, owned: string): string {
  const q = new URLSearchParams(current)
  for (const key of OWNED) q.delete(key)
  new URLSearchParams(owned).forEach((value, key) => q.set(key, value))
  const s = q.toString()
  return s ? `?${s}` : ''
}
