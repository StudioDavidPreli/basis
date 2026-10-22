import { describe, expect, it } from 'vitest'
import { ageMinutes, formatAge } from './age'

const S = 1000
const M = 60 * S
const H = 60 * M
const D = 24 * H

describe('formatAge', () => {
  it('counts minutes and seconds under an hour', () => {
    expect(formatAge(0)).toBe('+00:00')
    expect(formatAge(4 * M + 12 * S)).toBe('+04:12')
    expect(formatAge(59 * M + 59 * S + 999)).toBe('+59:59')
  })

  it('adds hours under a day', () => {
    expect(formatAge(H)).toBe('+1:00:00')
    expect(formatAge(3 * H + 4 * M + 12 * S)).toBe('+3:04:12')
  })

  it('adds days beyond', () => {
    expect(formatAge(35 * D + 4 * H + 12 * M + 5 * S)).toBe('+35 d 04:12:05')
  })

  it('shows zero for a clock read behind the snapshot', () => {
    expect(formatAge(-5 * S)).toBe('+00:00')
  })
})

describe('ageMinutes', () => {
  it('turns on each whole minute', () => {
    expect(ageMinutes(59 * S)).toBe(0)
    expect(ageMinutes(M)).toBe(1)
    expect(ageMinutes(35 * D)).toBe(35 * 24 * 60)
    expect(ageMinutes(-M)).toBe(0)
  })
})
