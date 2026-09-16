'use client'

import type { ColumnConfig } from '@/lib/config'
import type { AgentPhase } from '@/worker/refresh'
import { CHART_CAP, RANGES, type Range } from './surface-state'
import type { Row } from './data-table'
import { Marker } from './marker'
import styles from './chart-hero.module.css'

// The hero's frame: metric selector, range control, the plot area, and the
// legend strip that doubles as the deselect control, with the agent mark at
// its right end. The plot itself is M6; until then the area holds the axis
// frame and says so, so the layout and the controls are real from M4 on.
//
// The selection is not capped; the chart is. The first CHART_CAP selected
// rows are charted, the rest wait, and the legend says so.

const PHASE_LABEL: Record<AgentPhase, string> = {
  idle: 'Agent idle',
  reading: 'Agent reading sources',
  building: 'Agent building',
  waiting: 'Agent waiting for a manual refresh',
  done: 'Agent done',
  error: 'Agent error',
}

type Props = {
  columns: ColumnConfig[]
  metric: string
  onMetric: (key: string) => void
  range: Range
  onRange: (r: Range) => void
  selection: Row[]
  onDeselect: (id: string) => void
  onClear: () => void
  hoveredId: string | null
  phase: AgentPhase
}

export function ChartHero({ columns, metric, onMetric, range, onRange, selection, onDeselect, onClear, hoveredId, phase }: Props) {
  const charted = selection.slice(0, CHART_CAP)
  const waiting = selection.length - charted.length
  return (
    <section className={styles.hero} aria-labelledby="chart-title">
      <div className={styles.controls}>
        <h2 id="chart-title" className="sr-only">
          Chart
        </h2>
        <div className={styles.group} role="group" aria-label="Metric">
          {columns.map(c => (
            <button key={c.key} type="button" className={`${styles.chip} type-label`} aria-pressed={c.key === metric} onClick={() => onMetric(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className={styles.group} role="group" aria-label="Time range">
          {RANGES.map(r => (
            <button key={r} type="button" className={`${styles.chip} type-label`} aria-pressed={r === range} onClick={() => onRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.plot} role="img" aria-label={charted.length ? `${charted.length} series selected; the chart arrives in a later milestone` : 'No rows selected'}>
        <p className={`${styles.note} type-micro`}>
          {charted.length ? `${charted.length} of ${CHART_CAP} series charted. The ribbons arrive in M6.` : 'Select rows below to chart them.'}
        </p>
      </div>
      <div className={styles.strip}>
        <ul className={styles.legend} aria-label="Selected rows">
          {charted.map(r => (
            <li key={r.id}>
              <button
                type="button"
                className={`${styles.legendItem} type-label`}
                data-hover={hoveredId === r.id || undefined}
                onClick={() => onDeselect(r.id)}
                aria-label={`Remove ${r.name} from the chart`}
              >
                <Marker shape={r.marker} colors={r.colors} />
                {r.name}
              </button>
            </li>
          ))}
          {waiting > 0 && (
            <li className={`${styles.waiting} type-micro`}>
              {waiting} more selected, not charted: the chart holds {CHART_CAP}
            </li>
          )}
          {selection.length > 1 && (
            <li>
              <button type="button" className={`${styles.legendClear} type-action`} onClick={onClear}>
                [ Clear ]
              </button>
            </li>
          )}
        </ul>
        {/* AgentPresence arrives in M7 as a Rive mark; until then the phase
            is a text mark with the same aria-label contract. */}
        <span className={`${styles.agent} type-micro`} role="img" aria-label={PHASE_LABEL[phase]} data-phase={phase}>
          <span className={styles.agentDot} aria-hidden="true" />
          {phase}
        </span>
      </div>
    </section>
  )
}
