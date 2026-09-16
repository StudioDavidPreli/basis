// Exposure math (docs/sources.md, "Normalization"). A driver's raw values
// become a unitless factor around 1, and a company's level is its base
// series times the weighted sum of its drivers' factors. Weights sum to one
// (config.ts checks), so on the first date every factor is 1 and the level
// equals the base.
//
// normalized = 1 + (value - valueAtStart) / span
//
// Not value / valueAtStart: a Celsius ratio flips sign near zero and a debt
// ratio is a flat line. `span` is the per-driver constant declaring how big
// a move counts as "all of it".

export type DriverSeries = {
  weight: number
  values: number[] // raw driver values, one per date, aligned with the base
  span: number
}

export function normalize(value: number, start: number, span: number): number {
  return 1 + (value - start) / span
}

export function exposureFactor(drivers: DriverSeries[], i: number): number {
  let sum = 0
  for (const d of drivers) {
    const start = d.values[0]
    const value = d.values[i]
    if (start === undefined || value === undefined) throw new Error(`driver series shorter than base at index ${i}`)
    sum += d.weight * normalize(value, start, d.span)
  }
  return sum
}

export function deriveLevel(base: number[], drivers: DriverSeries[]): number[] {
  return base.map((b, i) => b * exposureFactor(drivers, i))
}
