// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMotionTokens } from './tokens'

// The contract's numbers, pinned: Standard values through, the reduced
// resolution applied, and the two traps the contract names (the spring, and
// `transitions` rebuilt rather than passed through).

function setFlag(value: '0' | '1' | null) {
  if (value === null) document.documentElement.removeAttribute('data-reduce-motion')
  else document.documentElement.setAttribute('data-reduce-motion', value)
}

describe('useMotionTokens', () => {
  beforeEach(() => setFlag('0'))

  it('hands back the Standard preset when motion is not reduced', () => {
    const { result } = renderHook(() => useMotionTokens())
    const t = result.current
    expect(t.reducedMotion).toBe(false)
    expect(t.durations).toEqual({ fast: 0.1, base: 0.2, slow: 0.4, slower: 0.6 })
    expect(t.delays).toEqual({ none: 0, short: 0.05, medium: 0.1, long: 0.2 })
    expect(t.easings.standard).toEqual([0.4, 0, 0.2, 1])
    expect(t.scale.pressSubtle).toBe(0.98)
    expect(t.spring).toEqual({ type: 'spring', stiffness: 170, damping: 20, mass: 1.5 })
    // Critically damped: damping² = 4 · stiffness · mass, nothing else changed.
    const d = t.springDamped as { type: string; stiffness: number; damping: number; mass: number }
    expect(d.type).toBe('spring')
    expect(d.stiffness).toBe(170)
    expect(d.mass).toBe(1.5)
    expect(d.damping * d.damping).toBeCloseTo(4 * 170 * 1.5, 6)
    expect(t.transitions.enter).toEqual({ duration: 0.2, ease: [0, 0, 0.2, 1] })
    expect(t.transitions.exit).toEqual({ duration: 0.1, ease: [0.4, 0, 1, 1] })
    expect(t.transitions.spring).toBe(t.spring)
  })

  it('flattens durations to 0.01 and delays to 0 under reduced motion, leaving easing and scale alone', () => {
    setFlag('1')
    const { result } = renderHook(() => useMotionTokens())
    const t = result.current
    expect(t.reducedMotion).toBe(true)
    expect(t.durations).toEqual({ fast: 0.01, base: 0.01, slow: 0.01, slower: 0.01 })
    expect(t.delays).toEqual({ none: 0, short: 0, medium: 0, long: 0 })
    expect(t.easings.enter).toEqual([0, 0, 0.2, 1])
    expect(t.scale.lift).toBe(1.02)
  })

  it('switches the spring to a 10ms timed transition under reduced motion', () => {
    setFlag('1')
    const { result } = renderHook(() => useMotionTokens())
    expect(result.current.spring).toEqual({ duration: 0.01 })
    expect(result.current.springDamped).toEqual({ duration: 0.01 })
  })

  it('rebuilds transitions from the flattened fields (the contract trap)', () => {
    setFlag('1')
    const { result } = renderHook(() => useMotionTokens())
    const { transitions } = result.current
    expect(transitions.enter).toEqual({ duration: 0.01, ease: [0, 0, 0.2, 1] })
    expect(transitions.exit).toEqual({ duration: 0.01, ease: [0.4, 0, 1, 1] })
    expect(transitions.spring).toEqual({ duration: 0.01 })
  })

  it('follows the attribute when it changes after mount', async () => {
    const { result } = renderHook(() => useMotionTokens())
    expect(result.current.reducedMotion).toBe(false)
    await act(async () => {
      setFlag('1')
      // MutationObserver delivers on a microtask.
      await Promise.resolve()
    })
    expect(result.current.reducedMotion).toBe(true)
    expect(result.current.durations.base).toBe(0.01)
  })

  it('treats a missing attribute as motion on', () => {
    setFlag(null)
    const { result } = renderHook(() => useMotionTokens())
    expect(result.current.reducedMotion).toBe(false)
  })
})

// The embeds' ?preset= (decisions/2026-10-05-presets-for-the-embeds.md):
// the attribute picks the module, and reduced motion flattens every one.
describe('useMotionTokens with a preset', () => {
  beforeEach(() => {
    setFlag('0')
    document.documentElement.removeAttribute('data-preset')
  })

  it('reads the preset the attribute names, each from its own module', async () => {
    const snappy = await import('cadence-tokens/dist/snappy/cadence.motion.js')
    const cinematic = await import('cadence-tokens/dist/cinematic/cadence.motion.js')
    document.documentElement.setAttribute('data-preset', 'snappy')
    expect(renderHook(() => useMotionTokens()).result.current.durations).toEqual(snappy.durations)
    document.documentElement.setAttribute('data-preset', 'cinematic')
    const t = renderHook(() => useMotionTokens()).result.current
    expect(t.durations).toEqual(cinematic.durations)
    expect(t.spring).toEqual(cinematic.spring)
    expect(t.transitions.enter).toEqual({ duration: cinematic.durations.base, ease: cinematic.easings.enter })
  })

  it('an unknown preset, or none, is Standard', () => {
    document.documentElement.setAttribute('data-preset', 'bouncy')
    expect(renderHook(() => useMotionTokens()).result.current.durations).toEqual({ fast: 0.1, base: 0.2, slow: 0.4, slower: 0.6 })
  })

  it('reduced motion flattens every preset the same way', () => {
    setFlag('1')
    for (const p of ['standard', 'snappy', 'cinematic']) {
      document.documentElement.setAttribute('data-preset', p)
      const t = renderHook(() => useMotionTokens()).result.current
      expect(t.durations).toEqual({ fast: 0.01, base: 0.01, slow: 0.01, slower: 0.01 })
      expect(t.spring).toEqual({ duration: 0.01 })
    }
  })
})
