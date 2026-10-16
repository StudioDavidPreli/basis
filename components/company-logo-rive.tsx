'use client'

import { useEffect } from 'react'
import { RuntimeLoader, useRive, useViewModel, useViewModelInstance, type Rive } from '@rive-app/react-canvas'
import { LOGO_STATE_MACHINE, LOGO_VIEW_MODEL, THEME_INSTANCE, type LogoArt } from '@/lib/logos'
import { RIVE_WASM, type Theme } from '@/app/theme-script'
import styles from './company-logo.module.css'

// The canvas half of CompanyLogo, and the only file that imports the Rive
// runtime for the logos. It is loaded with next/dynamic from company-logo.tsx
// and only mounted when motion is allowed, so under reduced motion the page
// fetches neither this chunk, nor the WASM, nor the .riv
// (contracts/agent-presence.md: reduced motion is outside the runtime).
//
// The runtime fetches its WASM from unpkg unless told otherwise; this one is
// copied from the installed package into public/ before every dev and build
// (scripts/rive-wasm.mjs). Module scope: set once, before the first load.
RuntimeLoader.setWasmUrl(RIVE_WASM)

type Props = {
  art: LogoArt & { riv: string }
  theme: Theme
  // Called once the canvas has drawn, so the poster under it can go. Not on
  // load: `rive` exists a frame before anything is painted.
  onPainted: () => void
  // The file failed to load, or loaded without the names the contract gives
  // it. The poster stays, and the reason is the console's.
  onFailed: (reason: string) => void
}

// The contract's names, read from the loaded file. A re-export that loses
// one would otherwise show the wrong theme or nothing, silently; this way the
// poster stays, and the e2e suite, which fails on a console error, says so.
function contractProblems(rive: Rive, art: LogoArt): string[] {
  const problems: string[] = []
  const artboard = rive.contents?.artboards?.find(a => a.name === art.artboard)
  if (!artboard) problems.push(`no artboard ${art.artboard}`)
  else if (!artboard.stateMachines.some(m => m.name === LOGO_STATE_MACHINE)) problems.push(`no state machine ${LOGO_STATE_MACHINE}`)
  const vm = rive.viewModelByName(LOGO_VIEW_MODEL)
  if (!vm) problems.push(`no view model ${LOGO_VIEW_MODEL}`)
  else for (const name of Object.values(THEME_INSTANCE)) if (!vm.instanceNames.includes(name)) problems.push(`no instance ${name}`)
  return problems
}

export default function CompanyLogoRive({ art, theme, onPainted, onFailed }: Props) {
  const { rive, RiveComponent } = useRive({
    src: art.riv,
    artboard: art.artboard,
    stateMachine: LOGO_STATE_MACHINE,
    autoplay: true,
    autoBind: false,
    onLoadError: () => onFailed(`${art.riv} did not load`),
  })

  // The theme is an instance, not a value: bind the one the theme names and
  // rebind on a switch, on the same canvas. Nothing else is written; every
  // property on the view model keeps the value it was authored with.
  const viewModel = useViewModel(rive, { name: LOGO_VIEW_MODEL })
  useViewModelInstance(viewModel, { name: THEME_INSTANCE[theme], rive })

  // Two frames after the runtime hands back an instance, the first draw has
  // happened. Decided from `rive` itself, so a second run under Strict Mode
  // waits its own two frames rather than trusting a flag from the first.
  useEffect(() => {
    if (!rive) return
    const problems = contractProblems(rive, art)
    if (problems.length > 0) {
      onFailed(`${art.riv}: ${problems.join(', ')} (contracts/agent-presence.md)`)
      return
    }
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(onPainted)
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [rive, art, onPainted, onFailed])

  return <RiveComponent className={styles.canvas} aria-hidden="true" />
}
