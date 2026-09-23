// From a number and the inputs it came from to a FigureValue the atom can
// render. The sources are the union of every input's, deduplicated by
// provider and ref; the status is the worst input's, decided by the same
// rule the ledger's figures use.

import type { FigureValue, Source } from '@/lib/types'
import { deriveStatus } from '@/lib/status'
import type { Cell, DerivedFormat, DiagnosticSeries } from './types'

export function unionSources(series: DiagnosticSeries[]): Source[] {
  const seen = new Set<string>()
  const out: Source[] = []
  for (const s of series)
    for (const src of s.sources) {
      const key = `${src.provider}|${src.ref}|${src.asOf}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(src)
    }
  return out
}

export function derived(value: number, from: DiagnosticSeries[], now: Date): FigureValue {
  const source = unionSources(from)
  const updatedAt = from.map(s => s.updatedAt).sort().at(-1) ?? now.toISOString()
  return { value, source, status: deriveStatus({ sources: source, changed: false, now }), updatedAt }
}

export function figureCell(label: string, value: number | null, format: DerivedFormat, from: DiagnosticSeries[], now: Date, note?: string): Cell {
  if (value === null || !Number.isFinite(value)) return { kind: 'text', text: '—' }
  return { kind: 'figure', label, figure: derived(value, from, now), format, note }
}

export function text(text: string): Cell {
  return { kind: 'text', text }
}
