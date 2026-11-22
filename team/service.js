"use strict";
const SNAPSHOT_CHANNELS={chat:'Chat',telefon:'Telefon',formular:'Kontaktformular',mail:'E-Mail'};
function snapshotKnown(s){return s?.method==='qualitative_snapshot'&&s.state==='ready'&&Array.isArray(s.providers);}
function snapshotStatus(s){return !snapshotKnown(s)?'Stand unbekannt':s.providers.map(p=>p.provider+' · '+p.state).join(' · ');}
function serviceMessage(text){const node=document.getElementById('service-message');if(node)node.textContent=text;}
function snapshotEvidence(item){
 if(!item.beleg_ref)return el('p',{class:'snapshot-evidence'},(SNAPSHOT_CHANNELS[item.kontaktweg]||item.kontaktweg)+' · '+(TEAM[item.person]||item.person||'Person unbekannt')+' · '+(item.tag||'Tag unbekannt')+' · '+item.state);
 const details=el('details',{class:'b-card snapshot-evidence','data-ref':item.beleg_ref},el('summary',{},'Belege ansehen · '+item.beleg_ref));
 details.append(el('p',{},(SNAPSHOT_CHANNELS[item.kontaktweg]||item.kontaktweg)+' · '+(TEAM[item.person]||item.person||'Person unbekannt')+' · '+item.state));
 if(item.relatedRefs?.length)details.append(el('p',{},'Ein Gespräch · zugehörige Originaleinträge '+item.relatedRefs.join(', ')));
 for(const original of item.originals||[])details.append(el('details',{},el('summary',{},'Originalbeleg '+original.nr),el('pre',{class:'snapshot-original'},Object.entries(original).map(([k,v])=>k+': '+v).join('\n'))));
 if(item.note)details.append(el('dl',{},['ablauf','antwort','eindruck','offene_angaben','aenderungsgrund'].flatMap(k=>[el('dt',{},({ablauf:'Beobachteter Ablauf',antwort:'Erhaltene Antwort',eindruck:'Persönlicher Eindruck',offene_angaben:'Offene Angaben',aenderungsgrund:'Änderungsgrund'})[k]),el('dd',{},item.note[k]||'Nicht dokumentiert')])));
 if(daten.person==='SA'&&!PA6View.active()&&daten.service.reviewSource==='ready'){
  const edit=el('details',{},el('summary',{},'Angaben ergänzen'));
  const fields={};for(const [key,label]of Object.entries({ablauf:'Was geschah?',antwort:'Welche Antwort kam?',eindruck:'Mein persönlicher Eindruck',offene_angaben:'Was bleibt unklar?',aenderungsgrund:'Änderungsgrund'})){
   fields[key]=el('textarea',{rows:3,maxlength:1500,'aria-label':label});fields[key].value=item.note?.[key]||'';edit.append(el('label',{},label,fields[key]));
  }
  edit.append(el('p',{},'Quelle oder Beleg: '+item.beleg_ref),el('p',{class:'leise'},'Nur Angaben aus vorhandenen Belegen ergänzen. Keine Kontodaten oder Mitarbeitendennamen eintragen.'));
  const save=async(action)=>{const note=Object.fromEntries(Object.entries(fields).map(([k,node])=>[k,node.value]));serviceMessage('Wird gespeichert …');try{await sende({typ:'b_snapshot',ref:item.beleg_ref,note,action});await start();serviceMessage('Nachtrag gespeichert.');}catch(e){serviceMessage(e.message);}};
  edit.append(el('button',{class:'knopf',type:'button',on:{click:()=>save('save')}},'Angaben speichern'),el('button',{class:'knopf hell',type:'button',on:{click:()=>save('submit')}},'Zur Prüfung geben'));
  if(['SA','ES'].includes(daten.person))edit.append(el('button',{class:'knopf hell',type:'button',on:{click:()=>save('review')}},'Belegprüfung dokumentieren'));
  details.append(edit);
 }
 return details;
}
function renderBSetup(main){
 const s=daten.service;
 main.append(el('section',{class:'b-card'},el('h1',{},'Service-Momentaufnahmen'),el('p',{},'Wir halten fest, was wir bei unseren Kontakten mit Yuh und Zak erlebt haben.'),el('p',{class:'leise'},'Subjektive Momentaufnahmen: wenige Kontakte, ein kurzer Zeitraum und wenige Personen. Die Ergebnisse erlauben keine allgemeine Bewertung oder Rangfolge des Kundendiensts.')));
 if(!snapshotKnown(s)){main.append(el('p',{role:'alert',class:'b-alert'},'Stand unbekannt. Die Belegquelle konnte nicht gelesen werden. Bitte den aktuellen Stand laden.'));return;}
 if(daten.person==='ES'||daten.person==='SA')main.append(el('section',{class:'b-card snapshot-review'},el('h2',{},'Momentaufnahmen prüfen · bis 24.11.2026'),el('p',{},'Ernes prüft die Zuordnung, hält offene Angaben fest und bereitet die Anbietertexte auf.'),el('a',{href:'/team/projekt/momentaufnahme/'},'Prüfung öffnen')));
 for(const provider of s.providers){
  const own=(s.evidence||[]).filter(r=>r.anbieter===provider.provider);
  const card=el('section',{class:'b-card snapshot-provider'},el('h2',{},provider.provider),el('p',{class:'b-label'},provider.state),el('p',{},provider.note));
  for(const channel of provider.channels||[])card.append(el('p',{},(SNAPSHOT_CHANNELS[channel.channel]||channel.channel)+' · '+channel.evidenceRefs.join(' · ')));
  own.forEach(item=>card.append(snapshotEvidence(item)));
  if(!own.length)card.append(el('p',{class:'leise'},'Interne Rohbelege sind nur für Salah zugänglich.'));
  main.append(card);
 }
 main.append(el('p',{class:'leise'},'Der Stand zeigt, wie vollständig die Dokumentation geprüft ist. Er bewertet nicht den Kundendienst.'));
 if(s.reviewSource!=='ready')main.append(el('p',{role:'status'},'Die Quelle für Nachträge und Belegprüfungen ist noch nicht verfügbar. Der verfügbare Belegstand bleibt sichtbar.'));
 main.append(el('p',{id:'service-message',role:'status','aria-live':'polite'}));
}
