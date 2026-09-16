// A seeded generator, so the same seed gives the same series on every
// runtime (the M2 acceptance line). Math.random cannot be seeded and differs
// between V8 on the Worker and V8 in Node only in state, but that is enough
// to make a snapshot test meaningless. mulberry32 is 32-bit integer
// arithmetic, which JavaScript does identically everywhere.

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Standard normal by Box-Muller. Two uniforms in, one gaussian out; the
// second output is discarded to keep the call stateless beyond the rng.
export function gaussian(rng: Rng): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}
