// Names, about paragraphs, and series descriptions, all from the config and
// nothing else (CLAUDE.md: never hand-write copy for a company). The grammar
// and both templates are documented in docs/sources.md; this is their only
// implementation. If a sentence cannot be derived, add a field to the
// config, not a string here.

import { config as defaultConfig, dominantDriver } from './config'
import type { CompanyConfig, Config, DriverConfig, ProcessConfig, RegionConfig } from './config'

// ── Names ───────────────────────────────────────────────────────────────

// name = processLexicon[family][indexWithinFamily] + " " + (driver.nameToken ?? driver.place)
export function companyName(company: CompanyConfig, config: Config = defaultConfig): string {
  const family = company.process.family
  const words = config.lexicon.process[family].filter(w => !w.startsWith('_'))
  const index = config.companies.filter(c => c.process.family === family).findIndex(c => c.id === company.id)
  const first = words[index]
  if (first === undefined) throw new Error(`no ${family} word for ${company.id}`)
  const driver = config.drivers[dominantDriver(company.exposures)]!
  return `${first} ${driver.nameToken ?? driver.place}`
}

export function regionName(region: RegionConfig, config: Config = defaultConfig): string {
  return config.drivers[dominantDriver(region.exposures)]!.place!
}

// ── Series descriptions ─────────────────────────────────────────────────

function processClause(p: ProcessConfig): string {
  switch (p.family) {
    case 'ou':
      return `mean-reverting series (θ = ${p.theta}, μ = ${p.mu}, σ = ${p.sigma}, seed ${p.seed})`
    case 'drift':
      return `random walk with drift (μ = ${p.mu} per step, σ = ${p.sigma}, seed ${p.seed})`
    case 'seasonal':
      return `seasonal series (amplitude ${p.amplitude}, period ${p.period} days, phase ${p.phase}, σ = ${p.sigma}, seed ${p.seed})`
    case 'jump':
      return `jump-diffusion series (λ = ${p.lambda} per step, jump size ${p.jumpSize}, σ = ${p.sigma}, seed ${p.seed})`
  }
}

export function ttlLabel(ms: number): string {
  const hours = ms / 3_600_000
  if (hours < 1) return `${Math.round(ms / 60_000)} min`
  if (hours < 48) return `${Math.round(hours)} h`
  return `${Math.round(hours / 24)} d`
}

function exposureClause(weight: number, d: DriverConfig): string {
  return `${Math.round(weight * 100)}% to ${d.label} (${d.provider}, ${d.cadence})`
}

// The slowest input is the driver with the longest TTL; on a tie, the
// dominant one.
function slowest(entity: CompanyConfig | RegionConfig, config: Config): DriverConfig {
  let best = entity.exposures[0]!
  for (const e of entity.exposures) {
    const d = config.drivers[e.driver]!
    const b = config.drivers[best.driver]!
    if (d.ttlMs > b.ttlMs || (d.ttlMs === b.ttlMs && e.weight > best.weight)) best = e
  }
  return config.drivers[best.driver]!
}

export function companyDescription(company: CompanyConfig, config: Config = defaultConfig): string {
  const parts = company.exposures.map(e => exposureClause(e.weight, config.drivers[e.driver]!))
  const slow = slowest(company, config)
  return (
    `${companyName(company, config)} is a ${processClause(company.process)} exposed ${parts.join(' and ')}. ` +
    `Its slowest input is ${slow.label}, so figures go stale after ${ttlLabel(slow.ttlMs)}.`
  )
}

export function regionDescription(region: RegionConfig, config: Config = defaultConfig): string {
  const d = config.drivers[dominantDriver(region.exposures)]!
  return (
    `${regionName(region, config)} is a ${processClause(region.process)} exposed 100% to ${d.label} ` +
    `(${d.provider}, ${d.cadence}). Figures go stale after ${ttlLabel(d.ttlMs)}.`
  )
}

// ── About paragraphs ────────────────────────────────────────────────────

function fill(template: string, fields: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = fields[key]
    if (v === undefined) throw new Error(`about template needs {${key}} and the config has no value for it`)
    return String(v)
  })
}

// {industry} renders with its first letter lowercased (docs/sources.md), so
// an industry must never begin with a proper noun or an acronym.
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

export function companyAbout(company: CompanyConfig, config: Config = defaultConfig): string {
  const dominant = dominantDriver(company.exposures)
  const city = config.drivers[dominant]!
  const macroId = company.exposures.find(e => e.driver !== dominant)?.driver
  const macro = macroId ? config.drivers[macroId] : undefined
  if (!macro?.noun) throw new Error(`${company.id}'s macro driver has no prose noun`)
  return fill(config.about.company, {
    name: companyName(company, config),
    industry: lowerFirst(company.industry),
    place: city.place!,
    founded: company.founded,
    activity: company.activity,
    macroNoun: macro.noun,
  })
}

export function regionAbout(region: RegionConfig, config: Config = defaultConfig): string {
  return fill(config.about.region, { place: regionName(region, config) })
}
