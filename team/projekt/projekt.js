'use strict';
(() => {
const FORM_ORDER=['stakeholder','coaching','risiko','arbeitszeit','beitrag'];
const ABSCHNITTE_6B=[
 {id:'1',title:'Ausgangslage und Problemstellung'},{id:'2',title:'Fazit der Analyse und Diagnose der Datenanalyse PA6a'},
 {id:'3',title:'Ökonomische und Vorökonomische Zielsetzungen'},{id:'4',title:'Risiko Map'},{id:'5',title:'Stakeholder-Analyse'},
 {id:'6',title:'Zielgruppenanalyse'},{id:'7',title:'Strategische Ansätze und Begründungen'},{id:'8',title:'Marketing-Mix'},
 {id:'9',title:'Nachhaltigkeitserläuterungen'},{id:'10',title:'Budget- und Kostenplanung'},{id:'11',title:'Fazit'},
 {id:'12',title:'Reflexion'},{id:'13',title:'Alle nötigen Verzeichnisse'},{id:'14',title:'Eigenständigkeitserklärung'}
];
const forms={
 stakeholder:{title:'Stakeholder',intro:'Eine Zeile pro Person oder Gruppe, die von der Massnahme für Yuh betroffen ist oder sie beeinflusst (Stakeholder-Map, C7).',fields:[['bereich','Bereich',['Massnahme']],['rolle','Rolle'],['einfluss','Einfluss',['tief','mittel','hoch']],['haltung','Haltung',['unterstützend','neutral','kritisch','unbekannt']],['massnahme','Massnahme','textarea'],['kontaktweg','Kontaktweg'],['zustaendig','Zuständig','person'],['aenderungsdatum','Änderungsdatum','date']]},
 coaching:{title:'Coaching-Protokoll',intro:'Dokumentiert ein Coaching mit Fragen, Antworten und Folgeaufgaben (Protokolle der Coachings, C6).',fields:[['termin','Termin','datetime-local'],['anwesenheit','Anwesenheit'],['fragen','Fragen','textarea'],['antworten','Antworten','textarea']]},
 risiko:{title:'Risiken',intro:'Was bei der Massnahme für Yuh oder bei unserer Gruppenarbeit schiefgehen kann und was ihr dagegen tut (Risiko-Map C8, Projektrisiken C4).',fields:[['bereich','Bereich',['Massnahme','Gruppenprojekt']],['risiko','Risiko','textarea'],['wahrscheinlichkeit','Wahrscheinlichkeit',['tief','mittel','hoch']],['auswirkung','Auswirkung',['tief','mittel','hoch']],['massnahme','Massnahme','textarea'],['verantwortung','Verantwortung','person'],['status','Status',['offen','in Bearbeitung','geschlossen']]]},
 arbeitszeit:{title:'Arbeitszeit',intro:'Erfasst geleistete Stunden für den Abgleich Plan und Ist (Aufwand Plan gegen Ist, C5).',fields:[['datum','Datum','date'],['person','Person','self'],['stunden','Stunden','hours'],['paket','Arbeitspaket','paket'],['aufgabe','Aufgabe','textarea']]},
 beitrag:{title:'6b-Beiträge',intro:'Ordnet deinen Textbeitrag einem Abschnitt der vorgegebenen 6b-Gliederung zu (eigener Beitrag zu einem 6b-Abschnitt).',fields:[['abschnitt','Abschnitt',ABSCHNITTE_6B.map(row=>row.id)],['beitrag','Beitrag','textarea'],['stand','Stand',['Entwurf','in Bearbeitung','zur Prüfung']]]}
};
let active=FORM_ORDER[0],who='',saving=false,draft=null,receipts=[],loaded=false,pakete=[];
const $=id=>document.getElementById(id),drafts=new Map();
function abschnittLabel(id){return ABSCHNITTE_6B.find(row=>row.id===String(id))?.title||('Abschnitt '+id);}
function newDraft(){return {id:crypto.randomUUID(),values:{},tasks:[],none:false,uncertain:false};}
function normalizeHours(raw){
 const text=String(raw||'').trim().replace(',','.');
 if(!/^\d{1,2}(\.\d{1,2})?$/.test(text))return null;
 const value=Number(text);
 return value>0&&value<=24?String(value):null;
}
function fieldInvalid(key,label,type){
 const input=$('project-'+key);
 if(!input)return false;
 const value=String(draft.values[key]||'').trim();
 if(type==='hours')return !normalizeHours(value);
 if(type==='paket')return false;
 if(!value||!input.checkValidity()||/^=/.test(value))return true;
 return false;
}
function field(key,label,type,value,onInput){
 const id='project-'+key,invalid=fieldInvalid(key,label,type);
 const mark=e=>{(draft.touched||(draft.touched=new Set())).add(key);onInput&&onInput(e);};
 const attrs={id,name:key,required:type!=='paket','aria-describedby':id+'-error',on:{input:mark,change:mark},...(invalid?{'aria-invalid':'true'}:{})};
 let input;
 if(Array.isArray(type)||type==='person'||type==='self'||type==='paket'){
  if(type==='paket'){
   input=el('select',attrs,el('option',{value:''},'Paket optional'),...pakete.map(row=>el('option',{value:row.ref},row.ref+' · '+row.title)),el('option',{value:'anderes'},'anderes'));
   input.value=value||'';
  }else{
  const options=Array.isArray(type)?type:(type==='self'?[who]:Object.keys(TEAM));
  input=el('select',attrs,el('option',{value:''},'Bitte wählen'),options.map(v=>el('option',{value:v},key==='abschnitt'?v+' · '+abschnittLabel(v):(TEAM[v]||v))));input.value=value||'';
  if(type==='self'){input.value=who;input.disabled=true;draft.values[key]=who;}
  }
 }else if(type==='textarea')input=el('textarea',{...attrs,maxlength:6000,rows:4},value||'');
 else if(type==='hours')input=el('input',{...attrs,type:'text',inputMode:'decimal',value:value||'',maxlength:8,placeholder:'0.5 mit Punkt oder Komma'});
 else input=el('input',{...attrs,type:type||'text',value:value||'',maxlength:6000});
 // t34 B6: Fehlertext immer im Dokument, sichtbar sobald das Feld berührt wurde.
 const error=el('p',{id:id+'-error',class:'field-error',role:'alert',hidden:true},type==='hours'?'Erfasse mehr als 0 und höchstens 24 Stunden. 0,5 mit Punkt oder Komma.':'Bitte ergänze '+label+'.');
 return el('div',{class:'project-field'+(type==='textarea'?' wide':'')+(invalid&&draft.touched&&draft.touched.has(key)?' is-invalid':'')},el('label',{for:id},label),input,error);
}
function missing(){
 const result=[];
 for(const [key,label,type] of forms[active].fields){
  if(fieldInvalid(key,label,type||'text'))result.push(label);
 }
 if(active==='coaching'&&!draft.none){if(!draft.tasks.length)result.push('Folgeaufgabe oder Bestätigung ohne Folgeaufgaben');draft.tasks.forEach((t,i)=>{if(!t.aufgabe?.trim()||!t.person||!t.frist||!$('project-taskdate-'+i)?.checkValidity())result.push('Aufgabe '+(i+1)+' mit Person und Frist');});}
 return result;
}
function update(){
 const absent=missing();$('project-save').disabled=saving||!loaded||draft.uncertain||absent.length>0;
 $('project-ready').textContent=draft.uncertain?'Der Eingang ist noch unbestätigt. Wiederhole denselben Speicherauftrag.':absent.length?(draft.touched&&[...draft.touched].some(k=>forms[active].fields.some(f=>f[0]===k&&fieldInvalid(f[0],f[1],f[2]||'text')))?'Bitte prüfe die markierten Felder.':'Füll die Felder aus, dann kannst du speichern.'):'Alle Pflichtfelder sind vollständig.';
 $('project-ready').className='project-ready'+(!absent.length?' ok':'');
 for(const [key,label,type] of forms[active].fields){
  const input=$('project-'+key),invalid=fieldInvalid(key,label,type||'text');
  input?.closest('.project-field')?.classList.toggle('is-invalid',invalid&&!!draft.touched&&draft.touched.has(key));
  if(input)input.setAttribute('aria-invalid',invalid?'true':'false');
  const err=$('project-'+key+'-error');if(err)err.hidden=!(invalid&&draft.touched&&draft.touched.has(key));
 }
}
function taskFields(){
 const box=el('fieldset',{class:'project-tasks'},el('legend',{},'Folgeaufgaben'));
 const check=el('input',{type:'checkbox',checked:draft.none,on:{change:e=>{draft.none=e.target.checked;renderForm();}}});
 box.append(el('label',{class:'project-none'},check,'Es gibt keine Folgeaufgaben.'));
 if(!draft.none){draft.tasks.forEach((task,i)=>{
  box.append(el('div',{class:'project-task'},field('task-'+i,'Aufgabe '+(i+1),'text',task.aufgabe,e=>{task.aufgabe=e.target.value;update();}),field('taskperson-'+i,'Person','person',task.person,e=>{task.person=e.target.value;update();}),field('taskdate-'+i,'Frist','date',task.frist,e=>{task.frist=e.target.value;update();}),el('button',{type:'button',class:'chip','aria-label':'Aufgabe '+(i+1)+' entfernen',on:{click:()=>{draft.tasks.splice(i,1);renderForm();}}},'Entfernen')));
 });box.append(el('button',{type:'button',class:'chip',disabled:draft.tasks.length>=20,on:{click:()=>{draft.tasks.push({aufgabe:'',person:'',frist:''});renderForm();}}},'Folgeaufgabe hinzufügen'));}
 return box;
}
function renderForm(){
 const spec=forms[active];
 $('project-tabs').replaceChildren(...FORM_ORDER.map((key,index)=>{
  const unlocked=receipts.some(r=>r.formular===key)||!FORM_ORDER.slice(0,index).some(prev=>!receipts.some(r=>r.formular===prev));
  return el('button',{type:'button',class:'chip','aria-pressed':String(key===active),disabled:saving||!unlocked,on:{click:()=>{active=key;draft=drafts.get(key)||newDraft();drafts.set(key,draft);renderForm();showNext();}}},String(index+1)+'. '+forms[key].title);
 }));
 const fields=el('div',{class:'project-fields'},spec.fields.map(([key,label,type])=>field(key,label,type,draft.values[key],e=>{draft.values[key]=e.target.value;update();})),active==='coaching'?taskFields():null);
 const form=el('form',{novalidate:true,on:{submit:e=>{e.preventDefault();save();}}},el('h2',{},spec.title),el('p',{},spec.intro),el('p',{class:'leise'},(active==='arbeitszeit'?'Alle Felder ausser dem Arbeitspaket sind Pflichtfelder.':'Alle Felder sind Pflichtfelder.')+' Deine Eingaben bleiben bis zum Speichern nur in diesem geöffneten Fenster.'),fields,el('p',{id:'project-ready',role:'status','aria-live':'polite'}),el('div',{class:'project-actions'},el('button',{id:'project-save',class:'knopf',type:'submit',disabled:true},draft.id&&receipts.some(r=>r.id===draft.id)?'Änderung speichern':'Speichern'),draft.uncertain?el('button',{type:'button',class:'knopf hell',on:{click:()=>save(true)}},'Speicherauftrag wiederholen'):null),el('p',{id:'project-message',class:'project-message',role:'status'}));
 $('project-form').replaceChildren(form);
 if(draft.uncertain)fields.querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=true);
 update();
}
function entrySummary(row){
 if(!row||!row.felder)return '';
 const f=row.felder;
 if(row.formular==='stakeholder')return f.rolle+' · '+f.bereich;
 if(row.formular==='coaching')return f.termin+' · '+String(f.fragen||'').slice(0,80);
 if(row.formular==='risiko')return String(f.risiko||'').slice(0,80);
 if(row.formular==='arbeitszeit')return f.datum+' · '+f.stunden+' h'+(f.paket?' · '+f.paket:'')+' · '+String(f.aufgabe||'').slice(0,60);
 if(row.formular==='beitrag')return abschnittLabel(f.abschnitt)+' · '+String(f.beitrag||'').slice(0,80);
 return '';
}
function loadEntry(row){
 active=row.formular;draft={id:row.id,values:{...row.felder},tasks:[],none:false,uncertain:false};
 if(row.formular==='coaching'){
  try{const tasks=JSON.parse(row.felder.folgeaufgaben||'[]');draft.tasks=Array.isArray(tasks)?tasks:[];draft.none=!draft.tasks.length;}catch{draft.tasks=[];}
 }
 drafts.set(active,draft);renderForm();showNext();$('project-message').textContent='Du bearbeitest einen gespeicherten Eintrag.';
}
function showReceipts(){
 $('project-receipts').replaceChildren(...(receipts.length?receipts.slice().sort((a,b)=>b.zeitstempel.localeCompare(a.zeitstempel)).map(r=>el('article',{},
  el('strong',{},forms[r.formular].title+' · Zeile '+r.zeile),
  el('p',{},entrySummary(r)),
  el('p',{class:'leise'},new Intl.DateTimeFormat('de-CH',{dateStyle:'short',timeStyle:'medium',timeZone:'Europe/Zurich'}).format(new Date(r.zeitstempel))+' · '+r.blatt),
  el('button',{type:'button',class:'chip',on:{click:()=>loadEntry(r)}},'Bearbeiten'),
  el('details',{},el('summary',{},'Prüfbeleg ansehen'),el('p',{},'Kennung '+r.id),el('code',{},r.pruefsumme)))):[el('p',{},'Du hast noch keine Einträge gespeichert.')]));
}
function syncLabel(row,enabled){
 if(!enabled)return 'Übertrag aus';
 if(row.stale)return 'Abgleich ausstehend';
 return row.status||'ungeprüft';
}
function showSync(sync){
 $('project-sync').replaceChildren(
  el('p',{},sync.enabled?'Der Abgleich läuft stündlich.':'Der automatische Übertrag ist ausgeschaltet. Deine Einträge bleiben im Projektblatt.'),
  ...sync.forms.map(row=>{
   const notion=row.notion_anzahl!==undefined&&row.notion_anzahl!==''?row.notion_anzahl:'unbekannt';
   const state=syncLabel(row,sync.enabled);
   const checksum=row.blatt_pruefsumme?String(row.blatt_pruefsumme).slice(0,12)+'…':'';
   return el('p',{class:'project-sync-row '+(sync.enabled&&(row.stale||!['gleich','ungeprüft','ausgeschaltet'].includes(row.status))?'warn':'ok')},
    forms[row.formular].title+' · '+state+(row.blatt_anzahl!==undefined&&row.blatt_anzahl!==''?' · Blatt '+row.blatt_anzahl+' · Notion '+notion:'')+(checksum?' · Prüfsumme '+checksum:'')+(row.fehler?' · '+row.fehler:''));
  })
 );
}
function showNext(){
 const next=FORM_ORDER.find(key=>!receipts.some(r=>r.formular===key))||null;
 $('project-next').replaceChildren(
  el('h2',{},'Als Nächstes'),
  el('p',{},next?('Als Nächstes '+forms[next].title+'. Die Formulare folgen der Projekt-Reihenfolge.'):'Du hast alle fünf Formulare mindestens einmal gespeichert.'),
  el('p',{class:'leise'},'Offen '+FORM_ORDER.filter(key=>!receipts.some(r=>r.formular===key)).map(key=>forms[key].title).join(' · ')||'keine Pflichtformulare')
 );
}
function showServiceLink(){
 $('project-service-link').replaceChildren(
  el('h2',{},'Einsatzplan Servicetest'),
  el('p',{},'Deine Kontakte planst und erfasst du im Servicetest. Dort siehst du nur deine Zeilen.'),
  el('a',{href:'../b/',class:'knopf hell'},'Zum Servicetest →')
 );
}
function draftDirty(d){
 if(d.uncertain)return true;
 if(Object.keys(d.values).some(k=>k!=='person'&&String(d.values[k]||'').trim()))return true;
 if(d.none)return false;
 if(d.tasks.length)return d.tasks.some(t=>t.aufgabe?.trim()||t.person||t.frist);
 return false;
}
async function save(retry=false){
 if(saving||!loaded||window.PA6View.active()||(!retry&&(draft.uncertain||missing().length)))return;
 const current=draft,type=active,payload={...current.values};
 if(type==='coaching')payload.folgeaufgaben=JSON.stringify(current.none?[]:current.tasks);
 if(type==='arbeitszeit'){const hours=normalizeHours(payload.stunden);if(!hours)return;payload.stunden=hours;if(payload.paket==='anderes')payload.paket='';}
 saving=true;renderForm();$('project-form').querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=true);$('project-message').textContent='Dein Eintrag wird gespeichert …';
 try{
  const r=await sende({typ:'projekt_save',formular:type,id:current.id,felder:payload});
  if(r.id!==current.id||r.formular!==type||!Number.isInteger(r.zeile)||r.zeile<2||!Number.isFinite(Date.parse(r.zeitstempel))||!/^[a-f0-9]{64}$/.test(r.pruefsumme))throw Error('Die Speicherquittung ist unvollständig');
  const stored=Object.assign({},r,{felder:payload});
  receipts=receipts.filter(x=>x.id!==r.id).concat(stored);draft=newDraft();drafts.set(type,draft);saving=false;renderForm();showReceipts();showNext();$('project-message').textContent='Gespeichert in '+r.blatt+' · Zeile '+r.zeile+' · '+new Date(r.zeitstempel).toLocaleString('de-CH')+'.';
 }catch(error){saving=false;current.uncertain=true;renderForm();$('project-message').textContent='Noch keine bestätigte Quittung. '+error.message+' Deine Eingaben bleiben erhalten.';}
}
async function start(){
 if(window.PA6View.active()){$('project-loading').textContent='Öffne Projekt in deinem eigenen Zugang. Die Personenansicht bleibt nur lesend.';return;}
 if(!schluessel()){$('project-loading').textContent='Öffne deinen persönlichen Team-Link.';return;}
 try{
  const data=await hole('projekt'),keys=FORM_ORDER;
  const receiptOk=row=>row&&forms[row.formular]&&typeof row.id==='string'&&Number.isInteger(row.zeile)&&row.zeile>=2&&Number.isFinite(Date.parse(row.zeitstempel))&&typeof row.blatt==='string'&&/^[a-f0-9]{64}$/.test(row.pruefsumme);
  const syncOk=data.sync&&typeof data.sync.enabled==='boolean'&&Array.isArray(data.sync.forms)&&data.sync.forms.length===keys.length&&data.sync.forms.every(row=>row&&forms[row.formular]&&typeof row.status==='string');
  const paketeOk=Array.isArray(data.pakete)&&data.pakete.every(row=>row&&/^AP-\d{3}$/.test(row.ref)&&typeof row.title==='string');
  if(!TEAM[data.person]||JSON.stringify(data.forms)!==JSON.stringify(keys)||!Array.isArray(data.receipts)||!data.receipts.every(receiptOk)||!syncOk||!paketeOk)throw Error('Der Projektbereich ist noch nicht bereitgestellt');
  who=data.person;pakete=data.pakete;receipts=data.receipts;loaded=true;draft=newDraft();drafts.set(active,draft);$('wer').textContent=TEAM[who];$('project-loading').hidden=true;$('project-content').hidden=false;showNext();showServiceLink();renderForm();showReceipts();showSync(data.sync);
 }
 catch(error){$('project-loading').replaceChildren(el('span',{},error.message+' '),el('button',{type:'button',class:'chip',on:{click:start}},'Erneut laden'));}
}
window.addEventListener('beforeunload',event=>{if([...drafts.values()].some(draftDirty)){event.preventDefault();event.returnValue='';}});
start();
})();
