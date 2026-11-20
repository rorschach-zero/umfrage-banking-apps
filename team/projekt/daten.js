'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ProjectData=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
const names={SA:'Salah',ES:'Ernes',MG:'Melisa',AM:'Arber',LB:'Leonie'};
function valid(result, as = '') {
  const leadership = true;
  if (Date.parse(result?.fetchedAt) > Date.now()) return false;
  if (as ? result?.readOnly !== true || result?.viewer !== 'SA' || result?.person !== as || result?.role !== 'mitglied' : result?.readOnly || result?.viewer) return false;
  if(!result||result.ok!==true||!Object.hasOwn(names,result.person)||!['mitglied','leitung'].includes(result.role)||!Number.isFinite(Date.parse(result.fetchedAt))||result.contract!=='t1-v1')return false;
  if(result.role==='leitung'&&(result.person!=='SA'||!leadership))return false;
  for(const name of ['psp','meetings'])if(!['ready','unknown'].includes(result.sources?.[name]?.state))return false;
  for(const name of ['tasks','meetings','milestones','phases','reserves','writing'])if(result[name]!==null&&!Array.isArray(result[name]))return false;
  if(result.sources.psp.state==='unknown'&&['tasks','milestones','phases','reserves','writing','group'].some(name=>result[name]!==null))return false;
  if(result.sources.psp.state==='ready'&&['tasks','milestones','phases','reserves','writing','group'].some(name=>result[name]===null||result[name]===undefined))return false;
  if((result.sources.meetings.state==='unknown')!==(result.meetings===null))return false;
  for(const name of ['tasks','meetings','milestones','phases','reserves','writing'])for(const row of result[name]||[]){
    if(!row||typeof row!=='object'||(row.due!==null&&row.due!==undefined&&!Number.isFinite(Date.parse(row.due))))return false;
    for(const field of ['title','ref','status','owner','Was','Warum','Fertig wenn',"So geht's",'Wo','Pia-Frage'])if(row[field]!==null&&row[field]!==undefined&&typeof row[field]!=='string')return false;
  }
  for(const name of ['chapters','assignments']) {
    if(result[name]!==undefined && result[name]!==null && !Array.isArray(result[name]))return false;
    for(const row of result[name]||[])if(!row || typeof row.id!=='string' || ['Was','Warum','Fertig wenn',"So geht's",'Wo','Pia-Frage'].some(field=>row[field]!==undefined&&typeof row[field]!=='string'))return false;
  }
  if(result.areas!==undefined){
    if(!Array.isArray(result.areas)||result.areas.some(a=>!a||!['b','c','writing','tasks'].includes(a.id)||typeof a.title!=='string'||!['ready','unknown'].includes(a.state)||!Array.isArray(a.taskIds)||a.taskIds.some(id=>typeof id!=='string')||['done','total','expected'].some(k=>a[k]!==null&&(!Number.isInteger(a[k])||a[k]<0))))return false;
  }
  if(result.blockers!==undefined&&(!Array.isArray(result.blockers)||result.blockers.some(b=>!b||typeof b.text!=='string'||typeof b.question!=='string'||!/^hang:(overdue|dependency|backlog|contact|stop|consensus):([a-f0-9-]{32,36}|b|c|writing|tasks)$/.test(b.ctx)||result.role==='mitglied'&&b.owner!==result.person)))return false;
  if(result.leadership!==undefined&&result.leadership!==null){
    const count=v=>v===null||Number.isInteger(v)&&v>=0;
    if(result.role!=='leitung'||!Array.isArray(result.leadership)||result.leadership.length!==5||new Set(result.leadership.map(row=>row.person)).size!==5||result.leadership.some(row=>!names[row.person]||!count(row.overdue)||!Number.isInteger(row.blockers)||row.blockers<0||!Number.isInteger(row.priority)||row.priority<0||row.priority>5||!['b','c','writing','tasks'].every(k=>row[k]===null||row[k]&&count(row[k].done)&&count(row[k].total))))return false;
  }
  if(result.practice!==undefined&&result.practice!==null&&(!Number.isInteger(result.practice.total)||!Number.isInteger(result.practice.done)||result.practice.done<0||result.practice.done>result.practice.total))return false;
  if(result.documents!==undefined&&(!Array.isArray(result.documents)||result.documents.some(row=>!row||['id','group','title','purpose'].some(k=>typeof row[k]!=='string')||!['ready','unavailable'].includes(row.state)||(row.state==='ready'?!/^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view$/.test(row.url||''):row.url!==null))))return false;
  if(result.writingFolder!==undefined&&!/^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+$/.test(result.writingFolder))return false;
  if(result.profile!==undefined&&(!result.profile||typeof result.profile.role!=='string'||typeof result.profile.text!=='string'))return false;
  if(result.role==='mitglied'&&(result.assignments||[]).some(row=>row.owner!==result.person))return false;
  if(result.role==='mitglied'&&(result.chapters||[]).some(row=>row.owner!==result.person&&row.reader!==result.person))return false;
  if(result.role==='mitglied'&&result.tasks?.some(row=>row.owner!==result.person))return false;
  if(result.group&&['total','active','done','unassigned','unknownStatus'].some(name=>!(result.group[name]===null&&['active','done'].includes(name))&&(!Number.isInteger(result.group[name])||result.group[name]<0)))return false;
  return true;
}

const keys=storage=>typeof storage.keys==='function'?storage.keys():Object.keys(storage);
async function namespace(access,crypto){try{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(access));return 'pa6-team-v1:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')+':';}catch{return '';}}
function save(storage,ns,value,as=''){if(!ns||!valid(value,as))return;try{storage.setItem(ns+value.person+':'+value.role+':'+(as?'preview':'own'),JSON.stringify(value));}catch{}}
function restore(storage,ns,as=''){if(!ns)return null;try{return keys(storage).filter(k=>k.startsWith(ns)).map(k=>{try{return JSON.parse(storage.getItem(k));}catch{return null;}}).filter(v=>valid(v,as)).sort((a,b)=>Date.parse(b.fetchedAt)-Date.parse(a.fetchedAt))[0]||null;}catch{return null;}}
function clear(storage,ns){if(!ns)return;try{for(const key of keys(storage))if(key.startsWith(ns))storage.removeItem(key);}catch{}}
function plain(value){return String(value||'').replace(/:\s+/g,' · ').replace(/Doppelcodierquote/gi,'Anteil der unabhängig zweimal eingeordneten Bewertungen').replace(/Erst- und Zweitcodes/gi,'erste und zweite Einordnungen').replace(/Erstcodes/gi,'erste Einordnungen').replace(/Zweitcodes/gi,'zweite Einordnungen').replace(/Doppelcodierung/gi,'unabhängige Einordnung durch zwei Personen').replace(/Codierungen|Codes/gi,'Einordnungen').replace(/codieren/gi,'einordnen').replace(/Codierung/gi,'Einordnung').replace(/Feldschluss/gi,'Ende der Erhebung').replace(/Nachlauf/gi,'späte Antworten').replace(/Lesestand/gi,'Stand vom').replace(/\bTor\b/g,'Freigabe').replace(/\bPSP\b/g,'Aufgabenplan').replace(/\bPM\b/g,'Projektmanagement').replace(/\bPA6a\b/g,'erste Praxisarbeit').replace(/\bPA6b\b/g,'zweite Praxisarbeit').replace(/\bLead\b/gi,'verantwortlich').replace(/Präzisierter Vorschlag gemäss Codebuch/gi,'Vorschlag nach unseren Regeln für die Einordnung').replace(/im Arbeitsplan noch abzugleichen/gi,'noch gemeinsam zu bestätigen');}
function memberText(value){return plain(value).split(/(?<=[.!?])\s+|\n/).map(line=>/(?:Salah|Projektleitung|Leitung)\s+(?:muss|soll|hat zu)|unabhängige Vertretung/i.test(line)?'Daran arbeitet Salah gerade.':line).join(' ');}
const sort=rows=>[...rows].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')||String(a.ref).localeCompare(String(b.ref)));
const open=row=>!['fertig','erledigt'].includes(row.status);
function project(raw){
 const person=raw.person,lead=person==='SA'&&raw.role==='leitung'&&!raw.readOnly,known=raw.sources.psp.state==='ready';
 const tasks=known?sort(raw.tasks.filter(row=>row.owner===person&&open(row))):[];
 const current=tasks.find(row=>!['in Prüfung','in_pruefung'].includes(row.status))||tasks[0]||null;
 const task=current?{id:current.id,ref:current.ref,title:memberText(current.title),next:memberText(current.Was)||'Öffne den Auftrag und prüfe die nächsten Schritte.',done:memberText(current['Fertig wenn'])||'Die Fertig-Bedingung fehlt noch. Kläre sie vor dem Abschluss.',steps:memberText(current["So geht's"]).split(/\s+(?=\d+[.)]\s)/).map(s=>s.replace(/^\d+[.)]\s*/, '')).filter(Boolean),due:current.due||null,plannedHours:current.planHours??null,status:current.status,sourceDone:memberText(current['Fertig wenn']),sourceTitle:memberText(current.title)}:null;
 const milestones=known?sort(raw.milestones.filter(open)):[];
 const gate=milestones.find(row=>/freigabe|tor\b/i.test(row.title||''))||null;
 const deadlines=known?sort([...raw.tasks,...raw.milestones].filter(row=>row.due&&open(row))).map(row=>({id:row.id,date:row.due,title:memberText(row.title),detail:row.owner?names[row.owner]||'Zuständig noch offen':'Gemeinsamer Termin',type:'Termin aus dem Aufgabenplan'})):[];
 return {person,lead,known,raw,date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich'}).format(new Date()),readDate:new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',dateStyle:'short',timeStyle:'short'}).format(new Date(raw.fetchedAt)),people:{[person]:{name:names[person],task,memberRisk:'Falls etwas fehlt, öffne den Auftrag und halte die offene Frage fest.'}},gate:gate?{name:memberText(gate.title),status:gate.status,date:gate.due}:null,deadlines};
}
return {names,valid,namespace,save,restore,clear,plain,memberText,project};
});
