'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import dynamic from 'next/dynamic'
import { entityStyleOf } from '@/lib/config'
import { logoArt } from '@/lib/logos'
import { useMotionTokens } from '@/lib/motion/tokens'
import { useTheme } from './use-theme'
import { Marker } from './marker'
import styles from './company-logo.module.css'

// The entity's mark in the ledger's name cell and on its own page
// (contracts/agent-presence.md, "Company logos"). Decorative: the name sits
// beside it and is the accessible label, so this is aria-hidden and carries no
// text of its own.
//
// A company shows the most it has: its animation, else its poster, else its
// Marker; a region always has the Marker. The poster is three things at once:
// the mark under reduced motion, the placeholder until the canvas has drawn,
// and the mark for good if the file fails. Both posters are in the HTML and
// the stylesheet shows the theme's, so the first paint is right on either
// stock without waiting for the theme hook.
//
// The canvas is a separate module, loaded only when it mounts, and it only
// mounts on the client with motion allowed: under reduced motion the page
// fetches no runtime, no WASM and no .riv.

const CompanyLogoRive = dynamic(() => import('./company-logo-rive'), { ssr: false })

// Sizes in px, the box the canvas and the poster share. Decided in the build
// session (docs/logos.md, rule 4): the ledger row and the entity heading.
export const LOGO_SIZE = { drawer: 500, heading: 32 } as const

// true only after hydration. Through hydration the reduced-motion flag still
// reads its server value, false, and mounting the canvas on that would start
// the runtime's download before the flag could say no.
const noop = () => () => {}
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}

type Props = {
  entityId: string
  size?: number
}

export function CompanyLogo({ entityId, size = LOGO_SIZE.drawer }: Props) {
  const { reducedMotion } = useMotionTokens()
  const theme = useTheme()
  const hydrated = useHydrated()
  const [state, setState] = useState<'poster' | 'painted' | 'failed'>('poster')
  const onPainted = useCallback(() => setState(s => (s === 'failed' ? s : 'painted')), [])
  const onFailed = useCallback((reason: string) => {
    console.error(`CompanyLogo: ${reason}`)
    setState('failed')
  }, [])

  const style = entityStyleOf(entityId)
  if (!style) return null
  const art = logoArt(entityId)

  if (!art) {
    return (
      <span className={styles.marker} aria-hidden="true" data-entity={entityId}>
        <Marker shape={style.marker} colors={{ light: style.color, dark: style.colorDark }} />
      </span>
    )
  }

  const riv = art.riv
  const animate = riv !== null && hydrated && !reducedMotion && state !== 'failed'
  return (
    <span
      className={styles.logo}
      aria-hidden="true"
      data-entity={entityId}
      data-artboard={art.artboard}
      data-riv={riv ?? undefined}
      data-logo={animate && state === 'painted' ? 'animated' : 'poster'}
      style={{ width: size }}
    >
      {/* Plain <img>: a two-ink SVG has nothing for an image optimiser to do,
          and next/image would need a loader on Workers to do nothing. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.posterLight} src={art.posters.passbook} alt="" width={size} height={size} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.posterDark} src={art.posters.operate} alt="" width={size} height={size} />
      {animate && <CompanyLogoRive art={{ ...art, riv }} theme={theme} onPainted={onPainted} onFailed={onFailed} />}
    </span>
  )
}
