# Basis

A sourced-data surface built on the [Cadence](https://cadence.davidpreli.com) motion system: simulated companies and regions driven by live public APIs, with a linked chart and provenance on every figure. Every duration, easing, delay, and spring comes from `cadence-tokens`; the visual language is Basis's own.

Live at [basis.davidpreli.com](https://basis.davidpreli.com).

## 01 · Data sources

Twelve companies and eight regions, each a seeded process (mean-reverting, drifting, seasonal, or jumping) with exposures to live inputs. No API needs a key.

| Provider | Input | Cadence |
|---|---|---|
| Open-Meteo | air temperature, twenty cities | hourly; daily for history |
| Frankfurter | ECB EUR/USD reference rate | business-daily |
| USGS | magnitude 2.5+ earthquakes, last 24 hours | minutes |
| NOAA CO-OPS | water level at The Battery, NY | minutes |

There is no LLM in Basis. The "agent" is an hourly Cloudflare Cron Trigger that fetches every source, recomputes, diffs against the last snapshot, and writes each change with its sources. A figure's provenance is the request that produced it; a figure without one renders as unverified. A failed source falls back to a recorded fixture and its figures read stale.

## 02 · Architecture

Next.js 16 on Cloudflare Workers through OpenNext, with KV for the snapshot and the series. `app/page.tsx` reads the snapshot on the server; `<Surface>` is the client boundary, and its only IO is the refresh, a minute poll while the tab is visible, and the series after hydration. Figures are DOM text, never canvas. A value tick writes to its node through a Framer `MotionValue`, so thirty-six figures tick while React commits twice.

## 03 · Motion tokens

Components read `useMotionTokens()` and `var(--cadence-*)`, never the package. A lint rule fails the build on a numeric literal in any timing position. Each interaction is a row in `contracts/cadence-basis.md`; this copy is held to it by a test.

<!-- token-table:start -->
| Interaction | Duration | Easing / transition | Delay |
|---|---|---|---|
| Figure value tick (`useAnimatedNumber`) | `slow` | `standard` | `none` |
| Figure direction color decay | `slower` | `exit` | `none` |
| Figure shimmer (refreshing) | `slower`, looped | `linear` | `none` |
| Refresh arrow turn (while a refresh runs) | `slower`, looped | `linear` | `none` |
| Figure → stale (desaturate) | `base` | `standard` | `none` |
| Provenance popover enter / exit | `transitions.enter` / `transitions.exit` | | |
| Table row reorder on sort | `slow` | `standard` (layout) | `short` stagger, capped at 8 rows |
| Row lane step as its reorder starts (a rising row steps left and lifts to `scale.lift`; a falling row steps right) | `fast` | `standard` | `none` |
| Row lane step back as it lands | `base` | `standard` | `none` |
| Row hover / line hover highlight | `fast` | `standard` | `none` |
| Row selection swatch appear | `base` | `enter` | `none` |
| Chart line draw-in / out | `slower` / `base` | `enter` / `exit` | `short` stagger by selection order |
| Chart domain rescale (time range) | `slow` | `standard` | `none` |
| Chart cursor: the rule, the dots, and the point card enter / exit | `transitions.enter` / `transitions.exit` | | `none` |
| Diagnostics card enter / exit (the hover preview and the pinned panel) | `transitions.enter` / `transitions.exit` | | `none` |
| Window set / reset (the shade, the handles, the axis tags) | `base` | `standard` | `none` |
| Drawer open | spring | `springDamped`, on the drawer column's width | `none` |
| Drawer close | spring | `springDamped`, the width back to zero, kept mounted until done | `none` |
| Sheet resize beside the drawer | spring | follows the column: one layout, one spring | `none` |
| Drawer entity switch (text scramble) | `slower`; glyphs re-roll every `delays.short` | `standard` on the length, the onsets, and the settle schedule | `none` |
| Command palette enter / exit | `transitions.enter` / `transitions.exit` | | |
| Press feedback on buttons | `fast` | `standard`, `scale.pressSubtle` | `none` |
| Theme switch crossfade | `base` | `standard` | `none` |
<!-- token-table:end -->

Basis takes motion from Cadence and nothing visual. Under reduced motion, durations flatten to 10 ms, delays to zero, springs to a timed branch, and loops are removed.

## 04 · Accessibility

- Native `<table>`, checkboxes, and `<dialog>`. The drawer is non-modal, so the sheet stays usable behind it; the command palette is modal.
- Every entity has a marker shape beside its color, so color is never the only channel.
- A live region announces sorts, refreshes, and agent updates with their sources.
- Axe passes in both themes and both reduced-motion states.

## 05 · Embeds

Chromeless routes for Cadence's "In Practice" page, frameable only by Basis and `cadence.davidpreli.com`:

- `/embed/figure?status=current|stale|refreshing|agent-updated|unverified`
- `/embed/agent?phase=idle|reading|building|waiting|done|error`
- `/embed/table-sort?dataset=comps|regions`

Each takes `theme=passbook|operate`, `reduce=1`, and `preset=standard|snappy|cinematic`.

## 06 · Development

```
npm install
npm run dev           # next dev on :3000
npm run lint          # includes the no-inline-motion rule
npm test              # vitest
npm run test:e2e      # playwright on the built Worker
npm run test:e2e:dev  # playwright on next dev (Strict Mode); run after, never beside, test:e2e
npm run test:live     # fixture-vs-live parity; the only suite that reaches the network
```

Every suite but `test:live` runs on recorded fixtures. Decisions are in `decisions/`, one dated record each.

## 07 · Limitations

- The agent mark is still its text fallback: the twelve company logos are on Rive, but the presence artboard has not been drawn. Under reduced motion every logo is a still poster and the page loads no Rive at all.
- The data refreshes hourly, inside the KV free tier's thousand writes a day.
- The last thirty days of tide data are NOAA's preliminary record, shaded provisional.
- The chart draws at most 500 points per series at 5Y and Max; the diagnostics use every point.
- Mobile Lighthouse performance was 92 on PageSpeed Insights on 2026-09-28, before the Rive runtime and the twelve logos landed; it has not been measured since.
