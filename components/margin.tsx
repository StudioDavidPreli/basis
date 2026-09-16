'use client'

import styles from './margin.module.css'

// The left margin: the document label and the date, rotated, the way the
// Operate reference and the passbook annotate their sheets. Row numbers
// live in the table's first column, aligned to this edge.
export function Margin({ date, dataset }: { date: string; dataset: string }) {
  const day = date.slice(0, 10)
  return (
    <aside className={styles.margin} aria-hidden="true">
      <span className={`${styles.label} type-eyebrow`}>Basis · {dataset}</span>
      <span className={`${styles.date} type-eyebrow`}>{day}</span>
    </aside>
  )
}
