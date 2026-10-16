'use client'

import { createElement, useCallback, useEffect, useState, type ComponentType } from 'react'
import type { Props as RiveProps } from './basis-title-rive'
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

// The canvas module, its own chunk, loaded from an effect and kept for the
// page: not next/dynamic, which is React.lazy in a Suspense boundary, and
// react-dom holds a boundary's content for 300 ms after its fallback showed,
// a null fallback included. The chunk arrives in about 30 ms; the canvas
// waited out the rest (decisions/2026-10-16-the-title-loads-without-
// suspense.md). The logos keep next/dynamic: their poster is already the
// right picture, so the hold costs them nothing on screen. Under reduced
// motion the effect never runs, so the page still fetches no runtime.
let loadedRive: ComponentType<RiveProps> | null = null

// A fixed component over the loaded module, so the element below keeps one
// identity and nothing is created during render. Rendered only once `ready`
// says the module is there. createElement rather than JSX: the React
// Compiler folds an alias of the module variable into the JSX tag, which
// the JSX transform then reads as a lowercase HTML tag name.
function LoadedRive(props: RiveProps) {
  return loadedRive ? createElement(loadedRive, props) : null
}

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
  const [ready, setReady] = useState(() => loadedRive !== null)
  useEffect(() => {
    if (!animate || ready) return
    let current = true
    import('./basis-title-rive').then(
      m => {
        loadedRive = m.default
        if (current) setReady(true)
      },
      () => {
        if (current) onFailed('the canvas module did not load')
      },
    )
    return () => {
      current = false
    }
  }, [animate, ready, onFailed])
  const poster = animate ? TITLE.textPosters[theme] : TITLE.posters[theme]
  return (
    <div className={styles.title} aria-hidden="true" data-title={animate ? (state === 'painted' ? 'animated' : 'pending') : 'poster'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.poster} src={poster} alt="" width={TITLE.width} height={TITLE.height} />
      {animate && ready && <LoadedRive theme={theme} onPainted={onPainted} onFailed={onFailed} />}
    </div>
  )
}
