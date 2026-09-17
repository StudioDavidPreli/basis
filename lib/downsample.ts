// The chart's downsampling seam (docs/spec.md, TimeSeriesChart: "LTTB
// downsampling above 500 points per series"). M6 wires the call; the
// algorithm is M9's (plan.md, Hardening). Until then every point is drawn,
// which at five years daily is under two thousand per ribbon and fine on
// the desktop the sheet is built for. Pure.

export const DOWNSAMPLE_ABOVE = 500

export function downsample<T>(points: T[], threshold: number = DOWNSAMPLE_ABOVE): T[] {
  if (points.length <= threshold) return points
  // M9: largest-triangle-three-buckets to `threshold` points, keeping the
  // first and the last. Identity until then.
  return points
}
