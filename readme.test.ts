import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// The README's token table is a copy of the contract's, which is the source
// of truth (contracts/cadence-basis.md, "Token assignment"). A row added to
// one and not the other fails here.
const read = (p: string) => readFileSync(path.resolve(__dirname, p), 'utf8')

function contractTable(): string {
  const s = read('contracts/cadence-basis.md')
  const i = s.indexOf('| Interaction | Duration |')
  return s.slice(i, s.indexOf('\n\n', i)).trim()
}

function readmeTable(): string {
  const s = read('README.md')
  const m = s.match(/<!-- token-table:start -->\n([\s\S]*?)\n<!-- token-table:end -->/)
  return (m?.[1] ?? '').trim()
}

describe('README', () => {
  it('carries the contract’s token table, row for row', () => {
    expect(contractTable().split('\n').length).toBeGreaterThan(10)
    expect(readmeTable()).toBe(contractTable())
  })
})
