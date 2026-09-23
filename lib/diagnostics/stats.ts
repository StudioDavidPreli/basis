// Small statistics the tools share. Pure; every function answers null
// where the sample cannot support the number rather than NaN.

import type { Point } from '@/lib/chart'

const DAY_MS = 86_400_000

export function mean(xs: number[]): number | null {
  if (xs.length === 0) return null
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

// Sample standard deviation.
export function sd(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs)!
  let s = 0
  for (const x of xs) s += (x - m) * (x - m)
  return Math.sqrt(s / (xs.length - 1))
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

// Steps in a year for a series, from its mean step: daily gives 365,
// business-daily about 260 (weekends stretch the mean step to 1.4 days).
export function stepsPerYear(points: Point[]): number | null {
  if (points.length < 2) return null
  const span = points[points.length - 1]![0] - points[0]![0]
  const step = span / (points.length - 1) / DAY_MS
  if (step <= 0) return null
  return Math.round(365.25 / step)
}

// Simple step returns, one per consecutive pair.
export function stepReturns(points: Point[]): number[] {
  const out: number[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]![1]
    if (a === 0) continue
    out.push(points[i]![1] / a - 1)
  }
  return out
}

export function logReturns(points: Point[]): number[] {
  const out: number[] = []
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]![1]
    const b = points[i]![1]
    if (a <= 0 || b <= 0) continue
    out.push(Math.log(b / a))
  }
  return out
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  const mx = mean(xs.slice(0, n))!
  const my = mean(ys.slice(0, n))!
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx
    const dy = ys[i]! - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

// Ordinary least squares of y on x: slope, intercept, residual sd.
export function ols(xs: number[], ys: number[]): { slope: number; intercept: number; residualSd: number; n: number } | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return null
  const mx = mean(xs.slice(0, n))!
  const my = mean(ys.slice(0, n))!
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my)
    sxx += (xs[i]! - mx) * (xs[i]! - mx)
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  const intercept = my - slope * mx
  let rss = 0
  for (let i = 0; i < n; i++) {
    const e = ys[i]! - (intercept + slope * xs[i]!)
    rss += e * e
  }
  return { slope, intercept, residualSd: Math.sqrt(rss / Math.max(1, n - 2)), n }
}

export function daysBetween(aMs: number, bMs: number): number {
  return Math.round((bMs - aMs) / DAY_MS)
}
