import { describe, it, expect } from 'vitest'
import { ESLint } from 'eslint'
import css from '@eslint/css'
import path from 'node:path'
import noInlineMotion from './no-inline-motion.js'

// The plugin is plain JavaScript, so its literal types (`type: 'problem'` read
// as `string`) do not satisfy ESLint's Plugin type without a cast. Same for
// @eslint/css, whose rules are typed against its own language.
const plugin = noInlineMotion as unknown as ESLint.Plugin
const cssPlugin = css as unknown as ESLint.Plugin

// The gate is tested the way it will be used: ESLint's own API, one file in,
// a count of errors out. The counts are written at the top of each fixture.
// M1's acceptance line is the first test.

const fixtures = path.resolve(__dirname, 'fixtures')

const jsLinter = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.tsx'],
      languageOptions: {
        parser: await import('typescript-eslint').then(m => m.parser),
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { 'no-inline-motion': plugin },
      rules: { 'no-inline-motion/jsx': 'error' },
    },
  ],
})

const cssLinter = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.css'],
      language: 'css/css',
      plugins: { css: cssPlugin, 'no-inline-motion': plugin },
      rules: { 'no-inline-motion/css': 'error' },
    },
  ],
})

async function errors(linter: ESLint, file: string) {
  const [result] = await linter.lintFiles([path.join(fixtures, file)])
  return result!.messages.filter(m => m.severity === 2)
}

describe('no-inline-motion/jsx', () => {
  it('fails on the planted transition={{ duration: 0.3 }} (M1 acceptance)', async () => {
    const found = await errors(jsLinter, 'planted.tsx')
    expect(found).toHaveLength(1)
    expect(found[0]!.message).toContain('duration: 0.3')
  })

  it('catches every nested and derived shape', async () => {
    const found = await errors(jsLinter, 'planted-shapes.tsx')
    expect(found.map(m => m.messageId)).toEqual([
      'timingLiteral', // delay in variants
      'timingLiteral', // animate() options
      'timingLiteral', // stiffness
      'timingLiteral', // damping
      'easeLiteral', // ease string
      'easeLiteral', // ease array
      'timingLiteral', // the 2 in durations.base * 2
    ])
  })

  it('passes the shapes Basis writes', async () => {
    expect(await errors(jsLinter, 'clean.tsx')).toEqual([])
  })
})

describe('no-inline-motion/css', () => {
  it('fails on typed times and curves', async () => {
    const found = await errors(cssLinter, 'planted.module.css')
    expect(found.map(m => m.messageId)).toEqual(['time', 'easing', 'time', 'time', 'easing', 'factor', 'foreignVar', 'foreignVar', 'foreignVar'])
  })

  it('passes var(--cadence-*) reads, and a token scaled or interpolated by the data', async () => {
    expect(await errors(cssLinter, 'clean.module.css')).toEqual([])
  })
})
