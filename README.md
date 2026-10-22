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
| Figure value tick (`useAnimatedNumber`); on refresh, a heat cell's tint, a scatter point's position, and a ledger bar's length move with their number | `slow` | `standard` | `none` |
| Figure direction color decay | `slower` | `exit` | `none` |
| Figure shimmer (refreshing) | `slower`, looped | `linear` | `none` |
| Refresh arrow turn (while a refresh runs) | `slower`, looped | `linear` | `none` |
| Figure → stale (desaturate) | `base` | `standard` | `none` |
| Provenance popover enter / exit | `transitions.enter` / `transitions.exit` | | |
| Table row reorder on sort; the heat view's rows follow the same sort | `slow` | `standard` (layout) | `short` stagger by the top of each move, `min(from, to)`, capped at 8 rows |
| Row lane step as its travel starts, after its stagger (a rising row steps left and lifts to `scale.lift`; a falling row steps right) | `fast` | `standard` | the row's reorder stagger |
| Row lane step back as it lands | `base` | `standard` | `none` |
| Row hover / line hover highlight | `fast` | `standard` | `none` |
| Row selection swatch appear | `base` | `enter` | `none` |
| Chart line draw-in: the ribbons drawing together (landing, Trend's return, a metric switch, rows charted at once), each by its rank in the ledger among them, t = rank / (n − 1); on the sheet, Cinematic on landing, Trend's return, and a metric switch, Standard when rows are charted; an embed keeps its own preset | `slow` + (`slower` − `slow`) × t | `standard` | `slow` × t |
| Chart line draw-out | `base` | `exit` | `none` |
| The ledger on landing: held until the graph's first line starts, then in, so the two arrive together (wide only; the phone's ledger is the Inputs sheet) | `base` | `enter` | `none` |
| Heat grid arrival: each cell's tint pours from the paper, its row by table rank, its week by column, oldest to newest; its outline is there from the first frame; the 2σ dot with it | `slow` + (`slower` − `slow`) × the cell's `heatShare` | `standard` | row rank × `short`, capped at 8, plus `slower` × the column's share through `standard` |
| Chart domain rescale (time range; never a metric switch); the scatter's axes, and the projection fan inside the time domain | `slow` | `standard` | `none` |
| Chart metric switch: the old ribbons, gridlines, y ticks, and endpoints leave, a fade | `fast` | `exit` | `none` |
| Chart metric switch: the new y ticks and gridlines arrive at their places, a fade; the y domain is set, not animated | `base` | `enter` | `none` |
| Chart cursor: the rule, the dots, and the point card enter / exit; the scatter's ring and card; the heat's row and column pick-out and card | `transitions.enter` / `transitions.exit` | | `none` |
| Diagnostics card enter / exit (the hover preview and the pinned panel), the waterfall's included | `transitions.enter` / `transitions.exit` | | `none` |
| Window set / reset (the shade, the handles, the axis tags); scatter points, heat cells, and the fan answering a typed or reset window | `base` | `standard` | `none` |
| Drawer open | spring | `springDamped`, on the drawer column's width | `none` |
| Drawer close | spring | `springDamped`, the width back to zero, kept mounted until done | `none` |
| Inputs sheet open (phone): the sheet lifts from below the viewport's bottom edge to its place | spring | `springDamped`, on its translate on y, from where a previous run left it | `none` |
| Inputs sheet close (phone): back below the edge, kept mounted until done; also as a name in it opens the drawer, the sheet no longer modal and above the opening drawer | spring | `springDamped`, on the same translate | `none` |
| Sheet resize beside the drawer | spring | follows the column: one layout, one spring | `none` |
| Drawer scroll cue bounce (while there is more below) | `slower`, looped, alternating | `standard` | `none` |
| Drawer scroll cue stills and lifts under a hovering pointer, and back | `fast` | `standard`, `scale.lift` | `none` |
| Drawer scroll cue appear / clear | `base` | `standard` | `none` |
| Drawer entity switch (text scramble) | `slower`; glyphs re-roll every `delays.short` | `standard` on the length, the onsets, and the settle schedule | `none` |
| The margin's "Basis" scrambles into itself each time the data's age passes a whole minute, every letter churning, on Cinematic | `slower`; glyphs re-roll every `delays.short` | `linear` on the onsets and the settle schedule | `none` |
| Command palette enter / exit | `transitions.enter` / `transitions.exit` | | |
| Welcome dialog enter / exit, on Cinematic; the backdrop fades with the panel | `slow` / `fast` | `enter` / `exit` | `none` |
| Analysis window dialog enter / exit (phone) | `transitions.enter` / `transitions.exit` | | |
| Press feedback on buttons | `fast` | `standard`, `scale.pressSubtle` | `none` |
| Theme switch crossfade | `base` | `standard` | `none` |
| Hero view switch: the selected marker slides | `base` | `standard` | `none` |
| Hero view switch: the outgoing view leaves, and its row of options (Trend's metric chips and projection, or a view's caption) with it | `fast` | `exit` | `none` |
| Hero view switch: the arriving view's row of options appears under the switch | `base` | `enter` | `none` |
| Scatter and Heat: a charted row's point (or its heat row) appears, on the view's arrival or as the row is charted; each view's markers are its own and nothing travels between views | `base` | `enter` | `short` stagger by table rank among the charted rows, capped at 8, on arrival; `none` for a row charted later |
| Scatter and Heat: a row unticked in the ledger, its point or heat row leaves | `fast` | `exit` | `none` |
| Heat: re-bucket on a range change (day, week, month), a crossfade | `base` | `standard` | `none` |
| Heat: the 2σ dot appears / clears | `base` | `enter` / `exit` | `none` |
| Ledger bar: first show, growing from zero (the sort or the column's keep box brings it in) | `slow` | `enter` | the row's reorder stagger |
| Ledger bar: the bars return when the ledger widens again (the drawer closes), a fade | `base` | `enter` | `none` |
| Ledger bar: a column loses its bars (the sort leaves an unkept column, or its keep box is cleared); the new column grows as on first show | `fast` | `exit` | `none` |
| Projection fan opens from today, left to right (the 50% band), on the draw's preset | `slow` | `enter` | starts as the last arriving line lands |
| Projection fan: the 90% tint follows | `slow` | `enter` | `short` |
| Projection fan closes into the today rule (toggle off) | `base` | `exit` | `none` |
| Waterfall: steps build in order, each from the last step's level, its connector with it | `base` | `enter` | `medium` stagger, on the card's entry only |
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
- `/embed/in-practice`: the chart over the ledger, four companies' Level over one year, from a committed copy of a live snapshot (`scripts/freeze-in-practice.mjs`); 820 px tall from 560 to 880 px wide

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
