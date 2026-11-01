'use strict';
// Shared field controls. All assignments and eligibility checks are server-owned.
function serviceMessage(text) { const node=document.getElementById('service-message');if(node)node.textContent=text; }
async function serviceAction(body) {
  serviceMessage('Wird gespeichert …');
  try { const result=await sende(body);await start();window.dispatchEvent(new Event('workspace-saved'));serviceMessage(result.assigned!==undefined?result.assigned+' Zellen übernommen.':'Gespeichert.');return result; }
  catch(error){serviceMessage(error.message);return null;}
}
function renderBSetup(main) {
  const state=daten.service;
  if(!state||state.error){main.append(el('p',{role:'alert'},state?.error||'Selbstzuteilung derzeit nicht verfügbar.'));return;}
  const config=state.config, section=el('section',{class:'karte service-setup'}), date=el('input',{type:'date',id:'service-day',min:config.start,max:config.end,value:nextServiceDay(config.start)});
  const selected=new Set(state.selected);
  const choices=el('fieldset',{class:'bank-options'},el('legend',{},'Deine aktiven Konten'),['Yuh','Neon','Zak','Revolut'].map(provider=>el('label',{},el('input',{type:'checkbox',name:'provider',value:provider,checked:selected.has(provider),on:{change:event=>{event.target.checked?selected.add(provider):selected.delete(provider);serviceMessage('');}}}),provider)));
  fuelle(section,el('h2',{},'Dein Start in die Servicebeobachtung'),el('p',{class:'service-status'},(state.probeDone?'Probe erledigt':'Probe noch offen')+' · '+state.done+' von '+config.target+' Kontakten erledigt · '+state.assigned+' zugeteilt'),
    el('p',{},heute()<config.start?'Probe jetzt möglich, echte Kontakte ab '+formatServiceDate(config.start):'Probe jetzt möglich. Echte Kontakte nach deiner Probe an Werktagen in Block A/B.'),
    el('p',{class:'leise'},'Offizieller Feldbeginn '+formatServiceDate(config.official)+'. Frühere Kontakte werden als vorgezogen markiert und zählen normal.'),
    el('button',{class:'knopf',type:'button',on:{click:()=>oeffne(state.probe)}},state.probeDone?'Probe ansehen':'Probe starten'),
    choices,el('p',{class:'leise'},'Wähle mindestens zwei verschiedene Banken. Nur Banken, bei denen du ein aktives Konto hast. Alle vier stehen zur Auswahl.'),
    el('label',{for:'service-day'},'Einsätze frühestens ab'),date,el('p',{class:'leise'},'Wiederholung 1 in Block A von 09–12 Uhr, Wiederholung 2 an einem anderen Tag in Block B von 13–17 Uhr. Höchstens zwei Kontakte je Block.'),
    el('button',{class:'knopf',type:'button',on:{click:()=>serviceAction({typ:'b_assign',providers:[...selected],day:date.value})}},state.assigned?'Auswahl speichern und freie Zellen ergänzen':'Kontakte zuteilen'),
    state.canTakeMore?el('button',{class:'knopf hell',type:'button',on:{click:()=>serviceAction({typ:'take_more',area:'b',day:date.value})}},'Weitere Fälle übernehmen'):null,
    el('p',{id:'service-message',role:'status','aria-live':'polite'}));
  if(state.next)section.append(el('p',{},'Nächste Zelle '+state.next.nr+' · '+state.next.anbieter+' · '+state.next.tag+' · Block '+state.next.block));
  if(state.open)section.append(el('details',{},el('summary',{},'Offene Zellen der Gruppe'),el('ul',{},state.open.map(row=>el('li',{},row.provider+' · '+row.open+' offen')))));
  if(state.selected.length)section.append(channelSetup(state));
  main.append(section);
}
function formatServiceDate(day){return day.split('-').reverse().join('.');}
function nextServiceDay(start){let day=[start,heute()].sort().pop();while([0,6].includes(new Date(day+'T12:00:00').getDay())){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);day=d.toISOString().slice(0,10);}return day;}
function channelSetup(state){
  const provider=el('select',{id:'channel-provider'},state.selected.map(a=>el('option',{value:a},a))),kind=el('select',{id:'channel-kind'},el('option',{value:'schriftlich'},'Schriftlich'),el('option',{value:'telefon'},'Telefon')),
    channel=el('select',{id:'channel-value'},['chat','mail','formular','telefon','keiner'].map(a=>el('option',{value:a},a==='keiner'?'Nicht angeboten':a))),source=el('input',{id:'channel-source',type:'url',placeholder:'https://…'}),date=el('input',{id:'channel-date',type:'date',max:heute(),value:heute()}),checked=el('input',{type:'checkbox',id:'channel-checked'});
  return el('details',{class:'channel-setup'},el('summary',{},'Kanäle vor dem echten Kontakt bestätigen'),el('p',{},'Prüfe die Anbieterquelle und die Bedingungen. Schriftlich gilt Chat in der App, falls angeboten, sonst Formular oder E-Mail. Eine fehlende Telefonverbindung ist ein Befund, kein erfundener Kontakt.'),
    el('ul',{},state.channels.map(r=>el('li',{},r.anbieter+' · '+r.art+' · '+r.kanal+' · '+r.abruf))),
    el('label',{for:'channel-provider'},'Anbieter'),provider,el('label',{for:'channel-kind'},'Kanalart'),kind,el('label',{for:'channel-value'},'Belegter Kanal'),channel,
    el('label',{for:'channel-source'},'Quelle des Anbieters'),source,el('label',{for:'channel-date'},'Abrufdatum'),date,
    el('label',{class:'checkline'},checked,'Ich habe Kanalregel und Bedingungen geprüft. Dieser Kontakt ist nach der Prüfung möglich.'),
    el('button',{class:'knopf hell',type:'button',on:{click:()=>serviceAction({typ:'b_channel',provider:provider.value,kind:kind.value,channel:channel.value,source:source.value,date:date.value,checked:checked.checked})}},'Kanalbeleg speichern'));
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
