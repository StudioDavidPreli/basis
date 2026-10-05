// The inline script that runs before hydration (contracts/cadence-basis.md,
// "useMotionTokens()", and the spec's server/client boundary). It writes two
// attributes on <html>:
//
//   data-reduce-motion  "1" | "0"   from ?reduce=1, then the stored choice
//                       (the palette's toggle), then prefers-reduced-motion.
//                       Only "on" is stored: the system's preference is never
//                       overridden toward motion
//                       (decisions/2026-09-28-palette-scope.md)
//   data-preset         "standard" | "snappy" | "cinematic"   from ?preset=,
//                       on /embed/* only; absent elsewhere, which is Standard
//                       (decisions/2026-10-05-presets-for-the-embeds.md)
//   data-theme          "passbook" | "operate"   from ?theme=, then the stored
//                       choice, then prefers-color-scheme (dark picks the
//                       green stock; both stocks are light paper)
//
// It is a string, not a module, because it has to run as the first thing in
// <body>, synchronously, before React or any stylesheet-dependent paint. A
// module would be deferred. Everything is wrapped in try/catch so a blocked
// localStorage cannot stop the page.

export const THEMES = ['passbook', 'operate'] as const
export type Theme = (typeof THEMES)[number]
export const THEME_KEY = 'basis-theme'
export const REDUCE_KEY = 'basis-reduce'

export const themeScript = `(function(){try{
var d=document.documentElement,q=new URLSearchParams(location.search);
var r=q.get('reduce'),m=window.matchMedia('(prefers-reduced-motion: reduce)').matches,s=null;
try{s=localStorage.getItem('${REDUCE_KEY}')}catch(e){}
d.setAttribute('data-reduce-motion',(r==='1'||s==='1'||m)?'1':'0');
var ok=['passbook','operate'],t=q.get('theme');
if(ok.indexOf(t)<0){try{t=localStorage.getItem('${THEME_KEY}')}catch(e){t=null}}
if(ok.indexOf(t)<0){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'operate':'passbook'}
d.setAttribute('data-theme',t);
var p=q.get('preset');
if(location.pathname.indexOf('/embed/')===0&&['standard','snappy','cinematic'].indexOf(p)>=0){d.setAttribute('data-preset',p)}
}catch(e){}})();`
