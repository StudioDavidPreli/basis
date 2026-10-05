import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { generate, PRESETS } from '../scripts/presets-css.mjs'

describe('styles/presets.css', () => {
  it('is exactly what the generator makes from the installed package', () => {
    expect(readFileSync(path.resolve(__dirname, 'presets.css'), 'utf8')).toBe(generate())
  })

  it('scopes every preset, its reduced-motion block included, and leaves no bare :root', () => {
    const css: string = generate()
    for (const id of PRESETS as string[]) expect(css.split(`:root[data-preset='${id}']`).length - 1).toBe(2)
    expect(css.replace(/:root\[data-preset='[a-z]+'\]/g, '')).not.toContain(':root')
  })
})
