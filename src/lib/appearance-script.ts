/**
 * Script bloquant du <head> : applique thème, accent et échelle de lisibilité avant le
 * premier rendu, pour éviter le flash de thème. Les clés sont celles de
 * src/lib/theme.ts (ariane-zoom est l'ancienne clé, reprise si présente).
 */
export const APPEARANCE_SCRIPT = `(function(){try{var t=localStorage.getItem('ariane-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var el=document.documentElement;el.setAttribute('data-theme',d?'dark':'light');el.setAttribute('data-theme-setting',t);el.classList.add(d?'dark':'light');var s=localStorage.getItem('ariane-scale')||localStorage.getItem('ariane-zoom');if(s==='0.9'||s==='1'||s==='1.1'||s==='1.2')el.style.setProperty('--app-scale',s);var a=localStorage.getItem('ariane-accent');if(a==='indigo'||a==='rose'||a==='cuivre'||a==='graphite')el.setAttribute('data-accent',a);}catch(e){}})();`;
