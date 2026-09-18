'use client'

import { config, entityStyleOf } from '@/lib/config'
import { useMotionTokens } from '@/lib/motion/tokens'
import { useTheme } from './use-theme'
import { Marker } from './marker'
import styles from './company-logo.module.css'

// The entity's mark in the ledger's name cell and on its own page
// (contracts/agent-presence.md, "Company logos"). Decorative: the name sits
// beside it and is the accessible label, so this is aria-hidden and carries no
// text of its own.
//
// There is no Rive here yet. The artboards land in their own session
// (decisions/2026-09-18-wrappers-before-artboards.md) and this file is the only
// one that will import the runtime for them. Until then the mark is the
// `Marker` that has sat beside the name since M2, and the wrapper is
// `display: contents`, so it is not in the layout at all and shipping it
// changes nothing on screen.
//
// One prop, an id: colour and marker are looked up rather than passed, so the
// call sites stay as they were and nothing can be handed a style that
// disagrees with its entity. A region resolves to no artboard — logos.riv
// holds one per company and the name cell renders both datasets — so it keeps
// its Marker for good, and that branch is here rather than in every caller.

export function hasArtboard(entityId: string): boolean {
  return config.companies.some(c => c.id === entityId)
}

type Props = {
  entityId: string
  // The entity's latest mutation `at`. Changing it fires the view model's
  // `pulse` once there is an artboard to fire it at; until then it rides on
  // the element, which is how a test proves the poll reaches the mark.
  pulseKey?: string | null
}

export function CompanyLogo({ entityId, pulseKey = null }: Props) {
  const { reducedMotion } = useMotionTokens()
  const theme = useTheme()
  const style = entityStyleOf(entityId)
  if (!style) return null
  return (
    <span
      className={styles.logo}
      aria-hidden="true"
      data-entity={entityId}
      data-artboard={hasArtboard(entityId) || undefined}
      data-theme-variant={theme}
      data-reduced={reducedMotion || undefined}
      data-pulse-key={pulseKey ?? undefined}
    >
      <Marker shape={style.marker} colors={{ light: style.color, dark: style.colorDark }} />
    </span>
  )
}
