import { FigureStage } from './stage'

// Chromeless: one Figure in one status, for screenshots (M4's "every status
// has a screenshot") and later for the Cadence "In Practice" page (M10).
//   /embed/figure?status=current|stale|refreshing|agent-updated|unverified
//   &theme=passbook|operate&reduce=1
// Theme and reduce are read by the inline script in the layout, as on every
// page. The figure's data is composed here from the config, not fetched.

export const dynamic = 'force-dynamic'

export default async function EmbedFigure({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const status = typeof params['status'] === 'string' ? params['status'] : 'current'
  return <FigureStage status={status} />
}
