'use client'

// The full page a hard load of /company/[id] or /region/[id] renders
// (docs/spec.md, "Drawer": hard load renders a full page). Same body as
// the drawer, under the page's own heading, with a way back to the sheet.

import Link from 'next/link'
import type { EntityDetail } from '@/lib/entity-detail'
import type { AgentPhase } from '@/worker/refresh'
import { EntityDetailBody } from './entity-detail-body'
import { Marker } from './marker'
import { useNow } from './use-now'
import styles from './entity-page.module.css'

type Props = { detail: EntityDetail; renderedAt: string; phase: AgentPhase }

export function EntityPage({ detail, renderedAt, phase }: Props) {
  const now = useNow(renderedAt)
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Sheet">
        <Link href="/" className={`${styles.back} type-action`}>
          [ ← Basis ]
        </Link>
      </nav>
      <header className={styles.head}>
        <p className={`${styles.kind} type-eyebrow`}>
          {detail.kind === 'company' ? 'Company' : 'Region'} · {detail.datasetLabel}
        </p>
        <h1 className={`${styles.title} type-figure-lg`}>
          <Marker shape={detail.marker} colors={detail.colors} />
          {detail.name}
        </h1>
      </header>
      <EntityDetailBody detail={detail} now={now} phase={phase} headings="h2" />
    </main>
  )
}
