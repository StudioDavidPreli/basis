// Where a company's logo lives (contracts/agent-presence.md, "Company logos").
// One `.riv` per company in public/rive/ and two posters in public/fallbacks/,
// all keyed by the company's name in camelCase; the artboard inside the file
// is the company `id`. The key is derived from the config here and nowhere
// else, so a file name is never typed beside a name it could disagree with.

import { config as defaultConfig, type Config } from './config'
import { companyName } from './describe'
import type { Theme } from '@/app/theme-script'

// "Meridian Páramo" → "meridianParamo": diacritics dropped, words joined, the
// first lower-case and the rest capitalised.
export function logoKey(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join('')
}

// What has been delivered, by company id. A poster may land before its
// animation; an animation never lands without its posters, because the poster
// is the reduced-motion mark, the placeholder and the load-failure fallback.
// lib/logos.test.ts holds both lists against public/ in both directions.
export const POSTERS: ReadonlySet<string> = new Set(['ou-tokyo', 'ou-london', 'ou-mumbai', 'drift-bogota', 'drift-lagos', 'drift-sydney', 'seasonal-toronto', 'seasonal-santiago', 'seasonal-berlin', 'jump-seoul', 'jump-johannesburg', 'jump-dubai'])
export const ANIMATED: ReadonlySet<string> = new Set(['ou-tokyo', 'ou-london', 'ou-mumbai', 'drift-bogota', 'drift-lagos', 'drift-sydney', 'seasonal-toronto', 'seasonal-santiago', 'seasonal-berlin', 'jump-seoul', 'jump-johannesburg', 'jump-dubai'])

// The names inside every logo file (contracts/agent-presence.md).
export const LOGO_STATE_MACHINE = 'logoSM'
export const LOGO_VIEW_MODEL = 'LogoVM'
export const THEME_INSTANCE: Record<Theme, string> = { passbook: 'lightMode', operate: 'darkMode' }

export type LogoArt = {
  key: string
  artboard: string
  posters: Record<Theme, string>
  riv: string | null
}

// A company's art, or null for a company with none yet and for every region:
// those keep their Marker.
export function logoArt(entityId: string, config: Config = defaultConfig): LogoArt | null {
  const company = config.companies.find(c => c.id === entityId)
  if (!company || !POSTERS.has(entityId)) return null
  const key = logoKey(companyName(company, config))
  return {
    key,
    artboard: company.id,
    posters: { passbook: `/fallbacks/${key}Light.svg`, operate: `/fallbacks/${key}Dark.svg` },
    riv: ANIMATED.has(entityId) ? `/rive/${key}.riv` : null,
  }
}
