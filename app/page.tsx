import styles from './page.module.css'

// M1: "hello". The page exists to be built, deployed, linted, and checked by
// axe. It reads one Cadence token through CSS so the token path is exercised
// on the first deploy, before any component depends on it.
export default function Page() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Basis</h1>
      <p className={styles.hello}>hello</p>
    </main>
  )
}
