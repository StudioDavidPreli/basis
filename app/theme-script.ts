// The inline script that runs before hydration (contracts/cadence-basis.md,
// "useMotionTokens()", and the spec's server/client boundary). It writes two
// attributes on <html>:
//
//   data-reduce-motion  "1" | "0"   from prefers-reduced-motion, or ?reduce=1
//   data-theme          "light" | "dark"   from ?theme=, then the stored
//                                          choice, then prefers-color-scheme
//
// It is a string, not a module, because it has to run as the first thing in
// <body>, synchronously, before React or any stylesheet-dependent paint. A
// module would be deferred. Everything is wrapped in try/catch so a blocked
// localStorage cannot stop the page.

export const themeScript = `(function(){try{
var d=document.documentElement,q=new URLSearchParams(location.search);
var r=q.get('reduce'),m=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
d.setAttribute('data-reduce-motion',(r==='1'||m)?'1':'0');
var t=q.get('theme');
if(t!=='light'&&t!=='dark'){try{t=localStorage.getItem('basis-theme')}catch(e){t=null}}
if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
d.setAttribute('data-theme',t);
}catch(e){}})();`
