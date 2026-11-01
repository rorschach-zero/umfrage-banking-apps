'use strict';
// Shared field controls. All assignments and eligibility checks are server-owned.
function serviceMessage(text) { const node=document.getElementById('service-message');if(node)node.textContent=text; }
async function serviceAction(body) {
  serviceMessage('Wird gespeichert …');
  try { const result=await sende(body);bOffen=null;await start();window.dispatchEvent(new Event('workspace-saved'));serviceMessage(result.assigned!==undefined?result.assigned+' Zellen übernommen.':'Gespeichert.');return result; }
  catch(error){serviceMessage(error.message);return null;}
}
// Open the current checklist step after a successful action.
let bOffen=null, startDay='';
function bFehlendeKanaele(state){
  const plan=(daten.plan||[]).filter(r=>!String(r.nr).startsWith('PROBE-B-'));
  const noetig=[...new Set(plan.map(r=>r.anbieter+'|'+(r.kanal==='telefon'?'telefon':'schriftlich')))];
  return noetig.filter(k=>!(state.channels||[]).some(c=>c.anbieter+'|'+c.art===k)).map(k=>{const [a,art]=k.split('|');return a+' · '+(art==='telefon'?'Telefon':'schriftlich');});
}
function bSchritt(nr,titel,erledigt,zusammenfassung,inhalt,gesperrt){
  const offen=bOffen===nr;
  const kopf=el('button',{type:'button',class:'b-step-head','aria-expanded':String(offen),'data-read-navigation':true,on:{click:()=>{bOffen=offen?0:nr;liste();document.querySelectorAll('.b-step-head')[nr-1]?.focus();}}},
    el('span',{class:'b-step-num'+(erledigt?' is-done':'')},erledigt?'✓':String(nr)),
    el('span',{class:'b-step-title'},titel,el('small',{},zusammenfassung)),
    el('span',{class:'b-step-state'+(erledigt?' done':gesperrt?' locked':' now')},erledigt?'erledigt':gesperrt?'danach':'jetzt'));
  return el('section',{class:'b-step'+(offen?' is-open':'')+(erledigt?' is-done':'')},kopf,offen?el('div',{class:'b-step-body'},inhalt):null);
}
function renderBSetup(main) {
  const state=daten.service;
  if(!state||state.error){main.append(el('p',{role:'alert'},state?.error||'Servicetest gerade nicht verfügbar. Lade die Seite neu oder frag Salah.'));return;}
  const config=state.config,selected=new Set(state.selected),fehlend=bFehlendeKanaele(state);
  const s1=!!state.probeDone,s2=state.selected.length>=2&&state.assigned>0,s3=s2&&!fehlend.length;
  if(bOffen===null)bOffen=!s1?1:!s2?2:!s3?3:4;
  const date=el('input',{type:'date',id:'service-day',min:config.start,max:config.end,value:startDay||nextServiceDay(config.start),on:{change:event=>{startDay=event.target.value;}}});
  const banken=el('fieldset',{class:'bank-options'},el('legend',{},'Wo hast du ein aktives Konto?'),['Yuh','Neon','Zak','Revolut'].map(provider=>el('label',{},el('input',{type:'checkbox',name:'provider',value:provider,checked:selected.has(provider),on:{change:event=>{event.target.checked?selected.add(provider):selected.delete(provider);serviceMessage('');}}}),provider)));
  const naechster=(daten.plan||[]).filter(r=>!String(r.nr).startsWith('PROBE-B-')&&!(r.erfasst&&r.erfasst.stand==='abgeschlossen')).sort((a,b)=>(a.tag+a.block).localeCompare(b.tag+b.block))[0];
  const box=el('div',{class:'b-steps'},
    bSchritt(1,'Probe durchspielen',s1,s1?'Erledigt. Du kennst das Erfassen.':'Ein erfundener Verlauf, keine Bank. Etwa 15 Minuten.',
      [el('p',{},'Du gehst einen ausgedachten Chat Schritt für Schritt durch und lernst so das Erfassen. Niemand wird kontaktiert.'),
       el('button',{class:'knopf',type:'button','data-read-navigation':true,on:{click:()=>oeffne(state.probe)}},s1?'Probe ansehen':'Probe starten')],false),
    bSchritt(2,'Banken wählen und Kontakte holen',s2,s2?state.selected.join(', ')+' · '+state.assigned+' Kontakte zugeteilt':'Mindestens zwei Banken, bei denen du ein Konto hast.',
      [banken,el('label',{for:'service-day'},'Ab wann hast du Zeit?'),date,
       el('p',{class:'leise'},'Kontakte sind nur werktags, vormittags 09–12 oder nachmittags 13–17 Uhr. Die App verteilt sie fair auf alle.'),
       el('button',{class:'knopf',type:'button',on:{click:()=>serviceAction({typ:'b_assign',providers:[...selected],day:date.value})}},state.assigned?'Auswahl speichern':'Kontakte zuteilen')],!s1),
    bSchritt(3,'Kanäle belegen',s3,s3?'Alle Kanäle belegt.':fehlend.length?'Noch offen: '+fehlend.join(', '):'Nach Schritt 2.',
      [el('p',{},'Bevor du eine Bank kontaktierst, hältst du fest, welchen Kanal sie anbietet und wo das steht. Eine Bank ohne Telefon ist ein Befund, kein Fehler.'),
       fehlend.length?el('p',{class:'b-missing'},'Noch zu belegen: '+fehlend.join(' · ')):null,channelSetup(state)],!s2),
    bSchritt(4,'Kontakte machen',state.assigned>0&&!naechster,naechster?'Nächster: '+naechster.anbieter+' · '+naechster.kanal+' · '+(naechster.tag?formatServiceDate(naechster.tag):'Tag offen')+' · '+(naechster.block==='A'?'09–12':'13–17')+' Uhr':state.assigned?'Alle zugeteilten Kontakte erledigt.':'Noch keine Kontakte zugeteilt.',
      [naechster?el('div',{class:'karte akzent'},el('div',{class:'kicker'},'Dein nächster Kontakt'),el('p',{class:'b-next'},naechster.anbieter+' · '+naechster.anliegen+' · '+naechster.kanal),
         el('p',{class:'leise'},(naechster.tag?new Intl.DateTimeFormat('de-CH',{weekday:'long',day:'2-digit',month:'2-digit'}).format(new Date(naechster.tag+'T12:00:00')):'Tag offen')+' · '+(naechster.block==='A'?'09 bis 12 Uhr':'13 bis 17 Uhr')),
         el('button',{class:'knopf',type:'button','data-read-navigation':true,on:{click:()=>oeffne(naechster)}},'Kontakt öffnen')):el('p',{class:'leise'},state.assigned?'Alle zugeteilten Kontakte sind abgeschlossen.':'Sobald Schritt 2 erledigt ist, steht hier dein nächster Kontakt.'),
       el('p',{class:'leise'},'Offizieller Start ist am '+formatServiceDate(config.official)+'. Wer nach der Probe früher startet, wird als «vorgezogen» markiert, das zählt normal.'),
       state.canTakeMore?el('button',{class:'knopf hell',type:'button',on:{click:()=>serviceAction({typ:'take_more',area:'b',day:date.value})}},'Weitere Kontakte übernehmen'):null],!s3),
    el('p',{id:'service-message',role:'status','aria-live':'polite'}));
  main.append(box);
  const last=Object.entries(belastung||{});
  if(state.open||last.length)main.append(el('details',{class:'b-group'},el('summary',{},'Stand der Gruppe'),
    state.open?el('p',{},'Noch offene Kontakte: '+state.open.map(r=>r.provider+' '+r.open).join(' · ')):null,
    last.length?el('p',{},'Belastung je Bank (Stopp bei '+STOPP.nachrichten+' Nachrichten oder '+STOPP.minuten+' Minuten): '+last.map(([a,x])=>a+' '+x.nachrichten+' Nachr. · '+x.minuten+' Min.').join(' · ')):null));
}
function formatServiceDate(day){return day.split('-').reverse().join('.');}
function nextServiceDay(start){let day=[start,heute()].sort().pop();while([0,6].includes(new Date(day+'T12:00:00').getDay())){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);day=d.toISOString().slice(0,10);}return day;}
// Belegte Kanäle (Recherche 01.11.2026, jede Angabe auf der Anbieterseite geprüft; 10_pa6a/beobachtung/Kanaele_belegt.md).
// Nur Vorschläge: die Person öffnet die Quelle, prüft selbst und speichert. Offene Zuordnungen zeigen beide Möglichkeiten.
const KANAELE_BELEGT={
  Yuh:{schriftlich:[{kanal:'chat',text:'Chat in der App («Support via Chat», kostenlos)',quelle:'https://www.yuh.com/de/pricing/'}],
       telefon:[{kanal:'telefon',text:'+41 44 825 87 89 · Mo–Fr 08–19 Uhr',quelle:'https://www.yuh.com/de/contact/'}]},
  Neon:{schriftlich:[{kanal:'chat',text:'In-App-Hilfe, laut Neon KI-gestützt',quelle:'https://www.neon-free.ch/blog/der-neon-kundenservice-ganz-ohne-filiale'},{kanal:'mail',text:'service@neon-free.ch · Antwort innert zwei Arbeitstagen',quelle:'https://www.neon-free.ch/kontakt'}],
        telefon:[{kanal:'telefon',text:'+41 43 508 03 19 · Mo–Fr 08–17 Uhr · nur Plan plus, global oder metal',quelle:'https://www.neon-free.ch/faq/wie-erreiche-ich-euch-am-besten'},{kanal:'keiner',text:'Gratis-Plan: kein Telefonservice laut Neon',quelle:'https://www.neon-free.ch/faq/wie-erreiche-ich-euch-am-besten'}]},
  Zak:{schriftlich:[{kanal:'chat',text:'Nachricht in der App («Nachricht im DigitalBanking»)',quelle:'https://www.cler.ch/de/services/hilfe-und-kontakt/hilfethemen/zak'},{kanal:'formular',text:'Zak-Kontaktformular · nur Domizil Schweiz',quelle:'https://www.cler.ch/de/services/kontakt/kontaktformular-zak'}],
       telefon:[{kanal:'telefon',text:'0848 845 245 · Mo–Fr 8–18 Uhr',quelle:'https://www.cler.ch/de/services/hilfe-und-kontakt/hilfethemen/zak'}]},
  Revolut:{schriftlich:[{kanal:'chat',text:'Chat in der App · Profil > Chats > Support · rund um die Uhr',quelle:'https://help.revolut.com/de-CH/help/profile-and-plan/how-can-i-contact-revolut-support/'}],
           telefon:[{kanal:'keiner',text:'Keine Nummer · Anruf nur mit Ultra-Abo und nur Englisch',quelle:'https://help.revolut.com/de-CH/help/profile-and-plan/how-can-i-contact-revolut-support/'},{kanal:'telefon',text:'Anruf in der App mit Ultra-Abo, nur Englisch',quelle:'https://help.revolut.com/de-CH/help/profile-and-plan/how-can-i-contact-revolut-support/'}]}
};
function kanalInfo(anbieter,kanal){const art=kanal==='telefon'?'telefon':'schriftlich';return ((KANAELE_BELEGT[anbieter]||{})[art]||[]).find(v=>v.kanal===kanal)||null;}
function channelSetup(state){
  const provider=el('select',{id:'channel-provider'},state.selected.map(a=>el('option',{value:a},a))),kind=el('select',{id:'channel-kind'},el('option',{value:'schriftlich'},'Schriftlich'),el('option',{value:'telefon'},'Telefon')),
    channel=el('select',{id:'channel-value'},['chat','mail','formular','telefon','keiner'].map(a=>el('option',{value:a},a==='keiner'?'Nicht angeboten':a))),source=el('input',{id:'channel-source',type:'url',placeholder:'https://…'}),date=el('input',{id:'channel-date',type:'date',max:heute(),value:heute()}),checked=el('input',{type:'checkbox',id:'channel-checked'});
  const belegt=new Set((state.channels||[]).map(r=>r.anbieter+'|'+r.art));
  const vorschlaege=state.selected.flatMap(a=>['schriftlich','telefon'].filter(art=>!belegt.has(a+'|'+art)).map(art=>({a,art,optionen:(KANAELE_BELEGT[a]||{})[art]||[]}))).filter(v=>v.optionen.length);
  const uebernehmen=(a,art,o)=>{provider.value=a;kind.value=art;channel.value=o.kanal;source.value=o.quelle;date.value=heute();checked.checked=false;serviceMessage('Übernommen. Öffne die Quelle, prüfe sie und setze dann das Häkchen.');provider.scrollIntoView({behavior:'smooth',block:'center'});};
  return el('div',{class:'channel-setup'},
    vorschlaege.length?el('div',{class:'kanal-vorschlaege'},el('p',{class:'kanal-titel'},'Schon recherchiert, du musst nur noch prüfen'),
      vorschlaege.map(v=>el('div',{class:'kanal-karte'},el('b',{},v.a+' · '+(v.art==='telefon'?'Telefon':'schriftlich')),
        v.optionen.length>1?el('p',{class:'leise'},'Zwei Möglichkeiten. Was für dein Konto gilt, entscheidest du mit Ernes.'):null,
        v.optionen.map(o=>el('div',{class:'kanal-option'},el('span',{},o.text),el('a',{href:o.quelle,target:'_blank',rel:'noopener','data-read-navigation':true},'Quelle ↗'),
          el('button',{type:'button',class:'chip',on:{click:()=>uebernehmen(v.a,v.art,o)}},'Übernehmen')))))):null,
    el('p',{class:'leise'},'Schriftlich heisst Chat in der App, falls angeboten, sonst Formular oder E-Mail.'),
    state.channels.length?el('ul',{},state.channels.map(r=>el('li',{},'✓ '+r.anbieter+' · '+r.art+' · '+r.kanal+' · geprüft '+r.abruf))):null,
    el('label',{for:'channel-provider'},'Anbieter'),provider,el('label',{for:'channel-kind'},'Kanalart'),kind,el('label',{for:'channel-value'},'Belegter Kanal'),channel,
    el('label',{for:'channel-source'},'Quelle des Anbieters'),source,el('label',{for:'channel-date'},'Geprüft am'),date,
    el('label',{class:'checkline'},checked,'Ich habe die Quelle geöffnet und Kanalregel und Bedingungen geprüft.'),
    el('button',{class:'knopf hell',type:'button',on:{click:()=>serviceAction({typ:'b_channel',provider:provider.value,kind:kind.value,channel:channel.value,source:source.value,date:date.value,checked:checked.checked})}},'Kanal speichern'));
}
async function oeffne(row){
  if(row.nr.startsWith('PROBE-B-')){openForm(row);return;}
  if(!daten.service?.probeDone){serviceMessage('Schliesse zuerst deine eigene Probe ab.');return;}
  const channel=daten.service.channels.find(r=>r.anbieter===row.anbieter&&r.art===(row.kanal==='telefon'?'telefon':'schriftlich'));
  if(!channel){serviceMessage('Bestätige zuerst den Kanal mit Quelle und Abrufdatum.');return;}
  openForm(row);
}
function serviceSchedule(row){
  const input=el('input',{type:'date',value:row.tag,min:daten.service?.config.start,max:daten.service?.config.end,'aria-label':'Termin '+row.nr});
  return el('div',{class:'service-schedule'},input,el('button',{class:'chip',type:'button',on:{click:()=>serviceAction({typ:'b_schedule',nr:row.nr,day:input.value})}},'Termin speichern'));
}
function simulationNotice(){
  return el('aside',{class:'hinweisbox simulation'},el('h2',{},'Interne Probe ohne Bankkontakt'),el('p',{},'Rufe keine Bank an und sende keine Nachricht. Spiele nur diesen erfundenen Verlauf durch und erfasse ihn unten.'),
    el('p',{},'Übung am heutigen Tag. Start 09:00, erkennbare automatische Antwort 09:01, menschliche Antwort 09:05, beide Kartenschritte vollständig erklärt um 09:08, Ende 09:09. Freundlich, keine Rückfragen, Deutsch beibehalten, Standort nicht genannt, keine Richtigkeitsquelle. Belastung immer null.'),
    el('label',{class:'checkline'},el('input',{type:'checkbox',checked:z.simulation_confirmed,on:{change:event=>{z.simulation_confirmed=event.target.checked;}}}),'Ich habe die interne Simulation ohne Bankkontakt durchgespielt.'));
}

async function startServiceContact(){
  const message=document.getElementById('meldung');
  try { await sende({typ:'b_begin',nr:aktiv.nr});const nr=aktiv.nr;daten=await hole('plan');openForm(daten.plan.find(row=>row.nr===nr));window.dispatchEvent(new Event('workspace-saved')); }
  catch(error){message.textContent=error.message;message.className='meldung fehler';}
}
function startNotice(row){
  return el('aside',{class:'hinweisbox'},el('h2',{},'Startzeit beim Startereignis festhalten'),el('p',{},'Drücke diesen Knopf genau dann, wenn du den Anruf wählst oder die erste Nachricht sendest. Das blosse Öffnen dieses Formulars startet keinen Kontakt.'),el('button',{type:'button',class:'knopf',on:{click:startServiceContact}},'Startzeit jetzt festhalten'));
}
