// The data's age as the margin counts it (contracts/cadence-basis.md, "The
// margin counts the data's age"): minutes and seconds under an hour, hours
// under a day, days beyond, always to the second. A clock read behind the
// snapshot shows zero. Pure.
export function formatAge(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600) % 24
  const d = Math.floor(total / 86400)
  const two = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `+${d} d ${two(h)}:${two(m)}:${two(s)}`
  if (h > 0) return `+${h}:${two(m)}:${two(s)}`
  return `+${two(m)}:${two(s)}`
}
