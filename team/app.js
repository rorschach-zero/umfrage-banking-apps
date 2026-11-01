'use strict';
(() => {
const config = window.TEAM_CONFIG;
const names = {SA:'Salah',ES:'Ernes',MG:'Melisa',AM:'Arber',LB:'Leonie'};
const labels = {sharing:'Umfrage teilen',today:'Heute',tasks:'Meine Arbeit',deadlines:'Fristen',pia:'Pia',documents:'Unterlagen',profile:'Profil'};
const paths = {documents:'M4 3h11l5 5v13H4zM14 3v6h6M8 13h8M8 17h6',profile:'M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',today:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',tasks:'M9 6h12M9 12h12M9 18h12M3 6l1 1 2-3M3 12l1 1 2-3M3 18l1 1 2-3',deadlines:'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',pia:'M21 11a8 8 0 0 1-8 8H8l-5 3 1-6a8 8 0 1 1 17-5Z'};
let view = new URLSearchParams(location.search).get('view') || 'today';
if (view === 'writing') view = 'tasks';
if (!labels[view]) view = 'today';
let area = new URLSearchParams(location.search).get('area') || '', pending = null;
let data = null, state = 'loading', person = 'SA', leadership = false, filter = 'open', key = '', generation = 0, lastLoaded = 0, errorMessage = '';
const $ = id => document.getElementById(id);
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name,value] of Object.entries(attrs)) {
    if (name.startsWith('on')) node.addEventListener(name.slice(2).toLowerCase(), value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(name, String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== undefined && child !== null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  for (const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) svg.setAttribute(key,value);
  const line = document.createElementNS(svg.namespaceURI,'path'); line.setAttribute('d', paths[name]); svg.append(line); return svg;
}
function button(text, action, cls='button') {return el('button',{type:'button',class:cls,onClick:action},text);}
function navigate(next, push=true) {
  view = labels[next] ? next : 'today';
  if(!pending)$('toast').hidden=true;
  if (push) {const url=new URL(location.href); url.searchParams.set('view',view); if(view==='tasks'&&area)url.searchParams.set('area',area);else url.searchParams.delete('area'); url.hash=''; history.pushState({},'',url);}
  render(); $('content').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'});
}
function today() {return config.demo ? '2026-11-01' : new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function day(value) {if (!value) return null; return value.includes('T') ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)) : value;}
function date(value, time=false) {
  if (!value) return 'Termin unbekannt';
  const text = new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',weekday:'short',day:'2-digit',month:'2-digit',...(time&&value.includes('T')?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(value.includes('T')?value:value+'T12:00:00+01:00'));
  return text;
}
function completed(row) {return ['fertig','erledigt'].includes(row.status);}
function overdue(row) {return !completed(row) && row.due && (row.due.includes('T') ? Date.parse(row.due)<Date.parse(config.demo ? '2026-11-01T10:00:00+01:00' : new Date().toISOString()) : row.due<today());}
function sortRows(rows) {return [...rows].sort((a,b)=>(a.due || '9999').localeCompare(b.due || '9999') || (a.ref||'').localeCompare(b.ref||''));}
function ownTasks() {return data?.tasks?.filter(row=>row.owner===data.person) ?? null;}
function heading(title, subtitle) {return el('div',{class:'heading'},el('div',{},el('p',{class:'eyebrow'},'PA6 · Gemeinsam weiter'),el('h1',{},title),el('p',{class:'subtitle'},subtitle)),el('span',{class:'date-label'},date(today())));}
function source(text='Notion · PSP') {return el('p',{class:'source'},text + (data ? ' · Stand '+date(data.fetchedAt,true) : ''));}
function card(title, contents, action) {return el('section',{class:'card'},el('div',{class:'card-header'},el('h2',{},title),action),contents);}
function empty(title, message, symbol='○') {return el('div',{class:'empty'},el('div',{class:'empty-symbol','aria-hidden':'true'},symbol),el('h3',{},title),el('p',{},message));}
function unknown(message='Die Quelle konnte nicht vollständig geladen werden. Fehlende Angaben bleiben unbekannt.') {return empty('Stand unbekannt',message,'–');}
function cardText(row, name) {return typeof row[name]==='string' && row[name].trim() ? row[name].trim() : 'noch offen';}
function safeQuestion(value) {
  const text=String(value||'').trim().slice(0,1000);
  const privateText=/[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/|www\.|(?:\+|00)?\d[\d\s/.-]{6,}\d|\b(?:Salah|Aouaj|Ernes|Softic|Melisa|Gjini|Arber|Maliqi|Leonie|Bytyqi)\b/i;
  return text && text!=='noch offen' && !privateText.test(text) ? text : 'Erklär mir Schritt für Schritt diesen Auftrag. Was ist zu tun und wann ist er fertig?';
}
function rememberPiaRole() {try {sessionStorage.setItem('pa6_pia_role',leadership?'leitung':'mitglied');} catch {}}
function piaLink(row, label='Pia fragen') {
  const url=new URL(config.piaPath,location.origin);
  url.searchParams.set('q',safeQuestion(cardText(row,'Pia-Frage')));
  if(row.ctx)url.searchParams.set('ctx',row.ctx);
  else if (/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(row.id||'')) url.searchParams.set('ctx',row.id);
  return el('a',{class:'button secondary pia-link',href:url.pathname+url.search,referrerpolicy:'no-referrer',onClick:rememberPiaRole},label);
}
function shortTitle(row) {
  let title=(row.title || 'Aufgabe noch offen').replace(/^(?:AP|EA)-[\w-]+\s*[·:–-]?\s*/,'');
  const ownName=names[data?.person];
  if(ownName)title=title.replace(new RegExp('^'+ownName+'\\s*[·:–-]\\s*'),'');
  return title.replace(/^[ABC](?:\s*[·:–-]\s*|\s+)/,'')
    .replace(/(?:ab|bis|am)?\s*\d{2}\.(?:[–-]\d{2}\.)?\d{2}\.(?:\d{4})?/g,'')
    .replace(/\s+/g,' ').replace(/^[\s·,]+|[\s·,]+$/g,'').trim().split(/\s+/).slice(0,8).join(' ');
}
function stepValues(row) {
  return cardText(row,"So geht's")==='noch offen'?[]:cardText(row,"So geht's").split(/\n+|\s+(?=\d+[.)]\s)/).map(v=>v.replace(/^\s*(?:\d+[.)]|[-•])\s*/,'').trim()).filter(Boolean);
}
function stepKey(row,value){return 'pa6-step:'+data.person+':'+row.id+':'+value;}
function stepDone(row,value){try{return localStorage.getItem(stepKey(row,value))==='1';}catch{return false;}}
function stepDate(value,row) {
  const match=value.match(/\b(\d{2})\.(?:[–-]\d{2}\.)?(\d{2})\.(\d{4})?/);
  if(!match)return null;
  const anchor=row.start||row.due;
  if(!match[3]&&!anchor)return null;
  const year=match[3]||anchor.slice(0,4), result=year+'-'+match[2]+'-'+match[1];
  if(!Number.isFinite(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result)return null;
  // A yearless date crossing two planning years is ambiguous; retain the package date.
  if(!match[3]&&row.start&&row.due&&row.start.slice(0,4)!==row.due.slice(0,4))return null;
  return result;
}
function nextActions(rows) {
  const actions=[];
  rows.forEach(row=>{
    const values=stepValues(row), candidates=values.flatMap((value,index)=>{
      if(stepDone(row,value))return [];
      const due=stepDate(value,row)||(index===0?row.start:null);
      return due?[{row,due,title:shortTitle(row),description:value}]:[];
    });
    if(candidates.length)actions.push(...candidates);
    else if(!values.length||!stepDone(row,values[0]))actions.push({row,due:row.start||row.due,title:shortTitle(row),description:values[0]||cardText(row,'Was')});
    else actions.push({row,due:row.due,title:shortTitle(row),description:values.some(value=>!stepDone(row,value))?'Öffne die Aufgabe und erledige die verbleibenden Schritte.':'Die Schritte sind abgehakt. Prüfe den Auftrag und melde ihn zur Prüfung.'});
  });
  (data.areas||[]).filter(module=>module.next&&module.next.date).forEach(module=>{
    const next=module.next;
    actions.push({due:next.date,title:module.title,description:'Nächster Kontakt · Block '+next.block+' · '+next.provider+' '+({chat:'Chat',mail:'Mail',telefon:'Telefon',formular:'Formular'}[next.channel]||next.channel),tool:module.tool});
  });
  return sortRows(actions);
}
function workLink(row) {
  const raw=cardText(row,'Wo');let url;
  try {url=new URL(raw,location.origin);}catch{}
  if (!url || url.username || url.password || /notion\.(so|site)|app\.notion/.test(url.hostname)) return null;
  const internal=(url.origin===location.origin || url.hostname==='umfrage.hydeout.ch') && /^\/team\/(?:b|c)(?:\/|$)/.test(url.pathname);
  const doc=url.protocol==='https:' && url.hostname==='docs.google.com' && /^\/document\//.test(url.pathname);
  const drive=url.protocol==='https:' && url.hostname==='drive.google.com';
  if(!internal&&!doc&&!drive)return null;
  const label=doc?'Kapitel-Doc öffnen':internal?(url.pathname.includes('/b')?'Maske B öffnen':'Maske C öffnen'):'Unterlagen öffnen';
  return el('a',{class:'button work-link',href:internal?url.pathname:url.href,rel:'noopener noreferrer',referrerpolicy:'no-referrer'},label);
}
function steps(row) {
  if(cardText(row,"So geht's")==='noch offen')return el('p',{class:'field-open'},'Die Schritte sind noch nicht hinterlegt. Pia hilft dir weiter.');
  const values=stepValues(row);
  return el('ul',{class:'step-list'},values.map(value=>{
    const storageKey=stepKey(row,value), checked=stepDone(row,value);
    const input=el('input',{type:'checkbox','aria-label':value,onChange:()=>{try{localStorage.setItem(storageKey,input.checked?'1':'0');render();}catch{announce('Der Schritt kann in diesem Browser nicht gespeichert werden.');}}});input.checked=checked;
    return el('li',{},el('label',{},input,el('span',{},value)));
  }));
}
function allTasks(){return [...(data.tasks||[]),...(data.assignments||[]),...(data.chapters||[])];}
function relativeDue(row){
  if(!row.due)return 'Frist noch offen';
  const diff=Math.round((Date.parse(day(row.due)+'T12:00:00Z')-Date.parse(today()+'T12:00:00Z'))/86400000);
  return (diff<0?'Überfällig':diff===0?'Heute':diff===1?'Morgen':'in '+diff+' Tagen')+' · '+date(row.due);
}
function canReport(row){return state==='ready' && ['psp','assignments'].includes(row.source) && ['offen','läuft'].includes(row.status) && (row.owner===data.person||leadership);}
function taskRow(row){
  const waiting=pending?.id===row.id;
  const check=button(completed(row)?'✓':row.status==='in Prüfung'?'·':'',()=>report(row),'task-check'+(waiting?' is-pending':'')+(completed(row)?' is-done':''));
  check.disabled=!canReport(row)||!!pending;check.setAttribute('aria-label',completed(row)?'Erledigt':row.status==='in Prüfung'?'In Prüfung':'Als erledigt melden: '+shortTitle(row));
  return el('li',{class:'task-line','data-owner':row.owner||data.person},check,
    el('button',{class:'task-open',onClick:()=>details(row)},el('span',{class:'task-name'},shortTitle(row)),el('span',{class:'due-chip'+(overdue(row)?' overdue':'')},relativeDue(row))),
    el('span',{class:'status-dot '+(row.status==='läuft'?'active':row.status==='in Prüfung'?'review':completed(row)?'done':''),role:'img','aria-label':row.status||'Status unbekannt',title:row.status||'Status unbekannt'}));
}
function taskList(rows,all=true){return rows===null?unknown():rows.length?el('ul',{class:'rows task-list'},sortRows(rows.filter(r=>all||!completed(r))).map(taskRow)):empty('Hier ist alles ruhig.','In diesem Bereich sind noch keine Aufgaben zugeteilt.');}
function progress(done,total,label){return el('div',{class:'progress-block'},el('span',{},label||done+' von '+total+' erledigt'),el('progress',{max:Math.max(1,total||0),value:done||0,'aria-label':label||'Erledigte Aufgaben'}));}
function areaRows(module){return allTasks().filter(r=>module.taskIds.includes(r.id));}
function areaSummary(module){
  if(module.state!=='ready')return 'Stand teilweise unbekannt';
  const unit=module.id==='b'?'Kontakten':module.id==='c'?'Bewertungen':'Aufgaben';
  return module.done+' von '+module.total+' '+unit+(module.id==='c'?' · Soll bis heute '+module.expected:'');
}
function openArea(id){area=id;navigate('tasks');}
function areaLine(module){return el('button',{class:'area-line',onClick:()=>openArea(module.id)},el('span',{class:'area-symbol','aria-hidden':'true'},module.id==='b'?'B':module.id==='c'?'C':module.id==='writing'?'✎':'○'),el('span',{class:'area-copy'},el('strong',{},module.title),el('small',{},areaSummary(module))),el('progress',{max:Math.max(1,module.total||0),value:module.done||0,'aria-label':module.title+' Fortschritt'}),el('span',{'aria-hidden':'true'},'›'));}
function serviceCard(){
  const s=data.service;if(!s||s.error)return null;
  return el('section',{class:'practice-card'},el('div',{},el('strong',{},'Servicebeobachtung B'),el('p',{},(s.probeDone?'Probe erledigt':'Probe jetzt möglich')+' · '+s.done+' von '+s.config.target+' Kontakten'),el('small',{},'Offizieller Feldbeginn '+date(s.config.official))),el('a',{class:'button secondary',href:'/team/b/'},s.probeDone?'Kontakte öffnen':'Probe und Konten wählen'));
}
function shareCard(){return el('section',{class:'practice-card'},el('div',{},el('strong',{},'Umfrage teilen'),el('p',{},(data.sharing?.done??'–')+' von 2 Kanälen · ohne Namen im Link')),button('Umfrage teilen',()=>navigate('sharing'),'button secondary'));}
function fieldLeadership(){
  return el('section',{class:'field-leadership'},el('h2',{},'Erhebung und Verteilung'),
    data.service?.open?el('p',{},'Offene B-Zellen · '+data.service.open.map(r=>r.provider+' '+r.open).join(' · ')):null,
    data.sharing?.people?el('ul',{},data.sharing.people.map(r=>el('li',{},names[r.person]+' · '+r.done+' von 2 Kanälen'))):null,
    el('details',{},el('summary',{},'Übernahmen · '+(data.transfers?.length||0)),el('ul',{},(data.transfers||[]).map(r=>{let change={};try{change=JSON.parse(r.change);}catch{}return el('li',{},r.date+' · '+r.nr+' · '+(names[change.alt]||'frei')+' → '+(names[change.neu]||r.person));}))));
}
function practiceCard(){
  return data.practice?.total ? el('section',{class:'practice-card'},el('div',{},el('strong',{},'Probecodierung · 01./02.11.'),el('p',{},data.practice.done+' von '+data.practice.total+' Schulungsfällen · getrennt von der Erhebung')),el('a',{class:'button secondary',href:'/team/c/'},'Probe codieren')) : null;
}
function leadMetric(label,value,field=false){
  return el('div',{class:'lead-metric'},el('dt',{},label),el('dd',{},value&&value.done!==null?value.done+' / '+value.total:'unbekannt'),field&&value?el('small',{},'Soll '+value.expected+(label==='B'?' · davon erledigt '+value.expectedDone:'')):null);
}
function takeOver(row){
  details(row,'Übernahme prüfen',true);
  const storageKey='pa6-takeover:SA:'+row.id;
  let saved='';try{saved=localStorage.getItem(storageKey)||'';}catch{}
  const note=el('textarea',{id:'takeover-note',rows:3,maxlength:500,placeholder:'Was möchtest du übernehmen?'});note.value=saved;
  const feedback=el('p',{class:'local-note',role:'status'},'Notiz nur auf diesem Gerät. Die Zuständigkeit bleibt bei '+(names[row.owner]||'der eingetragenen Person')+'.');
  $('detail-body').prepend(el('section',{class:'takeover-note'},el('h3',{},'Übernahme vormerken'),el('p',{},'Aufgabe von '+(names[row.owner]||'der eingetragenen Person')+'. Kläre die Übernahme mit der Person und bestätige die neue Zuteilung separat.'),el('label',{for:'takeover-note'},'Deine Notiz'),note,
    button('Notiz auf diesem Gerät speichern',()=>{try{localStorage.setItem(storageKey,note.value);feedback.textContent='Notiz lokal gespeichert. Keine Zuteilung und kein Status geändert.';}catch{feedback.textContent='Notiz konnte auf diesem Gerät nicht gespeichert werden.';}},'text-button'),feedback));
}
function showLeadership(){
  if(!Array.isArray(data.leadership))return [heading('Leitungsübersicht','Der Personenstand ist noch unbekannt.'),unknown('Bitte den aktuellen Empfängerstand laden.')];
  const cards=data.leadership.map(summary=>{
    const issues=(data.blockers||[]).filter(issue=>issue.owner===summary.person),row=allTasks().find(item=>item.id===summary.taskId);
    const labels=[summary.overdue?summary.overdue+' überfällig':null,summary.backlog?'Rückstand unter 80 % Soll':null,summary.blockers?summary.blockers+' Hänger':null,summary.unknown?'Stand teilweise unbekannt':null].filter(Boolean);
    return el('section',{class:'lead-person','data-person':summary.person,'data-priority':summary.priority},el('div',{class:'lead-person-head'},el('h2',{},names[summary.person]),el('span',{class:'lead-status'+(summary.priority>=2?' urgent':'')},labels.join(' · ')||'Im Plan')),
      el('dl',{class:'lead-metrics'},leadMetric('B',summary.b,true),leadMetric('C',summary.c,true),leadMetric('Schreiben',summary.writing),leadMetric('Pakete',summary.tasks)),
      el('div',{class:'lead-next'},el('span',{},row?shortTitle(row)+' · '+relativeDue(row):'Keine offene Aufgabe verknüpft.'),row?button('Ich übernehme',()=>takeOver(row),'button secondary takeover'):null),
      issues.length?el('details',{class:'lead-issues'},el('summary',{},'Hänger ansehen · '+issues.length),el('ul',{},issues.map(issue=>el('li',{},el('span',{},({b:'B',c:'C',writing:'Schreiben',tasks:'Pakete'}[issue.area]||'Aufgabe')+' · '+issue.text),(()=>{const task=allTasks().find(item=>item.id===issue.taskId);return task?button('Ich übernehme',()=>takeOver(task),'text-button takeover'):el('small',{},'Aufgabe noch nicht verknüpft.');})())))):null);
  });
  return [heading('Leitungsübersicht','Alle fünf Personen · Dringendes zuerst.'),el('p',{class:'quiet-note'},'B und C: erledigt / zugeteilt, Soll bis gestern. Schreiben: Kapitel als Pate oder Zweitleser. Pakete: eigene Arbeitspakete. Die Probe zählt separat.'),el('div',{class:'lead-people'},cards),fieldLeadership(),serviceCard(),shareCard(),practiceCard()];
}
function showToday(){
  if(leadership && data.person==='SA')return showLeadership();
  const open=sortRows(allTasks().filter(r=>!completed(r)&&r.status!=='in Prüfung'&&(r.owner===data.person||r.reader===data.person)));
  const focus=nextActions(open)[0], blockers=(data.blockers||[]).filter(b=>b.owner===data.person), count=blockers.length;
  const status=count?count+' '+(count===1?'Sache hängt.':'Dinge hängen.'):data.workspaceState==='ready'?'Du bist im Plan.':'Ein Teil deines Stands ist noch unbekannt.';
  return [heading('Hallo, '+names[data.person]+'.',status),blockerList(blockers),serviceCard(),shareCard(),practiceCard(),
    el('section',{class:'focus-card'},el('p',{class:'eyebrow'},'Dein nächster Schritt'),el('h2',{},focus?focus.title:'Zeit für deinen Überblick'),el('p',{},focus?(focus.description==='noch offen'?'Öffne die Aufgabe und kläre deinen nächsten Schritt.':focus.description):'Öffne deine Arbeitsbereiche und sieh, wo du stehst.'),focus?el('span',{class:'focus-due'},relativeDue(focus)):null,focus?.tool?el('a',{class:'button',href:focus.tool},'Kontakt erfassen'):button(focus?'Aufgabe ansehen':'Meine Arbeit öffnen',()=>focus?details(focus.row):navigate('tasks'))),
    el('section',{class:'area-overview'},el('h2',{},'Deine Arbeitsbereiche'),(data.areas||[]).map(areaLine),!(data.areas||[]).length?unknown('Deine Arbeitsbereiche sind noch nicht zugeteilt oder nicht erreichbar.'):null),
    open.length>1?el('section',{class:'next-list'},el('h2',{},'Danach'),taskList(open.filter(row=>row.id!==focus?.row?.id).slice(0,3))):null,
    el('p',{class:'group-line'},data.group?'Gemeinsam · '+(data.group.done??'Stand unbekannt')+' von '+data.group.total+' Arbeitspaketen erledigt':'Gruppenstand unbekannt')];
}
function groupedTasks(rows){
  const now=new Date(today()+'T12:00:00Z'),end=new Date(now);end.setUTCDate(end.getUTCDate()+(7-(now.getUTCDay()||7)));
  const week=end.toISOString().slice(0,10),soon=new Date(end.getTime()+14*86400000).toISOString().slice(0,10);
  const groups={'Diese Woche':[],Demnächst:[],Später:[],Erledigt:[]};
  sortRows(rows).forEach(r=>groups[completed(r)?'Erledigt':r.due&&day(r.due)<=week?'Diese Woche':r.due&&day(r.due)<=soon?'Demnächst':'Später'].push(r));
  return Object.entries(groups).filter(([,list])=>list.length).map(([label,list])=>label==='Erledigt'?el('details',{class:'done-list'},el('summary',{},'Erledigt · '+list.length),taskList(list)):el('section',{class:'task-group'},el('h3',{},label,el('span',{},list.length)),taskList(list)));
}
function blockerNote(blocker){
  const module=(data.areas||[]).find(item=>item.id===blocker.area),row=allTasks().find(item=>item.id===blocker.taskId);
  const label=module?.title||'Arbeitsbereich', title=row?shortTitle(row):'';
  return el('li',{class:'blocker-note'},el('div',{},el('strong',{},label),el('p',{},title?title+': '+blocker.text:blocker.text)),piaLink({ctx:blocker.ctx,'Pia-Frage':blocker.question},'Pia hilft'));
}
function blockerList(blockers){
  return blockers.length?el('section',{class:'blocker-list','aria-label':'Hier hängt es'},el('ul',{},blockers.slice(0,3).map(blockerNote)),blockers.length>3?el('details',{class:'extra-hints'},el('summary',{},'Weitere anzeigen · '+(blockers.length-3)),el('ul',{},blockers.slice(3).map(blockerNote))):null):null;
}
function areaBlockers(id){return blockerList((data.blockers||[]).filter(b=>b.area===id));}
function showTasks(){
  const modules=data.areas||[],selected=modules.find(m=>m.id===area);
  const rows=selected?areaRows(selected):allTasks(), done=rows.filter(completed).length;
  if(!selected)return [heading('Meine Arbeit','Deine Bereiche. Dein nächster Schritt.'),el('div',{class:'work-modules'},modules.map(module=>el('section',{class:'work-module'},areaLine(module),el('div',{class:'module-foot'},el('span',{},areaRows(module).filter(r=>!completed(r)).length+' offene Aufgaben'),button('Bereich öffnen',()=>openArea(module.id),'text-button'))))),!modules.length?unknown('Deine Arbeitsbereiche sind noch nicht zugeteilt oder nicht erreichbar.'):null];
  const next=selected.next;
  return [button('← Meine Arbeit',()=>{area='';navigate('tasks');},'text-button back-link'),heading(selected.title,''),areaBlockers(area),
    selected.id==='writing'?writingFolderLink():null,selected.id==='b'?serviceCard():null,
    progress(selected.done,selected.total,areaSummary(selected)),
    next?el('p',{class:'next-contact'},'Nächster '+date(next.date)+' · Block '+next.block+' · '+next.provider+' '+({chat:'Chat',mail:'Mail',telefon:'Telefon',formular:'Formular'}[next.channel]||next.channel)):null,
    selected.tool?el('a',{class:'button area-tool',href:selected.tool},area==='b'?'Nächsten Kontakt erfassen':'Weiter codieren'):selected.id==='writing'?workLink(sortRows(rows).find(row=>!completed(row)&&/^https:\/\/docs.google.com\/document\//.test(row.Wo||''))||{}):null,
    el('div',{class:'list-heading'},el('h2',{},'Meine Aufgaben'),el('small',{},done+' von '+rows.length+' erledigt')),
    ...groupedTasks(rows),!rows.length?el('p',{class:'quiet-note'},'Deine Einsätze findest du direkt im Werkzeug.'):null];
}
function writingFolderLink(){
  return /^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+$/.test(data.writingFolder||'')
    ?el('a',{class:'button secondary writing-folder',href:data.writingFolder,target:'_blank',rel:'noopener noreferrer'},'Ordner Schreibwerk öffnen')
    :el('p',{class:'quiet-note'},'Der Schreibwerk-Ordner ist noch nicht verbunden.');
}
function documentRow(row,chapter=false){
  const url=chapter?row.doc:row.url;
  const valid=chapter?/^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+(?:\/edit)?$/.test(url||''):/^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]+\/view$/.test(url||'');
  return el('li',{class:'document-row'},el('div',{class:'document-copy'},el('h3',{},row.title),el('p',{},chapter?((row.owner===data.person?'Als Pate':row.reader===data.person?'Als Zweitleser:in':'Leitungsübersicht')+' · '+(row.ref||'')):'Wozu: '+row.purpose)),
    el('div',{class:'document-actions'},valid?el('a',{class:'button secondary document-open',href:url,target:'_blank',rel:'noopener noreferrer'},'Öffnen'):el('button',{class:'button secondary',disabled:true,title:'Datei oder Leselink noch nicht verfügbar'},'Öffnen'),piaLink({...row,'Pia-Frage':'Erklär mir das Wichtigste aus '+row.title+'.'})),
    valid?null:el('p',{class:'quiet-note'},'Datei oder Leselink noch nicht verfügbar.'));
}
function showDocuments(){
  const documents=data.documents,chapters=data.chapters;
  const groups=Array.isArray(documents)?[...new Set(documents.map(row=>row.group))]:[];
  return [heading('Unterlagen','Die Grundlagen für unsere Arbeit. An einem Ort.'),
    ...groups.map(group=>el('section',{class:'document-group'},el('h2',{},group),el('ul',{class:'document-list'},documents.filter(row=>row.group===group).map(row=>documentRow(row))))),
    !groups.length?unknown('Die Unterlagen sind noch nicht verbunden.'):null,
    el('section',{class:'document-group'},el('h2',{},'Meine Kapitel-Docs'),el('p',{class:'quiet-note'},leadership?'Alle Kapitel der Gruppe.':'Deine Kapitel als Pate oder Zweitleser:in.'),writingFolderLink(),
      chapters===null||chapters===undefined?unknown('Die Kapitel konnten nicht geladen werden.'):chapters.length?el('ul',{class:'document-list'},[...chapters].sort((a,b)=>(a.ref||'').localeCompare(b.ref||'','de',{numeric:true})).map(row=>documentRow(row,true))):empty('Noch keine Kapitel zugeteilt.','Sobald deine Zuteilung hinterlegt ist, findest du hier deine Docs.'))];
}
function showProfile(){
  const profile=data.profile||{},chapters=data.chapters||[],own=allTasks().filter(r=>r.owner===data.person||r.reader===data.person);
  const section=(label,rows)=>el('section',{class:'profile-section'},el('h2',{},label),rows.length?taskList(rows):el('p',{class:'quiet-note'},'Noch keine Zuteilung hinterlegt.'));
  return [heading('Dein Profil','Deine Rolle im gemeinsamen Projekt.'),el('section',{class:'profile-intro'},el('span',{class:'avatar-large'},names[data.person].slice(0,1)),el('div',{},el('h2',{},profile.role||'Rolle noch offen'),el('p',{},profile.text||'Dein Lead-Blatt ist noch nicht erreichbar.'),el('small',{class:'source'},profile.source||'Lead-Blatt'))),
    piaLink({'Pia-Frage':'Erklär mir meine Rolle und meinen Lead-Bereich. Wofür bin ich verantwortlich?'},'Pia: Erklär mir meine Rolle'),
    button('Unterlagen öffnen',()=>navigate('documents'),'button secondary'),button('Umfrage teilen',()=>navigate('sharing'),'button secondary'),
    section('Kapitel als Pate',chapters.filter(r=>r.owner===data.person)),section('Kapitel als Zweitleser:in',chapters.filter(r=>r.reader===data.person)),
    section('Deine Erhebungsaufträge',(data.assignments||[]).filter(r=>r.owner===data.person)),section('Deine nächsten drei Fristen',sortRows(own.filter(r=>!completed(r)&&r.due)).slice(0,3))];
}
const schoolDates = [
 {id:'school-a',ref:'Moodle-Kalender',title:'Abgabe PA6a','Pia-Frage':'Was gilt für die Abgabe PA6a und wo steht die Frist?',due:'2026-12-12T23:59:00+01:00'},
 {id:'school-b',ref:'Moodle-Kalender',title:'Abgabe PA6b','Pia-Frage':'Was gilt für die Abgabe PA6b und wo steht die Frist?',due:'2027-02-27T23:59:00+01:00'},
 {id:'school-p',ref:'Stundenplan / Prüfungsübersicht',title:'Präsentation und Fachgespräch PA6a/PA6b','Pia-Frage':'Was gilt für die Präsentation und das Fachgespräch PA6a/PA6b?',due:'2027-03-22T13:00:00+01:00'}
];
function timeline(rows, origin) {
  if (rows===null) return unknown();
  if (!rows.length) return empty('Keine Fristen hinterlegt.','Für diesen Bereich sind aktuell keine Termine eingetragen.');
  const groups=new Map(); sortRows(rows).forEach(row=>{const key=day(row.due)||'unbekannt'; if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);});
  return el('div',{class:'timeline'},[...groups].map(([key,entries])=>el('section',{class:'timeline-group'},el('h3',{class:'timeline-label'},key==='unbekannt'?'Datum unbekannt':date(key)),entries.map(row=>el('div',{class:'card'},el('button',{class:'row',onClick:()=>details(row,row.source||origin)},el('span',{class:'row-copy'},el('span',{class:'row-title'},shortTitle(row)),el('span',{class:'row-sub'},date(row.due,true),' · ',row.source||origin,overdue(row)&&row.status?' · Überfällig':'')),el('span',{class:'row-arrow','aria-hidden':'true'},'›')),el('div',{class:'deadline-actions'},piaLink(row)))))));
}
function showDeadlines() {
  const rows=[...(data.meetings||[]).map(row=>({...row,source:'Notion · Sitzungen'})),...(data.reserves||[]).map(row=>({...row,source:'Notion · PSP · Reserve'})),...(data.milestones||[]).map(row=>({...row,source:'Notion · PSP'})),...(data.tasks||[]).filter(row=>!completed(row)).map(row=>({...row,source:'Notion · PSP'})),...(data.assignments||[]).map(row=>({...row,source:'Notion · Erhebungsaufträge'})),...(data.chapters||[]).map(row=>({...row,source:'Notion · Kapitel'}))];
  return [heading('Die nächsten Fristen.','Von der nächsten Sitzung bis zur letzten Abgabe.'),el('h2',{class:'section-heading'},'Aus unserer Planung'),rows.length ? timeline(rows,'Notion') : (data.sources.psp.state==='unknown'||data.sources.meetings.state==='unknown') ? unknown() : timeline(rows,'Notion'),el('p',{class:'source'},'Plan-Enden aus dem PSP sind keine neu festgelegten Schultermine. Abweichungen mit den unten belegten Terminen abgleichen.'),el('h2',{class:'section-heading'},'Die Schultermine'),timeline(schoolDates,'Termine.md · Stand 28.10.2026'),el('p',{class:'source'},'Quelle: Termine.md, abgeglichen mit Moodle-Kalender und Stundenplan. Statischer Zusatz; der aktuelle Schulkalender wird hier nicht live gelesen.')];
}
function showPia() {
  return [heading('Frag Pia.','Ein guter nächster Schritt beginnt mit einer Frage.'),el('section',{class:'pia-entry'},el('img',{src:'assets/pia.png',alt:'Pia, deine Projektkollegin',width:180,height:180}),el('p',{class:'eyebrow'},'Für unsere PA6'),el('h2',{},'Ich erkläre. Du entscheidest.'),el('p',{},'Deine Aufgaben, Fristen und Regeln. Zusammen bringen wir Ordnung rein.'),button(config.demo?'Pia-Einstieg ansehen →':'Pia öffnen →',openPia),el('p',{class:'privacy-copy'},'Keine Namen, Nummern oder Adressen eingeben. Vor einer Frage beachte den Verarbeitungshinweis auf der Pia-Seite. Ihr Verlauf bleibt in deinem Browser; die Nutzung ist freiwillig.'),config.demo?el('p',{class:'source'},'Lokaler Nachbau: Es wird keine Frage versendet.'):null)];
}
function openPia() {
  if (config.demo) return modal('Mit Pia klären',el('p',{},'Im Echtbetrieb öffnet dieser Einstieg deine bestehende Pia-Seite mit demselben persönlichen Zugang.'),el('p',{},'Beispiel für deinen Einstieg: «Was steht als Nächstes an?»'),el('p',{},'Dies ist die lokale Vorschau. Es wurde keine Verbindung aufgebaut.'),button('Zurück zu Heute',()=>{$('detail').close();navigate('today');}));
  rememberPiaRole(); location.assign(config.piaPath);
}
function modal(title,...content) {$('detail-body').replaceChildren(el('h2',{id:'detail-title'},title),...content.flat(Infinity).filter(node=>node!==null&&node!==undefined&&node!==false)); if(!$('detail').open)$('detail').showModal();}
function details(row,origin='Projektplanung',takeover=false){
  $('detail').dataset.owner=row.owner||data.person;
  const notion=leadership&&/^[a-f0-9-]{32,36}$/i.test(row.id||'')?el('a',{class:'source notion-link',href:'https://www.notion.so/'+row.id.replace(/-/g,''),rel:'noopener noreferrer'},'In Notion öffnen'):null;
  modal(shortTitle(row),el('p',{class:'detail-what'},cardText(row,'Was')==='noch offen'?shortTitle(row):row.Was),
    el('p',{class:'detail-due'+(overdue(row)?' overdue':'')},relativeDue(row),' · ',row.status||'Status unbekannt'),
    row.waitingOn?el('p',{class:'quiet-note dependency-wait'},'Startet nach: '+row.waitingOn):null,
    el('p',{class:'acceptance'},el('strong',{},'Fertig, wenn … '),cardText(row,'Fertig wenn')),
    el('h3',{},'So geht’s'),steps(row),el('p',{class:'local-note'},'Deine Schritte bleiben auf diesem Gerät gespeichert.'),
    el('div',{class:'task-actions'},workLink(row),piaLink(row)),
    !workLink(row)?el('p',{class:'quiet-note'},'Das Werkzeug ist noch nicht verknüpft. Pia hilft dir beim Einstieg.'):null,
    !takeover&&canReport(row)&&row.status==='offen'?button('Bearbeitung starten',()=>report(row,'läuft'),'text-button start-detail'):null,
    !takeover&&canReport(row)?button('Als erledigt melden',()=>report(row),'text-button report-detail'):null,
    !takeover&&leadership&&row.status==='in Prüfung'&&['psp','assignments'].includes(row.source)?button('Prüfung abschliessen',()=>report(row,'fertig'),'text-button'):null,
    el('details',{class:'more'},el('summary',{},'Mehr'),el('h3',{},'Warum'),el('p',{},cardText(row,'Warum')),el('p',{class:'source'},cardText(row,'Auftragsquelle')),el('p',{class:'source'},cardText(row,'Herkunft')),el('p',{class:'source'},origin+' · '+(row.ref||'')),el('p',{class:'source'},'Start '+date(row.start,true)+' · Frist '+date(row.due,true)),notion));
  $('detail-title').className='sr-only';
}
function toast(text,action){$('toast').replaceChildren(el('span',{},text),action||[]);$('toast').hidden=false;}
async function postStatus(row,from,to,access,lead){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({typ:'status',k:access,leitung:lead,id:row.id,from,to}),signal:controller.signal,referrerPolicy:'no-referrer'});
    const result=await response.json();if(!response.ok||!result.ok||result.id!==row.id||result.status!==to)throw Error(result.fehler||'Änderung nicht bestätigt.');
    row.status=to;return result;
  }finally{clearTimeout(timer);}
}
function report(row,target='in Prüfung'){
  if(pending||state!=='ready'||(!canReport(row)&&!(leadership&&row.status==='in Prüfung'&&target==='fertig')))return;
  if(config.demo){toast('In der Vorschau wird kein Status gespeichert.');return;}
  const access=key,lead=leadership,identity=data.person;
  pending={id:row.id,timer:null};
  const undo=button('Rückgängig',()=>{clearTimeout(pending.timer);pending=null;toast('Meldung zurückgenommen.');render();},'toast-undo');
  toast('Meldung wird in 5 Sekunden gesendet.',undo);$('detail').close();render();
  pending.timer=setTimeout(async()=>{
    if(key!==access||data?.person!==identity){pending=null;toast('Zugang geändert. Meldung zurückgenommen.');return;}
    toast('Wird gespeichert …');
    try{
      if(row.status==='offen'&&target==='in Prüfung')await postStatus(row,'offen','läuft',access,lead);
      await postStatus(row,row.status,target,access,lead);
      toast(target==='fertig'?'✓ Prüfung abgeschlossen.':target==='läuft'?'✓ Bearbeitung gestartet.':'✓ Zur Prüfung gemeldet. Gut gemacht.');$('toast').classList.add('success');
    }catch(error){toast((error.name==='AbortError'?'Verbindung unterbrochen. Bitte Stand prüfen.':error.message));}
    finally{pending=null;await load();setTimeout(()=>$('toast').classList.remove('success'),700);}
  },5000);
}

const shareChannels={w:'WhatsApp',i:'Instagram',f:'Facebook',l:'LinkedIn',r:'Reddit',g:'Arbeit / Geschäft',c:'Verein / Club',j:'Jodel und andere',k:'Klasse',s:'Schulhaus',a:'Anzeigen',d:'Dozierende und Sekretariat',h:'Andere Schulen',o:'Organisationen',t:'Test'};
function showSharing(){
  const cards=Object.entries(shareChannels).map(([channel,title])=>{
    const institution=window.SHARING_INSTITUTIONS?.[channel], choices=institution?el('select',{'aria-label':'Institution '+title},el('option',{value:''},'Vorhandene Institution wählen'),Object.entries(institution).map(([name,code])=>el('option',{value:code},name))):null;
    const url=()=> 'https://umfrage.hydeout.ch/'+channel+(institution?'/?s='+encodeURIComponent(choices.value):'');
    const call='Wir sind Studierende der Klasse 601/H25-B an der KV Business School Zürich. Für unsere Praxisarbeit untersuchen wir Erfahrungen mit Banking-Apps. Mach bei unserer anonymen Umfrage mit und teile deine Sicht. Vielen Dank!';
    const link=el('p',{class:'share-url'}),qr=el('img',{class:'share-qr',width:164,height:164,alt:'QR-Code für '+title}),feedback=el('p',{role:'status','aria-live':'polite'});
    const copy=button('Link kopieren',async()=>{try{await navigator.clipboard.writeText(url());feedback.textContent='Link kopiert.';}catch{feedback.textContent='Kopieren nicht möglich. Markiere den angezeigten Link.';}},'button secondary');
    const share=button('Teilen',async()=>{try{if(navigator.share){await navigator.share({title:'Umfrage zu Banking-Apps',text:call,url:url()});feedback.textContent='Teilen geöffnet. Bestätige den verwendeten Kanal unten selbst.';}else{await navigator.clipboard.writeText(call+' '+url());feedback.textContent='Aufruf und Link kopiert. Füge sie in deinem Kanal ein.';}}catch(error){feedback.textContent=error.name==='AbortError'?'Teilen abgebrochen.':'Teilen nicht verfügbar. Kopiere Aufruf und Link.';}},'button');
    function update(){const valid=!institution||!!choices.value;copy.disabled=!valid;share.disabled=!valid;link.textContent=valid?url():'Wähle die vorhandene Institutionskennung.';qr.hidden=!valid;if(valid){const code=qrcode(0,'M');code.addData(url());code.make();qr.src=code.createDataURL(4,16);}}
    if(choices)choices.addEventListener('change',update);update();
    const dateInput=el('input',{type:'date',value:today(),min:'2026-10-29',max:today(),'aria-label':'Datum '+title}),reach=el('input',{type:'number',min:0,max:9999999,step:1,placeholder:'optional','aria-label':'Gruppengrösse '+title}),check=el('input',{type:'checkbox','aria-label':'Ich habe geteilt in '+title});
    const save=button('Teilen bestätigen',async()=>{
      if(!check.checked){feedback.textContent='Bestätige zuerst, dass du hier geteilt hast.';return;}
      if(institution&&!choices.value){feedback.textContent='Wähle die verwendete Institution.';return;}
      if(!dateInput.checkValidity()||!reach.checkValidity()){feedback.textContent='Prüfe Datum und geschätzte Gruppengrösse.';return;}
      if(config.demo){feedback.textContent='Die Vorschau speichert keine Verteilung.';return;}
      save.disabled=true;
      try{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let result;
        try{const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({typ:'share',k:key,channel,day:dateInput.value,reach:reach.value}),signal:controller.signal});result=await response.json();if(!response.ok||!result.ok)throw Error(result.fehler||'Nicht gespeichert.');}finally{clearTimeout(timer);}
        data.sharing=result.sharing;document.getElementById('sharing-count').textContent=result.sharing.done+' von 2 Kanälen';feedback.textContent='Gespeichert. Die Reichweite ist eine Schätzung.';
      }catch(error){feedback.textContent=error.message;}finally{save.disabled=false;}
    },'button secondary');
    const sent=(data.sharing?.rows||[]).filter(r=>r.kanal===channel);
    return el('section',{class:'share-channel','data-channel':channel},el('h2',{},title),institution?el('p',{class:'quiet-note'},'Bestehenden Versandentscheid beachten. Die Institutionskennung ist keine Personenkennung.'):null,
      channel==='t'?el('p',{class:'quiet-note'},'Nur für technische Tests. Zählt nicht zum Ziel von zwei Kanälen.'):null,
      choices,el('p',{class:'share-call'},call),link,el('div',{class:'share-actions'},copy,share),el('details',{class:'share-code'},el('summary',{},'QR-Code anzeigen'),qr),
      el('fieldset',{},el('legend',{},'Deine Verteilung festhalten'),el('label',{class:'share-check'},check,'Ich habe geteilt in '+title),el('label',{},'Datum',dateInput),el('label',{},'Geschätzte Gruppengrösse',reach),save),
      sent.length?el('small',{},'Bereits erfasst am '+sent.map(r=>r.datum).join(', ')):null,feedback);
  });
  return [heading('Umfrage teilen','Teile in mindestens zwei passenden Kanälen. Der Link enthält keinen Namen.'),el('p',{id:'sharing-count',class:'sharing-count'},(data.sharing?.done??'–')+' von 2 Kanälen'),el('p',{class:'quiet-note'},'Gruppengrössen sind freiwillige Schätzungen. Überschneidungen sind möglich. Antworten werden nur je Kanal gezählt und keiner verteilenden Person zugeordnet.'),el('div',{class:'share-grid'},cards)];
}

function privacy() {
  modal('Datenschutz & Zugang',el('p',{},'Verantwortlich ist Salah Aouaj. Die Team-App liest Planungsdaten über Google und Notion. Der Team-Abruf sendet keine Daten an den Antwortdienst von Pia.'),el('p',{},'Dein persönlicher Zugang bleibt wie bei Pia in diesem Browser gespeichert. Projektstände werden hier nur im Arbeitsspeicher gehalten. Abgehakte Schritte werden lokal je Person gespeichert. Statusmeldungen werden nach fünf Sekunden an Notion gesendet und protokolliert. Der Server speichert Antworten höchstens 60 Sekunden zwischen.'),el('p',{},'Auf der Pia-Seite gilt deren Verarbeitungshinweis vor dem Absenden einer Frage. Keine Namen, Nummern oder Adressen eingeben. Bestehende Pia-Verläufe kannst du dort löschen. Die Nutzung ist freiwillig.'),el('p',{},'Beim Teilen speichert das Verteilungsprotokoll deine Person, den Kanal, das Datum und eine freiwillige Reichweitenschätzung. Es verknüpft keine Umfrageantwort mit dir. QR-Codes werden auf deinem Gerät erzeugt.'),el('p',{},'Projektbezogene Daten werden gemäss bestehender Gruppenregel nach der Benotung gelöscht.'),button('Von diesem Browser abmelden',logout,'button secondary'));
}
function logout() {try{localStorage.removeItem('pa6k');}catch{} key=''; generation++; data=null; state='unauthorized'; leadership=false; $('detail').close(); render();}
function render() {
  $('breadcrumb').textContent=labels[view]; document.title=labels[view]+' · Unser Projekt';
  $('nav').replaceChildren(...['today','tasks','documents','deadlines','pia','profile'].map(name=>el('a',{href:'?view='+name,class:'nav-link','aria-current':(view===name)?'page':null,onClick:event=>{event.preventDefault();navigate(name);}},icon(name),el('span',{},labels[name]))));
  document.body.dataset.person=data?.person||'';
  $('person').textContent=data?names[data.person]:'Dein Zugang';$('person').setAttribute('aria-label','Profil öffnen');
  $('role').hidden=!(data?.person==='SA'); $('role').textContent=leadership?'Leitung an':'Leitung aus'; $('role').setAttribute('aria-pressed',String(leadership));
  $('refresh').disabled=state==='loading';
  $('source-note').textContent=config.demo?'Nachbau · Planungsstand 01.11.2026':data?'Zuletzt geladen '+date(data.fetchedAt,true)+(data.cached?' · Zwischenspeicher':''):'Planungsstand unbekannt';
  const content=$('content'); content.setAttribute('aria-busy',String(state==='loading'));
  if(state==='loading') {content.replaceChildren(heading('Ein Moment.','Dein Projektstand wird geladen.'),el('div',{'aria-hidden':'true'},el('span',{class:'skeleton short'}),el('span',{class:'skeleton big'}),el('span',{class:'skeleton'}),el('span',{class:'skeleton short'}))); announce('Projektstand wird geladen.');return;}
  if(state==='unauthorized'||!data) {
    content.replaceChildren(el('section',{class:'error-panel card'},el('div',{class:'empty-symbol','aria-hidden':'true'},state==='unauthorized'?'↗':'!'),el('h2',{},state==='unauthorized'?'Dein persönlicher Zugang.':'Der Stand ist gerade unbekannt.'),el('p',{},state==='unauthorized'?'Öffne deinen persönlichen Team-Link. Wenn er nicht mehr funktioniert, hilft dir Salah weiter.':errorMessage||'Die Verbindung hat nicht geklappt. Deine Aufgaben sind dadurch nicht verschwunden.'),state!=='unauthorized'?button('Erneut versuchen',()=>load()):button('Datenschutz & Zugang',privacy,'button secondary')));announce(state==='unauthorized'?'Persönlichen Zugang öffnen.':'Laden fehlgeschlagen. Stand unbekannt.');return;
  }
  const notices=[];
  if(state==='stale')notices.push(el('div',{class:'notice',role:'status'},el('p',{},'Verbindung unterbrochen. Veralteter Stand vom '+date(data.fetchedAt,true)+'. Aktuelle Aufgaben sind unbekannt.'),button('Erneut laden',()=>load(),'text-button')));
  if(Object.values(data.sources).some(source=>source.state!=='ready'))notices.push(el('div',{class:'notice',role:'status'},el('p',{},'Ein Teil des Projektstands ist unbekannt. Fehlende Quellen zählen nicht als leer.'),button('Erneut laden',()=>load(),'text-button')));
  const screens={today:showToday,tasks:showTasks,deadlines:showDeadlines,pia:showPia,profile:showProfile,documents:showDocuments,sharing:showSharing};
  content.replaceChildren(...[...notices,...screens[view]()].flat(Infinity).filter(node=>node!==null&&node!==undefined&&node!==false)); announce(labels[view]+': '+(state==='stale'?'veralteter Stand.':'Projektstand angezeigt.'));
}
function announce(text){$('announcement').textContent=text;}
function readKey() {
  const fragment=new URLSearchParams(location.hash.slice(1)), incoming=fragment.get('k');
  if(location.hash){const url=new URL(location.href);url.hash='';history.replaceState({},'',url);}
  if(config.demo)return '';
  if(incoming){try{localStorage.setItem('pa6k',incoming);}catch{}return incoming;}
  try{return localStorage.getItem('pa6k')||key||'';}catch{return key||'';}
}
function validResponse(result) {
  if(!result||result.ok!==true||!names[result.person]||!['mitglied','leitung'].includes(result.role)||!Number.isFinite(Date.parse(result.fetchedAt))||result.contract!=='t1-v1')return false;
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
async function load(reset=false) {
  const ticket=++generation, nextKey=readKey();
  if(reset||nextKey!==key){data=null;leadership=reset?leadership:false;} key=nextKey;
  const previous=data;
  state='loading';render();
  if(config.demo){
    await new Promise(resolve=>setTimeout(resolve,250));if(ticket!==generation)return;
    const chosen=$('demo-state').value; person=$('demo-person').value;
    data=structuredClone(window.TEAM_DEMO[leadership&&person==='SA'?'leitung':person]);
    if(chosen==='empty'){data.tasks=[];data.meetings=[];data.milestones=[];data.phases=[];data.reserves=[];data.writing=[];data.group={total:0,active:0,done:0,unassigned:0,unknownStatus:0,progress:null};}
    if(chosen==='partial'){data.sources.psp.state='unknown';for(const name of ['tasks','milestones','phases','reserves','writing','group'])data[name]=null;}
    state=['loading','error','stale','unauthorized'].includes(chosen)?chosen:'ready';
    if(state==='error'||state==='unauthorized')data=null;
    lastLoaded=Date.now();render();return;
  }
  if(!key){data=null;state='unauthorized';render();return;}
  const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),20000);
  try{
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.endpoint))throw Error('Der Projektzugang ist noch nicht verbunden.');
    const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({typ:'team',k:key,leitung:leadership}),signal:controller.signal,referrerPolicy:'no-referrer',cache:'no-store'});
    if(!response.ok)throw Error('Der Projektstand ist vorübergehend nicht erreichbar.');
    const result=await response.json(); if(ticket!==generation)return;
    if(result?.code==='unauthorized'){data=null;state='unauthorized';leadership=false;render();return;}
    if(!validResponse(result))throw Error('Die Antwort ist unvollständig. Der aktuelle Stand bleibt unbekannt.');
    data=result;person=result.person;leadership=result.role==='leitung';state='ready';lastLoaded=Date.now();
  }catch(error){if(ticket!==generation)return;data=previous;state=previous?'stale':'error';errorMessage=error.name==='AbortError'?'Die Verbindung dauert zu lange. Bitte versuche es erneut.':error.message;}
  finally{clearTimeout(timeout);if(ticket===generation)render();}
}
$('person').addEventListener('click',()=>navigate('profile'));
$('role').addEventListener('click',()=>{leadership=!leadership;data=null;if(leadership){view='today';const url=new URL(location.href);url.searchParams.set('view','today');url.searchParams.delete('area');history.replaceState({},'',url);}load(true);});
$('refresh').addEventListener('click',()=>load());
$('demo-person').addEventListener('change',()=>{leadership=false;data=null;load(true);});
$('demo-state').addEventListener('change',()=>{data=null;load(true);});
$('privacy-button').addEventListener('click',privacy);$('privacy-footer').addEventListener('click',privacy);
window.addEventListener('popstate',()=>{area=new URLSearchParams(location.search).get('area')||'';navigate(new URLSearchParams(location.search).get('view'),false);});
window.addEventListener('hashchange',()=>load(true));
window.addEventListener('storage',event=>{if(event.key==='pa6k'){key='';data=null;leadership=false;load(true);}});
document.addEventListener('click',event=>{
  const link=event.target.closest('a[href]');
  if(pending&&link&&new URL(link.href).pathname!==location.pathname){event.preventDefault();announce('Die Meldung wird noch gespeichert. Warte kurz oder wähle Rückgängig.');}
},true);
document.addEventListener('visibilitychange',()=>{if(!config.demo&&!document.hidden&&Date.now()-lastLoaded>60000)load();});
$('preview').hidden=!config.demo;
if(config.demo&&!window.TEAM_DEMO){
  const script=document.createElement('script');script.src='demo-data.js';script.onload=()=>load();
  script.onerror=()=>{state='error';errorMessage='Die lokalen Vorschau-Daten fehlen.';render();};document.head.append(script);
}else load();
})();
