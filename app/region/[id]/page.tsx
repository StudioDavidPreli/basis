import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadEntity } from '@/app/entity-route'
import { entityName } from '@/lib/describe'
import { EntityPage } from '@/components/entity-page'

// The full page for a region on a hard load; see the company one.

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  return { title: `${entityName(id)} · Basis` }
}

export default async function RegionPage({ params }: { params: Promise<{ id: string }> }) {
  const loaded = await loadEntity('region', params)
  if (!loaded) notFound()
  return <EntityPage {...loaded} />
}
