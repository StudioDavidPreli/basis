'use client'

// The drawer's content, one entity (docs/spec.md, "Drawer"): the eyebrow,
// the close control top right, the heading, then the shared body. The
// <dialog> and the panel around it are the DrawerShell in the slot's
// layout, which persists across entity switches while this remounts, so
// the heading takes focus on every mount (open, and each switch) and the
// texts scramble into the next entity's through stores keyed to survive
// the remount.

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { EntityDetail } from '@/lib/entity-detail'
import type { AgentPhase } from '@/worker/refresh'
import { EntityDetailBody } from './entity-detail-body'
import { Marker } from './marker'
import { CloseIcon, IconButton } from './icon-button'
import { ScrambleText, resetScrambleStores } from './scramble-text'
import { DRAWER_HEADING_ID, DRAWER_SCRAMBLE_KEY, rowLinkSelector } from './drawer-shell'
import { useNow } from './use-now'
import styles from './drawer.module.css'

type Props = { detail: EntityDetail; renderedAt: string; phase: AgentPhase }

export function Drawer({ detail, renderedAt, phase }: Props) {
  const router = useRouter()
  const now = useNow(renderedAt)
  const heading = useRef<HTMLHeadingElement>(null)

  const id = detail.id
  useEffect(() => {
    heading.current?.focus()
    return () => {
      if (document.querySelector('dialog[open]')) return
      document.querySelector<HTMLElement>(rowLinkSelector(id))?.focus()
      resetScrambleStores(DRAWER_SCRAMBLE_KEY)
    }
  }, [id])

  const close = () => router.back()
  const key = DRAWER_SCRAMBLE_KEY

  return (
    <>
      <header className={styles.head}>
        <div className={styles.topRow}>
          <ScrambleText as="p" className={`${styles.kind} type-eyebrow`} persistKey={`${key}:kind`} text={`${detail.kind === 'company' ? 'Company' : 'Region'} · ${detail.datasetLabel}`} />
          <IconButton onClick={close} aria-label={`Close ${detail.name}`}>
            <CloseIcon />
          </IconButton>
        </div>
        <h2 id={DRAWER_HEADING_ID} ref={heading} tabIndex={-1} className={`${styles.title} type-figure-lg`} data-drawer-heading>
          <Marker shape={detail.marker} colors={detail.colors} />
          <ScrambleText persistKey={`${key}:name`} text={detail.name} />
        </h2>
      </header>
      <EntityDetailBody detail={detail} now={now} phase={phase} headings="h3" scrambleKey={key} />
    </>
  )
}
