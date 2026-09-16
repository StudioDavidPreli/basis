import { describe, it, expect } from 'vitest'
import { formatValue } from './format'

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
