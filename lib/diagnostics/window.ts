// The analysis window (docs/spec.md, Diagnostics): two ISO dates, inclusive,
// or null for "follows the view". Clipping is by the point's time.

import type { Point } from '@/lib/chart'
import { dateMs } from '@/lib/chart'
import type { WindowMs } from './types'

export type Window = { from: string; to: string }

const DAY_MS = 86_400_000

// The window in milliseconds: the dates given, else the view's time domain.
// `to` is inclusive of its whole day.
export function windowMs(window: Window | null, view: [number, number]): WindowMs {
  if (!window) return { fromMs: view[0], toMs: view[1] }
  return { fromMs: dateMs(window.from), toMs: dateMs(window.to) + DAY_MS - 1 }
}

export function clip(points: Point[], w: WindowMs): Point[] {
  return points.filter(p => p[0] >= w.fromMs && p[0] <= w.toMs)
}

export function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// A window typed or dragged, made valid: both dates present and parseable,
// from before to (swapped if not), else null.
export function normalizeWindow(from: string | undefined, to: string | undefined): Window | null {
  if (!from || !to) return null
  const a = dateMs(from)
  const b = dateMs(to)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return a <= b ? { from: isoDate(a), to: isoDate(b) } : { from: isoDate(b), to: isoDate(a) }
}

export function windowDays(w: WindowMs): number {
  return Math.max(1, Math.round((w.toMs - w.fromMs) / DAY_MS))
}

// The window as the strip's caption writes it on a phone: "Jun 17 – Sep 16".
// UTC, as the dates are; `to` is the last day inside the window.
const monthDay = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
export function windowLabel(w: WindowMs): string {
  return `${monthDay.format(w.fromMs)} – ${monthDay.format(w.toMs)}`
}
