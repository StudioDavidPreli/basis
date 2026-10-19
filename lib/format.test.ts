import { describe, it, expect } from 'vitest'
import { formatTick, formatValue } from './format'

describe('formatValue', () => {
  it('number: two decimals, parentheses for negatives when asked', () => {
    expect(formatValue('number', 104.2134)).toBe('104.21')
    expect(formatValue('number', 1234.5)).toBe('1,234.50')
    expect(formatValue('number', -3.2, { parentheses: true })).toBe('(3.20)')
    expect(formatValue('number', -3.2)).toBe('−3.20')
  })

  it('bps: whole numbers, explicit plus, parentheses on the comps side', () => {
    expect(formatValue('bps', 12.4)).toBe('+12 bps')
    expect(formatValue('bps', -8.6, { parentheses: true })).toBe('(9 bps)')
    expect(formatValue('bps', 0)).toBe('0 bps')
  })

  it('multiple: one decimal and an x', () => {
    expect(formatValue('multiple', 12.44)).toBe('12.4x')
  })

  it('celsius: one decimal, a real minus, never parentheses', () => {
    expect(formatValue('celsius', 23.46)).toBe('23.5 °C')
    expect(formatValue('celsius', -4, { parentheses: true })).toBe('−4.0 °C')
  })

  it('text passes through; a missing number renders as a dash glyph', () => {
    expect(formatValue('text', 'Reinsurance')).toBe('Reinsurance')
    expect(formatValue('number', Number.NaN)).toBe('—')
  })
})

describe('the diagnostics formats', () => {
  it('percent is signed with one decimal, days and integers are whole', () => {
    expect(formatValue('percent', 0.279)).toBe('+27.9%')
    expect(formatValue('percent', -0.264)).toBe('−26.4%')
    expect(formatValue('percent', -0.264, { parentheses: true })).toBe('(26.4%)')
    expect(formatValue('days', 11.4)).toBe('11 d')
    expect(formatValue('integer', 1831)).toBe('1,831')
    expect(formatValue('integer', -3)).toBe('−3')
  })
})

describe('formatTick', () => {
  it('writes basis points from a thousand up in thousands, signed as the figure is', () => {
    expect(formatTick('bps', 1000)).toBe('+1k bps')
    expect(formatTick('bps', -1000, { parentheses: true })).toBe('(1k bps)')
    expect(formatTick('bps', -1500)).toBe('−1.5k bps')
    expect(formatTick('bps', 2000)).toBe('+2k bps')
  })

  it('leaves small basis points, zero, and every other format as the figure reads', () => {
    expect(formatTick('bps', 500)).toBe('+500 bps')
    expect(formatTick('bps', 0)).toBe('0 bps')
    expect(formatTick('number', 12345.6)).toBe(formatValue('number', 12345.6))
    expect(formatTick('multiple', 22)).toBe('22.0x')
  })
})
