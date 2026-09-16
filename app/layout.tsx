import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { IBM_Plex_Mono, IBM_Plex_Sans, DotGothic16 } from 'next/font/google'
// The one thing Basis takes from Cadence is not visual: the motion tokens
// as custom properties, one preset, with the package's own reduced-motion
// media block. Nothing else from Cadence is imported anywhere.
import 'cadence-tokens/dist/standard/cadence.css'
import './globals.css'
import { themeScript } from './theme-script'

// Three families, as CSS variables the type roles read (styles/type.css).
// next/font self-hosts them at build, so no request leaves the page for a
// font and there is no layout shift on load.
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' })
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-sans', display: 'swap' })
const dot = DotGothic16({ subsets: ['latin'], weight: '400', variable: '--font-dot', display: 'swap' })

export const metadata: Metadata = {
  title: 'Basis',
  description:
    'A sourced-data surface: simulated companies, real public drivers, provenance on every figure.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${sans.variable} ${dot.variable}`}>
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
