'use client'

import { config } from '@/lib/config'
import type { StoredSnapshot } from '@/worker/refresh'
import { ageLabel } from '@/lib/present'
import styles from './footnotes.module.css'

// The passbook's footnotes: circle bullets, small type, the facts a reader
// needs about the sheet. Sources come from the config, the run time from
// the snapshot. The no-LLM sentence CLAUDE.md asks for lives in the README.
export function Footnotes({ snapshot, now }: { snapshot: StoredSnapshot | null; now: Date }) {
  const providers = [...new Set(Object.values(config.drivers).map(d => `${d.provider} (${d.cadence})`))]
  return (
    <footer className={styles.footnotes}>
      <ul className={`${styles.list} type-micro`}>
        <li>Sources: {providers.join(', ')}.</li>
        <li>The agent is a scheduled job: it fetches the sources, recomputes, and records what changed.</li>
        <li>{snapshot ? `Last run ${ageLabel(snapshot.at, now)}, phase ${snapshot.agent.phase}.` : 'No run recorded yet.'}</li>
        <li>Companies and regions are simulated; their drivers are real.</li>
      </ul>
    </footer>
  )
}
