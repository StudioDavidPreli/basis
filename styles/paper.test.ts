import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { config } from '@/lib/config'

// The visual language's numbers, pinned. The stocks live in the config (so
// the chart and the drawer can read them) and are mirrored in paper.css (so
// the page can paint before any script runs); this test fails if the two
// drift. Contrast is computed here the WCAG way, not read off a picker.

function luminance(hex: string): number {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!)
}
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const css = readFileSync(path.resolve(__dirname, 'paper.css'), 'utf8')
const stocks: Record<string, Record<string, string>> = config.stocks

describe('paper stocks', () => {
  it('paper.css mirrors the config for every role of every stock', () => {
    for (const [name, roles] of Object.entries(stocks)) {
      const block = css.slice(css.indexOf(`[data-theme='${name}']`))
      const end = block.indexOf('}')
      for (const [role, value] of Object.entries(roles)) {
        expect(block.slice(0, end), `${name} ${role}`).toContain(`--${role}: ${value};`)
      }
    }
  })

  it('ink and muted text clear AA on paper and on the band; accent clears 3:1 as a stroke', () => {
    for (const [name, s] of Object.entries(stocks)) {
      expect(contrast(s['ink']!, s['paper']!), `${name} ink`).toBeGreaterThanOrEqual(7)
      expect(contrast(s['ink']!, s['band']!), `${name} ink on band`).toBeGreaterThanOrEqual(7)
      expect(contrast(s['muted']!, s['paper']!), `${name} muted`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(s['muted']!, s['band']!), `${name} muted on band`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(s['accent']!, s['paper']!), `${name} accent`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('entity colors', () => {
  const entities = [...config.companies, ...config.regions]

  it('every entity has a color and a marker, and no two entities share both', () => {
    const seen = new Set<string>()
    for (const e of entities) {
      expect(e.color, e.id).toMatch(/^#[0-9a-f]{6}$/)
      expect(e.marker, e.id).toBeTruthy()
      const key = `${e.color}/${e.marker}`
      expect(seen.has(key), `${e.id} repeats ${key}`).toBe(false)
      seen.add(key)
    }
    expect(new Set(entities.map(e => e.color)).size).toBe(entities.length)
  })

  it('every color clears 3:1 on its stock, paper and band', () => {
    for (const e of entities) {
      expect(contrast(e.color, stocks['passbook']!['paper']!), `${e.id} on passbook`).toBeGreaterThanOrEqual(3)
      expect(contrast(e.color, stocks['passbook']!['band']!), `${e.id} on passbook band`).toBeGreaterThanOrEqual(3)
      expect(contrast(e.colorDark, stocks['operate']!['paper']!), `${e.id} on operate`).toBeGreaterThanOrEqual(3)
      expect(contrast(e.colorDark, stocks['operate']!['band']!), `${e.id} on operate band`).toBeGreaterThanOrEqual(3)
    }
    expect(new Set(entities.map(e => e.colorDark)).size).toBe(entities.length)
  })
})
