// Everything the drawer and the full company page show about one entity,
// as plain data assembled once on the server (docs/spec.md, "Drawer"): the
// about paragraph, the series description, every metric of its dataset,
// the cadence of each input, and the last three mutations recorded for it.
// Pure over the config and a stored snapshot, so it is tested without a
// Worker and the two routes cannot drift.

import { config as defaultConfig, dominantDriver, type ColumnConfig, type Config } from './config'
import { companyAbout, companyDescription, datasetOf, entityName, regionAbout, regionDescription } from './describe'
import type { Cadence, FigureValue, Mutation } from './types'
import type { StoredSnapshot } from '@/worker/refresh'

export const RECENT_MUTATIONS = 3

export type EntityInput = {
  driver: string
  label: string
  provider: string
  cadence: Cadence
  ttlMs: number
  weight: number
  dominant: boolean
}

export type EntityDetail = {
  id: string
  kind: 'company' | 'region'
  dataset: string
  datasetLabel: string
  name: string
  about: string
  description: string
  colors: { light: string; dark: string }
  marker: string
  columns: ColumnConfig[] // the dataset's figure columns, in table order
  metrics: Record<string, FigureValue> // by column key; absent when the snapshot has none
  inputs: EntityInput[] // by weight, heaviest first
  mutations: Mutation[] // newest first, at most RECENT_MUTATIONS
  parentheses: boolean
  at: string | null // the snapshot's time, null when there is none
}

export function entityDetail(id: string, snapshot: StoredSnapshot | null, config: Config = defaultConfig): EntityDetail | null {
  const company = config.companies.find(c => c.id === id)
  const region = company ? undefined : config.regions.find(r => r.id === id)
  const entity = company ?? region
  if (!entity) return null
  const kind = company ? 'company' : 'region'
  const dataset = datasetOf(id, config)
  const ds = config.datasets[dataset]!
  const columns = ds.columns.filter(c => c.derive !== 'field')
  const snap = snapshot?.entities[id]
  const metrics: Record<string, FigureValue> = {}
  for (const c of columns) {
    const m = snap?.metrics[c.key]
    if (m) metrics[c.key] = m
  }
  const dominant = dominantDriver(entity.exposures)
  const inputs = [...entity.exposures]
    .sort((a, b) => b.weight - a.weight)
    .map(e => {
      const d = config.drivers[e.driver]!
      return { driver: e.driver, label: d.label, provider: d.provider, cadence: d.cadence, ttlMs: d.ttlMs, weight: e.weight, dominant: e.driver === dominant }
    })
  const mutations = (snapshot?.mutations ?? [])
    .filter(m => m.entity === id)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, RECENT_MUTATIONS)
  return {
    id,
    kind,
    dataset,
    datasetLabel: ds.label,
    name: entityName(id, config),
    about: company ? companyAbout(company, config) : regionAbout(region!, config),
    description: company ? companyDescription(company, config) : regionDescription(region!, config),
    colors: { light: entity.color, dark: entity.colorDark },
    marker: entity.marker,
    columns,
    metrics,
    inputs,
    mutations,
    parentheses: dataset === 'comps',
    at: snapshot?.at ?? null,
  }
}

// The row's link target, and the drawer's route. One place, so the table,
// the drawer, and the tests agree on the path.
export function entityHref(id: string, config: Config = defaultConfig): string {
  return config.companies.some(c => c.id === id) ? `/company/${id}` : `/region/${id}`
}
