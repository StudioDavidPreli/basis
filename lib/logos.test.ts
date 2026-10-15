import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config'
import { companyName } from './describe'
import { ANIMATED, POSTERS, logoArt, logoKey, TITLE } from './logos'

const PUBLIC = join(__dirname, '..', 'public')
const files = (dir: string) => readdirSync(join(PUBLIC, dir)).filter(f => !f.startsWith('.'))

describe('logoKey', () => {
  it('camel-cases a name and drops its diacritics', () => {
    expect(logoKey('Anchor Kaze')).toBe('anchorKaze')
    expect(logoKey('Meridian Páramo')).toBe('meridianParamo')
  })

  it('gives the twelve twelve different keys', () => {
    const keys = config.companies.map(c => logoKey(companyName(c)))
    expect(new Set(keys).size).toBe(config.companies.length)
  })
})

// The delivered lists against what is actually in public/, both ways: a file
// nobody listed never shows, and a listed file that is missing is a 404 behind
// a poster.
describe('the delivered art matches public/', () => {
  it('every listed id is a company, and every animation has its posters', () => {
    for (const id of [...POSTERS, ...ANIMATED]) expect(config.companies.some(c => c.id === id), id).toBe(true)
    for (const id of ANIMATED) expect(POSTERS.has(id), id).toBe(true)
  })

  it('posters', () => {
    const expected = [...POSTERS].flatMap(id => {
      const art = logoArt(id)!
      return [art.posters.passbook, art.posters.operate].map(p => p.replace('/fallbacks/', ''))
    })
    expected.push(...Object.values(TITLE.posters).map(p => p.replace('/fallbacks/', '')))
    expect(files('fallbacks').sort()).toEqual(expected.sort())
  })

  it('animations', () => {
    const expected = [...ANIMATED].map(id => logoArt(id)!.riv!.replace('/rive/', '')).concat(TITLE.riv.replace('/rive/', ''))
    expect(files('rive').filter(f => f.endsWith('.riv')).sort()).toEqual(expected.sort())
  })

  // A poster is a still of the artboard, not of the drawing: the same
  // 500×500 frame the .riv is authored on, with the art where the artboard
  // has it. A poster scaled to its own bounds draws larger or smaller than
  // the canvas and the swap is a visible cut (2026-10-08, Keel London, a
  // quarter larger). This holds the frame; the e2e logos spec holds the
  // drawing by comparing drawn bounds against the canvas.
  it('every poster is on the 500×500 artboard frame', () => {
    const title = Object.values(TITLE.posters).map(p => p.replace('/fallbacks/', ''))
    for (const f of files('fallbacks').filter(f => f.endsWith('.svg') && !title.includes(f))) {
      const svg = readFileSync(join(PUBLIC, 'fallbacks', f), 'utf8')
      const viewBox = /viewBox="([^"]*)"/.exec(svg)?.[1]?.trim().split(/[\s,]+/).map(Number)
      expect(viewBox, f).toEqual([0, 0, 500, 500])
    }
  })

  // The Basis title's posters are stills of its own artboard, 588×204
  // (contracts/agent-presence.md, "Basis title").
  it('the title posters are on the title artboard frame', () => {
    for (const p of Object.values(TITLE.posters)) {
      const svg = readFileSync(join(PUBLIC, p), 'utf8')
      const viewBox = /viewBox="([^"]*)"/.exec(svg)?.[1]?.trim().split(/[\s,]+/).map(Number)
      expect(viewBox, p).toEqual([0, 0, TITLE.width, TITLE.height])
    }
  })

  it('a region, and a company with nothing delivered, have no art', () => {
    expect(logoArt(config.regions[0]!.id)).toBeNull()
    const bare = config.companies.find(c => !POSTERS.has(c.id))
    if (bare) expect(logoArt(bare.id)).toBeNull()
  })
})
