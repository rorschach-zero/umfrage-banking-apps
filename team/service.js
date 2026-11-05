'use strict';
// Servicetest B, Übersicht (05.11.2026): oben «Heute dran», darunter die Vorbereitung als Pfad, dann die Kontakte nach Tag.
// Alle Zuteilungen und Prüfungen bleiben beim Empfänger; gesendet wird genau wie bisher.
function serviceMessage(text) { const node=document.getElementById('service-message');if(node){node.textContent=text;if(text&&!/^Wird gespeichert/.test(text))node.scrollIntoView?.({block:'nearest'});} }
async function serviceAction(body) {
  serviceMessage('Wird gespeichert …');
  try { const result=await sende(body);bOffen=null;await start();window.dispatchEvent(new Event('workspace-saved'));serviceMessage(result.assigned!==undefined?result.assigned+' Kontakte übernommen.':'Gespeichert.');return result; }
  catch(error){serviceMessage(error.message);return null;}
}
// Zweck-Karte auf dieser Seite standardmässig eingeklappt: eine ruhige Zeile, «Heute dran» bleibt im ersten Bild.
document.querySelector('.purpose-slot .purpose-card')?.removeAttribute('open');
// bOffen: offener Vorbereitungsschritt (1–3), 0 = alle zu, null = automatisch der aktuelle.
let bOffen=null, startDay='', bListeOffen='', bZuteilung=null, bZuteilungFehler='', bAuswahl=null;
const B_ANLIEGEN={Karte:'Karte im Ausland verloren',Anmeldung:'App auf neuem Handy einrichten',Zahlung:'Ist meine Zahlung angekommen?',Kontodokumente:'Kontoauszug für die Steuer'};
const B_KANAL={chat:'Chat',mail:'E-Mail',formular:'Formular',telefon:'Telefon',keiner:'Gibt es nicht',schriftlich:'Schriftlich'};
const B_ICONS={check:'M5 12.5l4.2 4.2L19 7',chev:'M9 6l6 6-6 6',back:'M15 6l-6 6 6 6',ext:'M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4',alert:'M12 8v5M12 16.5v.5M10.3 4.2 3 17a2 2 0 0 0 1.7 3h14.6a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z'};
function bIcon(name){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class','b-ico b-ico-'+name);path.setAttribute('d',B_ICONS[name]);svg.append(path);return svg;}
function bWas(row){return row.anbieter+' · '+(B_ANLIEGEN[row.anliegen]||row.anliegen);}
function bKanalText(row){return B_KANAL[row.kanal]||row.kanal;}
function bZeit(block){return block==='A'?'09–12 Uhr':'13–17 Uhr';}
function bTag(day,lang){if(!day)return 'Tag offen';const d=new Date(day+'T12:00:00');return (day===heute()?'Heute, ':'')+new Intl.DateTimeFormat('de-CH',lang?{weekday:'long',day:'2-digit',month:'2-digit'}:{weekday:'short',day:'2-digit',month:'2-digit'}).format(d);}
function bName(){return TEAM[daten?.person]||daten?.person||'dich';}
function bEchte(){return (daten.plan||[]).filter(r=>!String(r.nr).startsWith('PROBE-B-')).sort((a,b)=>((a.tag||'9')+a.block).localeCompare((b.tag||'9')+b.block));}
function bHilfe(text){const u=new URL('/team/frag/',location.origin);u.searchParams.set('q',('Ich bin im Servicetest bei «'+text+'». Wie mache ich das genau?').slice(0,400));return el('a',{class:'b-help',href:u.pathname+u.search,referrerpolicy:'no-referrer','data-read-navigation':true},'Frag Pia zu diesem Schritt');}
function bFehlendeKanaele(state){
  const plan=(daten.plan||[]).filter(r=>!String(r.nr).startsWith('PROBE-B-'));
  const noetig=[...new Set(plan.map(r=>r.anbieter+'|'+(r.kanal==='telefon'?'telefon':'schriftlich')))];
  return noetig.filter(k=>!(state.channels||[]).some(c=>c.anbieter+'|'+c.art===k)).map(k=>{const [a,art]=k.split('|');return a+' · '+(art==='telefon'?'Telefon':'schriftlich');});
}
function bSchritt(nr,titel,erledigt,zusammenfassung,inhalt,gesperrt){
  const offen=bOffen===nr;
  const kopf=el('button',{type:'button',class:'b-step-head','aria-expanded':String(offen),'data-read-navigation':true,on:{click:()=>{bOffen=offen?0:nr;liste();document.querySelectorAll('.b-step-head')[nr-1]?.focus();}}},
    el('span',{class:'b-step-num'+(erledigt?' is-done':'')},erledigt?bIcon('check'):String(nr)),
    el('span',{class:'b-step-title'},titel,el('small',{},zusammenfassung)),
    el('span',{class:'b-step-state'+(erledigt?' done':gesperrt?' locked':' now')},erledigt?'erledigt':gesperrt?'danach':'jetzt'),
    el('span',{class:'b-step-chev'},bIcon('chev')));
  return el('section',{class:'b-step'+(offen?' is-open':'')+(erledigt?' is-done':'')},kopf,offen?el('div',{class:'b-step-body'},inhalt):null);
}
// Zuteilen: gleiche Nutzlast wie bisher ({typ:'b_assign',providers,day}); danach Stand neu laden und zeigen, was dazukam.
async function bZuteilen(providers,day,button){
  const vorher=new Set(bEchte().map(r=>r.nr));bZuteilung=null;bZuteilungFehler='';
  const fb=document.getElementById('b-assign-feedback');if(fb)fb.replaceChildren(el('p',{class:'b-wait'},'Wird zugeteilt …'));if(button)button.disabled=true;
  serviceMessage('Wird gespeichert …');
  let result;
  try{result=await sende({typ:'b_assign',providers,day});}
  catch(error){bZuteilungFehler=error instanceof TypeError?'Keine Verbindung zum Server.':error.message;bOffen=2;liste();serviceMessage('');document.querySelector('.b-alert')?.focus();return null;}
  bOffen=null;bAuswahl=null;
  try{await start();}catch{}
  window.dispatchEvent(new Event('workspace-saved'));
  const neu=bEchte().filter(r=>!vorher.has(r.nr));
  bZuteilung={n:result.assigned,wem:bName(),rows:neu.map(r=>r.nr)};
  if(!result.assigned)bOffen=2;
  liste();if(!result.assigned)serviceMessage(result.assigned+' Kontakte übernommen.');
  return result;
}
function bZuteilungsKarte(){
  if(!bZuteilung)return null;
  if(!bZuteilung.n)return el('div',{class:'b-result is-empty',role:'status'},el('p',{class:'b-result-title'},'Gerade ist nichts frei für dich.'),
    el('p',{},'Wähle eine weitere Bank oder einen späteren Tag. Klappt es nicht, frag Salah.'));
  const n=bZuteilung.n;
  return el('div',{class:'b-result',role:'status'},
    el('p',{class:'b-result-title'},bIcon('check'),el('span',{},el('span',{},n+' Kontakte übernommen.'),' Sie gehören dir ('+bZuteilung.wem+') und sind unten mit «neu» markiert.')),
    el('button',{type:'button',class:'b-link','data-read-navigation':true,on:{click:()=>{bZuteilung=null;liste();}}},'Ausblenden'));
}
// «Heute dran»: der nächste Kontakt gross, mit genau einem Hauptknopf.
function bHeuteDran(state,naechster,laufend){
  const row=laufend||naechster;
  if(!row){
    const alle=state.assigned>0;
    return el('section',{class:'b-today is-quiet','aria-labelledby':'b-today-h'},el('h2',{id:'b-today-h'},alle?'Alle Kontakte erledigt':'Heute dran'),
      el('p',{class:'b-today-lead'},alle?'Stark. Du hast alle '+state.assigned+' Kontakte abgeschlossen.':'Noch keine Kontakte zugeteilt.'),
      state.canTakeMore?el('button',{class:'knopf b-go',type:'button',on:{click:()=>serviceAction({typ:'take_more',area:'b',day:startDay||nextServiceDay(state.config.start)})}},'Weitere Kontakte übernehmen'):null);
  }
  const heute_=row.tag===heute(),titel=laufend?'Läuft gerade':heute_?'Heute dran':'Als Nächstes',info=kanalInfo(row.anbieter,row.kanal);
  return el('section',{class:'b-today','aria-labelledby':'b-today-h'},
    el('h2',{id:'b-today-h'},titel),
    el('p',{class:'b-today-what'},bWas(row)),
    el('dl',{class:'b-facts'},
      el('div',{},el('dt',{},'Kontaktweg'),el('dd',{},info&&info.kanal!=='keiner'?info.text.split(' · ')[0].replace(/\s*\(.*\)$/,''):bKanalText(row))),
      el('div',{},el('dt',{},'Zeitfenster'),el('dd',{},bTag(row.tag,true)+', '+bZeit(row.block))),
      el('div',{},el('dt',{},'Durchgang'),el('dd',{},row.wiederholung+' von 2'))),
    el('button',{class:'knopf b-go b-next',type:'button','data-read-navigation':true,on:{click:()=>oeffne(row)}},window.PA6View.active()?'Kontakt ansehen':laufend?'Weiter erfassen':'Kontakt starten'),
    el('p',{class:'b-today-note'},laufend?'Antwort ausstehend. Komm zurück, sobald sie da ist.':'Öffnen startet noch nichts. Die Zeit läuft erst, wenn du «Jetzt starte ich» tippst.'),
    state.config.official&&heute()<state.config.official?el('p',{class:'b-today-note'},'Offizieller Start ist am '+formatServiceDate(state.config.official)+'. Früher starten ist erlaubt und wird markiert.'):null);
}
function renderBSetup(main) {
  const state=daten.service;
  if(!state||state.error){main.append(el('p',{role:'alert',class:'b-alert'},state?.error||'Servicetest gerade nicht verfügbar. Lade die Seite neu oder frag Salah.'));return;}
  const config=state.config,selected=bAuswahl||new Set(state.selected),fehlend=bFehlendeKanaele(state);
  const s1=!!state.probeDone,s2=state.selected.length>=2&&state.assigned>0,s3=s2&&!fehlend.length,bereit=s1&&s2&&s3;
  const aktuell=!s1?1:!s2?2:!s3?3:0;
  if(bOffen===null)bOffen=aktuell;
  const echte=bEchte(),offen=echte.filter(r=>statusVon(r)!=='abgeschlossen');
  const laufend=offen.find(r=>statusVon(r)==='laufend'),naechster=offen.find(r=>statusVon(r)==='offen');
  const date=el('input',{type:'date',id:'service-day',min:config.start,max:config.end,value:startDay||nextServiceDay(config.start),on:{change:event=>{startDay=event.target.value;}}});
  const banken=el('fieldset',{class:'bank-options'},el('legend',{},'Wo hast du ein aktives Konto?'),['Yuh','Neon','Zak','Revolut'].map(provider=>el('label',{},el('input',{type:'checkbox',name:'provider',value:provider,checked:selected.has(provider),on:{change:event=>{event.target.checked?selected.add(provider):selected.delete(provider);bAuswahl=selected;bZuteilungFehler='';serviceMessage('');}}}),provider)));
  const rest=Math.max(0,(config.target||0)-state.assigned);
  const zuteilen=el('button',{class:'knopf b-go',type:'button',on:{click:event=>bZuteilen([...selected],date.value,event.currentTarget)}},state.assigned?'Auswahl speichern':'Kontakte zuteilen');
  const steps=el('div',{class:'b-steps'},
    bSchritt(1,'Übung durchspielen',s1,s1?'Du kennst das Erfassen.':'Erfundener Chat, keine Bank. Etwa 15 Minuten.',
      [el('p',{class:'b-lead'},'Spiel einen erfundenen Chat durch. Niemand wird kontaktiert.'),
       el('p',{class:'b-hint'},'Die Übung läuft genau wie ein echter Kontakt. So weisst du nachher, wo du was tippst.'),
       el('button',{class:'knopf b-go',type:'button','data-read-navigation':true,on:{click:()=>oeffne(state.probe)}},s1?'Übung ansehen':'Übung starten'),bHilfe('Übung durchspielen')],aktuell!==1),
    bSchritt(2,'Banken wählen und Kontakte holen',s2,s2?state.selected.join(', ')+' · '+state.assigned+' Kontakte für dich':'Mindestens zwei Banken, bei denen du ein Konto hast.',
      [el('p',{class:'b-lead'},rest?'Die App teilt dir ('+bName()+') '+rest+' Kontakte zu, fair auf alle verteilt.':'Du ('+bName()+') hast alle '+state.assigned+' Kontakte. Hier änderst du nur deine Banken.'),
       banken,el('label',{for:'service-day',class:'b-label'},'Ab wann hast du Zeit?'),date,
       el('p',{class:'b-hint'},'Nur werktags, vormittags 09–12 oder nachmittags 13–17 Uhr.'),
       zuteilen,
       el('div',{id:'b-assign-feedback'},bZuteilungFehler?el('div',{class:'b-alert',role:'alert',tabindex:'-1'},bIcon('alert'),el('div',{},el('b',{},'Nicht zugeteilt.'),' ',el('span',{},bZuteilungFehler),el('small',{},'Nichts wurde gespeichert. Korrigiere die Auswahl oder prüf die Verbindung und tipp nochmals.'))):null),
       bHilfe('Banken wählen und Kontakte holen')],aktuell!==2),
    !bereit&&bZuteilung?bZuteilungsKarte():null,
    bSchritt(3,'Kontaktwege prüfen',s3,s3?'Alle Kontaktwege geprüft.':fehlend.length?'Noch offen · '+fehlend.join(', '):'Nach Schritt 2.',
      [el('p',{class:'b-lead'},'Halte fest, wie du jede Bank erreichst und wo das steht.'),
       el('p',{class:'b-hint'},'Bietet eine Bank kein Telefon an, ist das ein Ergebnis, kein Fehler.'),
       fehlend.length?el('p',{class:'b-missing'},'Noch offen: '+fehlend.join(' · ')):null,channelSetup(state),bHilfe('Kontaktwege prüfen')],aktuell!==3),
    el('p',{id:'service-message',role:'status','aria-live':'polite'}));
  const kopf=bereit?el('section',{class:'b-prep is-done','aria-labelledby':'b-prep-h'},el('h2',{id:'b-prep-h',class:'b-section-h'},'Vorbereitung'),steps)
    :el('section',{class:'b-today b-prep','aria-labelledby':'b-today-h'},el('h2',{id:'b-today-h'},'Heute dran'),
      el('p',{class:'b-today-lead'},'Bereite dich in drei Schritten vor. Danach steht hier dein nächster Kontakt.'),
      el('div',{class:'b-path-k'},el('span',{},'Schritt '+aktuell+' von 3'+([s1,s2,s3].filter(Boolean).length?' · '+[s1,s2,s3].filter(Boolean).length+' erledigt':'')),el('span',{class:'b-dots','aria-hidden':'true'},[s1,s2,s3].map((ok,i)=>el('i',{class:i===aktuell-1?'now':ok?'on':''})))),steps);
  if(bereit)main.append(bHeuteDran(state,naechster,laufend));
  main.append(kopf);
  if(echte.length)main.append(bKontaktliste(echte));
  const last=Object.entries(belastung||{});
  if(state.open||last.length)main.append(el('details',{class:'b-group'},el('summary',{},'Stand der Gruppe'),
    state.open?el('p',{},'Noch offene Kontakte: '+state.open.map(r=>r.provider+' '+r.open).join(' · ')):null,
    last.length?el('p',{},'So stark ist jede Bank schon beansprucht (Stopp bei '+STOPP.nachrichten+' Nachrichten oder '+STOPP.minuten+' Minuten) · '+last.map(([a,x])=>a+' '+x.nachrichten+' Nachr. · '+x.minuten+' Min.').join(' · ')):null));
}
// Kontaktliste: nach Tag gruppiert, kompakt. Termin ändern erst nach Tipp auf einen Kontakt.
function bKontaktZeile(r){
  const status=statusVon(r),offen=bListeOffen===r.nr,neu=!!bZuteilung?.rows.includes(r.nr);
  const kopf=el('button',{type:'button',class:'b-row-head','aria-expanded':String(offen),'data-read-navigation':true,on:{click:()=>{bListeOffen=offen?'':r.nr;liste();document.querySelector('[data-nr="'+r.nr+'"] .b-row-head')?.focus();}}},
    el('span',{class:'b-row-time'},r.block==='A'?'09–12':'13–17'),
    el('span',{class:'b-row-main'},el('b',{},bWas(r),neu?el('span',{class:'b-new'},'neu'):null),el('small',{},bKanalText(r)+' · '+r.wiederholung+'. Durchgang · '+r.nr)),
    el('span',{class:'b-row-state is-'+status},status==='abgeschlossen'?'erledigt':status==='laufend'?'läuft':'offen'),
    el('span',{class:'b-row-chev'},bIcon('chev')));
  return el('li',{class:'b-row'+(offen?' is-open':'')+(neu?' is-new':''),'data-nr':r.nr},kopf,offen?el('div',{class:'b-row-body'},
    el('button',{type:'button',class:'knopf b-go','data-read-navigation':true,on:{click:()=>oeffne(r)}},status==='abgeschlossen'?'Ansehen':window.PA6View.active()?'Kontakt ansehen':status==='laufend'?'Weiter erfassen':'Kontakt starten'),
    !r.erfasst?el('div',{class:'b-move'},el('p',{class:'b-label'},'Anderer Tag?'),serviceSchedule(r)):null):null);
}
function bKontaktliste(echte){
  const offen=echte.filter(r=>statusVon(r)!=='abgeschlossen'),fertig=echte.filter(r=>statusVon(r)==='abgeschlossen'),tage=[...new Set(offen.map(r=>r.tag||''))];
  return el('section',{class:'b-list','aria-labelledby':'b-list-h'},
    el('div',{class:'b-list-top'},el('h2',{id:'b-list-h',class:'b-section-h'},'Deine Kontakte'),el('span',{class:'b-count'},offen.length+' offen · '+fertig.length+' erledigt')),
    tage.map(tag=>el('div',{class:'b-day'},el('h3',{},bTag(tag,true)),el('ul',{},offen.filter(r=>(r.tag||'')===tag).map(bKontaktZeile)))),
    fertig.length?el('details',{class:'b-done-list'},el('summary',{},'Erledigt ('+fertig.length+')'),el('ul',{},fertig.map(bKontaktZeile))):null,
    el('p',{class:'b-foot-note'},'Abend und Wochenende werden nicht beobachtet. Keine Kontodaten, keine Namen, keine Zitate eintragen.'));
}
function formatServiceDate(day){return day.split('-').reverse().join('.');}
function nextServiceDay(start){let day=[start,heute()].sort().pop();while([0,6].includes(new Date(day+'T12:00:00').getDay())){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);day=d.toISOString().slice(0,10);}return day;}
// Belegte Kanäle (Recherche 01.11.2026, jede Angabe auf der Anbieterseite geprüft; 10_pa6a/beobachtung/Kanaele_belegt.md).
// Nur Vorschläge: die Person öffnet die Quelle, prüft selbst und speichert. Offene Zuordnungen zeigen beide Möglichkeiten.
const KANAELE_BELEGT={
  Yuh:{schriftlich:[{kanal:'chat',text:'Chat in der App («Support via Chat», kostenlos)',quelle:'https://www.yuh.com/de/pricing/'}],
       telefon:[{kanal:'telefon',text:'+41 44 825 87 89 · Mo–Fr 08–19 Uhr',quelle:'https://www.yuh.com/de/contact/'}]},
  Neon:{schriftlich:[{kanal:'chat',text:'In-App-Hilfe, laut Neon KI-gestützt',quelle:'https://www.neon-free.ch/blog/der-neon-kundenservice-ganz-ohne-filiale'},{kanal:'mail',text:'service@neon-free.ch · von der hinterlegten Adresse schreiben · Antwort innert zwei Arbeitstagen',quelle:'https://www.neon-free.ch/kontakt'}],
        telefon:[{kanal:'keiner',text:'Gratis-Plan · kein Telefonservice laut Neon',quelle:'https://www.neon-free.ch/faq/wie-erreiche-ich-euch-am-besten'}]},
  Zak:{schriftlich:[{kanal:'chat',text:'Nachricht in der App («Nachricht im DigitalBanking»)',quelle:'https://www.cler.ch/de/services/hilfe-und-kontakt/hilfethemen/zak'},{kanal:'formular',text:'Zak-Kontaktformular · nur Domizil Schweiz',quelle:'https://www.cler.ch/de/services/kontakt/kontaktformular-zak'}],
       telefon:[{kanal:'telefon',text:'0848 845 245 · Mo–Fr 8–18 Uhr',quelle:'https://www.cler.ch/de/services/hilfe-und-kontakt/hilfethemen/zak'}]},
  Revolut:{schriftlich:[{kanal:'chat',text:'Chat in der App · Profil > Chats > Support · rund um die Uhr',quelle:'https://help.revolut.com/de-CH/help/profile-and-plan/how-can-i-contact-revolut-support/'}],
           telefon:[{kanal:'keiner',text:'Gratis-Plan · Anruf nur mit Ultra-Abo und deshalb nicht angeboten',quelle:'https://help.revolut.com/de-CH/help/profile-and-plan/how-can-i-contact-revolut-support/'}]}
};
function kanalInfo(anbieter,kanal){const art=kanal==='telefon'?'telefon':'schriftlich',options=((KANAELE_BELEGT[anbieter]||{})[art]||[]);return options.find(v=>v.kanal===kanal)||(kanal==='telefon'?options.find(v=>v.kanal==='keiner'):null)||null;}
function channelSetup(state){
  const provider=el('select',{id:'channel-provider'},state.selected.map(a=>el('option',{value:a},a))),kind=el('select',{id:'channel-kind'},el('option',{value:'schriftlich'},'Schriftlich'),el('option',{value:'telefon'},'Telefon')),
    channel=el('select',{id:'channel-value'},['chat','mail','formular','telefon','keiner'].map(a=>el('option',{value:a},{chat:'Chat',mail:'E-Mail',formular:'Formular',telefon:'Telefon',keiner:'Gibt es nicht'}[a]))),source=el('input',{id:'channel-source',type:'url',placeholder:'https://…'}),date=el('input',{id:'channel-date',type:'date',max:heute(),value:heute()}),checked=el('input',{type:'checkbox',id:'channel-checked'});
  const belegt=new Set((state.channels||[]).map(r=>r.anbieter+'|'+r.art));
  const vorschlaege=state.selected.flatMap(a=>['schriftlich','telefon'].filter(art=>!belegt.has(a+'|'+art)).map(art=>({a,art,optionen:(KANAELE_BELEGT[a]||{})[art]||[]}))).filter(v=>v.optionen.length);
  const formular=el('div',{class:'channel-form'});
  const uebernehmen=(a,art,o)=>{provider.value=a;kind.value=art;channel.value=o.kanal;source.value=o.quelle;date.value=heute();checked.checked=false;serviceMessage('Übernommen. Öffne die Quelle, prüfe sie und setze dann das Häkchen.');formular.scrollIntoView?.({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});};
  formular.append(el('p',{class:'b-label'},'Kontaktweg festhalten'),
    el('div',{class:'channel-grid'},el('div',{},el('label',{for:'channel-provider'},'Bank'),provider),el('div',{},el('label',{for:'channel-kind'},'Schriftlich oder Telefon?'),kind),
      el('div',{},el('label',{for:'channel-value'},'Kontaktweg'),channel),el('div',{},el('label',{for:'channel-date'},'Geprüft am'),date)),
    el('label',{for:'channel-source'},'Link zur Seite der Bank'),source,
    el('label',{class:'checkline'},checked,'Ich habe die Seite geöffnet und geprüft, dass der Kontaktweg für mein Konto gilt.'),
    el('button',{class:'knopf b-go',type:'button',on:{click:()=>serviceAction({typ:'b_channel',provider:provider.value,kind:kind.value,channel:channel.value,source:source.value,date:date.value,checked:checked.checked})}},'Kontaktweg speichern'));
  return el('div',{class:'channel-setup'},
    vorschlaege.length?el('div',{class:'kanal-vorschlaege'},el('p',{class:'kanal-titel'},'Schon recherchiert, du prüfst nur noch'),
      vorschlaege.map(v=>el('div',{class:'kanal-karte'},el('b',{},v.a+' · '+(v.art==='telefon'?'Telefon':'schriftlich')),
        v.optionen.length>1?el('p',{class:'leise'},'Zwei Möglichkeiten. Was für dein Konto gilt, entscheidest du mit Ernes.'):null,
        v.optionen.map(o=>el('div',{class:'kanal-option'},el('span',{},o.text),el('a',{href:o.quelle,target:'_blank',rel:'noopener','data-read-navigation':true},'Quelle',bIcon('ext')),
          el('button',{type:'button',class:'chip',on:{click:()=>uebernehmen(v.a,v.art,o)}},'Übernehmen')))))):null,
    state.channels.length?el('ul',{class:'channel-done'},state.channels.map(r=>el('li',{},bIcon('check'),r.anbieter+' · '+r.art+' · '+(B_KANAL[r.kanal]||r.kanal)+' · geprüft '+r.abruf))):null,
    formular);
}
async function oeffne(row){
  if(row.nr.startsWith('PROBE-B-')){openForm(row);return;}
  if(!daten.service?.probeDone){serviceMessage('Mach zuerst die Übung in Schritt 1.');return;}
  const channel=daten.service.channels.find(r=>r.anbieter===row.anbieter&&r.art===(row.kanal==='telefon'?'telefon':'schriftlich'));
  if(!channel){serviceMessage('Prüfe zuerst den Kontaktweg in Schritt 3.');return;}
  const unavailable=row.kanal==='telefon'&&channel.kanal==='keiner';
  openForm(unavailable?{...row,status:'nicht angeboten'}:row);
}
function serviceSchedule(row){
  const input=el('input',{type:'date',value:row.tag,min:daten.service?.config.start,max:daten.service?.config.end,'aria-label':'Termin '+row.nr});
  return el('div',{class:'service-schedule'},input,el('button',{class:'chip',type:'button',on:{click:()=>serviceAction({typ:'b_schedule',nr:row.nr,day:input.value})}},'Termin speichern'));
}
// Übung: der erfundene Verlauf als kurze Zeitleiste; das Häkchen steht am Schluss bei der Prüfung.
function simulationNotice(){
  return el('aside',{class:'b-sim'},el('h2',{},'Übung ohne Bank'),el('p',{class:'b-sim-warn'},'Ruf keine Bank an und schick keine Nachricht.'),
    el('ol',{class:'b-timeline'},[['09:00','Du schickst die Frage ab'],['09:01','Automatische Antwort, klar als Bot erkennbar'],['09:05','Eine Person antwortet'],['09:08','Beide Kartenschritte sind erklärt'],['09:09','Ende']].map(([t,x])=>el('li',{},el('time',{},t),el('span',{},x)))),
    el('p',{class:'b-hint'},'Freundlich, keine Rückfragen, bleibt bei Deutsch, kein Standort, kein Link. Nachrichten der Bank: 0.'));
}
function simulationCheck(){
  return el('label',{class:'b-check'},el('input',{type:'checkbox',checked:z.simulation_confirmed,on:{change:event=>{z.simulation_confirmed=event.target.checked;formular();}}}),el('span',{},'Ich habe die Übung durchgespielt und keine Bank kontaktiert.'));
}
async function startServiceContact(){
  const message=document.getElementById('meldung');
  try { await sende({typ:'b_begin',nr:aktiv.nr});const nr=aktiv.nr;daten=await hole('plan');openForm(daten.plan.find(row=>row.nr===nr));window.dispatchEvent(new Event('workspace-saved'));}
  catch(error){message.textContent=error.message;message.className='meldung fehler';}
}
