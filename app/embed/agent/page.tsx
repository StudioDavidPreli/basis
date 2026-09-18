import { AGENT_PHASES, type AgentPhase } from '@/worker/refresh'
import { AgentPresence } from '@/components/agent-presence'
import styles from './stage.module.css'

// Chromeless: one AgentPresence in one phase, for the per-phase aria-label
// checks and screenshots (contracts/agent-presence.md, "Acceptance") and later
// for the Cadence "In Practice" page (M10).
//
//   /embed/agent?phase=idle|reading|building|waiting|done|error
//   &theme=passbook|operate&reduce=1
//
// Theme and reduce are read by the inline script in the layout, as on every
// page. Unlike `?fail=` on the refresh route this needs no BASIS_FIXTURES
// gate, because nothing is faked and nothing is fetched: the component is
// handed a prop, which is the whole of its input
// (decisions/2026-09-18-phases-through-an-embed-route.md).

export const dynamic = 'force-dynamic'

function phaseFrom(value: string | string[] | undefined): AgentPhase {
  return AGENT_PHASES.find(p => p === value) ?? 'idle'
}

export default async function EmbedAgent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const phase = phaseFrom((await searchParams)['phase'])
  return (
    <main className={styles.stage} data-phase={phase}>
      <h1 className="sr-only">Agent presence, {phase}</h1>
      <AgentPresence phase={phase} />
      <p className={`${styles.caption} type-eyebrow`}>{phase}</p>
    </main>
  )
}
