'use client'

// The provenance list, shared by the popover and the drawer: every source
// with the provider, the reference, the provider's own asOf, the cadence,
// the TTL, and the actual request as a link that opens. Nothing here is
// fabricated: a source with no url renders none.

import type { Source } from '@/lib/types'
import { ttlLabel } from '@/lib/describe'
import styles from './source-list.module.css'

// A date stays a date; a timestamp reads as the sheet's date line does.
export function when(iso: string): string {
  return iso.length === 10 ? iso : `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

export function SourceList({ sources }: { sources: Source[] }) {
  return (
    <ol className={styles.list}>
      {sources.map((s, i) => (
        <li key={i} className={styles.source}>
          <span className={`${styles.provider} type-label`}>
            {s.provider}
            {s.fixture && <span className={`${styles.tag} type-micro`}> recorded fallback</span>}
          </span>
          <span className={`${styles.ref} type-micro`}>{s.ref}</span>
          <span className={`${styles.meta} type-micro`}>
            as of {when(s.asOf)} · {s.cadence} · stale after {ttlLabel(s.ttlMs)}
          </span>
          {s.url && (
            <a className={`${styles.link} type-micro`} href={s.url} target="_blank" rel="noreferrer">
              open the request ↗
            </a>
          )}
        </li>
      ))}
    </ol>
  )
}
