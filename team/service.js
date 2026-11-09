'use strict';
// Servicetest B, Übersicht (05.11.2026): oben «Heute dran», darunter die Vorbereitung als Pfad, dann die Kontakte nach Tag.
// Alle Zuteilungen und Prüfungen bleiben beim Empfänger; gesendet wird genau wie bisher.
function serviceMessage(text) { const node=document.getElementById('service-message');if(node){node.textContent=text;if(text&&!/^Wird gespeichert/.test(text))node.scrollIntoView?.({block:'nearest'});} }
async function serviceAction(body) {
  serviceMessage('Wird gespeichert …');
  try { const result=await sende(body);bOffen=null;await start();window.dispatchEvent(new Event('workspace-saved'));serviceMessage(result.assigned!==undefined?result.assigned+' Kontakte übernommen.':document.querySelector('.b-now')?'':'Gespeichert.');return result; }
  catch(error){serviceMessage(error.message);return null;}
}
// bOffen: offener Vorbereitungsschritt (1–3), 0 = alle zu, null = automatisch der aktuelle.
// Stand-Zeile nur zeigen, wenn etwas nicht stimmt (offline, Abgleich ausstehend); «aktualisiert …» bleibt still.
const bFieldNotice0=fieldNotice;fieldNotice=function(text){bFieldNotice0(text);document.getElementById('field-updated')?.classList.toggle('is-alarm',/offline|nicht verfügbar|ausstehend/.test(text));};
let bKanalWahl={};
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
// Übersicht nach der Regel «ein Bildschirm, eine Sache»: genau eine Karte mit dem, was jetzt dran ist. Alles andere einen Tipp entfernt.
function bLink(text,click,attrs){return el('button',Object.assign({type:'button',class:'b-link','data-read-navigation':true,on:{click}},attrs||{}),text,bIcon('chev'));}
function bPunkte(aktuell,erledigt){return el('div',{class:'b-path-k'},el('span',{},'Schritt '+aktuell+' von 3'),el('span',{class:'b-dots','aria-hidden':'true'},[1,2,3].map(i=>el('i',{class:i===aktuell?'now':erledigt[i-1]?'on':''}))));}
// Zuteilen: gleiche Nutzlast wie bisher ({typ:'b_assign',providers,day}); danach Stand neu laden und zeigen, was dazukam.
// Abweisung durch den Empfänger (Antwort mit Fehler) = sicher nicht zugeteilt. Transportfehler = unbestätigt: Plan neu laden und nachsehen.
function bGrundNull(providers){
  const state=daten.service||{},ziel=state.config?.target||0,last=belastung||{};
  if(ziel&&state.assigned>=ziel)return {art:'soll',titel:'Du hast schon alle '+state.assigned+' Kontakte.',text:'Deine Bankauswahl ist gespeichert. Mehr gibt es, wenn alle erledigt sind.'};
  const gesperrt=providers.filter(a=>last[a]&&(last[a].nachrichten>=STOPP.nachrichten||last[a].minuten>=STOPP.minuten));
  if(gesperrt.length)return {art:'stopp',titel:gesperrt.join(' und ')+(gesperrt.length>1?' sind':' ist')+' gesperrt.',text:'Die Stoppregel ist erreicht ('+STOPP.nachrichten+' Nachrichten oder '+STOPP.minuten+' Minuten). '+(gesperrt.length<providers.length?'Für deine anderen Banken ist gerade nichts frei. ':'')+'Wähle eine andere Bank oder frag Salah.'};
  return {art:'leer',titel:'Für deine Banken ist gerade nichts frei.',text:'Die anderen haben diese Kontakte schon. Wähle eine weitere Bank oder einen späteren Tag. Klappt es nicht, frag Salah.'};
}
async function bZuteilen(providers,day,button){
  const vorher=new Set(bEchte().map(r=>r.nr));bZuteilung=null;bZuteilungFehler='';
  const fb=document.getElementById('b-assign-feedback');if(fb)fb.replaceChildren(el('p',{class:'b-wait'},'Wird zugeteilt …'));if(button)button.disabled=true;
  serviceMessage('Wird gespeichert …');
  let result=null,unklar=false;
  try{result=await sende({typ:'b_assign',providers,day});}
  catch(error){
    if('denied' in error){bZuteilungFehler=error.message;bOffen=2;liste();serviceMessage('');document.querySelector('.b-alert')?.focus();return null;}
    unklar=true;
  }
  bOffen=null;
  try{await start();}catch{}
  const neu=bEchte().filter(r=>!vorher.has(r.nr));
  if(unklar){
    if(fieldPending||!neu.length){bZuteilungFehler=fieldPending?'unbestätigt-offline':'unbestätigt';bOffen=2;liste();serviceMessage('');document.querySelector('.b-alert')?.focus();return null;}
    result={assigned:neu.length};
  }
  bAuswahl=null;window.dispatchEvent(new Event('workspace-saved'));
  bZuteilung={n:result.assigned,wem:bName(),rows:neu.map(r=>r.nr),grund:result.assigned?null:bGrundNull(providers)};
  if(!result.assigned)bOffen=2;
  liste();serviceMessage('');
  return result;
}
function bZuteilungsFehler(){
  if(!bZuteilungFehler)return null;
  if(bZuteilungFehler.startsWith('unbestätigt'))return el('div',{class:'b-alert',role:'alert',tabindex:'-1'},bIcon('alert'),el('div',{},el('b',{},'Konnte nicht bestätigt werden.'),' ',el('span',{},'Die Verbindung brach ab, bevor die Antwort kam.'),
    el('small',{},bZuteilungFehler==='unbestätigt-offline'?'Lade die Seite nochmals, sobald du wieder Netz hast. Erst dann siehst du, ob die Kontakte da sind.':'Beim Nachladen sind keine neuen Kontakte aufgetaucht. Lade die Seite nochmals und tipp erst dann erneut.')));
  return el('div',{class:'b-alert',role:'alert',tabindex:'-1'},bIcon('alert'),el('div',{},el('b',{},'Nicht zugeteilt.'),' ',el('span',{},bZuteilungFehler),el('small',{},'Korrigiere die Auswahl und tipp nochmals.')));
}
// Bestätigung als ein Satz in der Karte, keine eigene Box.
function bZuteilungsSatz(){
  if(!bZuteilung)return null;
  if(!bZuteilung.n){const g=bZuteilung.grund;return el('p',{class:'b-confirm is-'+g.art,role:'status','data-grund':g.art},el('span',{class:'b-confirm-n'},'0 Kontakte übernommen.'),' ',el('b',{},g.titel),' ',g.text);}
  return el('p',{class:'b-confirm',role:'status'},bIcon('check'),el('span',{},el('span',{},bZuteilung.n+' Kontakte übernommen.'),' Sie gehören dir ('+bZuteilung.wem+') und sind in der Liste mit «neu» markiert.'));
}
function bKarteVorbereitung(state,aktuell,erledigt,schritt){
  const config=state.config,selected=bAuswahl||new Set(state.selected),fehlend=bFehlendeKanaele(state);
  const kopf=bPunkte(schritt,erledigt);
  if(schritt===1){const s1=erledigt[0];
    return el('section',{class:'b-card','aria-labelledby':'b-card-h'},kopf,el('h2',{id:'b-card-h'},'Übung durchspielen'),
      el('p',{class:'b-card-text'},s1?'Erledigt. Du kannst sie jederzeit nochmals ansehen.':'Spiel einen erfundenen Chat durch. Niemand wird kontaktiert. Etwa 2 Minuten.'),bZuteilungsSatz(),
      el('button',{class:'knopf b-go',type:'button','data-read-navigation':true,on:{click:()=>oeffne(state.probe)}},s1?'Übung ansehen':'Übung starten'));}
  if(schritt===2){
    const rest=Math.max(0,(config.target||0)-state.assigned);
    const date=el('input',{type:'date',id:'service-day',min:config.start,max:config.end,value:startDay||nextServiceDay(config.start),on:{change:event=>{startDay=event.target.value;}}});
    const banken=el('fieldset',{class:'bank-options'},el('legend',{},'Wo hast du ein aktives Konto?'),['Yuh','Neon','Zak','Revolut'].map(provider=>el('label',{},el('input',{type:'checkbox',name:'provider',value:provider,checked:selected.has(provider),on:{change:event=>{event.target.checked?selected.add(provider):selected.delete(provider);bAuswahl=selected;bZuteilungFehler='';serviceMessage('');}}}),provider)));
    return el('section',{class:'b-card','aria-labelledby':'b-card-h'},kopf,el('h2',{id:'b-card-h'},'Banken wählen'),
      el('p',{class:'b-card-text'},rest?'Die App teilt dir ('+bName()+') '+rest+' Kontakte zu, fair auf alle verteilt.':'Du ('+bName()+') hast alle '+state.assigned+' Kontakte. Hier änderst du nur deine Banken.'),
      banken,
      el('details',{class:'b-day-pick'},el('summary',{},'Ab '+bTag(startDay||nextServiceDay(config.start),true)+' · ändern'),el('div',{},el('label',{for:'service-day',class:'b-label'},'Ab wann hast du Zeit? Nur werktags, 09–12 oder 13–17 Uhr.'),date)),
      bZuteilungsSatz(),
      el('button',{class:'knopf b-go',type:'button',on:{click:event=>bZuteilen([...selected],date.value,event.currentTarget)}},state.assigned?'Auswahl speichern':'Kontakte zuteilen'),
      el('div',{id:'b-assign-feedback'},bZuteilungsFehler()));
  }
  return el('section',{class:'b-card','aria-labelledby':'b-card-h'},kopf,el('h2',{id:'b-card-h'},'Kontaktwege prüfen'),
    el('p',{class:'b-card-text'},fehlend.length?'Halte fest, wie du '+fehlend[0].split(' · ')[0]+' erreichst. Noch '+fehlend.length+' offen.':'Alle Kontaktwege sind geprüft.'),bZuteilungsSatz(),
    channelSetup(state,fehlend));
}
function bKarteJetzt(state,naechster,laufend,danach){
  const row=laufend||naechster;
  if(!row){const alle=state.assigned>0;
    return el('section',{class:'b-card','aria-labelledby':'b-card-h'},el('h2',{id:'b-card-h'},alle?'Alle Kontakte erledigt':'Noch keine Kontakte'),
      el('p',{class:'b-card-text'},alle?'Stark. Du hast alle '+state.assigned+' Kontakte abgeschlossen.':'Sobald du Kontakte hast, steht hier der nächste.'),
      state.canTakeMore?el('button',{class:'knopf b-go',type:'button',on:{click:()=>serviceAction({typ:'take_more',area:'b',day:startDay||nextServiceDay(state.config.start)})}},'Weitere Kontakte übernehmen'):null);}
  const info=kanalInfo(row.anbieter,row.kanal),weg=info&&info.kanal!=='keiner'?info.text.split(' · ')[0].replace(/\s*\(.*\)$/,''):bKanalText(row);
  const titel=laufend?'Läuft gerade':!row.tag||row.tag<=heute()?'Jetzt dran':'Als Nächstes';
  return el('section',{class:'b-card b-now','aria-labelledby':'b-card-h'},
    el('h2',{id:'b-card-h'},titel),
    el('p',{class:'b-today-what'},bWas(row)),
    el('p',{class:'b-today-meta'},weg+' · '+bTag(row.tag,true)+', '+bZeit(row.block)),
    bZuteilungsSatz(),
    el('button',{class:'knopf b-go b-next',type:'button','data-read-navigation':true,on:{click:()=>oeffne(row)}},window.PA6View.active()?'Kontakt ansehen':laufend?'Weiter erfassen':'Kontakt starten'),
    danach?el('p',{class:'b-after'},'Danach: '+bWas(danach)+' · '+bTag(danach.tag)+', '+bZeit(danach.block)):null);
}
function renderBSetup(main) {
  const state=daten.service;
  if(!state||state.error){main.append(el('p',{role:'alert',class:'b-alert'},state?.error||'Servicetest gerade nicht verfügbar. Lade die Seite neu oder frag Salah.'));return;}
  const fehlend=bFehlendeKanaele(state);
  const s1=!!state.probeDone,s2=state.selected.length>=2&&state.assigned>0,s3=s2&&!fehlend.length,bereit=s1&&s2&&s3,erledigt=[s1,s2,s3];
  const aktuell=!s1?1:!s2?2:!s3?3:0;
  if(bOffen===null)bOffen=aktuell;
  const echte=bEchte(),offen=echte.filter(r=>statusVon(r)!=='abgeschlossen');
  const laufend=offen.find(r=>statusVon(r)==='laufend'),naechster=offen.find(r=>statusVon(r)==='offen');
  const danach=offen.filter(r=>r!==(laufend||naechster))[0];
  main.append(bOffen?bKarteVorbereitung(state,aktuell,erledigt,bOffen):bKarteJetzt(state,naechster,laufend,danach));
  main.append(el('p',{id:'service-message',role:'status','aria-live':'polite'}));
  // Einen Tipp entfernt: die anderen Vorbereitungsschritte, die Liste, das Warum.
  const wege=el('nav',{class:'b-more-links','aria-label':'Mehr'},
    bOffen&&bereit?bLink('Zurück zu «Jetzt dran»',()=>{bOffen=0;liste();}):null,
    [[1,'Übung ansehen',s1],[2,'Banken ändern',s2],[3,'Kontaktwege ansehen',s3]].filter(([nr,,ok])=>ok&&bOffen!==nr).map(([nr,text])=>bLink(text,()=>{bOffen=nr;liste();},{'data-step':String(nr)})),
    bOffen&&!bereit&&aktuell&&bOffen!==aktuell?bLink('Zum aktuellen Schritt',()=>{bOffen=aktuell;liste();}):null);
  if(wege.children.length)main.append(wege);
  if(echte.length)main.append(bKontaktliste(echte));
  const zweck=document.querySelector('.purpose-card[data-area="b"]');if(zweck){zweck.removeAttribute('open');main.append(zweck);}
}
// Kontaktliste: eigener aufklappbarer Bereich, standardmässig zu. Termin ändern erst nach Tipp auf einen Kontakt.
function bKontaktZeile(r){
  const status=statusVon(r),offen=bListeOffen===r.nr,neu=!!bZuteilung?.rows.includes(r.nr);
  const kopf=el('button',{type:'button',class:'b-row-head','aria-expanded':String(offen),'data-read-navigation':true,on:{click:()=>{bListeOffen=offen?'':r.nr;liste();document.querySelector('[data-nr="'+r.nr+'"] .b-row-head')?.focus();}}},
    el('span',{class:'b-row-time'},r.block==='A'?'09–12':'13–17'),
    el('span',{class:'b-row-main'},el('b',{},bWas(r),neu?el('span',{class:'b-new'},'neu'):null),el('small',{},bKanalText(r)+' · Kontakt '+r.wiederholung,el('span',{class:'b-row-nr'},' · '+r.nr))),
    el('span',{class:'b-row-state is-'+status},status==='abgeschlossen'?'erledigt':status==='laufend'?'läuft':'offen'),
    el('span',{class:'b-row-chev'},bIcon('chev')));
  return el('li',{class:'b-row'+(offen?' is-open':'')+(neu?' is-new':''),'data-nr':r.nr},kopf,offen?el('div',{class:'b-row-body'},
    el('button',{type:'button',class:'knopf b-go','data-read-navigation':true,on:{click:()=>oeffne(r)}},status==='abgeschlossen'?'Ansehen':window.PA6View.active()?'Kontakt ansehen':status==='laufend'?'Weiter erfassen':'Kontakt starten'),
    !r.erfasst?el('div',{class:'b-move'},el('p',{class:'b-label'},'Anderer Tag?'),serviceSchedule(r)):null):null);
}
let bListeZu=true;
function bKontaktliste(echte){
  const offen=echte.filter(r=>statusVon(r)!=='abgeschlossen'),fertig=echte.filter(r=>statusVon(r)==='abgeschlossen'),tage=[...new Set(offen.map(r=>r.tag||''))];
  const box=el('details',{class:'b-list'},el('summary',{},'Alle '+echte.length+' Kontakte',el('span',{class:'b-count'},offen.length+' offen'),bIcon('chev')),
    el('div',{},tage.map(tag=>el('div',{class:'b-day'},el('h3',{},bTag(tag,true)),el('ul',{},offen.filter(r=>(r.tag||'')===tag).map(bKontaktZeile)))),
      fertig.length?el('div',{class:'b-day'},el('h3',{},'Erledigt'),el('ul',{},fertig.map(bKontaktZeile))):null,
      el('p',{class:'b-foot-note'},'Abend und Wochenende werden nicht beobachtet. Keine Kontodaten, keine Namen, keine Zitate eintragen.')));
  box.open=!bListeZu;box.addEventListener('toggle',()=>{bListeZu=!box.open;});
  return box;
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
function channelSetup(state,fehlend){
  fehlend=fehlend||bFehlendeKanaele(state);
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
  // Schnellweg: der nächste offene Kontaktweg mit dem belegten Vorschlag. Gleiche Nutzlast wie Formular plus «Übernehmen».
  let schnell=null;
  if(fehlend.length){
    const [a,artT]=fehlend[0].split(' · '),art=artT==='Telefon'?'telefon':'schriftlich',opts=(KANAELE_BELEGT[a]||{})[art]||[],key=a+'|'+art;
    if(opts.length){
      if(bKanalWahl[key]===undefined&&opts.length===1)bKanalWahl[key]=0;
      const o=opts[bKanalWahl[key]],ok=el('input',{type:'checkbox',id:'channel-quick-ok'}),save=el('button',{class:'knopf b-go',type:'button',disabled:true,on:{click:()=>serviceAction({typ:'b_channel',provider:a,kind:art,channel:o.kanal,source:o.quelle,date:heute(),checked:ok.checked})}},'Speichern und weiter');
      ok.addEventListener('change',()=>{save.disabled=!ok.checked||!o||window.PA6View.active()||fieldPending;});
      schnell=el('div',{class:'channel-quick'},el('p',{class:'b-q-h'},a+' · '+(art==='telefon'?'Telefon':'schriftlich')),
        opts.length>1?el('div',{class:'chips b-stack',role:'group'},opts.map((x,i)=>el('button',{type:'button',class:'chip','aria-pressed':String(bKanalWahl[key]===i),on:{click:()=>{bKanalWahl[key]=i;liste();}}},B_KANAL[x.kanal]||x.kanal))):null,
        opts.length>1&&!o?el('p',{class:'b-hint'},'Zwei Möglichkeiten. Was für dein Konto gilt, entscheidest du mit Ernes.'):null,
        o?el('p',{class:'channel-quick-text'},o.text,' ',el('a',{href:o.quelle,target:'_blank',rel:'noopener','data-read-navigation':true},'Quelle öffnen',bIcon('ext'))):null,
        o?el('label',{class:'checkline'},ok,'Ich habe die Seite geöffnet. Der Weg gilt für mein Konto.'):null,
        o?save:null);
    }
  }
  const alles=el('div',{class:'channel-setup'},
    vorschlaege.length?el('div',{class:'kanal-vorschlaege'},el('p',{class:'kanal-titel'},'Schon recherchiert, du prüfst nur noch'),
      vorschlaege.map(v=>el('div',{class:'kanal-karte'},el('b',{},v.a+' · '+(v.art==='telefon'?'Telefon':'schriftlich')),
        v.optionen.length>1?el('p',{class:'leise'},'Zwei Möglichkeiten. Was für dein Konto gilt, entscheidest du mit Ernes.'):null,
        v.optionen.map(o=>el('div',{class:'kanal-option'},el('span',{},o.text),el('a',{href:o.quelle,target:'_blank',rel:'noopener','data-read-navigation':true},'Quelle',bIcon('ext')),
          el('button',{type:'button',class:'chip',on:{click:()=>uebernehmen(v.a,v.art,o)}},'Übernehmen')))))):null,
    state.channels.length?el('ul',{class:'channel-done'},state.channels.map(r=>el('li',{},bIcon('check'),r.anbieter+' · '+r.art+' · '+(B_KANAL[r.kanal]||r.kanal)+' · geprüft '+r.abruf))):null,
    formular);
  if(!schnell&&!fehlend.length&&!state.channels.length)return alles;
  const mehr=el('details',{class:'b-more b-channel-more'},el('summary',{},schnell?'Anderer Kontaktweg oder alle Vorschläge':'Kontaktwege ansehen oder ändern'),el('div',{},alles));
  if(!schnell&&fehlend.length)mehr.open=true;
  return el('div',{},schnell,mehr);
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
