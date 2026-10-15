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
    expect(css.replace(/:root(\[data-reduce-motion='0'\])?\[data-preset='[a-z]+'\]/g, '')).not.toContain(':root')
  })

  it('restates each preset\'s own timing for a framed embed asked for motion, and nothing else', () => {
    const css: string = generate()
    for (const id of PRESETS as string[]) {
      const sel = `:root[data-reduce-motion='0'][data-preset='${id}'] {`
      const block = css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)))
      const authored = css.slice(css.indexOf(`:root[data-preset='${id}'] {`))
      for (const name of ['duration-fast', 'duration-base', 'duration-slow', 'duration-slower', 'delay-none', 'delay-short', 'delay-medium', 'delay-long']) {
        const line = authored.match(new RegExp(`--cadence-${name}: [^;]+;`))![0]
        expect(block, `${id} ${name}`).toContain(line)
      }
      expect(block).not.toMatch(/--cadence-(ease|scale|spring|duration-scalar)/)
      expect(block).not.toContain('10ms')
    }
  })
})
