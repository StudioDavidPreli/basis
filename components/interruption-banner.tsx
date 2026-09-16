'use client'

import type { AgentState } from '@/worker/refresh'
import styles from './interruption-banner.module.css'

// The service-interruption surface (docs/spec.md), three levels plus the
// cold-start case, every sentence composed from the snapshot's record.
// Provider names come from that record, which the handler filled from the
// config; nothing here is typed by hand. role="status": a polite live
// region, announced when it appears. Errors carry no accent and no
// illustration.

type Props = { agent: AgentState | null; cold: boolean; onRetry: () => void; busy: boolean }

function timeOf(iso: string | null): string {
  if (!iso) return 'an unknown time'
  return `${iso.slice(11, 16)} UTC`
}

export function interruptionCopy(agent: AgentState | null, cold: boolean): { lead: string; detail: string } | null {
  if (agent?.phase === 'error') {
    return {
      lead: `The last refresh failed at ${timeOf(agent.finishedAt)}.`,
      detail: agent.lastSuccessAt ? `Showing values from ${timeOf(agent.lastSuccessAt)}.` : 'Showing the last stored values.',
    }
  }
  const i = agent?.interruption
  if (i && i.level === 'all') {
    return {
      lead: 'No source is answering.',
      detail: `Every figure shows its recorded fallback. ${i.lastGoodAt ? `Last good run ${timeOf(i.lastGoodAt)}.` : 'No live run has completed yet.'}`,
    }
  }
  if (i && i.level === 'source') {
    const f = i.failures[0]!
    const count = new Set(i.failures.map(x => x.driver)).size
    const figures = count === 1 ? 'Figures on that source' : `Figures on those ${count} sources`
    return {
      lead: `${i.providers.join(' and ')} ${i.providers.length === 1 ? 'is' : 'are'} not answering (${f.error.replace(/^Error: /, '')} at ${timeOf(i.at)}).`,
      detail: `${figures} show their recorded fallback and read stale. ${i.lastGoodAt ? `Last good run ${timeOf(i.lastGoodAt)}.` : ''}`.trim(),
    }
  }
  if (cold) {
    return {
      lead: 'No snapshot yet.',
      detail: 'The board rendered from recorded fixtures; every figure reads stale until the first live refresh.',
    }
  }
  return null
}

export function InterruptionBanner({ agent, cold, onRetry, busy }: Props) {
  const copy = interruptionCopy(agent, cold)
  if (!copy) return null
  return (
    <div className={styles.banner} role="status">
      <p className={`${styles.text} type-body`}>
        <span className={styles.lead}>{copy.lead}</span> {copy.detail}
      </p>
      <button type="button" className={`${styles.retry} type-action`} onClick={onRetry} disabled={busy}>
        [ Retry ]
      </button>
    </div>
  )
}
