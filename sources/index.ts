import { frankfurter } from './frankfurter'
import { treasury } from './treasury'
import { openMeteo } from './open-meteo'
import { usgs } from './usgs'
import { noaaCoops } from './noaa-coops'
import type { Adapter } from './types'

// Keyed by the `adapter` field a driver names in data/companies.json.
export const adapters: Record<string, Adapter> = {
  [frankfurter.id]: frankfurter,
  [treasury.id]: treasury,
  [openMeteo.id]: openMeteo,
  [usgs.id]: usgs,
  [noaaCoops.id]: noaaCoops,
}

export function adapterFor(id: string): Adapter {
  const a = adapters[id]
  if (!a) throw new Error(`no adapter named ${id}`)
  return a
}

export type { Adapter, Params } from './types'
