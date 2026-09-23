// Formatters for every column `format` the config names. Pure, locale fixed
// to en-US so a server render and a client render agree byte for byte
// (docs/spec.md: no hydration mismatch). Negative values render in
// parentheses when the caller asks (the comps dataset, per the spec's
// visual language); regions do not.

import type { ColumnConfig } from './config'

export type FormatKey = ColumnConfig['format']

const two = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const one = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function signed(text: string, value: number, parentheses: boolean): string {
  if (value < 0) return parentheses ? `(${text})` : `−${text}` // U+2212 minus, not a hyphen
  return text
}

export type FormatOptions = { parentheses?: boolean }

export function formatValue(format: FormatKey, value: number | string, options: FormatOptions = {}): string {
  const parentheses = options.parentheses ?? false
  if (format === 'text') return String(value)
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—' // an em dash glyph for "no value"; not prose
  const abs = Math.abs(value)
  switch (format) {
    case 'number':
      return signed(two.format(abs), value, parentheses)
    case 'bps': {
      const text = `${whole.format(abs)} bps`
      if (value > 0) return `+${text}`
      return signed(text, value, parentheses)
    }
    case 'multiple':
      return signed(`${one.format(abs)}x`, value, parentheses)
    case 'celsius':
      return `${signed(one.format(abs), value, false)} °C`
    // The diagnostics' formats (docs/spec.md, Diagnostics): a rate as a
    // signed percentage with one decimal, a span of days, a count.
    case 'percent': {
      const text = `${one.format(abs * 100)}%`
      if (value > 0) return `+${text}`
      return signed(text, value, parentheses)
    }
    case 'days':
      return `${whole.format(abs)} d`
    case 'integer':
      return signed(whole.format(abs), value, parentheses)
  }
}
