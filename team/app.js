'use strict';
(() => {
const config = window.TEAM_CONFIG;
const names = {SA:'Salah',ES:'Ernes',MG:'Melisa',AM:'Arber',LB:'Leonie'};
const labels = {today:'Heute',tasks:'Meine Aufgaben',deadlines:'Fristen',pia:'Pia',writing:'Schreibwerk'};
const paths = {today:'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',tasks:'M9 6h12M9 12h12M9 18h12M3 6l1 1 2-3M3 12l1 1 2-3M3 18l1 1 2-3',deadlines:'M4 5h16v16H4zM4 10h16M8 3v4M16 3v4',pia:'M21 11a8 8 0 0 1-8 8H8l-5 3 1-6a8 8 0 1 1 17-5Z'};
let view = new URLSearchParams(location.search).get('view') || 'today';
if (!labels[view]) view = 'today';
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
  if (push) {const url=new URL(location.href); url.searchParams.set('view',view); url.hash=''; history.pushState({},'',url);}
  render(); $('content').focus({preventScroll:true}); window.scrollTo({top:0,behavior:'instant'});
}
function today() {return config.demo ? '2026-11-01' : new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function day(value) {if (!value) return null; return value.includes('T') ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)) : value;}
function date(value, time=false) {
  if (!value) return 'Termin unbekannt';
  const text = new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit',year:'numeric',...(time&&value.includes('T')?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(value.includes('T')?value:value+'T12:00:00+01:00'));
  return text + (time && !value.includes('T') ? ' · Uhrzeit unbekannt' : '');
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
  if (/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(row.id||'')) url.searchParams.set('ctx',row.id);
  return el('a',{class:'button secondary pia-link',href:url.pathname+url.search,referrerpolicy:'no-referrer',onClick:rememberPiaRole},label);
}
function workLink(row) {
  const raw=cardText(row,'Wo'); let url;
  try {url=new URL(raw,location.origin);} catch {}
  const safe=url && ((url.origin===location.origin && /^\/team(?:\/|$)/.test(url.pathname)) || (url.protocol==='https:' && /^(?:www\.)?(?:notion\.so|notion\.site|app\.notion\.com|docs\.google\.com|drive\.google\.com)$/.test(url.hostname)));
  return safe && !url.username && !url.password ? el('a',{class:'button work-link',href:url.href,rel:'noopener noreferrer',referrerpolicy:'no-referrer'},'Arbeitsort öffnen ↗') : el('span',{class:'field-open'},'Wo · noch offen');
}
function steps(row) {
  const values=cardText(row,"So geht's").split(/\n+|\s+(?=\d+[.)]\s)/).map(value=>value.replace(/^\s*(?:\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);
  return el('ol',{class:'task-steps'},values.map(value=>el('li',{},value)));
}
function taskRow(row) {
  const status=overdue(row)?'Überfällig':row.status||'Status unbekannt';
  return el('li',{class:'task-card','data-owner':row.owner||data.person},
    el('div',{class:'task-card-top'},el('span',{class:'eyebrow'},row.ref||'Kennung noch offen'),el('span',{class:'badge '+(overdue(row)?'warning':'')},status)),
    el('p',{class:'task-due'},el('span',{},'Frist'),date(row.due)),
    el('button',{type:'button',class:'row task-title',onClick:()=>details(row)},el('h3',{},cardText(row,'Was')),el('span',{'aria-hidden':'true'},'↗')),
    el('p',{class:'task-label'},row.title||'Auftrag noch offen'),
    el('div',{class:'task-field'},el('h4',{},'Fertig wenn'),el('p',{},cardText(row,'Fertig wenn'))),
    el('div',{class:'task-field'},el('h4',{},"So geht’s"),steps(row)),
    el('div',{class:'task-actions'},workLink(row),piaLink(row)),
    el('p',{class:'task-owner'},names[row.owner]||'Zuteilung noch offen'));
}
function taskList(rows, all=false) {
  if (rows === null) return unknown();
  const filtered=sortRows(rows.filter(row=>all||!completed(row)));
  return filtered.length ? el('ul',{class:'rows task-grid'},filtered.map(taskRow)) : empty('Hier ist noch nichts zugeteilt.','Es sind keine passenden Aufgaben hinterlegt. Das bedeutet nicht, dass nichts zu tun ist. Kläre die Zuteilung mit Salah.');
}
function groupCard() {
  const group = data.group;
  return card('Unser Gruppenstand',group ? el('div',{class:'card-body'},el('div',{class:'stats'},[['Arbeitspakete',group.total],['In Arbeit',group.active],['Erledigt',group.done],['Nicht zugeteilt',group.unassigned]].map(([label,value])=>el('div',{class:'stat'},el('strong',value===null?{class:'unknown-value'}:{},value??'Unbekannt'),el('span',{},label)))),el('p',{class:'quiet-note'},'Gemeinsame Planung. Keine Ergebnisse der Erhebung.'),el('p',{class:'unknown'},'Gesamtfortschritt unbekannt'+(group.unknownStatus?' · '+group.unknownStatus+' Statusangaben fehlen.':'.')),el('p',{class:'source'},'Laufende Phasen laut PSP: '+((data.phases||[]).filter(row=>row.status==='läuft').map(row=>row.title).join(', ')||'Unbekannt')),source()) : unknown());
}
function piaCard() {return el('section',{class:'pia-card'},el('div',{},el('p',{class:'eyebrow'},'Deine Projektkollegin'),el('h2',{},'Ein klarer nächster Schritt.'),el('p',{},'Aufgaben, Fristen oder Regeln: Pia hilft dir, sie einzuordnen.'),button('Mit Pia klären →',()=>navigate('pia'),'text-button')),el('img',{src:'assets/pia.png',alt:'',width:128,height:128}));}
function writingCard() {return card('Unser Schreibwerk',el('div',{class:'card-body'},el('p',{class:'quiet-note'},'PA6a · Kapitel 1 bis 7'),el('p',{class:'unknown'},'Kapitelstand unbekannt'),el('p',{class:'source'},'Es gibt noch keinen belegten Stand je Kapitel. Die PSP-Planung ist separat sichtbar.')),button('Ansehen →',()=>navigate('writing'),'text-button'));}
function showToday() {
  const tasks=ownTasks(), urgent=sortRows((tasks||[]).filter(row=>!completed(row)&&(overdue(row)||day(row.due)===today())));
  const next=sortRows((data.meetings||[]).filter(row=>row.due&&day(row.due)>=today()))[0];
  const focus=urgent[0]||next;
  const hero=focus ? el('section',{class:'hero'},el('div',{},el('p',{class:'eyebrow'},urgent.length?'Dein nächster Schritt':'Als Nächstes · Gemeinsam'),el('h2',{},focus.title?.replace(/^\d{4}-\d{2}-\d{2} · /,'')||'Termin'),el('p',{},date(focus.due,true),' · ',urgent.length?'Deine Aufgabe':'Für die ganze Gruppe'),button(urgent.length?'Aufgabe ansehen →':'Termin ansehen →',()=>details(focus,urgent.length?'PSP':'Sitzungen')),piaLink(focus)),el('div',{class:'date-card','aria-hidden':'true'},el('span',{},new Intl.DateTimeFormat('de-CH',{month:'short',timeZone:'Europe/Zurich'}).format(new Date(focus.due))),el('strong',{},day(focus.due).slice(-2)),el('small',{},urgent.length?'Dein Fokus':'Nächster Termin'))) : el('section',{class:'hero'},el('div',{},el('p',{class:'eyebrow'},'Raum für den nächsten Schritt'),el('h2',{},data.meetings===null?'Nächster Termin unbekannt.':'Heute ist kein Termin hinterlegt.'),el('p',{},'Deine Aufgaben und die nächsten Fristen findest du hier.'),button('Fristen ansehen →',()=>navigate('deadlines'))));
  return [heading('Hallo, '+names[data.person]+'.','Alles, was dich heute weiterbringt.'),hero,el('div',{class:'columns'},el('div',{class:'stack'},card('Deine nächsten Aufgaben',taskList(tasks===null?null:sortRows(tasks.filter(row=>!completed(row))).slice(0,3)),button('Alle ansehen →',()=>navigate('tasks'),'text-button')),writingCard()),el('div',{class:'stack'},groupCard(),piaCard())),el('div',{class:'capture-links','aria-label':'Erfassungsmasken'},el('a',{href:'b/'},'Servicebeobachtung →'),el('a',{href:'c/'},'Bewertungen codieren →'))];
}
function showTasks() {
  const tasks = data.role==='leitung'?data.tasks:ownTasks();
  const rows = tasks===null ? null : [...tasks,...(data.assignments||[]),...(data.chapters||[])];
  return [heading(data.role==='leitung'?'Aufgaben der Gruppe':'Meine Aufgaben',data.role==='leitung'?'Zuteilung und nächste Schritte im Blick.':'Dein Beitrag, übersichtlich an einem Ort.'),el('div',{class:'filters','aria-label':'Aufgabenfilter'},['open','all'].map(value=>el('button',{class:'filter','aria-pressed':filter===value,'data-filter':value,onClick:()=>{filter=value;render();document.querySelector('[data-filter='+value+']').focus();}},value==='open'?'Offen':'Alle'))),card(data.role==='leitung'?'Alle Arbeitspakete':'Für '+names[data.person],taskList(rows,filter==='all')),source(),data.group?.unassigned>0?el('p',{class:'unknown'},data.group.unassigned+' Arbeitspakete haben noch keine Zuständigkeit. Fehlende Zuordnung bedeutet nicht erledigt.'):null];
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
  return el('div',{class:'timeline'},[...groups].map(([key,entries])=>el('section',{class:'timeline-group'},el('h3',{class:'timeline-label'},key==='unbekannt'?'Datum unbekannt':date(key)),entries.map(row=>el('div',{class:'card'},el('button',{class:'row',onClick:()=>details(row,row.source||origin)},el('span',{class:'row-copy'},el('span',{class:'row-title'},row.title||'Titel unbekannt'),el('span',{class:'row-sub'},date(row.due,true),' · ',row.source||origin,overdue(row)&&row.status?' · Überfällig':'')),el('span',{class:'row-arrow','aria-hidden':'true'},'›')),el('div',{class:'deadline-actions'},piaLink(row)))))));
}
function showDeadlines() {
  const rows=[...(data.meetings||[]).map(row=>({...row,source:'Notion · Sitzungen'})),...(data.reserves||[]).map(row=>({...row,source:'Notion · PSP · Reserve'})),...(data.milestones||[]).map(row=>({...row,source:'Notion · PSP'})),...(data.tasks||[]).filter(row=>!completed(row)).map(row=>({...row,source:'Notion · PSP'})),...(data.assignments||[]).map(row=>({...row,source:'Notion · Erhebungsaufträge'})),...(data.chapters||[]).map(row=>({...row,source:'Notion · Kapitel'}))];
  return [heading('Die nächsten Fristen.','Von der nächsten Sitzung bis zur letzten Abgabe.'),el('h2',{class:'section-heading'},'Aus unserer Planung'),rows.length ? timeline(rows,'Notion') : (data.sources.psp.state==='unknown'||data.sources.meetings.state==='unknown') ? unknown() : timeline(rows,'Notion'),el('p',{class:'source'},'Plan-Enden aus dem PSP sind keine neu festgelegten Schultermine. Abweichungen mit den unten belegten Terminen abgleichen.'),el('h2',{class:'section-heading'},'Die Schultermine'),timeline(schoolDates,'Termine.md · Stand 28.10.2026'),el('p',{class:'source'},'Quelle: Termine.md, abgeglichen mit Moodle-Kalender und Stundenplan. Statischer Zusatz; der aktuelle Schulkalender wird hier nicht live gelesen.')];
}
const chapters = [['1','Ausgangslage und Problemstellung'],['2','Analyse der aktuellen Markt- und Geschäftssituation'],['2.4','Primäre Marktforschung'],['2.8','Auswertung'],['2.9','SWOT-Analyse'],['3','Strategische Überlegungen und mögliche Methoden das Ziel zu erreichen'],['4','Fazit'],['5','Reflexion Gruppenarbeit'],['6','Literaturverzeichnis'],['7','Eigenständigkeitserkärung']];
function showWriting() {
  return [heading('Unser Schreibwerk.','PA6a · Die vorgegebene Struktur bleibt unser roter Faden.'),el('p',{class:'notice'},'Für einzelne Kapitel ist noch kein Bearbeitungs- oder Prüfstand belegt. Die Planung unten ist keine Kapitelabnahme.'),card('Kapitelstand',chapters.map(([number,title])=>el('div',{class:'chapter-row'},el('span',{class:'chapter-num'},number),el('span',{class:'chapter-name'},title,number==='6'?el('span',{class:'row-sub'},'Abbildungsverzeichnis · Tabellenverzeichnis · Anhang'):null),el('small',{},'Stand unbekannt'),piaLink((data.chapters||[]).find(row=>row.ref==='6a-'+number)||{'Pia-Frage':'Erklär mir die Anforderungen an PA6a Kapitel '+number+' '+title+'.'})))),source('Merkmalblatt 6a · Wortlaut und Reihenfolge'),el('h2',{class:'section-heading'},'Deine Kapitelaufträge'),data.chapters==null?unknown('Kapitelaufträge sind noch offen.'):taskList(data.chapters,true),el('h2',{class:'section-heading'},'Zugehörige PSP-Planung'),data.writing===null?unknown():data.writing.length?card('Arbeitspakete',el('ul',{class:'rows task-grid'},data.writing.map(row=>taskRow(row)))):empty('Keine Schreibplanung hinterlegt.','Kapitelstände bleiben unbekannt.'),button('Zurück zu Heute',()=>navigate('today'),'button secondary')];
}
function showPia() {
  return [heading('Frag Pia.','Ein guter nächster Schritt beginnt mit einer Frage.'),el('section',{class:'pia-entry'},el('img',{src:'assets/pia.png',alt:'Pia, deine Projektkollegin',width:180,height:180}),el('p',{class:'eyebrow'},'Für unsere PA6'),el('h2',{},'Ich erkläre. Du entscheidest.'),el('p',{},'Deine Aufgaben, Fristen und Regeln. Zusammen bringen wir Ordnung rein.'),button(config.demo?'Pia-Einstieg ansehen →':'Pia öffnen →',openPia),el('p',{class:'privacy-copy'},'Keine Namen, Nummern oder Adressen eingeben. Vor einer Frage beachte den Verarbeitungshinweis auf der Pia-Seite. Ihr Verlauf bleibt in deinem Browser; die Nutzung ist freiwillig.'),config.demo?el('p',{class:'source'},'Lokaler Nachbau: Es wird keine Frage versendet.'):null)];
}
function openPia() {
  if (config.demo) return modal('Mit Pia klären',el('p',{},'Im Echtbetrieb öffnet dieser Einstieg deine bestehende Pia-Seite mit demselben persönlichen Zugang.'),el('p',{},'Beispiel für deinen Einstieg: «Was steht als Nächstes an?»'),el('p',{},'Dies ist die lokale Vorschau. Es wurde keine Verbindung aufgebaut.'),button('Zurück zu Heute',()=>{$('detail').close();navigate('today');}));
  rememberPiaRole(); location.assign(config.piaPath);
}
function modal(title,...content) {$('detail-body').replaceChildren(el('h2',{},title),...content); $('detail').showModal();}
function details(row, origin='Notion · PSP') {
  $('detail').dataset.owner=row.owner||data.person;
  modal(cardText(row,'Was')==='noch offen'?(row.title||'Eintrag'):row.Was,el('div',{class:'task-detail'},el('p',{class:'task-due'},el('span',{},'Frist'),date(row.due)),el('h3',{},'Warum'),el('p',{},cardText(row,'Warum')),el('h3',{},'Fertig wenn'),el('p',{},cardText(row,'Fertig wenn')),el('h3',{},"So geht’s"),steps(row),el('div',{class:'task-actions'},workLink(row),piaLink(row))),el('p',{class:'eyebrow'},row.ref||'Kennung unbekannt'),el('dl',{},el('dt',{},'Plan Start'),el('dd',{},date(row.start,true)),el('dt',{},'Termin'),el('dd',{},date(row.due,true)),el('dt',{},'Status'),el('dd',{},row.status||'Unbekannt'),el('dt',{},'Zuständig'),el('dd',{},names[row.owner]||'Unbekannt'),el('dt',{},'Quelle'),el('dd',{},origin)),el('p',{class:'source'},'Planungsstand. Änderungen und Zuteilungen werden weiterhin im Projekt gepflegt.'));
}
function privacy() {
  modal('Datenschutz & Zugang',el('p',{},'Verantwortlich ist Salah Aouaj. Die Team-App liest Planungsdaten über Google und Notion. Der Team-Abruf sendet keine Daten an den Antwortdienst von Pia.'),el('p',{},'Dein persönlicher Zugang bleibt wie bei Pia in diesem Browser gespeichert. Projektstände werden hier nur im Arbeitsspeicher gehalten. Der Server speichert Antworten höchstens 60 Sekunden zwischen.'),el('p',{},'Auf der Pia-Seite gilt deren Verarbeitungshinweis vor dem Absenden einer Frage. Keine Namen, Nummern oder Adressen eingeben. Bestehende Pia-Verläufe kannst du dort löschen. Die Nutzung ist freiwillig.'),el('p',{},'Projektbezogene Daten werden gemäss bestehender Gruppenregel nach der Benotung gelöscht.'),button('Von diesem Browser abmelden',logout,'button secondary'));
}
function logout() {try{localStorage.removeItem('pa6k');}catch{} key=''; generation++; data=null; state='unauthorized'; leadership=false; $('detail').close(); render();}
function render() {
  $('breadcrumb').textContent=labels[view]; document.title=labels[view]+' · Unser Projekt';
  $('nav').replaceChildren(...['today','tasks','deadlines','pia'].map(name=>el('a',{href:'?view='+name,class:'nav-link','aria-current':(view===name||view==='writing'&&name==='today')?'page':null,onClick:event=>{event.preventDefault();navigate(name);}},icon(name),el('span',{},labels[name]))));
  document.body.dataset.person=data?.person||'';
  $('person').textContent=data?names[data.person]:config.demo?'Vorschau':'Dein Zugang';
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
  const screens={today:showToday,tasks:showTasks,deadlines:showDeadlines,pia:showPia,writing:showWriting};
  content.replaceChildren(...notices,...screens[view]()); announce(labels[view]+': '+(state==='stale'?'veralteter Stand.':'Projektstand angezeigt.'));
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
$('role').addEventListener('click',()=>{leadership=!leadership;data=null;load(true);});
$('refresh').addEventListener('click',()=>load());
$('demo-person').addEventListener('change',()=>{leadership=false;data=null;load(true);});
$('demo-state').addEventListener('change',()=>{data=null;load(true);});
$('privacy-button').addEventListener('click',privacy);$('privacy-footer').addEventListener('click',privacy);
window.addEventListener('popstate',()=>navigate(new URLSearchParams(location.search).get('view'),false));
window.addEventListener('hashchange',()=>load(true));
window.addEventListener('storage',event=>{if(event.key==='pa6k'){key='';data=null;leadership=false;load(true);}});
document.addEventListener('visibilitychange',()=>{if(!config.demo&&!document.hidden&&Date.now()-lastLoaded>60000)load();});
$('preview').hidden=!config.demo;
if(config.demo&&!window.TEAM_DEMO){
  const script=document.createElement('script');script.src='demo-data.js';script.onload=()=>load();
  script.onerror=()=>{state='error';errorMessage='Die lokalen Vorschau-Daten fehlen.';render();};document.head.append(script);
}else load();
})();
