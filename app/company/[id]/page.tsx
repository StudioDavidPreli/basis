import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadEntity } from '@/app/entity-route'
import { entityName } from '@/lib/describe'
import { EntityPage } from '@/components/entity-page'

// The full page for a company on a hard load (docs/spec.md, "Drawer"). A
// soft navigation from the sheet is intercepted by app/@drawer instead.

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return { title: `${entityName(id)} · Basis` }
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const loaded = await loadEntity('company', params)
  if (!loaded) notFound()
  return <EntityPage {...loaded} />
}
