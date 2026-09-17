'use client'

// What the drawer and the full entity page share (docs/spec.md, "Drawer"):
// the about paragraph, then the series description, every metric of the
// dataset as a Figure with its provenance written out, each input with its
// cadence, and the last three mutations recorded for the entity. Plain
// data in, from lib/entity-detail.ts; the heading is the caller's, so the
// section headings take the level below it.

import type { EntityDetail } from '@/lib/entity-detail'
import { mutationSentence } from '@/lib/describe'
import { ttlLabel } from '@/lib/describe'
import { sourcesOf } from '@/lib/diff'
import type { AgentPhase } from '@/worker/refresh'
import { Figure } from './figure'
import { SourceList, when } from './source-list'
import { ScrambleText } from './scramble-text'
import styles from './entity-detail-body.module.css'

type Props = {
  detail: EntityDetail
  now: Date
  phase: AgentPhase
  headings: 'h2' | 'h3'
}

export function EntityDetailBody({ detail, now, phase, headings: H }: Props) {
  const base = `entity-${detail.id}`
  return (
    <div className={styles.body}>
      <ScrambleText as="p" className="type-body" text={detail.about} />
      <ScrambleText as="p" className={`${styles.muted} type-body`} text={detail.description} />

      <section aria-labelledby={`${base}-figures`} className={styles.section}>
        <H id={`${base}-figures`} className={`${styles.eyebrow} type-eyebrow`}>
          Figures
        </H>
        <dl className={styles.figures}>
          {detail.columns.map(c => {
            const f = detail.metrics[c.key]
            return (
              <div key={c.key} className={styles.figure}>
                <dt className="type-label">{c.label}</dt>
                <dd className={styles.value}>
                  {f ? (
                    <>
                      <Figure figure={f} column={c} parentheses={detail.parentheses} phase={phase} now={now} entityName={detail.name} />
                      <SourceList sources={sourcesOf(f.source)} />
                    </>
                  ) : (
                    <span className={`${styles.muted} type-micro`}>unsourced: no snapshot holds this figure yet</span>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      </section>

      <section aria-labelledby={`${base}-inputs`} className={styles.section}>
        <H id={`${base}-inputs`} className={`${styles.eyebrow} type-eyebrow`}>
          Inputs
        </H>
        <ul className={styles.inputs}>
          {detail.inputs.map(i => (
            <li key={i.driver} className={styles.input}>
              <span className="type-label">
                {i.label}
                {i.dominant && <span className={`${styles.muted} type-micro`}> · dominant</span>}
              </span>
              <span className={`${styles.muted} type-micro`}>
                {Math.round(i.weight * 100)}% · {i.provider} · {i.cadence} · stale after {ttlLabel(i.ttlMs)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${base}-changes`} className={styles.section}>
        <H id={`${base}-changes`} className={`${styles.eyebrow} type-eyebrow`}>
          Recent changes
        </H>
        {detail.mutations.length ? (
          <ol className={styles.changes}>
            {detail.mutations.map(m => (
              <li key={`${m.metric}-${m.at}`} className={styles.change}>
                <time dateTime={m.at} className={`${styles.muted} type-micro`}>
                  {when(m.at)}
                </time>
                <span className="type-body">{mutationSentence(m)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className={`${styles.muted} type-micro`}>No change recorded for {detail.name} yet.</p>
        )}
      </section>

      <p className={`${styles.muted} type-micro`}>{detail.at ? `Snapshot ${when(detail.at)}.` : 'No snapshot yet.'}</p>
    </div>
  )
}
