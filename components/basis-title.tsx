'use client'

import { useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { TITLE } from '@/lib/logos'
import { useMotionTokens } from '@/lib/motion/tokens'
import { useTheme } from './use-theme'
import styles from './basis-title.module.css'

// The Basis title in the welcome dialog (contracts/agent-presence.md, "Basis
// title"; decisions/2026-10-15-rive-for-the-basis-title.md and
// 2026-10-16-the-text-poster-is-the-placeholder.md). Decorative: the
// dialog's hidden <h2> carries the same words, so this is aria-hidden.
//
// Two posters, one shown at a time. Under motion the text poster, frame 0
// of the entrance, is on screen from the dialog's first paint until the
// canvas has drawn its first frame, which is the same two lines in the same
// place; then the markers enter over the held title. Under reduced motion,
// and if the file fails, the rest-pose poster is the title, markers in.
// The dialog mounts this only once open, after hydration, so the theme and
// the reduced-motion flag it reads are the real ones, and one <img> whose
// source follows them fetches one file, never the posters that cannot show.

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
  const poster = animate ? TITLE.textPosters[theme] : TITLE.posters[theme]
  return (
    <div className={styles.title} aria-hidden="true" data-title={animate ? (state === 'painted' ? 'animated' : 'pending') : 'poster'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.poster} src={poster} alt="" width={TITLE.width} height={TITLE.height} />
      {animate && <BasisTitleRive theme={theme} onPainted={onPainted} onFailed={onFailed} />}
    </div>
  )
}
