import { loadEntity } from '@/app/entity-route'
import { Drawer } from '@/components/drawer'

// The region drawer; see the company one beside it.

export const dynamic = 'force-dynamic'

export default async function RegionDrawer({ params }: { params: Promise<{ id: string }> }) {
  const loaded = await loadEntity('region', params)
  return loaded ? <Drawer {...loaded} /> : null
}
