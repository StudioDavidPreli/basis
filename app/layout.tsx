import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { IBM_Plex_Mono, IBM_Plex_Sans, DotGothic16 } from 'next/font/google'
// The one thing Basis takes from Cadence is not visual: the motion tokens
// as custom properties, one preset, with the package's own reduced-motion
// media block. Nothing else from Cadence is imported anywhere.
import 'cadence-tokens/dist/standard/cadence.css'
// The three presets, scoped to `data-preset`, for the embeds only
// (decisions/2026-10-05-presets-for-the-embeds.md). Generated from the
// package; the sheet never sets the attribute and stays on Standard.
import '@/styles/presets.css'
import './globals.css'
import { themeScript } from './theme-script'
import { DrawerExit } from '@/components/drawer-exit'

// Three families, as CSS variables the type roles read (styles/type.css).
// next/font self-hosts them at build, so no request leaves the page for a
// font and there is no layout shift on load.
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' })
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-sans', display: 'swap' })
const dot = DotGothic16({ subsets: ['latin'], weight: '400', variable: '--font-dot', display: 'swap' })

const description = 'A sourced-data surface: simulated companies, real public drivers, provenance on every figure.'

// The share card (decisions/2026-10-15-the-share-card.md): David's two
// images, the wide one first, which is the one most platforms take; the
// square is for the apps that crop to one. metadataBase makes their URLs
// absolute, which crawlers need; entity pages keep their own titles and
// inherit the card.
const card = { url: '/og/basis-1200x630.webp', width: 1200, height: 630, alt: 'Basis, sourced-data surface', type: 'image/webp' }
const square = { url: '/og/basis-630x630.webp', width: 630, height: 630, alt: 'Basis, sourced-data surface', type: 'image/webp' }

export const metadata: Metadata = {
  metadataBase: new URL('https://basis.davidpreli.com'),
  title: 'Basis',
  description,
  openGraph: { type: 'website', siteName: 'Basis', title: 'Basis', description, url: '/', images: [card, square] },
  twitter: { card: 'summary_large_image', title: 'Basis', description, images: [{ url: card.url, alt: card.alt }] },
}

// `drawer` is the parallel slot app/@drawer: nothing on the sheet, the
// entity drawer once a row's link is followed. Both are columns of one
// grid (.frame in globals.css), so the sheet narrows beside the drawer
// through the layout and never a backdrop.
//
// suppressHydrationWarning on <html>: the inline script writes data-theme
// and data-reduce-motion on it before React loads, on purpose (the contract's
// reduced-motion flag), so the client's attributes differ from the server's
// HTML by exactly those two. The flag is one level deep: it covers this
// element's attributes and nothing inside it.
export default function RootLayout({ children, drawer }: { children: ReactNode; drawer: ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} ${sans.variable} ${dot.variable}`} suppressHydrationWarning>
      <body>
        {/* First in the body, before anything renders: sets data-theme and
            data-reduce-motion so the first paint and the hydration both see
            the same attributes. See app/theme-script.ts.

            A raw element on purpose. next/script's beforeInteractive does
            not run inline content at parse time: the server emits a push
            onto self.__next_s and Next's runtime executes the queue later,
            which is after the first paint can happen. This element runs as
            the parser reaches it. The cost is a development-only warning
            when React re-creates the layout on the client after a server
            error (a script element is never executed by React); production
            hydrates the server's element and never creates one. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <div id="frame" className="frame">
          {children}
          {drawer}
          <DrawerExit />
        </div>
      </body>
    </html>
  )
}
