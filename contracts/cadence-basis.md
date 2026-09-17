# Contract: Basis consumes Cadence

Source of truth for names and values: `cadence-consumer-reference.md` (pulled
from Cadence source 2026-09-16). Package: `cadence-tokens@2.0.1` on npm. 2.0.0
shipped the per-preset dist files behind an exports map that did not name them,
so both imports below were refused by every resolver; 2.0.1 opens `./dist/*`.
Pin `^2.0.1`, never `2.0.0`.

## What Basis imports

Two files, one preset.

```ts
// app/layout.tsx (server)
import 'cadence-tokens/dist/standard/cadence.css'
// exposes --cadence-duration-*, --cadence-ease-*, --cadence-delay-*,
// --cadence-scale-*, --cadence-spring-*, --cadence-duration-scalar,
// plus a @media (prefers-reduced-motion: reduce) block carrying the resolution.

// lib/motion/tokens.ts (client) — the ONLY module that imports this
import {
  durations, easings, delays, scale, spring, transitions,
} from 'cadence-tokens/dist/standard/cadence.motion.js'
import { REDUCED_MOTION_RESOLUTION } from 'cadence-tokens'
```

Preset is Standard. A `?preset=snappy|cinematic` search param may switch the
import at the layout level for the Cadence "In Practice" embed; that is a later
milestone and must not leak into component code (components read
`useMotionTokens()`, never the module).

## What Basis does not import

- `presets.<id>.ambient` — the Motion Tiles clock vocabulary. Not interaction motion.
- `--motion-*` — Cadence's own site CSS. Not in the package.
- `--feedback-*` — Cadence tool chrome timing. Not tokens, not exported.
- `deviations` — absent in dist files; if present, ignore.
- Anything visual. Cadence has none, and Basis must not expect any.

## Units and names, as Basis sees them

| Concept | CSS (`cadence.css`) | Framer module | Unit |
|---|---|---|---|
| duration | `--cadence-duration-fast/base/slow/slower` | `durations.fast/base/slow/slower` | ms / s |
| easing | `--cadence-ease-linear/standard/enter/exit/overshoot` | `easings.*` (bezier array) | — |
| delay | `--cadence-delay-none/short/medium/long` | `delays.*` | ms / s |
| scale | `--cadence-scale-press-subtle/press-base/press-expressive/lift` | `scale.pressSubtle/pressBase/pressExpressive/lift` | unitless |
| spring | `--cadence-spring-stiffness/damping/mass` | `spring` (complete transition object) | unitless |
| scalar | `--cadence-duration-scalar` | absent | unitless |

Seams to respect: JSON says `easing`, runtime says `ease`, module says
`easings`. Basis only ever touches the module and the CSS, so in Basis code the
words are `easings` (JS) and `--cadence-ease-*` (CSS). Never introduce a third.

## Standard preset values (for review, not for hardcoding)

durations 100/200/400/600 ms · delays 0/50/100/200 ms · ease.standard
(0.4, 0, 0.2, 1) · enter (0, 0, 0.2, 1) · exit (0.4, 0, 1, 1) · overshoot
(0.34, 1.56, 0.64, 1) · scale 0.98/0.95/0.90/1.02 · spring 170/20/1.5.

## `useMotionTokens()` — the Basis-side adapter

`lib/motion/tokens.ts` exports one hook. It is the seam between Cadence and
every Basis component.

```ts
type MotionTokens = {
  durations: typeof durations   // flattened to 0.01 under reduced motion
  delays: typeof delays         // flattened to 0 under reduced motion
  easings: typeof easings       // unchanged
  scale: typeof scale           // unchanged
  spring: Transition            // Cadence spring, or { duration: 0.01 } under reduced motion
  springDamped: Transition      // the same spring critically damped, same reduced-motion branch
  transitions: typeof transitions  // REBUILT from the fields above, never the module's
  reducedMotion: boolean
}
```

Reduced-motion policy is `REDUCED_MOTION_RESOLUTION`: duration → 10 ms, delay →
0, easing/scale/spring/scalar unchanged. The spring branch is Basis's
responsibility (a spring has no duration to flatten): when `reducedMotion` is
true the hook returns `spring = { duration: 0.01 }` and every consumer of
`spring` goes through the hook, never the module. 10 ms, not 0, so
`onAnimationComplete` still fires.

`springDamped` is the Cadence spring with its damping raised to critical,
`2·√(stiffness · mass)`, so it settles with no overshoot. Every number in it
is the token's own; the relation is physics, not a tuned value. Cadence has
one spring and Basis cannot re-tune it, so a use that needs the spring's
motion without its bounce (the drawer) takes this derived one. If Cadence
grows a damped spring token, this field reads it instead. Under reduced
motion it takes the same 10 ms branch as `spring`.

`transitions` is the same trap one level up. The module evaluates
`transitions.enter = { duration: durations.base, ... }` at load, so the object
holds 0.2 no matter what the hook did to `durations`, and `transitions.spring`
is the live spring. The hook therefore rebuilds all three from its own
flattened fields:

```ts
transitions: {
  enter: { duration: durations.base, ease: easings.enter },   // hook's durations
  exit:  { duration: durations.fast, ease: easings.exit },
  spring,                                                     // hook's spring
}
```

The module's `transitions` export is never returned as-is. The provenance
popover and the command palette run on `transitions.*`, so without this they
would be the two interactions that ignore reduced motion.

`reducedMotion` is read from `document.documentElement.dataset.reduceMotion`,
set by the inline script in `layout.tsx` before hydration from
`matchMedia('(prefers-reduced-motion: reduce)')` and the `?reduce=1` override.
CSS reads the package's own media block; the `[data-reduce-motion="1"]`
selector in `app/globals.css` mirrors the same resolution for the override case.

## Token assignment for Basis interactions

Every interaction is named here with its token pair. Adding an interaction means
adding a row, in its own commit.

| Interaction | Duration | Easing / transition | Delay |
|---|---|---|---|
| Figure value tick (`useAnimatedNumber`) | `slow` | `standard` | `none` |
| Figure direction color decay | `slower` | `exit` | `none` |
| Figure shimmer (refreshing) | `slower`, looped | `linear` | `none` |
| Figure → stale (desaturate) | `base` | `standard` | `none` |
| Provenance popover enter / exit | `transitions.enter` / `transitions.exit` | | |
| Table row reorder on sort | `slow` | `standard` (layout) | `short` stagger, capped at 8 rows |
| Row hover / line hover highlight | `fast` | `standard` | `none` |
| Row selection swatch appear | `base` | `enter` | `none` |
| Chart line draw-in / out | `slower` / `base` | `enter` / `exit` | `short` stagger by selection order |
| Chart domain rescale (time range) | `slow` | `standard` | `none` |
| Drawer open | — | `springDamped` | `none` |
| Ledger shift beside the drawer (no reorder) | — | `springDamped` (layout) | `none` |
| Drawer close | — | `springDamped` (exit, kept mounted until done) | `none` |
| Drawer entity switch (text scramble) | `slower`; glyphs re-roll every `delays.short` | `standard` on the length | `none` |
| Command palette enter / exit | `transitions.enter` / `transitions.exit` | | |
| Press feedback on buttons | `fast` | `standard`, `scale.pressSubtle` | `none` |
| Theme switch crossfade | `base` | `standard` | `none` |

The drawer is an intercepting route, so Next removes it from the tree the
moment history moves, on every close path: Escape, the close control, and
the back button alike. The drawer shell holds the removed drawer through an
`AnimatePresence` boundary, so the panel slides out on `springDamped` and the
element is unmounted when the exit completes; history itself moves at once
and stays honest. The drawer sits in the layout's right gutter, so on a
viewport wide enough it touches nothing; when the sheet must give it room,
the ledger's rows shift on the same `springDamped` (every row keeping its
index moves as one; the `short` stagger is for a reorder only), so the two
move together. (The raw spring read as too springy; damping it, not removing
it, and an instant close read as no exit at all, David, 2026-09-16.)
Switching the entity while the drawer is open does not reopen it: the text
scrambles per character into the new text over `slower`, with the glyph
clock on `delays.short`; under reduced motion both flatten and the text
simply changes.

Rive artboards (`AgentPresence`, logos) hold their own timing inside the state
machine; Basis pushes only view-model values. The `reduced` boolean in the
view model is set from the same `reducedMotion` flag.

## `useAnimatedNumber(value, format)`

Basis-side for now. Interpolates a `MotionValue<number>` to `value` on change
using `durations.slow` / `easings.standard`, renders through `format`.
Candidate to upstream into Cadence if Token Lab's live retiming turns out to be
the same behavior; note it as such in the README and do not upstream from this
repo.

## Lint

`eslint/no-inline-motion.js` flags numeric literals and non-token identifiers
in timing positions only. A target is not a timing position:
`animate={{ opacity: 1 }}` is fine, `transition={{ duration: 0.3 }}` is not.

JSX and JS: the value of every timing key, `duration`, `delay`, `stiffness`,
`damping`, `mass`, `repeatDelay`, `staggerChildren`, `delayChildren`, wherever
it appears: a `transition` prop, a `transition` key nested inside `animate`,
`initial`, `exit`, `whileHover`, `whileTap`, or a variants object, and the
options argument of `animate()`. An `ease` value must be an identifier, never
a string or an array literal.

CSS Modules: the time components of `transition`, `transition-duration`,
`transition-delay`, `animation`, `animation-duration`, `animation-delay`, and
any `cubic-bezier()` or keyword easing in those declarations.

Allowed identifiers resolve to `useMotionTokens()` fields or `var(--cadence-*)`.
This is the Cadence gate (`src/tokens/tokenIntegrity.test.js` there) in its
Basis form; its fixtures are the M1 planted literal and one clean file per
shape above.
