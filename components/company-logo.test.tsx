// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { config } from '@/lib/config'
import { POSTERS, logoArt } from '@/lib/logos'

// contracts/agent-presence.md, "Company logos". The canvas half is a stub
// here: what these prove is the wrapper's choice of mark, which needs no
// runtime. The stub records what it was handed and exposes the two callbacks,
// so a test can play the canvas drawing or the file failing.
const mounts: { theme: string; onPainted: () => void; onFailed: (r: string) => void }[] = []
vi.mock('./company-logo-rive', () => ({
  default: (props: { theme: string; onPainted: () => void; onFailed: (r: string) => void }) => {
    mounts.push(props)
    return <canvas data-stub />
  },
}))

const { CompanyLogo } = await import('./company-logo')

const animated = config.companies.find(c => logoArt(c.id)?.riv)!
const bare = config.companies.find(c => !POSTERS.has(c.id))
const region = config.regions[0]!

describe('CompanyLogo', () => {
  // Unmounted after each, or an earlier test's logo re-renders on this one's
  // attribute change and its canvas lands in `mounts`.
  afterEach(cleanup)

  beforeEach(() => {
    mounts.length = 0
    document.documentElement.setAttribute('data-reduce-motion', '0')
    document.documentElement.setAttribute('data-theme', 'passbook')
  })

  it('is decorative: the name beside it is the accessible label', () => {
    const { container } = render(<CompanyLogo entityId={animated.id} />)
    expect(container.querySelector('[data-entity]')!.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('')
  })

  it('a company with art shows both posters in its box, named by its key', () => {
    const { container } = render(<CompanyLogo entityId={animated.id} size={32} />)
    const art = logoArt(animated.id)!
    const box = container.querySelector<HTMLElement>('[data-entity]')!
    expect(box.getAttribute('data-artboard')).toBe(animated.id)
    expect(box.style.width).toBe('32px')
    expect([...container.querySelectorAll('img')].map(i => i.getAttribute('src'))).toEqual([art.posters.passbook, art.posters.operate])
  })

  it('a region, and a company with nothing delivered, keep their Marker', () => {
    for (const id of [region.id, bare?.id].filter(Boolean) as string[]) {
      const { container, unmount } = render(<CompanyLogo entityId={id} />)
      expect(container.querySelector('[data-entity]')!.hasAttribute('data-artboard')).toBe(false)
      expect(container.querySelector('svg')).not.toBeNull()
      expect(container.querySelector('img')).toBeNull()
      unmount()
    }
  })

  it('every entity in the config resolves, so no name cell can render empty', () => {
    for (const e of [...config.companies, ...config.regions]) {
      const { container, unmount } = render(<CompanyLogo entityId={e.id} />)
      expect(container.querySelector('svg, img')).not.toBeNull()
      unmount()
    }
  })

  it('an id that names nothing renders nothing rather than a wrong mark', () => {
    const { container } = render(<CompanyLogo entityId="not-an-entity" />)
    expect(container.querySelector('[data-entity]')).toBeNull()
  })

  it('under reduced motion the canvas never mounts', async () => {
    document.documentElement.setAttribute('data-reduce-motion', '1')
    const { container } = render(<CompanyLogo entityId={animated.id} />)
    await act(async () => {})
    expect(mounts).toHaveLength(0)
    expect(container.querySelector('[data-entity]')!.getAttribute('data-logo')).toBe('poster')
  })

  it('with motion allowed the canvas mounts with the theme, and replaces the poster once it has drawn', async () => {
    document.documentElement.setAttribute('data-theme', 'operate')
    const { container } = render(
      <StrictMode>
        <CompanyLogo entityId={animated.id} />
      </StrictMode>,
    )
    await waitFor(() => expect(mounts.length).toBeGreaterThan(0))
    expect(mounts.at(-1)!.theme).toBe('operate')
    const box = container.querySelector('[data-entity]')!
    expect(box.getAttribute('data-logo')).toBe('poster')
    act(() => mounts.at(-1)!.onPainted())
    expect(box.getAttribute('data-logo')).toBe('animated')
    expect(container.querySelectorAll('[data-entity]')).toHaveLength(1)
  })

  it('a file that fails keeps the poster and says why', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(<CompanyLogo entityId={animated.id} />)
    await waitFor(() => expect(mounts.length).toBeGreaterThan(0))
    act(() => mounts.at(-1)!.onFailed('no artboard x'))
    expect(container.querySelector('[data-stub]')).toBeNull()
    expect(container.querySelector('[data-entity]')!.getAttribute('data-logo')).toBe('poster')
    expect(error).toHaveBeenCalledWith(expect.stringContaining('no artboard x'))
    error.mockRestore()
  })
})
