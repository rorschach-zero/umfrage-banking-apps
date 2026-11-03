'use strict';
(() => {
const forms={
 stakeholder:{title:'Stakeholder',intro:'Erfasse eine Rolle und deinen Umgang mit ihr. Trenne das Gruppenprojekt von einer Marketingmassnahme.',fields:[['bereich','Bereich',['Gruppenprojekt','Massnahme']],['rolle','Rolle'],['einfluss','Einfluss',['tief','mittel','hoch']],['haltung','Haltung',['unterstützend','neutral','kritisch','unbekannt']],['massnahme','Massnahme','textarea'],['kontaktweg','Kontaktweg'],['zustaendig','Zuständig','person'],['aenderungsdatum','Änderungsdatum','date']]},
 coaching:{title:'Coaching-Protokoll',intro:'Halte Fragen, Antworten und nächste Aufgaben fest. Nenne bei jeder Folgeaufgabe die Person und die Frist.',fields:[['termin','Termin','datetime-local'],['anwesenheit','Anwesenheit'],['fragen','Fragen','textarea'],['antworten','Antworten','textarea']]},
 risiko:{title:'Risiken',intro:'Beschreibe das Risiko, seine Folgen und was du dagegen unternimmst.',fields:[['risiko','Risiko','textarea'],['wahrscheinlichkeit','Wahrscheinlichkeit',['tief','mittel','hoch']],['auswirkung','Auswirkung',['tief','mittel','hoch']],['massnahme','Massnahme','textarea'],['verantwortung','Verantwortung','person'],['status','Status',['offen','in Bearbeitung','geschlossen']]]},
 arbeitszeit:{title:'Arbeitszeit',intro:'Erfasse deine geleistete Zeit in Stunden. Eine halbe Stunde ist 0,5 Stunden.',fields:[['datum','Datum','date'],['person','Person','self'],['stunden','Stunden','number'],['aufgabe','Aufgabe','textarea']]},
 beitrag:{title:'6b-Beiträge',intro:'Ordne deinen Beitrag einem Abschnitt der vorgegebenen Gliederung zu. Ein Beitrag ersetzt keine Prüfung oder Abgabe.',fields:[['abschnitt','Abschnitt',Array.from({length:14},(_,i)=>String(i+1))],['beitrag','Beitrag','textarea'],['stand','Stand',['Entwurf','in Bearbeitung','zur Prüfung']]]}
};
let active='stakeholder',who='',saving=false,draft=null,receipts=[],loaded=false;
const $=id=>document.getElementById(id),drafts=new Map();
function newDraft(){return {id:crypto.randomUUID(),values:{},tasks:[],none:false,uncertain:false};}
function field(key,label,type,value,onInput){
 const id='project-'+key,attrs={id,name:key,required:true,on:{input:onInput,change:onInput}};
 let input;
 if(Array.isArray(type)||type==='person'||type==='self'){
  const options=Array.isArray(type)?type:(type==='self'?[who]:Object.keys(TEAM));
  input=el('select',attrs,el('option',{value:''},'Bitte wählen'),options.map(v=>el('option',{value:v},TEAM[v]||v)));input.value=value||'';
  if(type==='self'){input.value=who;input.disabled=true;draft.values[key]=who;}
 }else if(type==='textarea')input=el('textarea',{...attrs,maxlength:6000,rows:4},value||'');
 else input=el('input',{...attrs,type:type||'text',value:value||'',maxlength:6000,...(type==='number'?{min:0.01,max:24,step:0.01}: {})});
 return el('div',{class:'project-field'+(type==='textarea'?' wide':'')},el('label',{for:id},label),input);
}
function missing(){
 const result=[];
 for(const [key,label] of forms[active].fields){const input=$('project-'+key);if(!String(draft.values[key]||'').trim()||!input.checkValidity()||/^=/.test(draft.values[key]))result.push(label);}
 if(active==='coaching'&&!draft.none){if(!draft.tasks.length)result.push('Folgeaufgabe oder Bestätigung ohne Folgeaufgaben');draft.tasks.forEach((t,i)=>{if(!t.aufgabe?.trim()||!t.person||!t.frist||!$('project-taskdate-'+i)?.checkValidity())result.push('Aufgabe '+(i+1)+' mit Person und Frist');});}
 return result;
}
function update(){
 const absent=missing();$('project-save').disabled=saving||!loaded||draft.uncertain||absent.length>0;
 $('project-ready').textContent=draft.uncertain?'Der Eingang ist noch unbestätigt. Wiederhole denselben Speicherauftrag.':absent.length?'Bitte ergänze '+absent.join(', ')+'.':'Alle Pflichtfelder sind vollständig.';
 $('project-ready').className='project-ready'+(!absent.length?' ok':'');
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
 const spec=forms[active];$('project-tabs').replaceChildren(...Object.entries(forms).map(([key,spec])=>el('button',{type:'button',class:'chip','aria-pressed':String(key===active),disabled:saving,on:{click:()=>{active=key;draft=drafts.get(key)||newDraft();drafts.set(key,draft);renderForm();}}},spec.title)));
 const fields=el('div',{class:'project-fields'},spec.fields.map(([key,label,type])=>field(key,label,type,draft.values[key],e=>{draft.values[key]=e.target.value;update();})),active==='coaching'?taskFields():null);
 const form=el('form',{novalidate:true,on:{submit:e=>{e.preventDefault();save();}}},el('h2',{},spec.title),el('p',{},spec.intro),el('p',{class:'leise'},'Alle Felder sind Pflichtfelder. Deine Eingaben bleiben bis zum Speichern nur in diesem geöffneten Fenster.'),fields,el('p',{id:'project-ready',role:'status','aria-live':'polite'}),el('div',{class:'project-actions'},el('button',{id:'project-save',class:'knopf',type:'submit',disabled:true},'Speichern'),draft.uncertain?el('button',{type:'button',class:'knopf hell',on:{click:()=>save(true)}},'Speicherauftrag wiederholen'):null),el('p',{id:'project-message',class:'project-message',role:'status'}));
 $('project-form').replaceChildren(form);
 if(draft.uncertain)fields.querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=true);
 update();
}
function showReceipts(){
 $('project-receipts').replaceChildren(...(receipts.length?receipts.slice().sort((a,b)=>b.zeitstempel.localeCompare(a.zeitstempel)).map(r=>el('article',{},el('strong',{},forms[r.formular].title+' · Zeile '+r.zeile),el('p',{},new Intl.DateTimeFormat('de-CH',{dateStyle:'short',timeStyle:'medium',timeZone:'Europe/Zurich'}).format(new Date(r.zeitstempel))+' · '+r.blatt),el('details',{},el('summary',{},'Prüfbeleg ansehen'),el('p',{},'Kennung '+r.id),el('code',{},r.pruefsumme)))):[el('p',{},'Du hast noch keine Einträge gespeichert.')]));
}
function showSync(sync){
 $('project-sync').replaceChildren(
  el('p',{},sync.enabled?'Der Abgleich läuft stündlich.':'Der automatische Übertrag ist ausgeschaltet. Deine Einträge bleiben im Projektblatt.'),
  ...sync.forms.map(row=>{
   const notion=row.notion_anzahl!==undefined&&row.notion_anzahl!==''?row.notion_anzahl:'unbekannt';
   const state=row.stale?'Abgleich ausstehend oder veraltet':row.status;
   return el('p',{class:'project-sync-row '+(row.stale||!['gleich','ungeprüft'].includes(row.status)?'warn':'ok')},
    forms[row.formular].title+' · '+state+(row.blatt_anzahl!==undefined&&row.blatt_anzahl!==''?' · Blatt '+row.blatt_anzahl+' · Notion '+notion:'')+(row.fehler?' · '+row.fehler:''));
  })
 );
}
async function save(retry=false){
 if(saving||!loaded||window.PA6View.active()||(!retry&&(draft.uncertain||missing().length)))return;
 const current=draft,type=active,payload={...current.values};if(type==='coaching')payload.folgeaufgaben=JSON.stringify(current.none?[]:current.tasks);
 saving=true;renderForm();$('project-form').querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=true);$('project-message').textContent='Dein Eintrag wird gespeichert …';
 try{
  const r=await sende({typ:'projekt_save',formular:type,id:current.id,felder:payload});
  if(r.id!==current.id||r.formular!==type||!Number.isInteger(r.zeile)||r.zeile<2||!Number.isFinite(Date.parse(r.zeitstempel))||!/^[a-f0-9]{64}$/.test(r.pruefsumme))throw Error('Die Speicherquittung ist unvollständig');
  receipts=receipts.filter(x=>x.id!==r.id).concat(r);draft=newDraft();drafts.set(type,draft);saving=false;renderForm();showReceipts();$('project-message').textContent='Gespeichert in '+r.blatt+' · Zeile '+r.zeile+' · '+new Date(r.zeitstempel).toLocaleString('de-CH')+'.';
 }catch(error){saving=false;current.uncertain=true;renderForm();$('project-message').textContent='Noch keine bestätigte Quittung. '+error.message+' Deine Eingaben bleiben erhalten.';}
}
async function start(){
 if(window.PA6View.active()){$('project-loading').textContent='Öffne Projekt in deinem eigenen Zugang. Die Personenansicht bleibt nur lesend.';return;}
 if(!schluessel()){$('project-loading').textContent='Öffne deinen persönlichen Team-Link.';return;}
 try{
  const data=await hole('projekt'),keys=Object.keys(forms);
  const receiptOk=row=>row&&forms[row.formular]&&typeof row.id==='string'&&Number.isInteger(row.zeile)&&row.zeile>=2&&Number.isFinite(Date.parse(row.zeitstempel))&&typeof row.blatt==='string'&&/^[a-f0-9]{64}$/.test(row.pruefsumme);
  const syncOk=data.sync&&typeof data.sync.enabled==='boolean'&&Array.isArray(data.sync.forms)&&data.sync.forms.length===keys.length&&data.sync.forms.every(row=>row&&forms[row.formular]&&typeof row.status==='string');
  if(!TEAM[data.person]||JSON.stringify(data.forms)!==JSON.stringify(keys)||!Array.isArray(data.receipts)||!data.receipts.every(receiptOk)||!syncOk)throw Error('Der Projektbereich ist noch nicht bereitgestellt');
  who=data.person;receipts=data.receipts;loaded=true;draft=newDraft();drafts.set(active,draft);$('wer').textContent=TEAM[who];$('project-loading').hidden=true;$('project-content').hidden=false;renderForm();showReceipts();showSync(data.sync);
 }
 catch(error){$('project-loading').replaceChildren(el('span',{},error.message+' '),el('button',{type:'button',class:'chip',on:{click:start}},'Erneut laden'));}
}
window.addEventListener('beforeunload',event=>{if([...drafts.values()].some(d=>d.uncertain||Object.keys(d.values).some(k=>k!=='person'&&d.values[k]))){event.preventDefault();event.returnValue='';}});
start();
})();
