"use strict";
let daten=null;
async function start(){
 if(!schluessel()){document.getElementById('main').replaceChildren(el('h1',{},'Persönlicher Link fehlt'),el('p',{},'Öffne die Seite über deinen persönlichen Team-Link.'));return;}
 return fieldStart('plan',value=>{daten=value;document.getElementById('wer').textContent=TEAM[daten.person]||daten.person;liste();});
}
function liste(){const main=document.getElementById('main');main.replaceChildren();renderBSetup(main);const ref=new URLSearchParams(location.search).get('nr');if(ref){const detail=[...main.querySelectorAll('[data-ref]')].find(n=>n.dataset.ref===ref||n.textContent.includes(ref));if(detail)detail.open=true;}}
start();
