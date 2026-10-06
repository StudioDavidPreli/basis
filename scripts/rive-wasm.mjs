// Self-hosts the Rive runtime's WASM (contracts/agent-presence.md). By
// default the runtime fetches rive.wasm from unpkg, and a blocked CDN blanks
// every canvas silently (Cadence's playbook, "Stage 5"). Copied from the
// installed package before every dev and build, never committed, so the
// binary always matches the JS that loads it.
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const from = join(dirname(require.resolve('@rive-app/canvas/package.json')), 'rive.wasm')
const to = join(import.meta.dirname, '..', 'public', 'rive', 'rive.wasm')
mkdirSync(dirname(to), { recursive: true })
copyFileSync(from, to)
