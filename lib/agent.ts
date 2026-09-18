// From the phase the handler stored to the phase the reader sees
// (contracts/agent-presence.md, "Phase semantics"). Pure, so the server
// render and the client render agree, and so the rules are tested once here
// rather than in every component that shows the mark.
//
// Two of the six phases are not the handler's to write:
//
//   idle     no run in the last IDLE_AFTER and the last one succeeded. A run
//            never ends `idle`; `done` becomes it by a clock, and the clock
//            that matters is the reader's, so only a reader can say when.
//   reading  written once at the start of a run and overwritten at its end,
//            inside one awaited handler, while the poll is 60 s. The one
//            moment a reader can observe a run is the refresh that reader
//            started, and the client knows about that before KV does
//            (decisions/2026-09-18-coarse-agent-progress.md).

import type { AgentPhase, AgentState } from '@/worker/refresh'

export const IDLE_AFTER_MS = 5 * 60_000

export function agentPhase(agent: AgentState | null, now: Date, refreshing: boolean): AgentPhase {
  if (refreshing) return 'reading'
  if (!agent) return 'idle'
  // `waiting` and `error` never age out: both say the reader has something to
  // do about them, and both stand until a run replaces them. `reading` and
  // `building` pass through, for the poll that does catch a run mid-flight.
  if (agent.phase !== 'done') return agent.phase
  // A `done` with no `finishedAt` is not a shape the handler writes; it is
  // still not a reason to claim five minutes have passed.
  if (!agent.finishedAt) return 'done'
  return now.getTime() - Date.parse(agent.finishedAt) >= IDLE_AFTER_MS ? 'idle' : 'done'
}
