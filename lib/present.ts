// From a stored figure and the agent's phase to what a cell shows. Pure, so
// the server render and the client render agree, and so the rules are
// tested once here rather than in every component.
//
// `refreshing` is the one status the handler never writes: it is a fetch in
// flight, which a reader derives from the agent phase at the moment of
// reading. The other four are written at snapshot time and re-aged here
// against the reader's clock, because a figure that was `current` when
// written can be past its TTL by the time it is read.

import type { FigureStatus, FigureValue, Source } from './types'
import { isExpired } from './status'
import { sourcesOf } from './diff'
import type { AgentPhase } from '@/worker/refresh'

export type Presentation = {
  status: FigureStatus
  age: string | null // "3 h ago", present only when stale
  direction: 'up' | 'down' | null // present only when agent-updated
  sources: Source[]
}

export function ageLabel(asOf: string, now: Date): string {
  const t = asOf.length === 10 ? Date.parse(`${asOf}T00:00:00Z`) : Date.parse(asOf)
  const minutes = Math.max(0, Math.round((now.getTime() - t) / 60_000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

export function present(figure: FigureValue, phase: AgentPhase, now: Date): Presentation {
  const sources = sourcesOf(figure.source)
  const inFlight = phase === 'reading' || phase === 'building'
  // The source that makes the figure stale is the one whose age is shown:
  // a fixture, or the first past its TTL.
  const culprit = sources.find(s => s.fixture || (s.kind === 'api' && isExpired(s, now))) ?? null
  const expired = culprit !== null
  const status: FigureStatus = inFlight
    ? 'refreshing'
    : expired
      ? 'stale'
      : figure.status === 'agent-updated'
        ? 'agent-updated'
        : figure.status === 'unverified'
          ? 'unverified'
          : 'current'
  const direction =
    status === 'agent-updated' && figure.prev !== undefined
      ? figure.value > figure.prev
        ? 'up'
        : figure.value < figure.prev
          ? 'down'
          : null
      : null
  return {
    status,
    age: status === 'stale' && culprit ? ageLabel(culprit.asOf, now) : null,
    direction,
    sources,
  }
}
