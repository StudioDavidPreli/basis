// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { StrictMode } from 'react'
import { render } from '@testing-library/react'
import { CompanyLogo, hasArtboard } from './company-logo'
import { config } from '@/lib/config'

// contracts/agent-presence.md, "Acceptance": the wrapper renders with the
// runtime absent. Absent is the only state there is until the artboards land,
// and it stays a real state after: every first paint is the fallback until the
// canvas loads.

const company = config.companies[0]!
const region = config.regions[0]!

describe('CompanyLogo with no runtime', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-reduce-motion', '0')
    document.documentElement.setAttribute('data-theme', 'passbook')
  })

  it('is decorative: the name beside it is the accessible label', () => {
    const { container } = render(<CompanyLogo entityId={company.id} />)
    expect(container.querySelector('[data-entity]')!.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('')
  })

  it('draws the entity its id names, without being handed a style', () => {
    const { container } = render(<CompanyLogo entityId={company.id} />)
    const svg = container.querySelector('svg')!
    expect(svg).not.toBeNull()
    expect(container.querySelector('[data-entity]')!.getAttribute('data-entity')).toBe(company.id)
  })

  it('a company has an artboard to come; a region never will', () => {
    expect(hasArtboard(company.id)).toBe(true)
    expect(hasArtboard(region.id)).toBe(false)
    const { container } = render(<CompanyLogo entityId={region.id} />)
    expect(container.querySelector('[data-entity]')!.hasAttribute('data-artboard')).toBe(false)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('every entity in the config resolves, so no name cell can render empty', () => {
    for (const e of [...config.companies, ...config.regions]) {
      const { container, unmount } = render(<CompanyLogo entityId={e.id} />)
      expect(container.querySelector('svg')).not.toBeNull()
      unmount()
    }
  })

  it('an id that names nothing renders nothing rather than a wrong mark', () => {
    const { container } = render(<CompanyLogo entityId="not-an-entity" />)
    expect(container.querySelector('[data-entity]')).toBeNull()
  })

  it('carries the pulse key and the read view-model values, once, under Strict Mode', () => {
    document.documentElement.setAttribute('data-theme', 'operate')
    const { container } = render(
      <StrictMode>
        <CompanyLogo entityId={company.id} pulseKey="2026-09-18T16:25:14.129Z" />
      </StrictMode>,
    )
    const marks = container.querySelectorAll('[data-entity]')
    expect(marks).toHaveLength(1)
    expect(marks[0]!.getAttribute('data-pulse-key')).toBe('2026-09-18T16:25:14.129Z')
    expect(marks[0]!.getAttribute('data-theme-variant')).toBe('operate')
  })
})
