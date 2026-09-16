import { describe, it, expect } from 'vitest'
import { config, loadConfig } from './config'
import {
  companyName,
  regionName,
  companyDescription,
  regionDescription,
  companyAbout,
  regionAbout,
  ttlLabel,
} from './describe'

// The M2 acceptance: a description snapshot per company. The snapshot file
// beside this one is the rendered set the M0 session read; a change to the
// config or the grammar shows up here as a diff to read, never as a silent
// rewrite.

describe('names', () => {
  it('produces twelve unique two-token names with no word reused', () => {
    const names = config.companies.map(c => companyName(c))
    expect(names).toHaveLength(12)
    expect(new Set(names).size).toBe(12)
    const words = names.flatMap(n => n.split(' '))
    expect(new Set(words).size).toBe(words.length)
  })

  it('takes the nameToken when set and the place otherwise', () => {
    expect(companyName(config.companies[0]!)).toBe('Anchor Kaze') // Tokyo
    expect(companyName(config.companies[1]!)).toBe('Keel London') // no token
  })

  it('names a region by its place', () => {
    expect(regionName(config.regions[0]!)).toBe('Brooklyn')
  })
})

describe('descriptions and about paragraphs', () => {
  it('match the reviewed set (M2 acceptance)', () => {
    const rendered = [
      ...config.companies.map(c => ({
        id: c.id,
        name: companyName(c),
        about: companyAbout(c),
        description: companyDescription(c),
      })),
      ...config.regions.map(r => ({
        id: r.id,
        name: regionName(r),
        about: regionAbout(r),
        description: regionDescription(r),
      })),
    ]
    expect(rendered).toMatchSnapshot()
  })

  it('names the slowest input by TTL, dominant on a tie', () => {
    // Anchor Kaze: Tokyo temperature (2 h) vs EUR/USD (3 d).
    expect(companyDescription(config.companies[0]!)).toContain('Its slowest input is EUR/USD, so figures go stale after 3 d.')
    // Plumb Varsha: Mumbai temperature (2 h) vs the tide (30 min).
    expect(companyDescription(config.companies[2]!)).toContain('Its slowest input is Mumbai temperature, so figures go stale after 2 h.')
  })

  it('lowercases only the first letter of the industry', () => {
    expect(companyAbout(config.companies[9]!)).toContain('is a heat-pump manufacturing company headquartered in Seoul')
  })

  it('ttlLabel picks the unit', () => {
    expect(ttlLabel(1_800_000)).toBe('30 min')
    expect(ttlLabel(7_200_000)).toBe('2 h')
    expect(ttlLabel(259_200_000)).toBe('3 d')
  })
})

describe('loadConfig', () => {
  it('refuses a company without its profile fields', () => {
    const broken = structuredClone(config) as unknown as { companies: Array<Record<string, unknown>> }
    delete broken.companies[0]!.industry
    expect(() => loadConfig(broken)).toThrow(/missing industry/)
  })

  it('refuses exposures that do not sum to one', () => {
    const broken = structuredClone(config)
    broken.companies[0]!.exposures[0]!.weight = 0.5
    expect(() => loadConfig(broken)).toThrow(/sum to/)
  })

  it('refuses an unknown driver', () => {
    const broken = structuredClone(config)
    broken.regions[0]!.exposures[0]!.driver = 'temp-atlantis'
    expect(() => loadConfig(broken)).toThrow(/unknown driver/)
  })
})
