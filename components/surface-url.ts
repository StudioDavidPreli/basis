// The URL codec for the reducer's shareable slice (docs/spec.md, "State":
// range, dataset, metric, sort mirror to the URL). Pure, so the server
// parses the same search params the client later writes, and a deep link
// renders the same state on both sides with nothing to reconcile.
//
//   /?dataset=regions&sort=level&dir=desc&metric=index&range=5Y
//
// Defaults are omitted, so the sheet's own URL is bare. An unknown value
// falls back to the default rather than throwing: a stale link still opens
// the sheet.

import { config as defaultConfig, type Config, type DatasetConfig } from '@/lib/config'
import { DEFAULT_RANGE, RANGES, type Range, type Sort, type SurfaceState } from './surface-state'

export type UrlState = Pick<SurfaceState, 'dataset' | 'sort' | 'metric' | 'range'>

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

  return { dataset, sort, metric, range }
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
  const s = q.toString()
  return s ? `?${s}` : ''
}
