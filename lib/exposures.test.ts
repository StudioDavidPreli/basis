import { describe, it, expect } from 'vitest'
import { normalize, exposureFactor, deriveLevel } from './exposures'

describe('normalize', () => {
  it('is 1 at the start and moves by value over span', () => {
    expect(normalize(20, 20, 30)).toBe(1)
    expect(normalize(35, 20, 30)).toBeCloseTo(1.5)
    expect(normalize(5, 20, 30)).toBeCloseTo(0.5)
  })

  it('does not flip sign across zero the way a ratio would', () => {
    // -0.3 °C to 0.3 °C: a ratio would be -1; the span form is a hair over 1.
    expect(normalize(0.3, -0.3, 30)).toBeCloseTo(1.02)
  })
})

describe('deriveLevel', () => {
  const base = [100, 101, 102, 103]
  it('equals base on the first date when weights sum to one', () => {
    const drivers = [
      { weight: 0.75, values: [20, 22, 18, 25], span: 30 },
      { weight: 0.25, values: [1.15, 1.16, 1.14, 1.2], span: 0.1 },
    ]
    const level = deriveLevel(base, drivers)
    expect(level[0]).toBe(100)
    // Date 1: 0.75 * (1 + 2/30) + 0.25 * (1 + 0.01/0.1) = 0.75*1.0667 + 0.25*1.1
    expect(exposureFactor(drivers, 1)).toBeCloseTo(0.75 * (1 + 2 / 30) + 0.25 * 1.1)
    expect(level[1]).toBeCloseTo(101 * (0.75 * (1 + 2 / 30) + 0.25 * 1.1))
  })

  it('refuses a driver series shorter than the base', () => {
    expect(() => deriveLevel(base, [{ weight: 1, values: [1, 2], span: 1 }])).toThrow(/shorter/)
  })
})
