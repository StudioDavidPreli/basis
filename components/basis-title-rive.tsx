'use client'

import { useEffect } from 'react'
import { RuntimeLoader, useRive, useViewModel, useViewModelInstance, type Rive } from '@rive-app/react-canvas'
import { TITLE } from '@/lib/logos'
import type { Theme } from '@/app/theme-script'
import styles from './basis-title.module.css'

// The Basis title's canvas (contracts/agent-presence.md, "Basis title"). The
// same runtime and the same shape of check as the logos' canvas
// (company-logo-rive.tsx): the file is checked against the contract on load,
// and the wrapper is told once two frames have drawn.

RuntimeLoader.setWasmUrl('/rive/rive.wasm')

type Props = {
  theme: Theme
  onPainted: () => void
  onFailed: (reason: string) => void
}

function contractProblems(rive: Rive): string[] {
  const problems: string[] = []
  const artboard = rive.contents?.artboards?.find(a => a.name === TITLE.artboard)
  if (!artboard) problems.push(`no artboard ${TITLE.artboard}`)
  else if (!artboard.stateMachines.some(m => m.name === TITLE.stateMachine)) problems.push(`no state machine ${TITLE.stateMachine}`)
  const vm = rive.viewModelByName(TITLE.viewModel)
  if (!vm) problems.push(`no view model ${TITLE.viewModel}`)
  else for (const name of Object.values(TITLE.instances)) if (!vm.instanceNames.includes(name)) problems.push(`no instance ${name}`)
  return problems
}

export default function BasisTitleRive({ theme, onPainted, onFailed }: Props) {
  const { rive, RiveComponent } = useRive({
    src: TITLE.riv,
    artboard: TITLE.artboard,
    stateMachine: TITLE.stateMachine,
    autoplay: true,
    autoBind: false,
    onLoadError: () => onFailed(`${TITLE.riv} did not load`),
  })

  const viewModel = useViewModel(rive, { name: TITLE.viewModel })
  useViewModelInstance(viewModel, { name: TITLE.instances[theme], rive })

  useEffect(() => {
    if (!rive) return
    const problems = contractProblems(rive)
    if (problems.length > 0) {
      onFailed(`${TITLE.riv}: ${problems.join(', ')} (contracts/agent-presence.md)`)
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
  }, [rive, onPainted, onFailed])

  return <RiveComponent className={styles.canvas} aria-hidden="true" />
}
