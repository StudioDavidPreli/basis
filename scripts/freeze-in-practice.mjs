// Freezes the live snapshot for /embed/in-practice
// (decisions/2026-10-15-the-in-practice-stage.md). The stage reads no Worker
// and runs no refresh, so it carries a committed copy of what the agent last
// wrote on basis.davidpreli.com: the twelve companies' figures as stored,
// with their real sources and asOf, and each company's Level series over
// the chart's one year. Nothing here is computed or typed; it is trimmed.
//
//   node scripts/freeze-in-practice.mjs     write data/in-practice.json
//
// The mutation log is left out (the stage shows none) and so is the series
// history before the year, apart from the one point that carries each line
// to the plot's left edge.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = 'https://basis.davidpreli.com'
const DAYS = 365 // RANGE_DAYS['1Y'] in lib/chart.ts
const DAY_MS = 86_400_000

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(path.join(root, 'data/companies.json'), 'utf8'))
const ids = config.companies.map(c => c.id)

async function get(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

const [snapshot, series] = await Promise.all([get(`${ORIGIN}/api/refresh`), get(`${ORIGIN}/api/series?dataset=comps`)])
if (!snapshot?.at || !snapshot.entities) throw new Error('no stored snapshot')
if (snapshot.agent?.phase !== 'done' && snapshot.agent?.phase !== 'idle') throw new Error(`the agent is ${snapshot.agent?.phase}; freeze after a clean run`)

const entities = {}
const trimmed = {}
for (const id of ids) {
  const e = snapshot.entities[id]
  const s = series.entities[id]
  if (!e || !s) throw new Error(`${id}: missing from the live snapshot`)
  entities[id] = e
  const end = Date.parse(`${s.dates[s.dates.length - 1]}T00:00:00Z`)
  const first = Math.max(0, s.dates.findIndex(d => Date.parse(`${d}T00:00:00Z`) >= end - DAYS * DAY_MS) - 1)
  trimmed[id] = { dates: s.dates.slice(first), level: s.level.slice(first), coveredFrom: s.coveredFrom, provisionalFrom: s.provisionalFrom }
}

const out = {
  _source: `${ORIGIN}/api/refresh and /api/series?dataset=comps, frozen ${new Date().toISOString()}`,
  snapshot: { at: snapshot.at, entities, mutations: [], agent: snapshot.agent },
  series: { at: series.at, dataset: 'comps', entities: trimmed },
}
writeFileSync(path.join(root, 'data/in-practice.json'), `${JSON.stringify(out)}\n`)
console.log(`data/in-practice.json: snapshot ${snapshot.at}, ${ids.length} companies`)
