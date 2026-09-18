// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { AgentPresence, PHASE_LABEL } from './agent-presence'
import { AGENT_PHASES } from '@/worker/refresh'

// contracts/agent-presence.md, "Acceptance": both wrappers render with the
// runtime absent. Absent is the only state there is until the artboards land
// (decisions/2026-09-18-wrappers-before-artboards.md), so this is the whole
// component for now — and it must keep passing once the Rive import is there
// and the canvas has not loaded yet, which is the case every first paint.

describe('AgentPresence with no runtime', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-reduce-motion', '0')
    document.documentElement.setAttribute('data-theme', 'passbook')
  })

  it('labels every phase, and the label is the phase name and never a count', () => {
    for (const phase of AGENT_PHASES) {
      const { container, unmount } = render(<AgentPresence phase={phase} />)
      const mark = container.querySelector('[role="img"]')!
      expect(mark.getAttribute('aria-label')).toBe(PHASE_LABEL[phase])
      expect(mark.getAttribute('aria-label')).not.toMatch(/\d/)
      expect(mark.getAttribute('data-phase')).toBe(phase)
      unmount()
    }
  })

  it('carries the coarse progress the artboard binds', () => {
    const { container: reading } = render(<AgentPresence phase="reading" />)
    expect(reading.querySelector('[role="img"]')!.getAttribute('data-progress')).toBe('0')
    const { container: done } = render(<AgentPresence phase="done" />)
    expect(done.querySelector('[role="img"]')!.getAttribute('data-progress')).toBe('1')
  })

  it('reads the theme rather than taking it, because a canvas cannot read CSS variables', () => {
    document.documentElement.setAttribute('data-theme', 'operate')
    const { container } = render(<AgentPresence phase="done" />)
    expect(container.querySelector('[role="img"]')!.getAttribute('data-theme-variant')).toBe('operate')
  })

  it('lands on one mark under Strict Mode, run and run again', () => {
    const { container } = render(
      <StrictMode>
        <AgentPresence phase="waiting" pulseKey="2026-09-18T16:25:14.129Z" />
      </StrictMode>,
    )
    const mark = container.querySelector('[role="img"]')!
    expect(mark.getAttribute('aria-label')).toBe('Agent waiting for a manual refresh')
    expect(mark.getAttribute('data-pulse-key')).toBe('2026-09-18T16:25:14.129Z')
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(1)
  })

  it('the dot is decorative: the label is the whole accessible name', () => {
    const { container } = render(<AgentPresence phase="error" />)
    expect(container.querySelector('[role="img"] > span')!.getAttribute('aria-hidden')).toBe('true')
  })
})
