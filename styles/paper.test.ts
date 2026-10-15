import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { config, type CadenceStock } from '@/lib/config'
import { CADENCE_DARK, CADENCE_THEMES } from '@/app/theme-script'
import { CHARTED } from '@/app/embed/in-practice/charted'

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

// OKLab, for telling two inks apart: Euclidean distance here tracks what the
// eye separates far better than RGB or contrast does.
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map(i => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
// The same space from linear RGB, with a colour-vision simulation applied
// first: Machado, Oliveira and Fernandes (2009), severity 1.
type Matrix = [number, number, number][]
const VISION: Record<string, Matrix> = {
  typical: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
}
function seen(hex: string, m: Matrix): [number, number, number] {
  const v = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const [r, g, b] = m.map(row => Math.max(0, row[0] * v[0]! + row[1] * v[1]! + row[2] * v[2]!)) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s,
  ]
}

function distance(a: string, b: string): number {
  const [p, q] = [oklab(a), oklab(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

const css = readFileSync(path.resolve(__dirname, 'paper.css'), 'utf8')
const tableCss = readFileSync(path.resolve(__dirname, '../components/data-table.module.css'), 'utf8')

// color-mix(in srgb, a w%, b): component-wise on the encoded values, as the
// browser does it.
function mix(a: string, b: string, weight: number): string {
  const ch = (i: number) => Math.round(parseInt(a.slice(i, i + 2), 16) * weight + parseInt(b.slice(i, i + 2), 16) * (1 - weight))
  return `#${[1, 3, 5].map(i => ch(i).toString(16).padStart(2, '0')).join('')}`
}
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

  it('muted text clears AA on the row hover tint, band mixed with rule', () => {
    const m = tableCss.match(/color-mix\(in srgb, var\(--band\) (\d+)%, var\(--rule\)\)/)
    expect(m, 'the hover tint in data-table.module.css').not.toBeNull()
    const weight = Number(m![1]) / 100
    for (const [name, s] of Object.entries(stocks)) {
      const hover = mix(s['band']!, s['rule']!, weight)
      expect(contrast(s['muted']!, hover), `${name} muted on hover ${hover}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(s['ink']!, hover), `${name} ink on hover ${hover}`).toBeGreaterThanOrEqual(7)
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

  // Companies chart together, so their inks must part on each stock. The floor
  // sits under the closest pair, Spark Highveld and Equinox Cordillera on
  // passbook (decisions/2026-10-13-last-four-inks.md).
  it('no two companies are closer than 0.06 in OKLab on either stock', () => {
    const cs = config.companies
    for (const [i, a] of cs.entries()) {
      for (const b of cs.slice(i + 1)) {
        expect(distance(a.color, b.color), `${a.id} / ${b.id} on passbook`).toBeGreaterThanOrEqual(0.06)
        expect(distance(a.colorDark, b.colorDark), `${a.id} / ${b.id} on operate`).toBeGreaterThanOrEqual(0.06)
      }
    }
  })
})

// decisions/2026-10-14-cadence-stocks-on-the-embeds.md: Cadence's four themes
// as embed-only stocks. Mirrored like the Basis stocks, held to the same bars,
// and the entity inks, which do not change, checked on the new papers.
describe('the Cadence stocks', () => {
  const cadenceCss = readFileSync(path.resolve(__dirname, 'cadence-stocks.css'), 'utf8')
  const cadence = Object.entries(config.cadenceStocks).filter(([k]) => !k.startsWith('_')) as [string, CadenceStock][]
  const ROLES = ['paper', 'band', 'ink', 'muted', 'rule', 'accent'] as const

  it('are the four Cadence themes, each titled, and the source commit is named', () => {
    expect(cadence.map(([k]) => k)).toEqual([...CADENCE_THEMES])
    expect(cadence.map(([, s]) => s.cadenceTheme)).toEqual(['light', 'dark', 'high-contrast-light', 'high-contrast-dark'])
    for (const [k, s] of cadence) expect(s.title, k).toMatch(/^Cadence /)
    expect(config.cadenceStocks._source).toContain('57b5e4f')
  })

  it('cadence-stocks.css mirrors the config, with no grain, and the tone sets the color scheme', () => {
    for (const [name, s] of cadence) {
      const block = cadenceCss.slice(cadenceCss.indexOf(`:root[data-theme='${name}'] {`))
      const body = block.slice(0, block.indexOf('}'))
      for (const role of ROLES) expect(body, `${name} ${role}`).toContain(`--${role}: ${s[role]};`)
      expect(body, name).toContain('--grain: none;')
      expect(body, name).toContain(`color-scheme: ${s.tone};`)
      expect(body.includes('--pinstripe-ink: var(--paper);'), `${name} pinstripes`).toBe(name.includes('-hc-'))
    }
  })

  it('the dark tones are exactly the stocks that take dark inks and operate art', () => {
    expect(cadence.filter(([, s]) => s.tone === 'dark').map(([k]) => k)).toEqual([...CADENCE_DARK])
    for (const name of CADENCE_DARK) expect(cadenceCss).toContain(`[data-theme='${name}'] .entity`)
  })

  it('text and accent clear the same bars as the Basis stocks, accent as text too', () => {
    for (const [name, s] of cadence) {
      for (const ground of ['paper', 'band'] as const) {
        expect(contrast(s.ink, s[ground]), `${name} ink on ${ground}`).toBeGreaterThanOrEqual(7)
        expect(contrast(s.muted, s[ground]), `${name} muted on ${ground}`).toBeGreaterThanOrEqual(4.5)
        // Accent is text in the fresh-ink effect (components/figure.module.css).
        expect(contrast(s.accent, s[ground]), `${name} accent on ${ground}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('the row hover clears AA: the mixed tint, or on HC the band itself', () => {
    const weight = Number(tableCss.match(/color-mix\(in srgb, var\(--band\) (\d+)%, var\(--rule\)\)/)![1]) / 100
    expect(tableCss).toMatch(/data-theme\^='cadence-hc'\]\) \.row:hover \{\s*background: var\(--band\);/)
    for (const [name, s] of cadence) {
      const hover = name.includes('-hc-') ? s.band : mix(s.band, s.rule, weight)
      expect(contrast(s.muted, hover), `${name} muted on hover ${hover}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(s.ink, hover), `${name} ink on hover ${hover}`).toBeGreaterThanOrEqual(7)
    }
  })

  it('every entity ink, unchanged, clears 3:1 on each Cadence paper, band and hover', () => {
    const weight = Number(tableCss.match(/color-mix\(in srgb, var\(--band\) (\d+)%, var\(--rule\)\)/)![1]) / 100
    for (const e of [...config.companies, ...config.regions]) {
      for (const [name, s] of cadence) {
        const ink = s.tone === 'dark' ? e.colorDark : e.color
        const hover = name.includes('-hc-') ? s.band : mix(s.band, s.rule, weight)
        for (const [ground, hex] of [['paper', s.paper], ['band', s.band], ['hover', hover]] as const) {
          expect(contrast(ink, hex), `${e.id} on ${name} ${ground}`).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })
})

// decisions/2026-10-15-the-in-practice-stage.md: the stage charts four lines
// alone, with no selection to tell them apart, so its four inks are held to
// more than the ledger's floor: 0.08 apart in OKLab with typical vision and
// under deuteranopia and protanopia, light inks and dark. Johannesburg and
// Santiago beside Tokyo fell to 0.012 under deuteranopia (David, 2026-10-15).
describe('the In Practice stage', () => {
  it('charts four companies whose inks stay 0.08 apart, under each colour vision', () => {
    const four = CHARTED.map(id => config.companies.find(c => c.id === id)!)
    expect(four.every(Boolean)).toBe(true)
    expect(new Set(four.map(c => c.process.family)).size).toBe(4)
    for (const ink of ['color', 'colorDark'] as const) {
      for (const [vision, m] of Object.entries(VISION)) {
        for (const [i, a] of four.entries()) {
          for (const b of four.slice(i + 1)) {
            const [p, q] = [seen(a[ink], m), seen(b[ink], m)]
            const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
            expect(d, `${a.id} / ${b.id}, ${ink}, ${vision}`).toBeGreaterThanOrEqual(0.08)
          }
        }
      }
    }
  })
})
