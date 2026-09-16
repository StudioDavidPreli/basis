// The inline script that runs before hydration (contracts/cadence-basis.md,
// "useMotionTokens()", and the spec's server/client boundary). It writes two
// attributes on <html>:
//
//   data-reduce-motion  "1" | "0"   from prefers-reduced-motion, or ?reduce=1
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

export const themeScript = `(function(){try{
var d=document.documentElement,q=new URLSearchParams(location.search);
var r=q.get('reduce'),m=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
d.setAttribute('data-reduce-motion',(r==='1'||m)?'1':'0');
var ok=['passbook','operate'],t=q.get('theme');
if(ok.indexOf(t)<0){try{t=localStorage.getItem('${THEME_KEY}')}catch(e){t=null}}
if(ok.indexOf(t)<0){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'operate':'passbook'}
d.setAttribute('data-theme',t);
}catch(e){}})();`
