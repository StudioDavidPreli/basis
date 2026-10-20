'use client'

// One tool's report as a real table (docs/spec.md, Diagnostics): the row's
// marker and name, then a Figure per number, so every derived value has
// the atom's provenance popover, status marks, and tick. Text cells and
// the template sentences are plain. Attribution adds a waterfall per row
// (decisions/2026-10-19-attribution-draws-a-waterfall.md): drawn for the
// eye and hidden from assistive tech, since the row's Figures carry every
// step. Its steps build in order on the card's entry, each from the last
// step's level, base / enter, a medium stagger; afterwards a window change
// re-tweens them in place on base / standard (contract row "Waterfall").

import type { ColumnConfig } from '@/lib/config'
import type { AgentPhase } from '@/worker/refresh'
import { Fragment, useState } from 'react'
import { motion } from 'framer-motion'
import type { Cell, DiagnosticSeries, Report, Waterfall } from '@/lib/diagnostics'
import { formatValue } from '@/lib/format'
import { useMotionTokens } from '@/lib/motion/tokens'
import { present } from '@/lib/present'
import { Figure } from './figure'
import { Marker } from './marker'
import styles from './diagnostics-strip.module.css'

type Props = {
  report: Report
  titleId: string
  series: DiagnosticSeries[]
  pinned: boolean
  onPin: () => void
  phase: AgentPhase
  now: Date
  parentheses: boolean
}

export function DiagnosticsPanel({ report, titleId, series, pinned, onPin, phase, now, parentheses }: Props) {
  const look = new Map<string, { colors: { light: string; dark: string }; marker: string }>()
  for (const s of series) if ('colors' in s) look.set(s.id, s as unknown as { colors: { light: string; dark: string }; marker: string })
  // Every figure in a report shares the inputs, so the status and the age
  // are stated once here; the figures keep their marks and popovers.
  const first = report.rows.flatMap(r => r.cells).find((c): c is Extract<Cell, { kind: 'figure' }> => c.kind === 'figure')
  const shared = first ? present(first.figure, phase, now) : null
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <h3 id={titleId} className={`${styles.title} type-label`}>
          {report.title}
        </h3>
        <span className="type-micro">{report.scope}</span>
        {shared && (
          <span className="type-micro" data-testid="panel-status">
            inputs {shared.status}
            {shared.age ? `, ${shared.age}` : ''}
          </span>
        )}
        <button type="button" className={`${styles.pin} type-action`} onClick={onPin} aria-pressed={pinned}>
          {pinned ? '[ Unpin ]' : '[ Pin ]'}
        </button>
      </div>
      {report.rows.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              {report.head.map((h, i) => (
                <th key={i} scope="col" className="type-micro">
                  {i === 0 && !h ? <span className="sr-only">Row</span> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map(row => (
              <Fragment key={row.id}>
              <tr>
                <th scope="row" className="type-label">
                  <span className={styles.name}>
                    {look.get(row.id) && <Marker shape={look.get(row.id)!.marker} colors={look.get(row.id)!.colors} />}
                    {row.name}
                  </span>
                  {row.bars && row.bars.length > 0 && (
                    <span className={styles.bars} aria-hidden="true">
                      <span className={styles.bar}>
                        {row.bars.map(b => (
                          <span key={b.label} className={styles.barPart} data-tone={b.tone} style={{ width: `${(b.share * 100).toFixed(1)}%` }} />
                        ))}
                      </span>
                      <span className={`${styles.barLegend} type-micro`}>{row.bars.map(b => b.label).join(' · ')}</span>
                    </span>
                  )}
                </th>
                {row.cells.map((cell, i) => (
                  // Keyed by tool, so switching tools remounts the figures
                  // rather than ticking one quantity into another; a window
                  // change keeps the tool and ticks.
                  <td key={`${report.tool}:${i}`}>
                    <CellView cell={cell} entityName={row.name} phase={phase} now={now} parentheses={parentheses} />
                  </td>
                ))}
              </tr>
              {row.waterfall && (
                <tr className={styles.waterfallRow} aria-hidden="true">
                  <td colSpan={report.head.length}>
                    <WaterfallView key={`${report.tool}:${row.id}`} waterfall={row.waterfall} parentheses={parentheses} />
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {report.foot.map((line, i) => (
        <p key={i} className={`${styles.foot} type-micro`}>
          {line}
        </p>
      ))}
    </div>
  )
}

function CellView({ cell, entityName, phase, now, parentheses }: { cell: Cell; entityName: string; phase: AgentPhase; now: Date; parentheses: boolean }) {
  if (cell.kind === 'empty') return null
  if (cell.kind === 'text') return <span className="type-micro">{cell.text}</span>
  const column: ColumnConfig = { key: cell.label, label: cell.label, format: cell.format, derive: 'level' }
  return (
    <span className={styles.cell}>
      <Figure figure={cell.figure} column={column} parentheses={parentheses} phase={phase} now={now} entityName={entityName} compact />
      {cell.note && <span className={`${styles.note} type-micro`}>{cell.note}</span>}
    </span>
  )
}

// Start, each step floating from the level before it to the level after,
// end; start and end stand on the floor. Positions are percentages of the
// waterfall's own extent.
function WaterfallView({ waterfall, parentheses }: { waterfall: Waterfall; parentheses: boolean }) {
  const { durations, easings, delays } = useMotionTokens()
  const levels = [waterfall.start]
  for (const st of waterfall.steps) levels.push(levels[levels.length - 1]! + st.value)
  const lo = Math.min(...levels, waterfall.end)
  const hi = Math.max(...levels, waterfall.end)
  const pad = (hi - lo) * 0.25 || Math.abs(hi) * 0.01 || 1
  const floor = lo - pad
  const top = hi + pad * 0.6
  const y = (v: number) => ((top - v) / (top - floor)) * 100
  const bars = [
    { label: 'start', from: floor, to: waterfall.start, tone: 'ink' as const, text: formatValue('number', waterfall.start, { parentheses }) },
    ...waterfall.steps.map((st, i) => ({
      label: st.label,
      from: levels[i]!,
      to: levels[i + 1]!,
      tone: st.value >= 0 ? ('up' as const) : ('down' as const),
      text: st.value >= 0 ? `+${formatValue('number', st.value)}` : formatValue('number', st.value, { parentheses }),
    })),
    { label: 'end', from: floor, to: waterfall.end, tone: 'ink' as const, text: formatValue('number', waterfall.end, { parentheses }) },
  ]
  return (
    <div className={styles.waterfall} data-waterfall>
      {bars.map((b, i) => (
        <WaterfallBar key={i} index={i} bar={b} next={bars[i + 1]} y={y} durations={durations} easings={easings} stagger={delays.medium} />
      ))}
    </div>
  )
}

type WBar = { label: string; from: number; to: number; tone: 'ink' | 'up' | 'down'; text: string }

function WaterfallBar({ index, bar, next, y, durations, easings, stagger }: { index: number; bar: WBar; next: WBar | undefined; y: (v: number) => number; durations: ReturnType<typeof useMotionTokens>['durations']; easings: ReturnType<typeof useMotionTokens>['easings']; stagger: number }) {
  // The build runs once, on the card's entry; when it has landed, a change
  // of window re-tweens the bar in place. Decided from the animation's own
  // completion, not from a first-run flag.
  const [built, setBuilt] = useState(false)
  const delay = index * stagger
  const transition = built ? { duration: durations.base, ease: easings.standard } : { duration: durations.base, ease: easings.enter, delay }
  const t = Math.min(y(bar.from), y(bar.to))
  const h = Math.abs(y(bar.from) - y(bar.to))
  // Where it grows from: the level before it, so each step leaves from the
  // last one's top.
  const growFrom = y(bar.from)
  const after = y(bar.tone === 'ink' ? bar.to : bar.to)
  return (
    <div className={styles.wfColumn}>
      <div className={styles.wfPlot}>
        <motion.span
          className={styles.wfBar}
          data-tone={bar.tone}
          initial={{ top: `${growFrom}%`, height: '0%' }}
          animate={{ top: `${t}%`, height: `${Math.max(h, 0.6)}%` }}
          transition={transition}
          onAnimationComplete={() => setBuilt(true)}
        />
        <motion.span className={`${styles.wfValue} type-micro`} initial={{ opacity: 0, top: `${t}%` }} animate={{ opacity: 1, top: `${t}%` }} transition={transition}>
          {bar.text}
        </motion.span>
        {next && next.tone !== 'ink' && (
          <motion.span className={styles.wfConnector} initial={{ opacity: 0, top: `${after}%` }} animate={{ opacity: 1, top: `${after}%` }} transition={transition} />
        )}
      </div>
      <span className={`${styles.wfLabel} type-micro`}>{bar.label}</span>
    </div>
  )
}

