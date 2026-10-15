'use client'

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { TITLE } from '@/lib/logos'
import { useMotionTokens } from '@/lib/motion/tokens'
import { useTheme } from './use-theme'
import styles from './basis-title.module.css'

// The Basis title in the welcome dialog (contracts/agent-presence.md, "Basis
// title"; decisions/2026-10-15-rive-for-the-basis-title.md). Decorative: the
// dialog's hidden <h2> carries the same words, so this is aria-hidden.
//
// Unlike a logo, the poster is not the placeholder. The animation plays from
// empty to settled, and the poster is the settled frame, so under motion the
// box stays empty until the canvas has drawn and the markers' entrance plays
// from its start. The poster is the title under reduced motion and if the
// file fails. The dialog mounts this only once open, after hydration, so the
// reduced-motion flag it reads is the real one.

const BasisTitleRive = dynamic(() => import('./basis-title-rive'), { ssr: false })

export function BasisTitle() {
  const { reducedMotion } = useMotionTokens()
  const theme = useTheme()
  const [state, setState] = useState<'pending' | 'painted' | 'failed'>('pending')
  const onPainted = useCallback(() => setState(s => (s === 'failed' ? s : 'painted')), [])
  const onFailed = useCallback((reason: string) => {
    console.error(`BasisTitle: ${reason}`)
    setState('failed')
  }, [])

  const animate = !reducedMotion && state !== 'failed'
  return (
    <div className={styles.title} aria-hidden="true" data-title={animate ? (state === 'painted' ? 'animated' : 'pending') : 'poster'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.posterLight} src={TITLE.posters.passbook} alt="" width={TITLE.width} height={TITLE.height} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.posterDark} src={TITLE.posters.operate} alt="" width={TITLE.width} height={TITLE.height} />
      {animate && <BasisTitleRive theme={theme} onPainted={onPainted} onFailed={onFailed} />}
    </div>
  )
}
