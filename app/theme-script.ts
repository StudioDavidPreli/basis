// The inline script that runs before hydration (contracts/cadence-basis.md,
// "useMotionTokens()", and the spec's server/client boundary). It writes two
// attributes on <html>:
//
//   data-reduce-motion  "1" | "0"   from ?reduce=1, then the stored choice
//                       (the palette's toggle), then prefers-reduced-motion.
//                       Only "on" is stored: the system's preference is never
//                       overridden toward motion on the sheet
//                       (decisions/2026-09-28-palette-scope.md). On /embed/*
//                       only, ?reduce=0 wins over both and is never stored:
//                       the host asked the visitor first
//                       (decisions/2026-10-14-reduce-0-on-the-embeds.md)
//   data-preset         "standard" | "snappy" | "cinematic"   from ?preset=,
//                       on /embed/* only, "standard" when absent there, so
//                       styles/presets.css can restate a preset's timing
//                       under ?reduce=0; absent on the sheet, which is
//                       Standard (decisions/2026-10-05-presets-for-the-embeds.md)
//   one <link rel="preload" as="fetch"> in <head>, for the Basis title's
//                       file, on the sheet only, when motion is allowed and
//                       the welcome will open: the canvas's own fetch then
//                       finds it in the preload cache instead of starting it
//                       after hydration. Not the Rive runtime: its 800 KB
//                       shared a phone's link with the page's own scripts
//                       and held the welcome's paint back; the canvas
//                       fetches it when it mounts
//                       (decisions/2026-10-20-the-runtime-is-not-preloaded.md).
//                       Never under reduced motion, which stays outside the
//                       runtime (contracts/agent-presence.md)
//   data-theme          "passbook" | "operate"   from ?theme=, then the stored
//                       choice, then prefers-color-scheme (dark picks the
//                       green stock; both stocks are light paper)
//                       On a framed /embed/* only, ?theme=cadence-* first:
//                       Cadence's four themes as stocks, never stored, never
//                       in the toggle's cycle, ignored unframed
//                       (decisions/2026-10-14-cadence-stocks-on-the-embeds.md)
//
// It is a string, not a module, because it has to run as the first thing in
// <body>, synchronously, before React or any stylesheet-dependent paint. A
// module would be deferred. Everything is wrapped in try/catch so a blocked
// localStorage cannot stop the page.

export const THEMES = ['passbook', 'operate'] as const
export type Theme = (typeof THEMES)[number]
// Separate from THEMES on purpose: toggleTheme() cycles THEMES, and these
// must never enter that cycle or localStorage.
export const CADENCE_THEMES = ['cadence-light', 'cadence-dark', 'cadence-hc-light', 'cadence-hc-dark'] as const
// The Cadence stocks whose company inks and logo art are operate's.
export const CADENCE_DARK: readonly string[] = ['cadence-dark', 'cadence-hc-dark']
export const THEME_KEY = 'basis-theme'
export const REDUCE_KEY = 'basis-reduce'
// The welcome's stored flag (components/welcome.tsx). Here because the
// script reads it: when the welcome will open, it asks for the title's
// runtime and file at parse time (decisions/2026-10-16-the-titles-runtime-
// starts-at-parse-time.md). The runtime's WASM is self-hosted at this path
// (scripts/rive-wasm.mjs); the title's file is lib/logos.ts's TITLE.riv.
export const WELCOME_KEY = 'basis-welcome'
export const RIVE_WASM = '/rive/rive.wasm'
export const TITLE_RIV = '/rive/basisModalTitles.riv'

export const themeScript = `(function(){try{
var d=document.documentElement,q=new URLSearchParams(location.search);
var e=location.pathname.indexOf('/embed/')===0;
var r=q.get('reduce'),m=window.matchMedia('(prefers-reduced-motion: reduce)').matches,s=null;
try{s=localStorage.getItem('${REDUCE_KEY}')}catch(x){}
d.setAttribute('data-reduce-motion',(e&&r==='0')?'0':(r==='1'||s==='1'||m)?'1':'0');
var ok=['passbook','operate'],t=q.get('theme'),f=false;
try{f=window.self!==window.top}catch(x){f=true}
if(e&&f&&${JSON.stringify(CADENCE_THEMES)}.indexOf(t)>=0){d.setAttribute('data-theme',t)}else{
if(ok.indexOf(t)<0){try{t=localStorage.getItem('${THEME_KEY}')}catch(e){t=null}}
if(ok.indexOf(t)<0){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'operate':'passbook'}
d.setAttribute('data-theme',t)}
var p=q.get('preset');
if(e){d.setAttribute('data-preset',['standard','snappy','cinematic'].indexOf(p)>=0?p:'standard')}
if(!e&&location.pathname==='/'&&d.getAttribute('data-reduce-motion')==='0'){var w=null;try{w=localStorage.getItem('${WELCOME_KEY}')}catch(x){}
if(w!=='dismissed'){var h=document.head,l=document.createElement('link');l.rel='preload';l.as='fetch';l.crossOrigin='anonymous';l.href='${TITLE_RIV}';h.appendChild(l)}}
}catch(e){}})();`
