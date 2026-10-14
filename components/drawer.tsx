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
import { CompanyLogo, LOGO_SIZE } from './company-logo'
import { logoArt } from '@/lib/logos'
import { CloseIcon, IconButton } from './icon-button'
import { ScrambleText, resetScrambleStores } from './scramble-text'
import { DRAWER_HEADING_ID, DRAWER_SCRAMBLE_KEY, rowLinkSelector } from './drawer-shell'
import { EXITING } from './drawer-exit'
import { useNow } from './use-now'
import styles from './drawer.module.css'

type Props = { detail: EntityDetail; renderedAt: string; phase: AgentPhase }

export function Drawer({ detail, renderedAt, phase }: Props) {
  const router = useRouter()
  const now = useNow(renderedAt)
  const heading = useRef<HTMLHeadingElement>(null)

  const id = detail.id
  useEffect(() => {
    // preventScroll: on open the panel is still off to the right, and the
    // browser's scroll-into-view on focus would scroll the dialog to it,
    // cancelling the slide frame by frame. The heading arrives with the
    // panel.
    heading.current?.focus({ preventScroll: true })
    return () => {
      // Another drawer open means a switch, not a close. The one on its
      // way out still carries `open` (the stylesheet needs it) and is
      // re-appended by DrawerExit from a microtask that can land before or
      // after this cleanup depending on the scheduler's slice; its marker
      // is set before the re-append, so it is never mistaken for a switch.
      if (document.querySelector(`dialog[open]:not([${EXITING}])`)) return
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
        {logoArt(detail.id) && <CompanyLogo entityId={detail.id} size={LOGO_SIZE.drawer} />}
        <h2 id={DRAWER_HEADING_ID} ref={heading} tabIndex={-1} className={`${styles.title} type-figure-lg`} data-drawer-heading>
          <Marker shape={detail.marker} colors={detail.colors} />
          <ScrambleText persistKey={`${key}:name`} text={detail.name} />
        </h2>
      </header>
      <EntityDetailBody detail={detail} now={now} phase={phase} headings="h3" scrambleKey={key} />
    </>
  )
}
