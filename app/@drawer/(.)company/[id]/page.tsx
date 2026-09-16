import { loadEntity } from '@/app/entity-route'
import { Drawer } from '@/components/drawer'

// The intercepting route (docs/spec.md, "Drawer"): a client navigation from
// the sheet to /company/[id] renders here, in the layout's drawer slot,
// while the sheet stays mounted beside it. A hard load of the same URL
// renders app/company/[id]/page.tsx instead. An id that is not a company
// renders nothing; the full page is where it 404s.

export const dynamic = 'force-dynamic'

export default async function CompanyDrawer({ params }: { params: Promise<{ id: string }> }) {
  const loaded = await loadEntity('company', params)
  return loaded ? <Drawer {...loaded} /> : null
}
