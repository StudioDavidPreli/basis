// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'

// Under development Strict Mode React runs every effect twice on mount:
// run, clean up, run again. A "first run" flag survives that and sends
// the second run down the animate branch; the hook now decides from the
// value itself. Framer's animate is wrapped so the test can count starts.
const starts = vi.fn()
vi.mock('framer-motion', async importOriginal => {
  const mod = await importOriginal<typeof import('framer-motion')>()
  const real = mod.animate as unknown as (...args: unknown[]) => unknown
  return {
    ...mod,
    animate: (...args: unknown[]) => {
      starts(...args)
      return real(...args)
    },
  }
})

import { useAnimatedNumber } from './useAnimatedNumber'

const format = (n: number) => n.toFixed(1)

describe('useAnimatedNumber under Strict Mode', () => {
  beforeEach(() => {
    starts.mockClear()
    document.documentElement.setAttribute('data-reduce-motion', '0')
  })

  it('starts no animation on mount, though the effect runs twice', () => {
    const { result } = renderHook(({ v }) => useAnimatedNumber(v, format), { initialProps: { v: 1 }, wrapper: StrictMode })
    expect(result.current.get()).toBe('1.0')
    expect(starts).not.toHaveBeenCalled()
  })

  it('animates once per change and lands on the value', async () => {
    document.documentElement.setAttribute('data-reduce-motion', '1')
    const { result, rerender } = renderHook(({ v }) => useAnimatedNumber(v, format), { initialProps: { v: 1 }, wrapper: StrictMode })
    rerender({ v: 2 })
    expect(starts).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.get()).toBe('2.0'))
    // The same value again is not a change.
    rerender({ v: 2 })
    expect(starts).toHaveBeenCalledTimes(1)
  })
})
