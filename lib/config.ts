// data/companies.json, typed and checked once. Every other module takes the
// typed config, never the raw JSON, so a malformed entry fails here with a
// sentence rather than somewhere downstream with `undefined`.

import raw from '@/data/companies.json'
import type { Cadence } from './types'

export type DriverConfig = {
  adapter: string
  provider: string
  place?: string
  nameToken?: string
  nameTokenGloss?: string
  label: string
  ref: string
  noun?: string
  cadence: Cadence
  ttlMs: number
  span: number
  params: Record<string, string | number>
}

export type OUProcess = { family: 'ou'; theta: number; mu: number; sigma: number; seed: number }
export type DriftProcess = { family: 'drift'; mu: number; sigma: number; seed: number }
export type SeasonalProcess = {
  family: 'seasonal'
  amplitude: number
  period: number
  phase: number
  sigma: number
  seed: number
}
export type JumpProcess = { family: 'jump'; lambda: number; jumpSize: number; sigma: number; seed: number }
export type ProcessConfig = OUProcess | DriftProcess | SeasonalProcess | JumpProcess
export type ProcessFamily = ProcessConfig['family']

export type Exposure = { driver: string; weight: number }

export type EntityStyle = {
  color: string // fixed per entity on the light stock, 3:1 on paper and band (styles/paper.test.ts)
  colorDark: string // the same hue lifted for the dark stock
  marker: string // the second cue beside color
}

export type CompanyConfig = EntityStyle & {
  id: string
  process: ProcessConfig
  exposures: Exposure[]
  industry: string
  founded: number
  activity: string
}

export type RegionConfig = EntityStyle & {
  id: string
  process: ProcessConfig
  exposures: Exposure[]
}

export type Stock = { paper: string; band: string; ink: string; muted: string; rule: string; accent: string }

export type ColumnConfig = {
  key: string
  label: string
  format: 'number' | 'bps' | 'multiple' | 'celsius' | 'text'
  derive: 'level' | 'deltaBps' | 'ratio' | 'driver' | 'field'
  divisor?: number
  field?: string
}

export type DatasetConfig = {
  label: string
  entities: 'companies' | 'regions'
  columns: ColumnConfig[]
}

export type Config = {
  version: string
  drivers: Record<string, DriverConfig>
  lexicon: { process: Record<ProcessFamily, string[]> }
  datasets: Record<string, DatasetConfig>
  base: { level: number }
  companies: CompanyConfig[]
  regions: RegionConfig[]
  about: { company: string; region: string }
  stocks: Record<string, Stock>
}

const FAMILIES: ProcessFamily[] = ['ou', 'drift', 'seasonal', 'jump']

function fail(message: string): never {
  throw new Error(`data/companies.json: ${message}`)
}

// The checks are the rules docs/sources.md states, not a schema: every
// exposure names a real driver, every company has its three profile fields
// (the generator refuses a company without them rather than filling a
// blank), every process family has a word for every company in it, and the
// weights of one entity sum to one so the derived level starts at base.
export function loadConfig(input: unknown = raw): Config {
  const c = input as Config
  const perFamily: Record<string, number> = {}
  for (const co of c.companies) {
    for (const e of co.exposures) if (!c.drivers[e.driver]) fail(`${co.id} exposes an unknown driver ${e.driver}`)
    if (!co.industry || !co.founded || !co.activity) fail(`${co.id} is missing industry, founded, or activity`)
    if (!FAMILIES.includes(co.process.family)) fail(`${co.id} has an unknown process family`)
    const sum = co.exposures.reduce((s, e) => s + e.weight, 0)
    if (Math.abs(sum - 1) > 1e-9) fail(`${co.id} exposures sum to ${sum}, not 1`)
    perFamily[co.process.family] = (perFamily[co.process.family] ?? 0) + 1
  }
  for (const [family, count] of Object.entries(perFamily)) {
    const words = c.lexicon.process[family as ProcessFamily]?.filter(w => !w.startsWith('_')) ?? []
    if (words.length < count) fail(`lexicon.process.${family} has ${words.length} words for ${count} companies`)
  }
  for (const r of c.regions) {
    for (const e of r.exposures) if (!c.drivers[e.driver]) fail(`${r.id} exposes an unknown driver ${e.driver}`)
    const dominant = r.exposures.reduce((a, b) => (b.weight > a.weight ? b : a))
    if (!c.drivers[dominant.driver]?.place) fail(`${r.id}'s dominant driver has no place to name it by`)
  }
  return c
}

export const config: Config = loadConfig()

// An entity's fixed color and marker, by id, across both datasets. The row
// and the detail already carry these; this is for a consumer that has only an
// id, and it cannot disagree with them because both derive from this config.
export function entityStyleOf(id: string, c: Config = config): EntityStyle | null {
  return c.companies.find(e => e.id === id) ?? c.regions.find(e => e.id === id) ?? null
}

export function dominantDriver(exposures: Exposure[]): string {
  return exposures.reduce((a, b) => (b.weight > a.weight ? b : a)).driver
}
