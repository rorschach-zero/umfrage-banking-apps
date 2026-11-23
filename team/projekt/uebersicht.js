'use strict';
(async () => {
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
 const main=document.querySelector('main');
 const demo=local&&new URLSearchParams(location.search).get('vorschau')==='1';
 const M=window.ProjectData;
 const storage=(()=>{try{return localStorage;}catch{return null;}})();
 let phase='loading',access='',cacheSlot='',generation=0,controller=null;
 if(new URLSearchParams(location.search).has('vorschau')&&!local){main.replaceChildren(document.createTextNode('Diese Projektvorschau läuft nur lokal.'));return;}
 const element=(tag,attrs={},...children)=>{const node=document.createElement(tag);for(const [key,value]of Object.entries(attrs)){if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else if(value!==null&&value!==false)node.setAttribute(key,value===true?'':value);}for(const child of children.flat(Infinity))if(child!==null&&child!==undefined&&child!==false)node.append(child?.nodeType?child:String(child));return node;};
 const E=element;
 const button=(text,action,style='pv-button',attrs={})=>E('button',{type:'button',class:style,onclick:action,...attrs},text);
 const label=text=>E('span',{class:'pv-eyebrow'},text);
 const arrow=()=>E('span',{'aria-hidden':'true'},'↗');
 const fmt=value=>!value?'Frist noch offen':new Intl.DateTimeFormat('de-CH',{day:'numeric',month:'long',timeZone:'Europe/Zurich'}).format(new Date(value.includes('T')?value:value+'T12:00:00Z'));
 const shortDate=value=>!value?'Frist noch offen':new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'short',timeZone:'Europe/Zurich'}).format(new Date(value.includes('T')?value:value+'T12:00:00Z'));
 const params=new URLSearchParams(location.search);
 let data,person=params.get('person')||'MG',view='overview',selected=null;
 const storageKey=kind=>'pa6-project-preview:'+kind+':'+person+':'+data.people[person].task.ref;
 const read=kind=>{try{return JSON.parse(localStorage.getItem(storageKey(kind))||'null');}catch{return null;}};
 const write=(kind,value)=>{localStorage.setItem(storageKey(kind),JSON.stringify(value));};
 const user=()=>data.people[person];
 const isLead=()=>demo?person==='SA':data?.lead===true;
 function setView(next){view=next;render();document.querySelector('main h1')?.focus({preventScroll:true});window.scrollTo?.({top:0,behavior:'instant'});}
 function navButton(name,key,number){return button([number,name].join('  '),()=>setView(key),'pv-nav-button',{'data-view':key,'aria-current':view===key||key==='steckbriefe'&&view==='steckbrief'?'page':null,hidden:key==='lead'&&!isLead()||key==='steckbriefe'&&demo});}
 function shell(){
  document.body.classList.add('project-preview');
  const mark=E('span',{class:'pv-mark','aria-hidden':'true'},E('i'),E('i'),E('i'));
  const select=E('select',{id:'preview-person','aria-label':'Beispielperson',onchange:e=>{person=e.target.value;view='overview';render();}},Object.entries(data.people).map(([key,p])=>E('option',{value:key,selected:key===person},p.name)));
  const sidebar=E('aside',{class:'pv-sidebar'},E('a',{href:'../',class:'pv-brand'},mark,E('span',{},'Unser Projekt',E('small',{},'Praxisarbeit 6 · Klasse 601/H25-B'))),E('nav',{'aria-label':'Projektansichten'},navButton(demo?'Überblick':'Werkzeuge','overview','01'),navButton('Mein Auftrag','task','02'),navButton('Leitung','lead','03'),navButton('Steckbriefe','steckbriefe','04')),E('div',{class:'pv-side-bottom'},E('span',{class:'pv-tiny'},demo?'LOKALE VORSCHAU':'DEIN PROJEKT'),demo?E('p',{},'Gemeinsam wissen,\nwas als Nächstes zählt.'):null,demo?E('label',{for:'preview-person'},'Beispielperson'):E('span',{},user().name),demo?select:null));
  const top=E('header',{class:'pv-top'},E('a',{href:'../'},'Meine Arbeit'),E('span',{'aria-hidden':'true'},'/'),E('strong',{},'Projekt'),E('span',{class:'pv-top-status'},E('i'),'Stand vom '+data.readDate+(phase==='cached'?' · wird aktualisiert':phase==='stale'?' · veraltet':'')),!demo&&phase==='ready'&&data.known?button('Aktualisieren',()=>load(),'pv-text-button'):null,E('span',{class:'pv-avatar','aria-label':user().name},user().name.slice(0,1)));
  const body=E('main',{id:'main',class:'pv-main'});
  document.body.replaceChildren(E('a',{class:'pv-skip',href:'#main'},'Zum Inhalt'),sidebar,E('div',{class:'pv-workspace'},top,body,E('footer',{class:'pv-footer'},E('span',{},demo?'Beispiel vom '+data.readDate+' · Änderungen bleiben auf diesem Gerät.':'Aufgaben und Fristen aus dem gemeinsamen Aufgabenplan'),E('span',{},'Studiengruppe · nicht im Namen von Yuh'))));
  window.PA6View?.mount();return body;
 }
 function heading(kicker,title,copy){return E('div',{class:'pv-heading'},label(kicker),E('h1',{tabindex:'-1'},title),copy?E('p',{},copy):null);}
 function tag(text,tone=''){return E('span',{class:'pv-tag '+tone},text);}
 function criteria(task){return E('div',{class:'pv-criteria'},E('h3',{},'Fertig, wenn'),E('p',{},task.done),task.criteriaProposed?E('small',{},'Vorschlag: Die genaue Fertig-Bedingung wird noch gemeinsam bestätigt.'):null);}
 function deadlineList(all=false){
  const row=(d,i)=>E('li',{},E('time',{datetime:d.date},shortDate(d.date)),E('div',{},E('strong',{},d.title),E('small',{},d.detail+' · '+d.type)),E('span',{class:'pv-deadline-dot '+(i===0?'active':''),'aria-hidden':'true'}));
  const later=all?null:E('details',{},E('summary',{},'Die weiteren Schritte bis zur Abgabe'),E('ol',{},data.deadlines.slice(4).map(row)));
  return E('section',{class:'pv-panel pv-deadlines'},E('div',{class:'pv-panel-head'},E('h2',{},'Der Weg bis 12. Dezember'),tag('Erste Praxisarbeit')),E('ol',{},data.deadlines.slice(0,all?8:4).map(row)),later);
 }
 function overview(){
  if(!demo)return liveOverview();
  const p=user(),task=p.task;
  const hero=E('section',{class:'pv-hero'},heading('UNSER GEMEINSAMES ZIEL','Aus Daten wird ein guter Bericht.','Hallo '+p.name+'. Hier siehst du deinen nächsten Beitrag und was die Gruppe dafür braucht.'),E('div',{class:'pv-date'},label('ABGABE ERSTE PRAXISARBEIT'),E('strong',{},'12'),E('span',{},'Dezember · 23:59')));
  const gate=E('div',{class:'pv-gate'},E('span',{class:'pv-dot','aria-hidden':'true'}),E('div',{},E('strong',{},'Grundlagen klären'),E('span',{},'Freigabe der Grundlagen noch offen')),button('Was fehlt?',()=>setView(person==='SA'?'lead':'task'),'pv-text-button'));
  const next=E('section',{class:'pv-next'},E('div',{class:'pv-card-top'},label('DEIN NÄCHSTER SCHRITT'),tag('Bis '+shortDate(task.due))),E('h2',{},task.title),E('p',{},task.next),p.absence?E('p',{class:'pv-absence'},p.absence+' · Daran arbeitet Salah gerade.'):null,criteria(task),E('div',{class:'pv-next-bottom'},button('Auftrag öffnen  →',()=>setView('task'),'pv-button pv-primary',{'data-next-task':task.ref}),E('span',{},'Du führst diesen Auftrag.\nSalah prüft danach.')));
  const dependency=E('section',{class:'pv-panel pv-dependency'},E('div',{class:'pv-panel-head'},E('h2',{},'Wer braucht wen?'),label('NÄCHSTE ÜBERGABEN')),E('div',{class:'pv-flow'},[['Melisa & Ernes','Geprüfte Daten'],['Arber','Auswertung'],['Ernes','Schlüsse ableiten'],['Salah & Leonie','Bericht & Prüfung']].map(([name,job],i)=>E('div',{class:'pv-flow-step'},E('span',{class:'pv-step-number'},'0'+(i+1)),E('strong',{},job),E('small',{},name)))),E('p',{class:'pv-caption'},'Die Auswertung braucht geprüfte Daten. Offene Einordnungen und Unterschiede zuerst klären; ein fertiges Häkchen genügt nicht.'));
  const risk=E('section',{class:'pv-risk'},E('span',{class:'pv-risk-icon','aria-hidden':'true'},'!'),E('div',{},E('h2',{},'Das kann deinen nächsten Schritt aufhalten'),E('p',{},p.memberRisk||p.risk)),person==='SA'?button('Entscheide ansehen',()=>setView('lead'),'pv-text-button'):button('Im Auftrag festhalten',()=>setView('task'),'pv-text-button'));
  return [hero,gate,E('div',{class:'pv-overview-grid'},next,deadlineList()),dependency,risk];
 }
 function taskView(){
  if(!demo)return liveTask();
  const p=user(),task=p.task,draft=read('draft')||{},receipt=read('receipt');
  const steps=E('ol',{class:'pv-work-steps'},task.steps.map((step,i)=>E('li',{},E('span',{class:'pv-step-number'},String(i+1)),E('div',{},E('strong',{},step),E('p',{},['Beginne mit dem aktuellen Stand. Unbekanntes bleibt offen.','Halte das Ergebnis nachvollziehbar fest.','Prüfe die Fertig-Bedingung und bestätige deine eigene Zeit.'][i])))));
  const notes=E('textarea',{id:'work-note',rows:3,placeholder:'Was ist geklärt, was fehlt noch?',maxlength:600},draft.note||'');
  const minutes=E('input',{type:'number',id:'work-minutes',min:1,max:1440,step:1,inputmode:'numeric',value:draft.minutes||'',placeholder:'z. B. 25'});
  const date=E('input',{type:'date',id:'work-date',value:draft.date||data.date,min:'2026-10-01',max:data.date});
  const confirm=E('input',{type:'checkbox',id:'result-confirmed',checked:draft.confirmed===true});
  const message=E('p',{id:'handover-message',role:'status','aria-live':'polite'});
  const form=E('form',{id:'handover-form',class:'pv-handover',novalidate:true},label('ZUM SCHLUSS'),E('h2',{},'Deine Arbeit festhalten'),E('p',{},'Bestätige nur deine eigene, noch nicht erfasste Arbeitszeit.'),E('div',{class:'pv-fields'},E('div',{},E('label',{for:'work-minutes'},'Arbeitsminuten'),minutes),E('div',{},E('label',{for:'work-date'},'Gearbeitet am'),date)),E('label',{for:'work-note'},'Ergebnis oder offene Frage · freiwillig'),notes,E('label',{class:'pv-check',for:'result-confirmed'},confirm,E('span',{},'Ich habe «Fertig, wenn» geprüft. Mein Ergebnis ist zur Prüfung bereit.')),message,E('button',{class:'pv-button pv-primary',type:'submit'},'Übergabe lokal ausprobieren  →'),E('small',{class:'pv-caption'},'Die Vorschau meldet nichts an die Gruppe und bucht keine echten Stunden.'));
  function persist(){try{write('draft',{minutes:minutes.value,date:date.value,note:notes.value,confirmed:confirm.checked});}catch{message.textContent='Dein Browser speichert den Entwurf nicht. Lass dieses Fenster offen.';}}
  form.addEventListener('input',persist);form.addEventListener('change',persist);
  form.addEventListener('submit',event=>{
   event.preventDefault();if(!minutes.value||!minutes.checkValidity()){message.textContent='Ergänze die Minuten deiner Arbeit: 1 bis 1440.';minutes.focus();return;}
   if(!date.checkValidity()||!date.value){message.textContent='Prüfe den Arbeitstag.';date.focus();return;}
   if(!confirm.checked){message.textContent='Prüfe zuerst die Fertig-Bedingung und bestätige sie.';confirm.focus();return;}
   try{persist();if(!read('receipt')||read('receipt').undone)write('receipt',{minutes:+minutes.value,date:date.value,note:notes.value,created:new Date().toISOString(),undone:false});render();}catch{message.textContent='Nicht gespeichert. Dein Entwurf bleibt im Fenster.';}
  });
  const work=E('section',{class:'pv-panel pv-task-body'},E('div',{class:'pv-panel-head'},E('h2',{},'So gehst du vor'),tag('3 Schritte')),steps,criteria(task),E('details',{class:'pv-source'},E('summary',{},'Grundlage und ursprünglichen Auftrag ansehen'),E('p',{},task.ref+' (AP = Arbeitspaket) · '+task.sourceTitle),E('p',{},'Stand vom '+data.readDate+'. Die Schritte oben sind ein redaktioneller Vorschlag.'),E('p',{},'Ursprüngliches «Fertig, wenn»: '+task.sourceDone)));
  const side=E('aside',{class:'pv-task-side'},E('div',{class:'pv-panel'},label('DEIN AUFTRAG'),E('h2',{},p.name),E('dl',{class:'pv-facts'},E('div',{},E('dt',{},'Frist'),E('dd',{},fmt(task.due))),E('div',{},E('dt',{},'Im Plan'),E('dd',{},task.plannedHours+' h für das ganze Paket')),E('div',{},E('dt',{},'Deine erfasste Zeit'),E('dd',{},'Noch nicht vollständig belegt')),E('div',{},E('dt',{},'Danach prüft'),E('dd',{},'Salah'))),E('p',{class:'pv-caption'},'Die Paketstunden gehören der Gruppe. Sie sind keine Zusage deiner verfügbaren Zeit.')),E('div',{class:'pv-side-risk'},label('ACHTE DARAUF'),E('p',{},p.memberRisk||p.risk)));
  let completion=null;
  if(receipt&&!receipt.undone)completion=E('section',{class:'pv-receipt',role:'status'},E('span',{class:'pv-receipt-check','aria-hidden':'true'},'✓'),label('ÜBERGABE AUSPROBIERT'),E('h2',{},'So fühlt sich ein klarer Abschluss an.'),E('p',{},receipt.minutes+' Minuten · '+fmt(receipt.date)+' · '+p.name),E('strong',{},'Nur lokal · kein echter Abschluss.'),E('p',{},'In der angebundenen Version würde das Ergebnis jetzt zur Prüfung gehen. Hier wurde nichts an den Server gesendet.'),button('Lokale Übergabe zurücknehmen',()=>{write('receipt',{...receipt,undone:true});render();},'pv-text-button',{id:'undo-preview'}));
  return [button('← Zur Übersicht',()=>setView('overview'),'pv-text-button'),heading('MEIN AUFTRAG',task.title,'Ein klares Ergebnis. Deine Zeit. Eine nachvollziehbare Übergabe.'),E('div',{class:'pv-task-grid'},E('div',{},work,receipt?.undone?E('p',{role:'status',class:'pv-notice'},'Lokale Übergabe zurückgenommen. Dein Entwurf bleibt erhalten.'):null,completion||form),side)];
 }
 function leadView(){
  if(!demo)return liveLead();
  const decisions=[{id:'coverage',title:'Vertretung für Leonie klären',tag:'Vor 21. November',copy:'60 offene Einordnungen sind Leonie zugeteilt: 47 erste und 13 zweite Einordnungen. Sie ist bis 23.11. abwesend.',next:'Verfügbare Personen festhalten. Eine Person darf ihre eigene erste Einordnung nicht nochmals ein zweites Mal beurteilen.',owner:'Salah · mit den verfügbaren Mitgliedern'}, {id:'capacity',title:'Den Restplan mit echten Zusagen abgleichen',tag:'Kapazität noch offen',copy:'267 Stunden sind für die Arbeitspakete geplant. Die persönliche Restkapazität bis 12.12. ist noch nicht bestätigt.',next:'Für alle fünf Zusagen sammeln; Arbers Verfügbarkeit und die 15 Reservestunden klären.',owner:'Salah · alle fünf Mitglieder'}, {id:'gate',title:'Über den nächsten Arbeitsschritt entscheiden',tag:'Freigabe noch offen',copy:'Die nächste Phase ist ab 19.11. geplant. Die Freigabe der Grundlagen ist im gelesenen Stand noch offen.',next:'Offene Planungspunkte prüfen. Freigabe oder begründete Teilfreigabe mit Datum und Beleg festhalten.',owner:'Salah · Projektleitung'}];
  return [heading('LEITUNG','Damit die anderen weiterkommen.','Drei Entscheide vor dem nächsten Schritt. Der gelesene Stand zeigt offene Arbeit, keine stillschweigende Freigabe.'),E('div',{class:'pv-lead-grid'},E('section',{class:'pv-decisions'},decisions.map((d,i)=>{
    const saved=read('decision-'+d.id);const note=E('textarea',{rows:3,placeholder:'Vorschlag, betroffene Personen und nächster Termin',maxlength:600,'aria-label':'Entwurf: '+d.title},saved?.note||'');
    const status=E('p',{role:'status',class:'pv-caption'},saved?'Lokaler Entwurf vorhanden. Noch kein Gruppenentscheid.':'');
    return E('article',{class:'pv-panel pv-decision'},E('div',{class:'pv-card-top'},label('ENTSCHEID 0'+(i+1)),tag(d.tag,'warm')),E('h2',{},d.title),E('p',{},d.copy),E('div',{class:'pv-decision-next'},E('strong',{},'Jetzt tun'),E('p',{},d.next)),E('p',{class:'pv-caption'},d.owner),E('details',{},E('summary',{},'Entscheid vorbereiten'),note,button('Entwurf lokal sichern',()=>{try{write('decision-'+d.id,{note:note.value});status.textContent='Lokal gesichert · noch kein Gruppenentscheid.';}catch{status.textContent='Speichern nicht möglich. Lass das Fenster offen.';}},'pv-button'),status))
  })),E('aside',{},E('section',{class:'pv-panel'},label('NÄCHSTE KONTROLLE'),E('h2',{},'22. November'),E('p',{},'Risiken prüfen und die Wirkung der Massnahmen festhalten.'),E('p',{class:'pv-caption'},'Vergangene Lücken bleiben sichtbar. Eine Bestätigung ersetzt kein beobachtetes Ergebnis.')),E('section',{class:'pv-panel pv-lead-note'},E('h2',{},'Was noch belegt werden muss'),E('ul',{},E('li',{},'Tatsächliche Stunden je Person'),E('li',{},'Coaching vom 2. November'),E('li',{},'Freigabe und Versand des Wochenberichts')),E('p',{class:'pv-caption'},'Quelle: Gesamtprüfung vom 18.11. zu Risiken, Aufwand und Coaching.'))))];
 }
 function render(){const old=document.querySelector('main.pv-main');let target=shell();if(old){target.replaceWith(old);target=old;target.replaceChildren();}target.append(...[!demo?liveNotice():null,...(view==='task'?taskView():view==='lead'&&isLead()?leadView():view==='steckbriefe'&&!demo?steckbriefList():view==='steckbrief'&&!demo?steckbriefDetail():overview()),demo?E('p',{class:'pv-caption pv-read-stand'},'Stand vom '+data.readDate+' · lokale Vorschau.'):null].filter(node=>node!=null&&node!==false));}
 if(demo)try{const response=await fetch('beispielstand.json');if(!response.ok)throw Error('Beispielstand nicht erreichbar');data=await response.json();if(!data.people[person])person='MG';render();}catch(error){main.replaceChildren(E('h1',{},'Vorschau nicht geladen'),E('p',{},error.message),button('Erneut versuchen',()=>location.reload()));}

 function toolsNav(){
  const actions=[['?formular=arbeitszeit','Arbeitszeit erfassen','Stunden für deine Aufgaben eintragen'],['?formular=coaching','Coaching festhalten','Gespräch und nächste Schritte notieren'],['?formular=risiko','Risiko festhalten','Risiko und Gegenmassnahme eintragen'],['../?view=deadlines','Fristen prüfen','Termine und offene Aufgaben ansehen']];
  return E('nav',{class:'pv-tools','aria-label':'Projektwerkzeuge'},actions.map(([href,title,benefit])=>E('a',{href,class:'pv-tool'},E('strong',{},title),E('span',{},benefit),arrow())));
 }
 function liveNotice(){if(phase==='ready'&&data.known)return null;return E('div',{class:'pv-notice',role:'status'},E('span',{},phase==='stale'?'Verbindung unterbrochen. Dies ist der gespeicherte Stand vom '+data.readDate+'. Neue Änderungen sind unbekannt.':phase==='cached'?'Gespeicherter Stand vom '+data.readDate+'. Der aktuelle Stand wird geladen …':'Der Aufgabenplan ist nicht vollständig verfügbar. Aufgaben und Fristen bleiben unbekannt.'),button('Aktualisieren',()=>load(),'pv-text-button'));}
 function liveDates(){return E('section',{class:'pv-panel pv-deadlines'},E('h2',{},'Deine nächsten Fristen'),data.deadlines.length?E('ol',{},data.deadlines.slice(0,8).map(d=>E('li',{},E('time',{datetime:d.date},shortDate(d.date)),E('div',{},E('strong',{},d.title),E('small',{},d.detail))))):E('p',{},data.known?'Noch kein offener Termin im Aufgabenplan.':'Die Fristen konnten nicht geladen werden.'));}
 function actionArea(){
  const task=user().task;
  const next=E('section',{class:'pv-next pv-action-next'},E('div',{class:'pv-card-top'},label('DEIN NÄCHSTER SCHRITT'),task?tag(task.due?'Bis '+shortDate(task.due):'Frist noch offen'):null),E('h2',{},task?task.title:data.known?'Keine offene Aufgabe im Aufgabenplan':'Deine Aufgabe ist noch unbekannt'),E('p',{},task?'Schritte und Ziel für deinen Auftrag ansehen.':data.known?'Weitere Kontakte und Kapitel findest du unter «Meine Arbeit».':'Bitte lade den Aufgabenplan erneut.'),task?button('Auftrag öffnen →',()=>setView('task'),'pv-button pv-primary',{'data-next-task':task.ref}):E('a',{href:'../?view=tasks',class:'pv-button'},'Meine Arbeit öffnen'));
  return E('div',{class:'pv-action-area'},next,toolsNav());
 }

 // 23.11.2026 Steckbrief je Arbeitspaket nach PM-Skript Block 2, Folie 25 (Aufwand und Dauer nach Folien 26 und 27).
 const SB_PROJEKT='Kundendienst als Stärke positionieren',SB_NUMMER='PA6 · 601/H25-B';
 const SB_LIEFER={umfrage:'Online-Befragung (Methode A)',umfrage_site:'Umfrage-Website',testprotokoll:'Belege Service-Momentaufnahmen (Methode B)',codebuch:'Einordnung der Bewertungen (Methode C)',pa6a_grundlage:'Projektgrundlage PA6a',pa6a_bericht:'Bericht PA6a',pa6a_swot:'SWOT-Analyse PA6a, Kapitel 2.9',pa6b_bericht:'Bericht PA6b',projektauftrag:'Projektauftrag',psp_gantt:'Projektstrukturplan und Gantt',risiko:'Risiko-Map und Risikoregister',controlling:'Projektsteuerung (Controlling, Coaching)',praesentation:'Präsentation',flipchart:'Flipchart',fachgespraech:'Vorbereitung Fachgespräch',massnahme:'Massnahme'};
 const SB_KEINES={'AP-009':'Initiale Stakeholder-Map','AP-019':'Rückblick und geordnete Projektablage'};
 const sbNum=(v,d=2)=>Number.isFinite(v)?new Intl.NumberFormat('de-CH',{maximumFractionDigits:d}).format(v):'–';
 const sbChf=v=>Number.isFinite(v)?'CHF '+new Intl.NumberFormat('de-CH',{maximumFractionDigits:0}).format(v).replace(/[’‘]/g,"'"):'–';
 const sbDate=v=>v?new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Europe/Zurich'}).format(new Date(v.includes('T')?v:v+'T12:00:00Z')):'–';
 const sbText=v=>typeof v==='string'&&v.trim()&&v!=='noch offen'?v.trim():'';
 const sbKey=code=>String(code||'9').split('.').map(n=>String(+n||0).padStart(3,'0')).join('.');
 function sbPackages(){return (data?.raw?.tasks||[]).filter(r=>r&&r.source==='psp'&&r.type==='Arbeitspaket'&&r.steckbrief&&typeof r.steckbrief==='object'&&typeof r.steckbrief.code==='string').sort((a,b)=>sbKey(a.steckbrief.code).localeCompare(sbKey(b.steckbrief.code)));}
 function sbOf(id){return sbPackages().find(r=>r.id===id)||null;}
 function openSteckbrief(id){selected=id;setView('steckbrief');}
 function sbSteps(text){return String(text||'').split(/\n+/).map(s=>s.trim()).filter(s=>s&&!/^(Methode B|Hinweis)\b/.test(s)).map(s=>s.replace(/^\d+[.)]\s*/,'')).slice(0,6);}
 function sbLines(text){return String(text||'').split(/(?<=\.)\s+(?=(?:Personen|Werkzeuge|Mittel|Termine?):)/).map(s=>s.trim()).filter(Boolean);}
 function sbMeasure(text){return String(text||'').split(/(?<=\.)\s+(?=\d+ %)/).map(s=>s.trim()).filter(Boolean);}
 function sbCell(label,content,cls=''){return E('div',{class:'pv-sb-cell '+cls},E('span',{class:'pv-sb-label'},label),E('div',{class:'pv-sb-value'},content));}
 function steckbriefList(){
  const rows=sbPackages(),groups=new Map();
  for(const r of rows){const g=r.steckbrief.teilaufgabe||r.steckbrief.code.split('.').slice(0,2).join('.');if(!groups.has(g))groups.set(g,[]);groups.get(g).push(r);}
  const total=rows.reduce((s,r)=>s+(Number.isFinite(r.steckbrief.kosten)?r.steckbrief.kosten:0),0);
  return [heading('STECKBRIEFE',isLead()?'Steckbriefe aller Arbeitspakete':'Steckbriefe deiner Arbeitspakete','Jedes Arbeitspaket auf einer Seite, nach dem Muster aus dem Projektmanagement-Unterricht. Der Code zeigt Phase, Teilaufgabe und Paket, zum Beispiel 2.3.1.'),
   rows.length?E('div',{class:'pv-sb-list'},[...groups].map(([g,list])=>E('section',{class:'pv-panel pv-sb-group'},E('div',{class:'pv-panel-head'},E('h2',{},g),tag(list.length+(list.length===1?' Paket':' Pakete'))),E('ul',{},list.map(r=>E('li',{},E('button',{type:'button',class:'pv-sb-row','data-steckbrief':r.ref,onclick:()=>openSteckbrief(r.id)},E('strong',{class:'pv-sb-code'},r.steckbrief.code),E('span',{class:'pv-sb-title'},r.title,E('small',{},r.ref+' · '+(M.names[r.owner]||'offen')+' · '+sbDate(r.start)+' bis '+sbDate(r.due))),E('span',{class:'pv-sb-pt'},sbNum(r.steckbrief.pt)+' PT'),arrow()))))))):E('section',{class:'pv-panel'},E('p',{},data.known?'Die Steckbriefe sind im gelesenen Stand noch nicht enthalten. Aktualisiere den Stand.':'Der Aufgabenplan konnte nicht geladen werden.'),button('Aktualisieren',()=>load(),'pv-button')),
   rows.length?E('p',{class:'pv-caption pv-sb-note'},rows.length+' Pakete · '+sbChf(total)+' kalkulatorisch. Annahme: CHF 1\'000 pro Personentag, 1 Personentag = 8 Personenstunden.'):null];
 }
 function steckbriefDetail(){
  const r=sbOf(selected);if(!r)return steckbriefList();
  const sb=r.steckbrief,lief=SB_KEINES[r.ref]||SB_LIEFER[r.deliverable]||'Kein eigenes Lieferobjekt',done=(t=>isLead()?t:M.memberText(t))(sbText(r['Fertig wenn'])),steps=sbSteps(r["So geht's"]),res=sbLines(sb.ressourcen),measure=sbMeasure(sb.messung);
  const abw=Number.isFinite(sb.dauerAbweichung)?(sb.dauerAbweichung>0?'+':'')+sbNum(sb.dauerAbweichung,1):'–';
  const people=Number.isFinite(sb.personen)?sbNum(sb.personen,0)+(sb.personen===1?' Person':' Personen'):'–';
  const sheet=E('section',{class:'pv-panel pv-sb','aria-label':'Steckbrief '+sb.code},
   E('div',{class:'pv-sb-grid pv-sb-three'},sbCell('Projektname',SB_PROJEKT),sbCell('Projektnummer',SB_NUMMER),sbCell('Datum','Stand '+data.readDate)),
   E('div',{class:'pv-sb-grid pv-sb-three'},sbCell('Arbeitspaketname',r.title),sbCell('PSP-Code',[E('strong',{},sb.code),' · '+r.ref,E('small',{},sb.teilaufgabe||'')]),sbCell('AP-Verantwortliche',M.names[r.owner]||'offen')),
   sbCell('Lieferobjekt',[E('strong',{},lief),done?E('p',{},done):null],'wide'),
   sbCell('Aufgaben',steps.length?E('ol',{},steps.map(s=>E('li',{},s))):E('p',{},'Noch keine Schritte im Aufgabenplan.'),'wide'),
   sbCell('Ressourcen',res.length?E('ul',{},res.map(s=>E('li',{},s))):E('p',{},'Noch offen.'),'wide'),
   E('div',{class:'pv-sb-grid pv-sb-two'},
    sbCell('Dauer (T)',[E('span',{class:'pv-sb-num'},sbNum(sb.dauer,0)+' T'),E('small',{},'Plan in Kalendertagen. Rechnerisch '+sbNum(sb.dauerRechnerisch,1)+' T bei '+people+' × '+sbNum(sb.stundenTag,1)+' h pro Tag, Abweichung '+abw+' T.'),sbText(sb.annahme)?E('small',{},'Annahme · '+sb.annahme):null]),
    sbCell('Aufwand (PT)',[E('span',{class:'pv-sb-num'},sbNum(sb.pt)+' PT'),E('small',{},(Number.isFinite(r.planHours)?sbNum(r.planHours,1):'–')+' Personenstunden ÷ 8')]),
    sbCell('Anfang',sbDate(r.start)),sbCell('Vorgänger',sb.vorgaenger||'–'),
    sbCell('Ende',sbDate(r.due)),sbCell('Nachfolger',sb.nachfolger||'–'),
    sbCell('Fortschrittsmessung',measure.length?E('ul',{class:'pv-sb-measure'},measure.map(s=>E('li',{},s))):'–'),
    sbCell('Kosten',[E('span',{class:'pv-sb-num'},sbChf(sb.kosten)),E('small',{},'Annahme · kalkulatorisch CHF 1\'000 pro Personentag. Keine Geldkosten der Massnahme.')])));
  return [button('← Alle Steckbriefe',()=>setView('steckbriefe'),'pv-text-button'),heading('STECKBRIEF · '+sb.code,r.title,'Arbeitsauftrag nach dem Muster aus dem Projektmanagement-Unterricht. Quelle ist der gemeinsame Aufgabenplan.'),sheet,E('div',{class:'pv-sb-actions'},taskLink(r),button('Alle Steckbriefe',()=>setView('steckbriefe'),'pv-button'))];
 }
 function taskLink(task,label='Im Arbeitsbereich öffnen →'){return E('a',{class:'pv-button pv-primary',href:'../?view=tasks&auftrag='+encodeURIComponent(task.id)},label);}
 function assignmentHours(){
  const rows=(data.raw.assignments||[]).filter(row=>row.owner===data.person), hours=data.raw.zeit?.auftraege;
  if(!rows.length)return null;
  return E('section',{class:'pv-panel','data-assignment-hours':''},E('h2',{},'Erfasste Stunden je Auftrag'),E('dl',{class:'pv-facts'},rows.map(row=>E('div',{'data-assignment-ref':row.ref},E('dt',{},row.ref+' · '+M.memberText(row.title)),E('dd',{},typeof hours?.[row.ref]==='number'?new Intl.NumberFormat('de-CH',{maximumFractionDigits:2}).format(hours[row.ref])+' h':'Stand unbekannt')))));
 }
 function liveOverview(){
  const gate=data.gate;
  return [heading('FÜR '+user().name.toLocaleUpperCase('de-CH'),'Dein Projektwerkzeug'),actionArea(),assignmentHours(),E('div',{class:'pv-context'},liveDates(),gate?E('section',{class:'pv-panel pv-project-state'},label('GEMEINSAMER STAND'),E('h2',{},gate.name),E('p',{},isLead()?gate.status:'Daran arbeitet Salah gerade.')):null)];
 }
 function liveTask(){
  const task=user().task;if(!task)return [heading('MEIN AUFTRAG','Dein nächster Auftrag ist noch offen.','Öffne «Meine Arbeit» oder aktualisiere den Stand.'),E('a',{href:'../?view=tasks',class:'pv-button'},'Meine Arbeit öffnen')];
  return [button('← Zur Übersicht',()=>setView('overview'),'pv-text-button'),heading('MEIN AUFTRAG',task.title,task.next),E('div',{class:'pv-task-grid'},E('section',{class:'pv-panel'},E('h2',{},'So gehst du vor'),task.steps.length?E('ol',{class:'pv-work-steps'},task.steps.map((text,i)=>E('li',{},E('span',{class:'pv-step-number'},i+1),E('p',{},text)))):E('p',{},'Die einzelnen Schritte stehen noch nicht im Aufgabenplan.'),criteria(task),taskLink(task),sbOf(task.id)?button('Steckbrief ansehen →',()=>openSteckbrief(task.id),'pv-button',{'data-steckbrief-open':task.ref}):null,E('p',{class:'pv-caption'},'Dort findest du die vorhandenen Schritte zum Erfassen, Prüfen und Abschliessen.')),E('aside',{class:'pv-panel'},E('h2',{},'Dein Auftrag'),E('dl',{class:'pv-facts'},E('div',{},E('dt',{},'Frist'),E('dd',{},fmt(task.due))),E('div',{},E('dt',{},'Geplante Gruppenstunden'),E('dd',{},task.plannedHours===null?'Noch offen':task.plannedHours+' Stunden')),E('div',{},E('dt',{},'Arbeitspaket'),E('dd',{},task.ref.replace(/^AP-/,'Arbeitspaket ')))),E('p',{},'Die Gruppenstunden sind keine Zusage deiner verfügbaren Zeit.'))),toolsNav()];
 }
 function liveLead(){
  if(!isLead())return liveOverview();
  const rows=(data.raw.tasks||[]).filter(row=>row.owner==='SA'&&!['fertig','erledigt'].includes(row.status));
  return [heading('LEITUNG · '+user().name.toLocaleUpperCase('de-CH'),'Projekt leiten'),actionArea(),assignmentHours(),E('div',{class:'pv-lead-grid'},E('section',{class:'pv-decisions'},rows.length?rows.map(row=>E('article',{class:'pv-panel'},tag(row.due?'Bis '+shortDate(row.due):'Frist noch offen'),E('h2',{},row.id===user().task?.id?'Zum nächsten Auftrag':M.plain(row.title)),E('p',{},M.plain(row.Was)),E('h3',{},'Fertig, wenn'),E('p',{},M.plain(row['Fertig wenn'])||'Noch zu ergänzen'),taskLink(row))):E('p',{},data.known?'Keine offene Leitungsaufgabe im Plan.':'Der Aufgabenplan konnte nicht geladen werden.')),E('aside',{class:'pv-panel'},E('h2',{},'Bei einer Vertretung beachten'),E('p',{},'Eine Bewertung muss von zwei verschiedenen Personen unabhängig eingeordnet werden. Verteile nur Aufgaben, die die andere Person übernehmen kann.'),E('p',{},'Offene Zusagen, tatsächliche Stunden und die Freigabe für den nächsten Schritt bleiben getrennt.')))];
 }
 function readAccess(){
  const query=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));const incoming=hash.get('k')||query.get('k');
  if(incoming){query.delete('k');history.replaceState(null,'',location.pathname+(query.size?'?'+query:''));window.PA6View.clear();try{localStorage.setItem('pa6k',incoming);}catch{}return incoming;}
  try{return localStorage.getItem('pa6k')||access||'';}catch{return access||'';}
 }
 function message(title,copy){document.body.classList.remove('project-preview');const target=E('main',{id:'main'},E('h1',{},title),E('p',{role:'status'},copy),button('Erneut versuchen',()=>load()),E('a',{href:'../'},'Zur Team-App'));document.body.replaceChildren(target);}
 async function load(){
  const ticket=++generation;controller?.abort();const nextAccess=readAccess(),as=window.PA6View.target();
  if(nextAccess!==access){data=null;cacheSlot='';view='overview';}access=nextAccess;
  if(!access){data=null;message('Dein persönlicher Zugang fehlt','Öffne deinen persönlichen Link zur Team-App.');return;}
  cacheSlot=await M.namespace(access,crypto);if(ticket!==generation)return;
  if(!data){const cached=M.restore(storage,cacheSlot,as);if(cached)data=M.project(cached);}
  if(data){person=data.person;phase='cached';render();}else message('Dein Projekt wird geladen …','Aufgaben und Fristen werden aus dem gemeinsamen Plan abgerufen.');
  controller=new AbortController();const timer=setTimeout(()=>controller.abort(),60000);
  try{
   const endpoint=window.TEAM_CONFIG?.endpoint;if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint||''))throw Error('Der Projektzugang ist noch nicht verbunden.');
   const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(window.PA6View.request({typ:'team',k:access,leitung:true})),signal:controller.signal,referrerPolicy:'no-referrer',cache:'no-store'});
   const raw=await response.json();if(ticket!==generation||readAccess()!==access)return;
   if(['unauthorized','forbidden'].includes(raw?.code)){M.clear(storage,cacheSlot);data=null;message('Kein Zugang','Öffne deinen gültigen persönlichen Link erneut.');return;}
   if(!response.ok||!M.valid(raw,as))throw Error('Die Antwort ist unvollständig. Bitte versuche es erneut.');
   M.save(storage,cacheSlot,raw,as);data=M.project(raw);person=raw.person;phase='ready';render();
  }catch(error){if(ticket!==generation)return;if(data){phase='stale';render();}else message('Dein Projekt konnte nicht geladen werden','Bitte aktualisiere die Seite. Deine aktuellen Aufgaben und Fristen sind noch unbekannt.');}
  finally{clearTimeout(timer);}
 }
 if(!demo){
  window.addEventListener('hashchange',()=>{data=null;load();});
  window.addEventListener('storage',event=>{if(event.key==='pa6k'){data=null;access='';load();}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  await load();
 }
})();
