// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render, waitFor } from '@testing-library/react'
import { ScrambleText, resetScrambleStores } from './scramble-text'

// The drawer's case: the component unmounts and a new one mounts on the
// same persisted store, and under development Strict Mode the new mount
// runs its layout effect twice. The first cleanup stopped the clock at
// progress zero and the second run once trusted the store's target and
// returned, freezing the text on its first noise frame (commit dffe9e2).

const KEY = 'test:name'

describe('ScrambleText under Strict Mode', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-reduce-motion', '0')
    resetScrambleStores('test')
  })

  it('churns from the old text to the new one and settles', async () => {
    const first = render(
      <StrictMode>
        <ScrambleText persistKey={KEY} text="Anchor Kaze" />
      </StrictMode>,
    )
    expect(first.container.textContent).toBe('Anchor Kaze')
    first.unmount()

    const second = render(
      <StrictMode>
        <ScrambleText persistKey={KEY} text="Keel London" />
      </StrictMode>,
    )
    // In flight: the real text for assistive tech, noise for the eye.
    expect(second.container.querySelector('.sr-only')?.textContent).toBe('Keel London')
    const glyphs = second.container.querySelector('[aria-hidden="true"]')
    expect(glyphs).not.toBeNull()
    expect(glyphs!.textContent).not.toBe('Keel London')
    // Settled: plain text, no hidden copy, within the slower duration.
    await waitFor(() => expect(second.container.innerHTML).toBe('<span>Keel London</span>'), { timeout: 3000 })
  })

  it('just changes under reduced motion', () => {
    document.documentElement.setAttribute('data-reduce-motion', '1')
    const first = render(
      <StrictMode>
        <ScrambleText persistKey={KEY} text="Anchor Kaze" />
      </StrictMode>,
    )
    first.unmount()
    const second = render(
      <StrictMode>
        <ScrambleText persistKey={KEY} text="Keel London" />
      </StrictMode>,
    )
    expect(second.container.innerHTML).toBe('<span>Keel London</span>')
  })
})
