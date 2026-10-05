// cadence-tokens ships JavaScript without type declarations. These are the
// entry points Basis imports (contracts/cadence-basis.md, "What Basis
// imports"), typed to the shape the consumer reference documents. Nothing
// else from the package is declared, on purpose: if a file wants more of it,
// that is a contract change first.

declare module 'cadence-tokens/dist/standard/cadence.motion.js' {
  export const durations: { fast: number; base: number; slow: number; slower: number }
  export const easings: {
    linear: [number, number, number, number]
    standard: [number, number, number, number]
    enter: [number, number, number, number]
    exit: [number, number, number, number]
    overshoot: [number, number, number, number]
  }
  export const delays: { none: number; short: number; medium: number; long: number }
  export const scale: { pressSubtle: number; pressBase: number; pressExpressive: number; lift: number }
  export const spring: { type: 'spring'; stiffness: number; damping: number; mass: number }
  export const transitions: {
    enter: { duration: number; ease: [number, number, number, number] }
    exit: { duration: number; ease: [number, number, number, number] }
    spring: typeof spring
  }
}

// The other two presets have the same shape (the embeds' ?preset=,
// decisions/2026-10-05-presets-for-the-embeds.md).
declare module 'cadence-tokens/dist/snappy/cadence.motion.js' {
  export * from 'cadence-tokens/dist/standard/cadence.motion.js'
}
declare module 'cadence-tokens/dist/cinematic/cadence.motion.js' {
  export * from 'cadence-tokens/dist/standard/cadence.motion.js'
}

declare module 'cadence-tokens/dist/standard/cadence.css'

declare module 'cadence-tokens' {
  export const REDUCED_MOTION_RESOLUTION: {
    duration: number // ms
    delay: number // ms
    unchanged: string[]
  }
}
