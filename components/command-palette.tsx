'use client'

// The command palette (docs/spec.md, CommandPalette): ⌘K or Ctrl+K, or the
// header's hint. A real modal <dialog> opened with showModal(), unlike the
// drawer: while it is open nothing behind it is reachable, and closing it
// hands focus back to what had it, natively. Inside, the combobox pattern:
// the input keeps focus, the listbox's active option is named by
// aria-activedescendant, the arrows move it, Enter runs it, Escape closes.
//
// What is typed filters the palette's own list, not the ledger
// (decisions/2026-09-28-palette-scope.md). An action runs after the dialog
// has closed and returned focus, so an action that moves focus itself (the
// drawer, on a jump) is the last word.

import { useEffect, useId, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { motion } from 'framer-motion'
import { toggleReducedMotion, useMotionTokens, useReducedMotion, useSystemReducedMotion } from '@/lib/motion/tokens'
import { toggleTheme, useTheme } from './use-theme'
import styles from './command-palette.module.css'

export type PaletteItem = {
  id: string
  group: string
  label: string
  keywords?: string // matched but not shown
  tag?: string // shown at the end of the line: "current", a shortcut
  leading?: ReactNode // decorative, beside the label
  disabled?: boolean
  run: () => void
}

type Props = {
  open: boolean
  onOpenChange: Dispatch<SetStateAction<boolean>>
  items: PaletteItem[] // the sheet's own; the palette adds the View group
}

// Every word of the query must appear somewhere in the item's text.
function matches(item: PaletteItem, words: string[]): boolean {
  const text = `${item.group} ${item.label} ${item.keywords ?? ''}`.toLowerCase()
  return words.every(w => text.includes(w))
}

export function CommandPalette({ open, onOpenChange, items }: Props) {
  const { transitions } = useMotionTokens()
  const theme = useTheme()
  const reduced = useReducedMotion()
  const system = useSystemReducedMotion()
  const dialog = useRef<HTMLDialogElement>(null)
  const pending = useRef<(() => void) | null>(null)
  const base = useId()
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)

  // A fresh palette on every open: the query and the active option reset
  // while rendering, from the value itself, never from an effect's first run.
  // The element exists only from an open until its exit has finished, so
  // the drawer's own `dialog` queries never meet a closed palette.
  const [wasOpen, setWasOpen] = useState(open)
  const [mounted, setMounted] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQuery('')
      setActiveId(null)
      setMounted(true)
    }
  }

  const all: PaletteItem[] = [
    ...items,
    {
      id: 'view:theme',
      group: 'View',
      label: theme === 'operate' ? 'Switch to the light stock' : 'Switch to the dark stock',
      keywords: 'theme stock paper light dark',
      run: toggleTheme,
    },
    {
      id: 'view:motion',
      group: 'View',
      label: system ? 'Reduced motion: on (system setting)' : reduced ? 'Turn reduced motion off' : 'Reduce motion',
      keywords: 'reduced motion animation accessibility',
      disabled: system,
      run: toggleReducedMotion,
    },
  ]
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const visible = all.filter(i => matches(i, words))
  const active = visible.find(i => i.id === activeId) ?? visible[0] ?? null
  const groups = [...new Set(visible.map(i => i.group))]
  const optionId = (id: string) => `${base}-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`

  // The global shortcut. Toggles, so ⌘K inside the open palette closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return
      e.preventDefault()
      onOpenChange(o => !o)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onOpenChange])

  // Open is a statement about the element, decided from the element: a
  // second run under Strict Mode finds it open and does nothing.
  useEffect(() => {
    const d = dialog.current
    if (open && d && !d.open) d.showModal()
  }, [open])

  // The active option stays in view as the arrows move it.
  const activeDomId = active ? optionId(active.id) : undefined
  useEffect(() => {
    if (activeDomId) document.getElementById(activeDomId)?.scrollIntoView({ block: 'nearest' })
  }, [activeDomId])

  // The exit has run (or was skipped under reduced motion): close the
  // element, which returns focus, then run what was chosen.
  const finish = () => {
    if (open) return
    dialog.current?.close()
    setMounted(false)
    const run = pending.current
    pending.current = null
    run?.()
  }

  const choose = (item: PaletteItem | null) => {
    if (!item || item.disabled) return
    pending.current = item.run
    onOpenChange(false)
  }

  const move = (delta: number) => {
    if (visible.length === 0) return
    const i = active ? visible.indexOf(active) : -1
    setActiveId(visible[(i + delta + visible.length) % visible.length]!.id)
  }

  if (!mounted) return null
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label="Command palette"
      // Escape: the exit animates instead of the element vanishing.
      onCancel={e => {
        e.preventDefault()
        onOpenChange(false)
      }}
      // The element closed without us (the browser may force a second
      // Escape through): follow it.
      onClose={() => {
        if (open) onOpenChange(false)
      }}
      // A click on the backdrop lands on the dialog itself.
      onClick={e => {
        if (e.target === e.currentTarget) onOpenChange(false)
      }}
    >
      <motion.div
        className={styles.panel}
        // It mounts on an open, so it always enters from the exit's pose.
        initial={{ opacity: 0, y: -4 }}
        animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
        transition={open ? transitions.enter : transitions.exit}
        onAnimationComplete={finish}
      >
        <input
          className={`${styles.input} type-body`}
          type="text"
          role="combobox"
          aria-label="Command or name"
          aria-expanded="true"
          aria-controls={`${base}-list`}
          aria-autocomplete="list"
          aria-activedescendant={activeDomId}
          placeholder="Type a command or a name"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            setActiveId(null)
          }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              move(1)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              move(-1)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(active)
            }
          }}
        />
        <div id={`${base}-list`} role="listbox" aria-label="Commands" className={styles.list}>
          {groups.map((g, gi) => (
            <div key={g} role="group" aria-labelledby={`${base}-g-${gi}`} className={styles.group}>
              <div id={`${base}-g-${gi}`} role="presentation" className={`${styles.heading} type-eyebrow`}>
                {g}
              </div>
              {visible
                .filter(i => i.group === g)
                .map(i => (
                  <div
                    key={i.id}
                    id={optionId(i.id)}
                    role="option"
                    aria-selected={i === active}
                    aria-disabled={i.disabled || undefined}
                    className={styles.option}
                    onMouseMove={() => {
                      if (i !== active) setActiveId(i.id)
                    }}
                    onClick={() => choose(i)}
                  >
                    {i.leading}
                    <span className={`${styles.label} type-label`}>{i.label}</span>
                    {i.tag && <span className={`${styles.tag} type-micro`}>{i.tag}</span>}
                  </div>
                ))}
            </div>
          ))}
        </div>
        {visible.length === 0 && <p className={`${styles.empty} type-micro`}>No matches.</p>}
        <p className={`${styles.keys} type-micro`} aria-hidden="true">
          ↑ ↓ move · Enter run · Esc close
        </p>
      </motion.div>
    </dialog>
  )
}
