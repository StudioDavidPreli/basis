'use client'

// One tool's report as a real table (docs/spec.md, Diagnostics): the row's
// marker and name, then a Figure per number, so every derived value has
// the atom's provenance popover, status marks, and tick. Text cells and
// the template sentences are plain. Attribution adds a bar per row.

import type { ColumnConfig } from '@/lib/config'
import type { AgentPhase } from '@/worker/refresh'
import type { Cell, DiagnosticSeries, Report } from '@/lib/diagnostics'
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
              <tr key={row.id}>
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
