import { describe, it, expect } from 'vitest'
import { deriveMetric } from './metrics'
import { config } from './config'

const comps = config.datasets['comps']!.columns
const regions = config.datasets['regions']!.columns
const company = config.companies[0]!
const region = config.regions[0]!

describe('deriveMetric', () => {
  it('derives every comps column from level, prev, and the entity', () => {
    const inputs = { level: 104, prevLevel: 100, driverValue: 23.5, entity: company }
    const byKey = Object.fromEntries(comps.map(c => [c.key, deriveMetric(c, inputs)]))
    expect(byKey).toEqual({ industry: 'Reinsurance', level: 104, change: 400, multiple: 13 })
  })

  it('derives the regions driver column from the raw driver value', () => {
    const inputs = { level: 98, prevLevel: undefined, driverValue: 19.8, entity: region }
    const byKey = Object.fromEntries(regions.map(c => [c.key, deriveMetric(c, inputs)]))
    expect(byKey).toEqual({ index: 98, change: undefined, driver: 19.8 })
  })
})
