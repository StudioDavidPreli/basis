// The chart's downsampling (docs/spec.md, TimeSeriesChart: "LTTB
// downsampling above 500 points per series"). Largest-triangle-three-
// buckets (Steinarsson, 2013): the first and last points are kept, the
// rest are split into equal buckets, and each bucket keeps the one point
// that makes the largest triangle with the point kept before it and the
// average of the bucket after it. It keeps peaks and troughs, which is
// what an eye reads in a line, and every point it returns is a real point
// of the input, so a cursor on a downsampled ribbon still reads a value
// the series actually had. Pure.

export const DOWNSAMPLE_ABOVE = 500

export function downsample<T extends readonly [number, number]>(points: T[], threshold: number = DOWNSAMPLE_ABOVE): T[] {
  const n = points.length
  if (n <= threshold || threshold < 3) return points
  const out: T[] = [points[0]!]
  // Buckets over the interior points, the first and last excluded.
  const every = (n - 2) / (threshold - 2)
  let a = 0
  for (let i = 0; i < threshold - 2; i++) {
    // The next bucket's average, the triangle's third corner.
    const nextStart = Math.floor((i + 1) * every) + 1
    const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, n)
    let avgX = 0
    let avgY = 0
    for (let j = nextStart; j < nextEnd; j++) {
      avgX += points[j]![0]
      avgY += points[j]![1]
    }
    const count = nextEnd - nextStart
    avgX /= count
    avgY /= count
    // This bucket: keep the point with the largest triangle.
    const start = Math.floor(i * every) + 1
    const end = Math.floor((i + 1) * every) + 1
    const [ax, ay] = points[a]!
    let best = start
    let bestArea = -1
    for (let j = start; j < end; j++) {
      const [x, y] = points[j]!
      const area = Math.abs((ax - avgX) * (y - ay) - (ax - x) * (avgY - ay))
      if (area > bestArea) {
        bestArea = area
        best = j
      }
    }
    out.push(points[best]!)
    a = best
  }
  out.push(points[n - 1]!)
  return out
}
