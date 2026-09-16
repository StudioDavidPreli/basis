import { entityDetail, type EntityDetail } from '@/lib/entity-detail'
import { loadSnapshot } from '@/worker/read'
import type { AgentPhase } from '@/worker/refresh'

// What the four entity routes share: the drawer and the full page for a
// company or a region read the same snapshot and build the same detail.
// Null when the id is not an entity of that kind, so each route can 404
// or render nothing as fits its slot.

export type EntityRoute = { detail: EntityDetail; renderedAt: string; phase: AgentPhase }

export async function loadEntity(kind: EntityDetail['kind'], params: Promise<{ id: string }>): Promise<EntityRoute | null> {
  const { id } = await params
  const { snapshot } = await loadSnapshot()
  const detail = entityDetail(id, snapshot)
  if (!detail || detail.kind !== kind) return null
  return { detail, renderedAt: new Date().toISOString(), phase: snapshot?.agent.phase ?? 'idle' }
}
