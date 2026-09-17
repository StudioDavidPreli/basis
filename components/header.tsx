'use client'

import { useSyncExternalStore } from 'react'
import { THEMES, THEME_KEY, type Theme } from '@/app/theme-script'
import { IconButton } from './icon-button'
import styles from './header.module.css'

type Props = {
  datasets: Array<{ id: string; label: string }>
  active: string
  onDataset: (id: string) => void
  busy: boolean
  onRefresh: () => void
  date: string
}

// The theme is the data-theme attribute the inline script set, read as an
// external store (the same pattern as the reduced-motion flag in
// lib/motion/tokens.ts): the server snapshot is the first stock, hydration
// uses it, the client snapshot takes over with no mismatch. The toggle
// writes the attribute and stores the choice for the next visit.
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}
function readTheme(): Theme {
  const t = document.documentElement.getAttribute('data-theme')
  return t === 'operate' ? 'operate' : 'passbook'
}
function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'passbook' as Theme)
  const toggle = () => {
    const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {}
  }
  return [theme, toggle]
}

// The last refresh, as the sheet's date line: date and time in UTC, the
// zone every timestamp on the sheet uses, so the server and the client
// render the same string.
function stamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

// The refresh arrow: one curved stroke with a head, in the current ink.
// While a refresh runs it turns on the slower duration (CSS, tokens).
function RefreshArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M13 8a5 5 0 1 1-1.5-3.6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M13 2.5v3h-3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Sun and moon, drawn once, in the current ink. The sun shows on the dark
// stock (the way out), the moon on the light one.
function SunMoon({ theme }: { theme: Theme }) {
  const stroke = 'currentColor'
  return theme === 'operate' ? (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="3.2" fill="none" stroke={stroke} strokeWidth="1.2" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M10.5 2.2a6 6 0 1 0 3.3 8.6A5 5 0 0 1 10.5 2.2z" fill="none" stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

export function Header({ datasets, active, onDataset, busy, onRefresh, date }: Props) {
  const [theme, toggleTheme] = useTheme()
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <nav className={styles.tabs} aria-label="Dataset">
          {datasets.map(d => (
            <button
              key={d.id}
              type="button"
              className={`${styles.tab} type-label`}
              aria-pressed={d.id === active}
              onClick={() => onDataset(d.id)}
            >
              {d.label}
            </button>
          ))}
        </nav>
      </div>
      <div className={styles.right}>
        <h1 className={`${styles.title} type-eyebrow`}>
          Basis <span className={styles.titleDate}>{stamp(date)}</span>
        </h1>
        <IconButton
          onClick={onRefresh}
          disabled={busy}
          aria-busy={busy}
          aria-label={busy ? 'Refreshing' : 'Refresh'}
          data-busy={busy || undefined}
        >
          <RefreshArrow />
        </IconButton>
        <IconButton
          onClick={toggleTheme}
          aria-label={theme === 'operate' ? 'Switch to the light stock' : 'Switch to the dark stock'}
          aria-pressed={theme === 'operate'}
        >
          <SunMoon theme={theme} />
        </IconButton>
      </div>
    </header>
  )
}
