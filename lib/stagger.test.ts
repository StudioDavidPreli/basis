import { describe, expect, it } from 'vitest'
import { staggerSlot } from './stagger'

describe('staggerSlot', () => {
  it('gives two rows that trade places the same slot', () => {
    expect(staggerSlot(3, 4, 8)).toBe(3)
    expect(staggerSlot(4, 3, 8)).toBe(3)
  })

  it('reads the top of the move, whichever way the row goes', () => {
    expect(staggerSlot(1, 6, 8)).toBe(1)
    expect(staggerSlot(6, 1, 8)).toBe(1)
  })

  it('gives a still row its own index', () => {
    expect(staggerSlot(2, 2, 8)).toBe(2)
  })

  it('gives a row new to the order its own index', () => {
    expect(staggerSlot(-1, 5, 8)).toBe(5)
  })

  it('caps at the last slot', () => {
    expect(staggerSlot(10, 11, 8)).toBe(7)
  })
})
