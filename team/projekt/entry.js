'use strict';
(async()=>{
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 const params=new URLSearchParams(location.search);
 const form=params.has('formular')||params.has('werkzeug');
 const demo=local&&params.get('vorschau')==='1';
 const scripts=form?['../view-as.js?v=57cf137a2d56','../team.js?v=2280247b8908','projekt.js?v=29d3262bbabf']:demo?['uebersicht.js?v=93a6b3707333']:['../config.js?v=f5c6ff179779','../view-as.js?v=57cf137a2d56','daten.js?v=dd7781fe831a','uebersicht.js?v=93a6b3707333'];
 if(!form){const css=document.createElement('link');css.rel='stylesheet';css.href='uebersicht.css?v=2f3ad25abe54';document.head.append(css);}
 for(const src of scripts)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.head.append(script);});
})().catch(()=>{document.getElementById('main').textContent='Die Seite konnte nicht geladen werden. Bitte neu laden.';});
