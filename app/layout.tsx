import type { Metadata } from 'next'
import type { ReactNode } from 'react'
// The one visual thing Basis takes from Cadence is not visual: the motion
// tokens as custom properties, one preset, with the package's own
// reduced-motion media block. Nothing else from Cadence is imported anywhere.
import 'cadence-tokens/dist/standard/cadence.css'
import './globals.css'
import { themeScript } from './theme-script'

export const metadata: Metadata = {
  title: 'Basis',
  description:
    'A sourced-data surface: simulated companies, real public drivers, provenance on every figure.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* First in the body, before anything renders: sets data-theme and
            data-reduce-motion so the first paint and the hydration both see
            the same attributes. See app/theme-script.ts. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  )
}
