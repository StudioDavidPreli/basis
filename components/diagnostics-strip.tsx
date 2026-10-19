'use client'

// The diagnostics strip (docs/spec.md, Diagnostics): the eyebrow, the
// scope, six tools as icon buttons, and the analysis window as two real
// date inputs. One panel element carries the tool that is up: it floats
// under the strip while a tool is hovered or focused, and sits in flow
// under the strip while a tool is pinned (clicked; `aria-expanded`), so a
// pin never re-enters what the hover already showed. Escape unpins. The
// card enters and exits on transitions.enter / exit (the contract).
//
// The window and the view range are two things: the chips say what the
// chart shows, the window says what the tools compute over. The inputs
// show the view's dates, muted and dashed, until a window is set.

import { useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { AgentPhase } from '@/worker/refresh'
import { useMotionTokens } from '@/lib/motion/tokens'
import { isoDate, normalizeWindow, runTool, TOOLS, windowDays, windowMs, type EntityFacts, type DiagnosticSeries, type ToolKey, type Window } from '@/lib/diagnostics'
import { IconButton } from './icon-button'
import { DiagnosticsPanel } from './diagnostics-panel'
import styles from './diagnostics-strip.module.css'

type Props = {
  series: DiagnosticSeries[] // the charted rows
  facts: Record<string, EntityFacts>
  metric: { key: string; label: string; derive: string }
  view: [number, number] | null // the chart's time domain in ms
  window: Window | null
  onWindow: (window: Window | null) => void
  tool: string | null // the pinned tool
  onTool: (tool: string | null) => void
  now: Date
  phase: AgentPhase
  parentheses: boolean
  // Said beside the scope while the hero shows more rows than the tools
  // cover (Risk / return plots every row; the tools take the charted).
  note?: string
}

export function DiagnosticsStrip({ series, facts, metric, view, window: win, onWindow, tool, onTool, now, phase, parentheses, note }: Props) {
  const { transitions } = useMotionTokens()
  const [preview, setPreview] = useState<ToolKey | null>(null)
  const panelId = useId()
  const pinned = TOOLS.find(t => t.key === tool)?.key ?? null
  // A hovered tool shows in the panel; with one pinned, the panel stays in
  // flow and shows the hovered reading until the pointer leaves.
  const up = preview ?? pinned
  const w = view ? windowMs(win, view) : null
  const fromValue = win ? win.from : view ? isoDate(view[0]) : ''
  const toValue = win ? win.to : view ? isoDate(view[1]) : ''
  const report = up && w ? runTool(up, { series, window: w, now, metric, facts }) : null

  const setDates = (from: string, to: string) => onWindow(normalizeWindow(from, to))

  return (
    <section
      className={styles.strip}
      aria-label="Diagnostics"
      onMouseLeave={() => setPreview(null)}
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        // A provenance dialog inside the panel owns its own Escape.
        if ((e.target as HTMLElement).closest('[role="dialog"]')) return
        if (pinned) onTool(null)
        setPreview(null)
      }}
    >
      <div className={styles.row}>
        <span className={`${styles.eyebrow} type-eyebrow`}>Diagnostics</span>
        <span className={`${styles.scope} type-micro`}>
          {series.length} {series.length === 1 ? 'row' : 'rows'} · {metric.label}
          {note && <span data-strip-note> · {note}</span>}
        </span>
        <div className={styles.tools} role="group" aria-label="Tools">
          {TOOLS.map(t => (
            <IconButton
              key={t.key}
              aria-label={t.label}
              aria-expanded={pinned === t.key}
              aria-controls={up === t.key ? panelId : undefined}
              data-tool={t.key}
              data-up={up === t.key || undefined}
              disabled={series.length === 0}
              onMouseEnter={() => setPreview(t.key)}
              onFocus={() => setPreview(t.key)}
              onBlur={() => setPreview(null)}
              onClick={() => onTool(pinned === t.key ? null : t.key)}
            >
              <ToolIcon tool={t.key} />
            </IconButton>
          ))}
        </div>
        <span className={styles.divider} aria-hidden="true" />
        <div className={styles.window}>
          <label htmlFor="window-from" className="type-micro">
            window
          </label>
          <input
            id="window-from"
            type="date"
            className={`${styles.date} type-figure`}
            data-follows={win ? undefined : ''}
            value={fromValue}
            onChange={e => setDates(e.target.value, toValue)}
            aria-label="Window from"
          />
          <span className="type-micro" aria-hidden="true">
            →
          </span>
          <input
            id="window-to"
            type="date"
            className={`${styles.date} type-figure`}
            data-follows={win ? undefined : ''}
            value={toValue}
            onChange={e => setDates(fromValue, e.target.value)}
            aria-label="Window to"
          />
          {w && (
            <span className="type-micro" data-testid="window-days">
              {win ? `${windowDays(w)} d` : `follows the view · ${windowDays(w)} d`}
            </span>
          )}
          {win && (
            <button type="button" className={`${styles.reset} type-action`} onClick={() => onWindow(null)}>
              [ Reset ]
            </button>
          )}
        </div>
      </div>
      <AnimatePresence>
        {report && (
          <motion.section
            key="panel"
            id={panelId}
            className={styles.panel}
            data-pinned={pinned ? '' : undefined}
            data-testid="diagnostics-panel"
            aria-labelledby={`${panelId}-title`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: transitions.exit }}
            transition={transitions.enter}
          >
            <DiagnosticsPanel report={report} titleId={`${panelId}-title`} series={series} pinned={pinned === report.tool} onPin={() => onTool(pinned === report.tool ? null : report.tool)} phase={phase} now={now} parentheses={parentheses} />
          </motion.section>
        )}
      </AnimatePresence>
    </section>
  )
}

// One stroke, 16px, the header's icon weight.
function ToolIcon({ tool }: { tool: ToolKey }) {
  const body = {
    summary: <path d="M3 3v10M13 3v10M3 8h10" />,
    relate: (
      <>
        <circle cx="6" cy="8" r="4" />
        <circle cx="10" cy="8" r="4" />
      </>
    ),
    attribution: (
      <>
        <rect x="2" y="5.5" width="12" height="5" rx="0.5" />
        <path d="M8.5 5.5v5M11.5 5.5v5" />
      </>
    ),
    model: (
      <>
        <path d="M2 13h12M2 13c3 0 4-9 6-9s3 9 6 9" />
        <path d="M5 13V9.5M11 13V9.5" strokeDasharray="1 2" />
      </>
    ),
    quality: (
      <>
        <rect x="2.5" y="3.5" width="11" height="10" rx="1" />
        <path d="M2.5 6.5h11M5.5 9h1.5M9 9h1.5M5.5 11.5h1.5" />
      </>
    ),
    anomalies: (
      <>
        <path d="M2 11h3.5l2-7 2 7H14" />
        <circle cx="7.5" cy="4" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  }[tool]
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      {body}
    </svg>
  )
}
