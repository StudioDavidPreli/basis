# Basis

A sourced-data surface built on the [Cadence](https://cadence.davidpreli.com) motion system: a table of simulated companies whose values are driven by real, free, keyless public APIs, with a linked time-series chart, provenance on every figure, and a scheduled refresh cycle.

There is no LLM anywhere in Basis. The "agent" is a Cloudflare Cron Trigger that fetches sources, recomputes, diffs against the last snapshot, and writes mutations with their provenance.

This README fills in at M10. Until then: `docs/spec.md` says what Basis is, `plan.md` says what is built, `contracts/` says how it consumes Cadence.

```
npm install
npm run lint       # eslint, then the CSS half of the no-inline-motion gate
npm test           # vitest on fixtures
npm run test:e2e   # playwright against built output on the Worker runtime
npm run preview    # build and serve the Worker locally on :8787
```
