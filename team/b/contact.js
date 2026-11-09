'use strict';

// Measurement rules retained from the existing v4 form.
const SKRIPT = {
  Karte: { frage: "Wenn ich meine Karte im Ausland verliere, was muss ich tun?", elemente: ["Wo man die Karte sperrt", "Wie man Ersatz anfordert"] },
  Anmeldung: { frage: "Wenn ich ein neues Handy bekomme, wie richte ich die App dort wieder ein?", elemente: ["Neuinstallation", "Identifikation", "Was man dafür braucht"] },
  Zahlung: { frage: "Wie sehe ich in der App, ob eine Zahlung beim Empfänger angekommen ist?", elemente: ["Ort in der App oder Statusbezeichnung (auch korrekt: Empfang nicht sichtbar, Status «ausgeführt»)"] },
  Kontodokumente: { frage: "Wo finde ich einen Kontoauszug für die Steuererklärung?", elemente: ["Ort in der App oder Bestellweg"] }
};
const FRIST = { // Minutes to a human, then to a complete answer; total observation window
  telefon: { mensch: 20, antwort: 15, gesamt: 35, text: "20 min bis eine Person spricht, dann 15 min für die Antwort" },
  chat: { mensch: 60, antwort: 60, gesamt: 120, text: "60 min bis zur ersten menschlichen Antwort, dann 60 min" },
  mail: { mensch: 1440, antwort: 4320, gesamt: 4320, text: "24 h bis zur ersten menschlichen Antwort, Beobachtung bis 72 h" },
  formular: { mensch: 1440, antwort: 4320, gesamt: 4320, text: "24 h bis zur ersten menschlichen Antwort, Beobachtung bis 72 h" }
};
// Paare [gespeicherter Wert, Anzeige]; gespeichert wird weiter der linke Wert.
const HINWEISE = [["Name oder Kürzel", "Name oder Kürzel"], ["Bezug auf ein Detail der Frage", "Geht auf meine Frage genau ein"], ["Sichtbare Tippzeit oder Schreibanzeige", "«Schreibt gerade …» war sichtbar"], ["Freitext ohne Bausteincharakter", "Eigener Text, kein Standardbaustein"]];
const HOEFLICH = [[1, "abweisend oder herablassend"], [2, "einsilbig, geht nicht auf Dank oder Rückfrage ein"], [3, "korrekt und sachlich"], [4, "freundlich, nimmt Bezug auf die Person"], [5, "freundlich und vorausschauend, bietet ungefragt Hilfe an"]];
const STOPP = { nachrichten: 42, minuten: 140 };
let bDirektOffen = false;
let daten = null, aktiv = null, z = {}, belastung = {}, savePending = false;

function frei(s) { return (s || "").replace(/\s+/g, " ").trim(); }
async function start() {
  if (!schluessel()) { document.getElementById("main").replaceChildren(el("h1", {}, "Persönlicher Link fehlt"), el("p", {}, "Öffne die Seite über den Link, den du von Salah bekommen hast. Er enthält deinen Schlüssel.")); return; }
  const selectedStep = bOffen;
  return fieldStart("plan", (value, cached) => {
    daten = value; belastung = daten.belastung || {};
    document.getElementById("wer").textContent = TEAM[daten.person] || daten.person;
    if (!cached) bOffen = selectedStep;
    liste();
    // Direktlink je Kontakt (09.11.2026): team/b/?nr=B05#k=… öffnet diesen Kontakt, einmal pro Laden.
    const ziel = new URLSearchParams(location.search).get("nr") || new URLSearchParams(location.hash.slice(1)).get("nr");
    if (ziel && !bDirektOffen) { const r = (daten.plan || []).find(x => x.nr === ziel); if (r) { bDirektOffen = true; openForm(r); } }
  });
}
function statusVon(r) { const e = r.erfasst; return !e ? "offen" : e.stand === "abgeschlossen" ? "abgeschlossen" : "laufend"; }
function liste() {
  if (savePending || startPending) return;
  clearInterval(contactTicker);
  if (aktiv?.erfasst?.stand === "abgeschlossen") bOffen = null;
  aktiv = null; document.getElementById("fuss").hidden = true; document.body.classList.remove("b-form-open"); document.getElementById("main").classList.remove("is-uebung","contact-rating","contact-rating-more");
  const m = document.getElementById("main"); fuelle(m, );
  const p = bEchte(), fertig = p.filter(r => statusVon(r) === "abgeschlossen").length;
  m.append(el("div", { class: "b-top" }, el("h1", {}, "Servicetest"), p.length ? el("span", { class: "b-top-count", "aria-label": fertig + " von " + p.length + " Kontakten erledigt" }, fertig + " von " + p.length) : null));

  renderBSetup(m);
}
function gesperrt() { const l = belastung[aktiv.anbieter] || { nachrichten: 0, minuten: 0 }; return !aktiv.erfasst && (l.nachrichten >= STOPP.nachrichten || l.minuten >= STOPP.minuten); }
function vorschlaege() {
  // Fristen (Testprotokoll, Zeitstempelregel): Telefon und Chat zaehlen die Antwortfrist ab der ersten menschlichen
  // Antwort, Mail und Formular ab dem Start. Vorschlaege werden nie still uebernommen.
  const f = FRIST[aktiv.kanal] || FRIST.chat, v = {};
  const n = (SKRIPT[aktiv.anliegen] || { elemente: [] }).elemente.length, h = (z.elemente || []).length;
  v.vollstaendig = !z.t_antwort && !h ? "" : h === n ? "vorhanden" : h > 0 ? "teilweise" : "fehlt";
  if (aktiv.kanal === "telefon") v.mensch_status = z.t_mensch ? "Mensch" : "";
  else v.mensch_status = z.auto_selbst ? "Automat" : z.t_mensch ? ((z.hinweise || []).length >= 2 ? "wahrscheinlich Mensch" : "unklar") : "";
  const bisMensch = minuten(z.t_start, z.t_mensch);
  const ab = aktiv.kanal === "telefon" || aktiv.kanal === "chat" ? z.t_mensch : z.t_start;
  const bisAntwort = minuten(ab, z.t_antwort);
  const inFrist = z.t_antwort && bisMensch !== null && bisMensch <= f.mensch && bisAntwort !== null && bisAntwort <= f.antwort;
  v.fcr = v.vollstaendig === "vorhanden" && inFrist && !z.anderer_kanal ? "ja" : v.vollstaendig === "teilweise" ? "unklar" : (z.t_ende ? "nein" : "");
  if (z.kanal_angeboten === "nein") v.code = "nicht angeboten";
  else if (z.kanal_angeboten === "nicht erreichbar") v.code = "erfolglos";
  else if (z.t_start && (bisMensch === null ? (z.t_ende && minuten(z.t_start, z.t_ende) >= f.mensch) : bisMensch > f.mensch)) v.code = "erfolglos";
  else if (z.t_start) v.code = "durchgefuehrt";
  v.inFrist = inFrist;
  return v;
}

function zeile(stand) {
  const o = Object.assign({}, z, { stand }); delete o._startVorher;
  o.mensch_hinweise = (z.hinweise || []).join("|");
  o.elemente = (z.elemente || []).join("|");
  ["t_start", "t_auto", "t_mensch", "t_antwort", "t_ende"].forEach(k => { if (o[k]) o[k] = o[k].replace("T", " "); });
  o.datum = (o.t_start || "").slice(0, 10);
  o.verlauf = frei(o.verlauf); o.bemerkung = frei(o.bemerkung);
  delete o.hinweise; delete o.auto_selbst; delete o.anderer_kanal; delete o.erfasst;
  if (z.start_korrektur) o.start_korrektur = true;
  return o;
}
function echt(t) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t || "")); if (!m) return false; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCDate() === +m[3] && d.getUTCMonth() === +m[2] - 1; }
function heute() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function fehlt() {
  // gleiche Regeln wie der Empfaenger (pruefeAbschluss), damit niemand erst beim Speichern scheitert
  const o = zeile("abgeschlossen"), f = [];
  if(aktiv.nr.startsWith('PROBE-B-')&&!z.simulation_confirmed)f.push('Häkchen «Übung durchgespielt»');
  if (!o.code) f.push("Wie der Kontakt lief");
  if (o.code === "durchgefuehrt" || o.code === "erfolglos") {
    if (!o.t_start) f.push("Start"); if (!o.t_ende) f.push("Ende");
    const bel = aktiv.kanal === "telefon" ? o.minuten_anbieter : o.nachrichten_anbieter;
    if (!/^\d+$/.test(String(bel === undefined || bel === null ? "" : bel))) f.push(aktiv.kanal === "telefon" ? "Gesprächsminuten" : "Nachrichten der Bank");
  }
  if (o.code === "durchgefuehrt") {
    const NAMEN = { kanal_angeboten: "Gibt es diesen Kontaktweg", mensch_status: "Wer hat geantwortet", vollstaendig: "Ist die Antwort vollständig", fcr: "Beim ersten Kontakt beantwortet",
      richtig: "Stimmt die Antwort", weiterverlauf: "wie geht es weiter", hoeflichkeit: "Höflichkeit", rueckfragen: "Rückfragen der Bank", beibehalten: "Blieb die Bank bei Deutsch", standort: "Standort genannt" };
    Object.keys(NAMEN).forEach(k => !String(o[k] || "") && f.push(NAMEN[k]));
    if (["richtig", "teils", "falsch"].includes(o.richtig) && (!/^https:\/\//.test(o.quelle_url || "") || !echt(o.quelle_datum) || o.quelle_datum > heute())) f.push("Link zur Hilfeseite (https) und Datum");
  } else if (o.code && !o.ausfall_grund) f.push("Grund");
  const t = ["t_start", "t_auto", "t_mensch", "t_antwort", "t_ende"].map(k => o[k] ? new Date(o[k].replace(" ", "T")).getTime() : null);
  if (t[0] !== null && t[4] !== null && t[4] < t[0]) f.push("Ende liegt vor dem Start");
  if ([t[1], t[2], t[3]].some(x => x !== null && ((t[0] !== null && x < t[0]) || (t[4] !== null && x > t[4])))) f.push("Zeiten in falscher Reihenfolge (Start zuerst, Ende zuletzt)");
  if (t[2] !== null && t[3] !== null && t[3] < t[2]) f.push("Vollständige Antwort liegt vor der ersten Antwort einer Person");
  ["nachrichten_anbieter", "minuten_anbieter"].forEach(k => { const v = String(o[k] === undefined || o[k] === null ? "" : o[k]); if (v && (!/^\d{1,3}$/.test(v) || +v > 500)) f.push("Anzahl als ganze Zahl von 0 bis 500"); });
  if (VERBOTEN.test([o.verlauf, o.bemerkung, o.ausfall_grund, o.abbruch_grund].join(" "))) f.push("Notizen ohne Nummern, Mailadressen und Links");
  return f;
}
// Invalidate earlier refreshes as soon as a new write begins.
let bSpeicherNr = 0;
async function speichern(stand) {
  if(window.PA6View.active() || fieldPending || savePending)return;
  const msg = document.getElementById("meldung"); msg.className = "meldung";
  if (stand === "abgeschlossen") { const f = fehlt(); if (f.length) { msg.className = "meldung fehler"; msg.textContent = "Fehlt noch: " + f.join(", "); return; } }
  if (stand === "laufend" && VERBOTEN.test([z.verlauf, z.bemerkung].join(" "))) { msg.className = "meldung fehler"; msg.textContent = "Notizen ohne Nummern, Mailadressen und Links"; return; }
  const row = aktiv, planRow = daten.plan.find(item => item.nr === row.nr) || row;
  const previous = planRow.erfasst, payload = zeile(stand), nummer = ++bSpeicherNr;
  savePending = true; bUpdateReadiness(); row.erfasst = planRow.erfasst = payload;
  msg.textContent = "Speichert …";
  try {
    const result = await sende({ typ: "beobachtung", maske: "b4", simulation: aktiv.nr.startsWith("PROBE-B-"), zeile: payload, start_korrektur: payload.start_korrektur === true });
    delete z.start_korrektur;
    window.dispatchEvent(new Event("workspace-saved"));
    row.erfasst = planRow.erfasst = payload; try { localStorage.removeItem("b-" + row.nr); } catch (e) {}
    fieldValue = daten; fieldPersist();
    hole("plan").then(neu => { if (nummer !== bSpeicherNr || neu.person !== daten.person) return; neu.fetchedAt ||= new Date().toISOString(); daten = neu; belastung = neu.belastung || {}; fieldValue = neu; fieldPersist(); }).catch(() => { if (nummer === bSpeicherNr) fieldNotice('Gespeichert · Abgleich ausstehend'); });
    msg.className = "meldung ok"; msg.textContent = stand === "abgeschlossen" ? "Abgeschlossen und gespeichert." : "Zwischenstand gespeichert. Komm zurück, wenn die Antwort da ist.";
    if (stand === "abgeschlossen" && result && result.arbeitszeit && window.PA6Zeit) {
      const host = document.getElementById("zeit-vorschlag") || (() => { const node = el("div", { id: "zeit-vorschlag" }); const main = document.getElementById("main"); main.parentNode.insertBefore(node, main); return node; })();
      host.replaceChildren();
      const auto = result.arbeitszeit;
      const receipt = el("p", { class: "zeit-receipt", role: "status" });
      receipt.replaceChildren(PA6Zeit.fmtHours(auto.stunden) + " h automatisch erfasst · ", el("button", { type: "button", class: "chip", on: { click: async () => {
        try {
          await sende({ typ: "projekt_save", formular: "arbeitszeit", id: auto.id, felder: { datum: payload.datum || heute(), person: daten.person, stunden: String(auto.stunden), aufgabe: "Servicetest " + row.nr, paket: auto.paket, storniert: "ja", quelle: "werkzeug_b" } });
          receipt.textContent = "Automatische Buchung zurückgenommen.";
        } catch (error) { receipt.textContent = error.message; }
      } } }, "Rückgängig"));
      host.append(receipt);
      showSavedContact(row);
    } else if (stand === "abgeschlossen") showSavedContact(row);
  } catch (e) { row.erfasst = planRow.erfasst = previous; msg.className = "meldung fehler"; msg.textContent = "Nicht gespeichert: " + e.message + ". Deine Eingaben bleiben auf diesem Gerät."; }
  finally { savePending = false; bUpdateReadiness(); }
}

// UI-only state lives separately from the observation sent to the receiver.
const CONTACT_SCREENS = ['Vorbereiten', 'Läuft', 'Bewerten', 'Fertig'];
const PRACTICE_MESSAGES = [
  {after: 5000, key: 't_auto', who: 'Musterbot · automatisch', text: 'Danke für deine Nachricht. Ich bin ein Bot und hole jemanden dazu.'},
  {after: 15000, key: 't_mensch', who: 'Mia · Kundenservice', text: 'Hallo, ich bin Mia. Du hast deine Karte im Ausland verloren? Ich helfe dir beim Sperren und beim Ersatz.'},
  {after: 25000, key: 't_antwort', who: 'Mia · Kundenservice', text: 'Öffne in unserer Muster-App «Karten», wähle die verlorene Karte und dann «Sperren». Unter «Ersatzkarte» kannst du eine neue Karte bestellen. Ich wünsche dir weiterhin eine gute Reise!'}
];
let contactScreen = 0, contactUI = {}, contactTicker = 0, contactSaved = false, startPending = false;
function isPractice() { return !!aktiv?.nr.startsWith('PROBE-B-'); }
function canEditContact() { return !!aktiv && !window.PA6View.active() && !fieldPending && !savePending && !startPending && !gesperrt(); }
function persistContact() {
  if (window.PA6View.active()) return;
  lokal('b-' + aktiv.nr, z);
  lokal('b-ui-' + aktiv.nr, contactUI);
}
function contactScript() { return SKRIPT[isPractice() ? 'Karte' : aktiv.anliegen] || {frage: '', elemente: []}; }
function openForm(row) {
  if (savePending || startPending) return;
  clearInterval(contactTicker);
  aktiv = isProbeRow(row) ? {...row, anbieter: 'Musterbank', kanal: 'chat', anliegen: 'Karte'} : row;
  contactUI = lokal('b-ui-' + row.nr) || {};
  const draft = lokal('b-' + row.nr);
  const saved = isPractice() && contactUI.freshPractice ? {} : row.erfasst || {};
  z = Object.assign({nr:row.nr, code:'durchgefuehrt', kanal_angeboten:'ja', stand:'laufend', hinweise:[], elemente:[]}, saved, draft || {});
  if (typeof z.mensch_hinweise === 'string' && !draft?.hinweise) z.hinweise = z.mensch_hinweise ? z.mensch_hinweise.split('|') : [];
  if (!Array.isArray(z.elemente)) z.elemente = z.elemente ? String(z.elemente).split('|') : [];
  ['t_start','t_auto','t_mensch','t_antwort','t_ende'].forEach(key => {if(z[key])z[key]=String(z[key]).replace(' ','T').slice(0,16);});
  if (isPractice()) {
    z.nachrichten_anbieter='0'; z.minuten_anbieter='0';
    if (z.stand !== 'abgeschlossen' && z.t_start && !contactUI.practiceStartedAt) {
      // Old guided exercises have no real chat clock. Restart only this local practice.
      z={nr:row.nr,code:'durchgefuehrt',kanal_angeboten:'ja',stand:'laufend',hinweise:[],elemente:[],nachrichten_anbieter:'0',minuten_anbieter:'0'};
      contactUI={freshPractice:true}; persistContact();
    }
  }
  const channel = daten.service?.channels?.find(c => c.anbieter === row.anbieter && c.art === (row.kanal === 'telefon' ? 'telefon' : 'schriftlich'));
  if (!row.erfasst && (row.status === 'nicht angeboten' || row.kanal === 'telefon' && channel?.kanal === 'keiner')) {
    z.code='nicht angeboten'; z.kanal_angeboten='nein'; z.ausfall_grund ||= 'Telefon im Gratisplan nicht angeboten';
    fillChannelSource();
  }
  if(!z.mensch_status)deriveContactResponder();
  contactSaved = z.stand === 'abgeschlossen' && !contactUI.editing;
  contactScreen = contactSaved ? 3 : z.code === 'nicht angeboten' ? 3 : z.t_ende ? 2 : z.t_start ? 1 : 0;
  document.getElementById('meldung').textContent='';
  formular(); focusContact();
}
function isProbeRow(row) { return String(row.nr).startsWith('PROBE-B-'); }
function contactButton(label, action, options = {}) {
  return el('button', {type:'button', class:'contact-button', ...options, on:{click:event=>{
    if(savePending||startPending)return;
    if(!options['data-read-navigation']&&!canEditContact())return;
    return action(event);
  }}}, label);
}
function goContact(screen) { contactScreen=screen; formular(); focusContact(); }
function focusContact() {
  document.querySelector('.b-form-title')?.focus({preventScroll:true});
  window.scrollTo({top:0,behavior:'instant'});
}
function updateContact(key, value, redraw = true) {
  if (!canEditContact()) return;
  z[key]=value;
  if(key==='mensch_status')contactUI.responderEdited=true;
  if(key==='beibehalten'){if(value==='ja')z.sprache_antwort='Deutsch';else if(z.sprache_antwort==='Deutsch')z.sprache_antwort='';}
  persistContact();
  if (redraw) formular(); else bUpdateReadiness();
}
function contactChoice(key, label, choices) {
  return el('fieldset', {class:'contact-field'}, el('legend',{},label), el('div',{class:'contact-choices'}, choices.map(([value,title]) => contactButton(title,()=>updateContact(key,value),{'aria-pressed':String(String(z[key] ?? '')===String(value)), 'data-choice':key+':'+value}))));
}
function contactInput(key, label, type='text', hint='') {
  const input=el(type==='textarea'?'textarea':'input',{id:'contact-'+key,type:type==='textarea'?null:type,class:'t',value:z[key] ?? '',min:type==='number'?'0':null,max:type==='number'?'500':type==='date'?heute():null,step:type==='number'?'1':null,on:{input:event=>updateContact(key,event.target.value,false)}},type==='textarea'?z[key]||'':null);
  return el('div',{class:'contact-field'},el('label',{for:'contact-'+key},label),input,hint?el('small',{},hint):null);
}
function contactDetails(label, ...children) {
  const node=el('details',{class:'contact-details',open:!!contactUI.details?.[label]},el('summary',{},label),el('div',{class:'contact-detail-body'},children.flat(Infinity)));
  node.addEventListener('toggle',()=>{if(!canEditContact())return;contactUI.details ||= {};contactUI.details[label]=node.open;lokal('b-ui-'+aktiv.nr,contactUI);});
  return node;
}
function channelSource() {
  const c=daten.service?.channels?.find(row=>row.anbieter===aktiv.anbieter&&row.art===(aktiv.kanal==='telefon'?'telefon':'schriftlich'));
  const known=isPractice()?null:kanalInfo(aktiv.anbieter,aktiv.kanal);
  return {text:known?.text || '',url:c?.quelle_url || c?.quelle || c?.source || known?.quelle || '',date:c?.abruf || c?.date || heute()};
}
function fillChannelSource() {
  const source=channelSource(); z.quelle_url ||= source.url; z.quelle_datum ||= source.date;
}
function contactPreparation() {
  const script=contactScript(),source=channelSource(),phone=source.text.match(/^(\+?\d[\d ]{6,}\d)/)?.[1].replace(/ /g,'');
  return [
    isPractice()?el('p',{class:'contact-note'},'Übe mit der erfundenen Musterbank. Lies die Nachrichten und halte fest, was passiert. Etwa 2 Minuten.'):null,
    el('blockquote',{class:'contact-question'},script.frage),
    isPractice()?null:el('p',{class:'contact-way'},source.text || 'Öffne den bestätigten Kontaktweg deiner Bank.',source.url?el('a',{href:source.url,target:'_blank',rel:'noopener','data-read-navigation':true},'Kontaktinfo öffnen'):null),
    aktiv.kanal==='telefon'&&phone?el('a',{class:'contact-button',href:'tel:'+phone,'aria-disabled':String(!canEditContact()),on:{click:event=>{if(!canEditContact())event.preventDefault();}}},'Anrufen'):
      contactButton('Frage kopieren',async event=>{const button=event.currentTarget;try{await navigator.clipboard.writeText(script.frage);button.textContent='Frage kopiert';}catch{document.getElementById('meldung').textContent='Kopieren ging nicht. Halte die Frage gedrückt und kopiere sie.';}},{class:isPractice()?'contact-button contact-primary':'contact-button'}),
    contactButton(isPractice()?'Start':aktiv.kanal==='telefon'?'Start – ich habe gewählt':'Start – Frage ist abgeschickt',beginContact,{class:isPractice()?'contact-button contact-start':'contact-button contact-primary',id:'contact-start',disabled:!canEditContact()}),
    el('p',{class:'contact-hint'},isPractice()?'Start öffnet den Probe-Chat.':aktiv.kanal==='telefon'?'Tippe auf Start, sobald du wählst.':'Tippe auf Start, sobald du die Frage abgeschickt hast.'),
    !isPractice()?contactDetails('Hinweise und freiwillige Angaben',el('p',{},'Stell die Frage möglichst wörtlich. Keine Kontodaten, Namen oder Zitate erfassen. Wird nach dem Test gefragt, antworte ehrlich.'),contactInput('konto_aktiv_seit','Konto aktiv seit'),contactInput('app_version','App-Version')):null
  ];
}
async function beginContact() {
  if(!canEditContact())return;
  const started=Date.now(),nr=aktiv.nr;
  startPending=true;bUpdateReadiness();
  try {
    if(!isPractice()&&!aktiv.erfasst?.t_start) {
      await sende({typ:'b_begin',nr});
      // A successful begin is retained even if the following plan refresh fails.
      z.t_start ||= jetztLokal();contactUI.startedAt=started;persistContact();
      try {
        const fresh=await hole('plan'),row=fresh.plan.find(r=>r.nr===nr);
        daten=fresh;belastung=fresh.belastung || {};
        if(row){aktiv=row;if(row.erfasst?.t_start)z.t_start=String(row.erfasst.t_start).replace(' ','T').slice(0,16);}
      } catch { document.getElementById('meldung').textContent='Start gespeichert. Der Plan wird später abgeglichen.'; }
      window.dispatchEvent(new Event('workspace-saved'));
    } else z.t_start ||= jetztLokal();
    contactUI.startedAt=started;
    if(isPractice()){contactUI.practiceStartedAt=started;contactUI.taps={};contactUI.seen=0;}
    persistContact();contactScreen=1;
  } catch(error){document.getElementById('meldung').textContent=error.message;}
  finally{startPending=false;formular();focusContact();}
}
function eventContact(key) {
  if(!canEditContact()||!z.t_start||z[key])return;
  z[key]=jetztLokal();
  if(isPractice()){contactUI.taps ||= {};contactUI.taps[key]=Date.now()-contactUI.practiceStartedAt;}
  if(['t_auto','t_mensch'].includes(key))deriveContactResponder();
  if(key==='t_antwort'){z.t_ende=z[key];contactUI.endedAt=Date.now();}
  persistContact();formular();
}
function undoContact(key) {
  if(!canEditContact())return;
  z[key]='';
  if(['t_auto','t_mensch'].includes(key))deriveContactResponder();
  if(key==='t_antwort'){z.t_ende='';delete contactUI.endedAt;}
  if(contactUI.taps)delete contactUI.taps[key];
  persistContact();formular();
}
function deriveContactResponder() {
  if(!contactUI.responderEdited)z.mensch_status=z.t_mensch?'Mensch':z.t_auto?'Automat':'';
}
function contactEvent(key,label) {
  return el('div',{class:'contact-event-row'},contactButton(label,()=>eventContact(key),{class:'contact-button contact-event'+(z[key]?' is-set':''),disabled:!!z[key]||!canEditContact(),'data-event':key}),
    z[key]?el('div',{class:'contact-event-stamp'},el('span',{},'Erfasst um '+z[key].slice(11,16)),contactButton('Rückgängig',()=>undoContact(key),{class:'contact-button contact-undo','aria-label':label+' rückgängig','data-undo':key})):null);
}
// The receiver stores minutes; the live stopwatch uses a separate local timestamp.
function contactDeadline(now=Date.now()) {
  const f=FRIST[aktiv.kanal] || FRIST.chat,start=Date.parse(z.t_start),human=Date.parse(z.t_mensch);
  const written=['mail','formular'].includes(aktiv.kanal);
  const total=start+f.gesamt*60000;
  const limit=written?total:Math.min(total,Number.isFinite(human)?human+f.antwort*60000:start+f.mensch*60000);
  return {remaining:Math.max(0,Math.ceil((limit-now)/60000)),expired:now>=limit,humanLate:written&&!z.t_mensch&&now>=start+f.mensch*60000,limit};
}
function updateContactClock() {
  if(!aktiv||contactScreen!==1)return;
  const origin=contactUI.startedAt || Date.parse(z.t_start),end=contactUI.endedAt || (z.t_ende?Date.parse(z.t_ende):Date.now());
  const seconds=Math.max(0,Math.floor((end-origin)/1000));
  const clock=document.getElementById('contact-clock');if(clock)clock.textContent=String(Math.floor(seconds/3600)).padStart(2,'0')+':'+String(Math.floor(seconds/60)%60).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  const deadline=document.getElementById('contact-deadline');
  if(deadline&&!isPractice()){const d=contactDeadline();deadline.textContent=z.t_ende?'Kontakt beendet':d.expired?'Wartezeit vorbei – Ergebnis festhalten':(d.humanLate?'Noch keine Person erreicht. ':'')+'noch '+d.remaining+' Min.';}
  if(isPractice())updatePracticeChat();
}
function updatePracticeChat() {
  const chat=document.getElementById('practice-chat');if(!chat)return;
  const elapsed=Date.now()-(contactUI.practiceStartedAt || Date.now());
  const visible=PRACTICE_MESSAGES.filter(message=>elapsed>=message.after);
  for(const message of visible){if(chat.querySelector('[data-message="'+message.key+'"]'))continue;chat.append(el('p',{'data-message':message.key,class:'practice-message'},el('strong',{},message.who),el('span',{},message.text)));}
  if(visible.length!==contactUI.seen){contactUI.seen=visible.length;if(canEditContact())lokal('b-ui-'+aktiv.nr,contactUI);}
  const hint=document.getElementById('practice-wait');if(hint)hint.hidden=visible.length>0;
  const feedback=document.getElementById('practice-feedback');
  if(feedback&&visible.length===3&&!feedback.children.length){
    feedback.append(el('h3',{},'Deine Rückmeldung'),...PRACTICE_MESSAGES.map(message=>{
      const tap=contactUI.taps?.[message.key],label={t_auto:'Bot',t_mensch:'Mensch',t_antwort:'Antwort'}[message.key];
      return el('p',{},el('b',{},label+': '),tap===undefined?'Noch nicht erfasst.':tap<message.after?'Zu früh getippt – die Nachricht war noch nicht da.':tap-message.after<=8000?'Gut erkannt.':'Erkannt, aber etwas spät.',message.key==='t_auto'?' Der Bot nennt sich ausdrücklich automatisch.':message.key==='t_mensch'?' Mia nennt ihren Namen und geht auf den Verlust im Ausland ein.':' Erst die letzte Nachricht erklärt Sperren und Ersatz.');
    }));
  }
  const next=document.getElementById('contact-rate');if(next)next.disabled=!canEditContact()||elapsed<25000;
  const nextHint=document.getElementById('practice-next-hint');if(nextHint)nextHint.textContent=elapsed<25000?'Warte, bis Mia fertig geantwortet hat.':'Lies deine Rückmeldung. Danach kannst du weiter zur Bewertung.';
  const timeout=document.getElementById('practice-timeout');if(timeout)timeout.hidden=elapsed<150000;
}
function finishPractice() {
  // Feedback has already shown errors. The participant can correct event times before rating.
  z.simulation_confirmed=true;
  z.t_ende ||= jetztLokal();contactUI.endedAt ||= Date.now();
  persistContact();goContact(2);
}
function contactRunning() {
  const written=['mail','formular'].includes(aktiv.kanal),probe=isPractice();
  return [el('div',{class:'contact-clock-wrap'},el('output',{id:'contact-clock','aria-label':'Zeit seit Start',class:'contact-clock'},'00:00:00'),el('p',{id:'contact-deadline',class:'contact-hint'},probe?'Übung · keine echte Bank':'')),
    probe?el('section',{class:'practice-chat','aria-label':'Probe-Chat mit der Musterbank'},el('h3',{},'Musterbank · Chat'),el('div',{id:'practice-chat',role:'log','aria-live':'polite','aria-relevant':'additions'},el('p',{class:'practice-question'},contactScript().frage)),el('p',{id:'practice-wait',class:'contact-hint'},'Nachricht gesendet …')):null,
    contactEvent('t_auto',aktiv.kanal==='telefon'?'Ansage / Bot antwortet':'Bot antwortet'),contactEvent('t_mensch','Mensch antwortet'),contactEvent('t_antwort','Frage beantwortet'),
    probe?el('section',{id:'practice-feedback',class:'practice-feedback','aria-live':'polite'}):null,
    probe?el('p',{id:'practice-timeout',hidden:true,class:'contact-note'},'Du kannst die Übung jetzt mit deiner Bewertung abschliessen.'):null,
    z.t_antwort||probe?contactButton('Weiter zur Bewertung',()=>probe?finishPractice():goContact(2),{class:'contact-button contact-primary',id:'contact-rate'}):null,
    probe?el('p',{id:'practice-next-hint',class:'contact-hint',role:'status'}):null,
    !probe?contactButton('Gespräch beendet · Bewerten',()=>{z.t_ende ||= jetztLokal();contactUI.endedAt=Date.now();persistContact();goContact(2);},{class:'contact-button',hidden:!!z.t_antwort}):null,
    !probe?el('div',{class:'contact-exits'},contactButton('Keine Antwort / Warteschleife zu lang',()=>{z.code='erfolglos';z.ausfall_grund='Keine Antwort / Warteschleife zu lang';z.t_ende=jetztLokal();contactUI.endedAt=Date.now();persistContact();goContact(2);},{class:'contact-button contact-exit'}),contactButton('Diesen Weg gibt es nicht',()=>{z.code='nicht angeboten';z.kanal_angeboten='nein';z.ausfall_grund='Kontaktweg nicht angeboten';fillChannelSource();persistContact();goContact(3);},{class:'contact-button contact-exit'})):null,
    !probe&&written?contactButton('Antwort kommt später – Zwischenstand speichern',()=>speichern('laufend'),{class:'contact-button contact-save-later'}):null,
    !probe&&written?el('p',{class:'contact-hint'},'Der Kontakt bleibt offen. Schau bis 72 Stunden nach dem Start wieder nach.'):null,
    !probe?contactDetails('Zeiten korrigieren',...['t_start','t_auto','t_mensch','t_antwort','t_ende'].map((key,index)=>contactTimeInput(key,['Start','Bot / Ansage','Mensch','Frage beantwortet','Ende'][index]))):null
  ];
}
function contactTimeInput(key,label) {
  return el('div',{class:'contact-field'},el('label',{for:'time-'+key},label),el('input',{id:'time-'+key,class:'t',type:'datetime-local',value:z[key]||'',on:{change:event=>{if(!canEditContact())return;z[key]=event.target.value;if(key==='t_start'){z.start_korrektur=true;delete contactUI.startedAt;}if(key==='t_ende')delete contactUI.endedAt;persistContact();bUpdateReadiness();updateContactClock();}}}));
}
function answeredChoice() {
  return el('fieldset',{class:'contact-field'},el('legend',{},'Ist deine Frage beantwortet?'),el('div',{class:'contact-choices'},[['vorhanden','Ganz'],['teilweise','Teilweise'],['fehlt','Nicht']].map(([value,label])=>contactButton(label,()=>{
    if(!canEditContact())return;z.vollstaendig=value;
    if(value==='fehlt')z.elemente=[];
    if(value!=='vorhanden'&&z.t_antwort){z.t_antwort='';if(contactUI.taps)delete contactUI.taps.t_antwort;}
    persistContact();formular();
  },{'data-choice':'vollstaendig:'+value,'aria-pressed':String(z.vollstaendig===value)}))));
}
function ratingOpinion() {
  const opinion=contactUI.opinion ?? (z.richtig==='offen'?'':z.richtig) ?? '';
  return el('div',{},el('fieldset',{class:'contact-field'},el('legend',{},'Stimmt die Antwort? · freiwillig'),el('div',{class:'contact-choices'},[['richtig','Ja'],['teils','Teilweise'],['falsch','Nein'],['offen','Weiss nicht']].map(([value,label])=>contactButton(label,()=>{contactUI.opinion=value;lokal('b-ui-'+aktiv.nr,contactUI);formular();},{'aria-pressed':String(opinion===value),'data-opinion':value})))),
    el('p',{class:'contact-hint'},'Die Auswertung prüft das. Ohne Beleg bleibt deine Einschätzung als Notiz erhalten.'),
    contactInput('quelle_url','Link · freiwillig','url'),contactInput('quelle_datum','Angeschaut am · freiwillig','date'));
}
function missingRatingChoices() {
  return [['mensch_status','Wer'],['beibehalten','Deutsch'],['fcr','Klärung'],['weiterverlauf','Weiter'],['standort','Ort']].filter(([key])=>!z[key]);
}
function responderHints() {
  const details=contactDetails('Woran erkannt?',el('fieldset',{class:'contact-field contact-hints'},el('legend',{},'Woran erkannt?'),HINWEISE.map(([value,label],index)=>el('label',{class:'contact-check',for:'hint-'+index},el('input',{id:'hint-'+index,type:'checkbox',checked:z.hinweise.includes(value),on:{change:event=>{const values=new Set(z.hinweise);event.target.checked?values.add(value):values.delete(value);updateContact('hinweise',[...values],false);}}}),el('span',{},label)))));
  details.querySelector('summary').append(el('span',{id:'contact-hint-count'},' · '+z.hinweise.length+' gewählt'));
  return details;
}
function ratingNavigation(next, label='Weiter') {
  return el('div',{class:'contact-rating-nav'},contactButton('Zurück',()=>{if(contactUI.ratingPage===1){contactUI.ratingPage=0;persistContact();goContact(2);}else goContact(1);},{'data-read-navigation':true}),contactButton(label,next,{class:'contact-button contact-primary',id:'contact-rating-next'}));
}
function contactRating() {
  if(z.code!=='durchgefuehrt')return [el('p',{class:'contact-note'},z.code==='erfolglos'?'Keine Antwort erhalten. Halte noch den Grund und den Aufwand fest.':'Halte fest, warum der Kontakt nicht stattfand.'),contactInput('ausfall_grund','Grund'),amountInput(),contactInput('bemerkung','Notiz · freiwillig','textarea'),contactButton('Weiter',prepareSummary,{class:'contact-button contact-primary'}),contactButton('Kontakt läuft doch weiter',()=>{z.code='durchgefuehrt';z.t_ende='';delete contactUI.endedAt;persistContact();goContact(1);})];
  if(contactUI.ratingPage!==1)return [
    answeredChoice(),
    ['vorhanden','teilweise'].includes(z.vollstaendig)?el('fieldset',{class:'contact-field'},el('legend',{},'Was wurde erklärt?'),contactScript().elemente.map((value,index)=>el('label',{class:'contact-check',for:'element-'+index},el('input',{type:'checkbox',id:'element-'+index,checked:z.elemente.includes(value),on:{change:event=>{const selected=new Set(z.elemente);event.target.checked?selected.add(value):selected.delete(value);updateContact('elemente',[...selected],false);}}}),el('span',{},value)))):null,
    contactChoice('hoeflichkeit','Wie freundlich?',HOEFLICH.map(([value,label])=>[String(value),el('span',{},el('b',{},value),el('small',{},({1:'abweisend',2:'knapp',3:'sachlich',4:'freundlich',5:'hilfreich'}[value])))])),
    el('p',{class:'contact-hint'},z.hoeflichkeit?HOEFLICH.find(([value])=>String(value)===String(z.hoeflichkeit))?.[1]:'1 = abweisend · 5 = hilft ungefragt'),
    el('fieldset',{class:'contact-field'},el('legend',{},'Gab es Rückfragen?'),el('div',{class:'contact-choices'},contactButton('Nein',()=>{contactUI.followup=false;updateContact('rueckfragen','0');},{'aria-pressed':String(z.rueckfragen==='0'),'data-followup':'no'}),contactButton('Ja',()=>{contactUI.followup=true;if(z.rueckfragen==='0')z.rueckfragen='';persistContact();formular();},{'aria-pressed':String(contactUI.followup===true||!!z.rueckfragen&&z.rueckfragen!=='0'),'data-followup':'yes'}))),
    contactUI.followup||z.rueckfragen&&z.rueckfragen!=='0'?contactChoice('rueckfragen','Wie viele?',[['1','1'],['2','2'],['3','3'],['4+','4+']]):null,
    ratingNavigation(()=>{contactUI.ratingPage=1;persistContact();goContact(2);})
  ];
  return [
    contactChoice('mensch_status','Wer hat geantwortet?',[['Mensch','Mensch'],['wahrscheinlich Mensch','Wahrscheinlich Mensch'],['Automat','Bot'],['unklar','Weiss nicht']]),
    ['Mensch','wahrscheinlich Mensch'].includes(z.mensch_status)?responderHints():null,
    contactChoice('beibehalten','Deutsch geblieben?',[['ja','Ja'],['nein','Nein']]),
    z.beibehalten==='nein'?contactInput('sprache_antwort','Welche Sprache?'):null,
    contactChoice('fcr','Im selben Gespräch geklärt?',[['ja','Ja'],['nein','Nein'],['unklar','Weiss nicht']]),
    contactChoice('weiterverlauf','Wie geht es weiter?',[['Schritt erklaert','Nächster Schritt erklärt'],['Verweis','Weitergeschickt'],['nichts','Nichts gesagt']]),
    contactChoice('standort','Von wo antwortet die Bank?',[['nicht genannt','Nicht gesagt'],['Schweiz','Schweiz'],['Ausland','Ausland']]),
    contactDetails('Notiz · freiwillig',contactInput('bemerkung','Notiz','textarea','Keine Namen, Kontodaten oder Zitate.')),
    contactDetails('Antwort prüfen · freiwillig',ratingOpinion()),
    contactDetails('Weitere Angaben · freiwillig',contactInput('verlauf','Verlauf in Stichworten','textarea'),contactInput('abbruch_grund','Abbruchgrund'),contactChoice('kanal_angeboten','War der Kontaktweg erreichbar?',[['ja','Ja'],['nicht erreichbar','Nicht erreichbar'],['nein','Gibt es nicht']]),contactChoice('code','Wie lief der Kontakt?',[['durchgefuehrt','Hat stattgefunden'],['erfolglos','Keine Antwort'],['nicht angeboten','Gibt es nicht'],['nicht zugaenglich','Kein Zugang'],['ausgefallen','Ausgefallen']]),...['t_start','t_auto','t_mensch','t_antwort','t_ende'].map((key,index)=>contactTimeInput(key,['Start','Bot / Ansage','Mensch','Frage beantwortet','Ende'][index]))),
    ratingNavigation(()=>{if(!missingRatingChoices().length)prepareSummary();}),
    el('p',{id:'contact-rating-missing',class:'contact-hint',role:'status'})
  ];
}
function amountInput() {return isPractice()?null:contactInput(aktiv.kanal==='telefon'?'minuten_anbieter':'nachrichten_anbieter',aktiv.kanal==='telefon'?'Gesprächsminuten mit einer Person':'Nachrichten der Bank','number');}
function prepareSummary() {
  if(!canEditContact())return;
  for(const label of ['Notiz · freiwillig','Antwort prüfen · freiwillig','Weitere Angaben · freiwillig'])if(contactUI.details)contactUI.details[label]=false;
  if(z.code==='durchgefuehrt') {
    const opinion=contactUI.opinion ?? z.richtig ?? 'offen';
    const evidenced=/^https:\/\//.test(z.quelle_url||'')&&echt(z.quelle_datum)&&z.quelle_datum<=heute();
    if(['richtig','teils','falsch'].includes(opinion)&&!evidenced) {
      const note='Einschätzung ohne Beleg: '+({richtig:'richtig',teils:'teilweise richtig',falsch:'falsch'}[opinion])+'.';
      if(contactUI.opinionNote)z.bemerkung=(z.bemerkung||'').replace(contactUI.opinionNote,'').trim();
      z.bemerkung=frei((z.bemerkung||'')+' '+note);contactUI.opinionNote=note;z.richtig='offen';
    } else {z.richtig=opinion;if(contactUI.opinionNote){z.bemerkung=(z.bemerkung||'').replace(contactUI.opinionNote,'').trim();delete contactUI.opinionNote;}}
  }
  if(z.code==='nicht angeboten'){z.kanal_angeboten='nein';fillChannelSource();}
  persistContact();goContact(3);
}
function contactSummary() {
  const unavailable=z.code==='nicht angeboten',probe=isPractice();
  const rows=[['Kontakt',(probe?'Musterbank':aktiv.anbieter)+' · '+(B_KANAL[aktiv.kanal]||aktiv.kanal)],['Ergebnis',{'durchgefuehrt':'gemessen','erfolglos':'keine Antwort in der Frist','nicht angeboten':'Weg gibt es nicht','nicht zugaenglich':'Kein Zugang','ausgefallen':'Ausgefallen'}[z.code]||z.code],['Zeit',z.t_start?(z.t_start.slice(11,16)+' – '+(z.t_ende?.slice(11,16)||'offen')):'Kein Gespräch'],['Antwort',{'vorhanden':'Ganz','teilweise':'Teilweise','fehlt':'Nicht beantwortet'}[z.vollstaendig]||'Keine Antwort erfasst']];
  return [el('dl',{class:'contact-summary'},rows.map(([label,value])=>el('div',{},el('dt',{},label),el('dd',{},value)))),
    unavailable&&!contactSaved?el('div',{class:'contact-unavailable'},contactInput('ausfall_grund','Grund'),contactInput('quelle_url','Quelle · vorausgefüllt','url'),z.quelle_url?el('a',{href:/^https:\/\//.test(z.quelle_url)?z.quelle_url:null,target:'_blank',rel:'noopener','data-read-navigation':true},'Quelle öffnen'):null,contactInput('quelle_datum','Geprüft am','date')):null,
    !unavailable&&!contactSaved?amountInput():null,
    !contactSaved?el('div',{id:'contact-missing',role:'status'}):el('p',{class:'contact-saved',role:'status'},probe?'Übung gespeichert. Es sind keine echten Messdaten.':'Gespeichert.'),
    contactSaved?contactButton('Korrigieren',()=>{contactSaved=false;contactUI.editing=true;contactUI.ratingPage=0;persistContact();goContact(unavailable?3:2);},{class:'contact-button',id:'contact-correct'}):contactButton('Angaben ändern',editMissingContact,{class:'contact-button contact-edit',id:'contact-edit','data-read-navigation':true,hidden:unavailable&&!fehlt().length}),
    contactSaved?nextContactButton():null,
    probe&&contactSaved?contactButton('Übung nochmals starten',restartPractice,{class:'contact-button'}):null,
    contactSaved?contactButton('Fertig für heute',()=>{bOffen=0;liste();},{class:'contact-button','data-read-navigation':true}):null
  ];
}
function editMissingContact() {
  const missing=fehlt()[0]||'';
  let screen=2,page=0,selector='[data-choice^="vollstaendig:"]',details='';
  const choices={
    'Ist die Antwort vollständig':[0,'vollstaendig'],'Höflichkeit':[0,'hoeflichkeit'],'Rückfragen der Bank':[0,'rueckfragen'],
    'Wer hat geantwortet':[1,'mensch_status'],'Beim ersten Kontakt beantwortet':[1,'fcr'],
    'wie geht es weiter':[1,'weiterverlauf'],'Blieb die Bank bei Deutsch':[1,'beibehalten'],'Standort genannt':[1,'standort'],
    'Gibt es diesen Kontaktweg':[1,'kanal_angeboten'],'Wie der Kontakt lief':[1,'code']
  };
  if(choices[missing]){[page,selector]=choices[missing];selector='[data-choice^="'+selector+':"]';if(['Gibt es diesen Kontaktweg','Wie der Kontakt lief'].includes(missing))details='Weitere Angaben · freiwillig';}
  if(missing==='Rückfragen der Bank')selector='[data-followup="yes"]';
  if(['Gesprächsminuten','Nachrichten der Bank','Anzahl als ganze Zahl von 0 bis 500'].includes(missing)){
    screen=3;const key=['nachrichten_anbieter','minuten_anbieter'].find(key=>z[key]!==undefined&&!/^\d{1,3}$/.test(String(z[key]))||Number(z[key])>500);
    selector='#contact-'+(key||(aktiv.kanal==='telefon'?'minuten_anbieter':'nachrichten_anbieter'));
    if(!document.querySelector(selector)){screen=2;page=1;details='Weitere Angaben · freiwillig';}
  } else if(missing==='Grund'){screen=z.code==='nicht angeboten'?3:2;selector='#contact-ausfall_grund';}
  else if(missing==='Häkchen «Übung durchgespielt»'){screen=1;selector='#contact-rate';}
  else if(missing==='Start'||missing==='Ende'||/liegt vor|falscher Reihenfolge/.test(missing)){
    screen=1;details='Zeiten korrigieren';selector='#time-'+(missing==='Start'?'t_start':missing==='Ende'?'t_ende':missing.includes('Vollständige Antwort')?'t_antwort':'t_ende');
  } else if(missing==='Stimmt die Antwort'||missing.startsWith('Link zur Hilfeseite')){
    page=1;details='Antwort prüfen · freiwillig';selector=missing==='Stimmt die Antwort'?'[data-opinion]':'#contact-quelle_url';
  } else if(missing.startsWith('Notizen ohne')){
    const key=['verlauf','bemerkung','ausfall_grund','abbruch_grund'].find(key=>VERBOTEN.test(z[key]||''));
    page=1;details=key==='bemerkung'?'Notiz · freiwillig':'Weitere Angaben · freiwillig';selector='#contact-'+key;
    if(key==='ausfall_grund'){screen=z.code==='nicht angeboten'?3:2;details='';}
  }
  contactUI.ratingPage=page;if(details){contactUI.details ||= {};contactUI.details[details]=true;}
  persistContact();goContact(screen);
  const target=document.querySelector(selector);target?.focus({preventScroll:true});target?.scrollIntoView({block:'center'});
}
function restartPractice() {
  if(!canEditContact()||!isPractice())return;
  const row={...aktiv,erfasst:null};
  try{localStorage.removeItem('b-'+row.nr);localStorage.removeItem('b-ui-'+row.nr);}catch{}
  lokal('b-ui-'+row.nr,{freshPractice:true});
  openForm(row);
}
function nextContactButton() {
  const next=bEchte().find(row=>row.nr!==aktiv.nr&&statusVon(row)!=='abgeschlossen');
  if(isPractice())return contactButton('Weiter zu meinen Kontakten',()=>{bOffen=null;liste();},{class:'contact-button contact-primary','data-read-navigation':true});
  return next?contactButton('Nächster Kontakt',()=>oeffne(next),{class:'contact-button contact-primary','data-read-navigation':true}):null;
}
function showSavedContact(row) {aktiv=row;contactUI.editing=false;delete contactUI.freshPractice;lokal('b-ui-'+row.nr,contactUI);contactSaved=true;contactScreen=3;if(isProbeRow(row)&&daten.service)daten.service.probeDone=true;formular();focusContact();}
function bUpdateReadiness() {
  if(!aktiv)return;
  const busy=savePending||startPending;
  for(const button of document.querySelectorAll('#main button,#main input,#main select,#main textarea,#fuss button')) {
    if(busy){if(!button.hasAttribute('data-busy-disabled'))button.dataset.busyDisabled=String(button.disabled);button.disabled=true;}
    else if(button.hasAttribute('data-busy-disabled')){button.disabled=button.dataset.busyDisabled==='true'||window.PA6View.active()&&!button.hasAttribute('data-read-navigation')||fieldPending;delete button.dataset.busyDisabled;}
  }
  const disabled=!canEditContact();
  const ratingMissing=missingRatingChoices(),ratingHint=document.getElementById('contact-rating-missing');
  if(ratingHint){
    document.getElementById('contact-rating-next').disabled=disabled||ratingMissing.length>0;
    ratingHint.textContent=ratingMissing.length?'Fehlt: '+ratingMissing.map(([,label])=>label).join(' · '):'';
  }
  const hintCount=document.getElementById('contact-hint-count');if(hintCount)hintCount.textContent=' · '+z.hinweise.length+' gewählt';
  document.getElementById('zwischen').disabled=disabled;
  document.getElementById('fertig').disabled=disabled||fehlt().length>0;
  document.getElementById('contact-start')?.toggleAttribute('disabled',disabled);
  const missing=document.getElementById('contact-missing');
  const edit=document.getElementById('contact-edit');if(edit)edit.hidden=z.code==='nicht angeboten'&&!fehlt().length;
  if(missing)missing.textContent=fehlt().length?'Noch ergänzen: '+fehlt().map(f=>({'Ist die Antwort vollständig':'Ganz, teilweise oder nicht beantwortet','Beim ersten Kontakt beantwortet':'im selben Gespräch geklärt','wie geht es weiter':'nächster Schritt','Höflichkeit':'Freundlichkeit','Blieb die Bank bei Deutsch':'Sprache','Standort genannt':'von wo die Bank antwortet','Stimmt die Antwort':'Antwortprüfung'}[f]||f)).join(', '):'Alles erfasst. Du kannst speichern.';
}
function formular() {
  if(!aktiv)return;
  clearInterval(contactTicker);
  const focused=document.activeElement,activeId=focused?.id;
  const focusKey=['data-choice','data-opinion','data-followup'].find(key=>focused?.hasAttribute(key));
  const focusValue=focusKey?focused.getAttribute(focusKey):null;
  document.body.classList.add('b-form-open');
  const main=document.getElementById('main');main.classList.toggle('is-uebung',isPractice());
  const lateAnswer=z.t_antwort&&vorschlaege().inFrist===false&&!isPractice();
  const rating=contactScreen===2&&z.code==='durchgefuehrt';
  main.classList.toggle('contact-rating',rating);
  main.classList.toggle('contact-rating-more',rating&&contactUI.ratingPage===1);
  const title=contactSaved?'Fertig':z.code==='nicht angeboten'?'Diesen Weg gibt es nicht':rating?(contactUI.ratingPage===1?'Noch kurz':'Die Antwort'):CONTACT_SCREENS[contactScreen];
  const content=contactScreen===0?contactPreparation():contactScreen===1?contactRunning():contactScreen===2?contactRating():contactSummary();
  fuelle(main,contactButton('Alle meine Kontakte',()=>{if(canEditContact()&&!contactSaved)persistContact();liste();},{class:'contact-button b-back','data-read-navigation':true}),
    el('p',{class:'contact-eyebrow'},(isPractice()?'Übung · Musterbank':aktiv.anbieter)+' · '+(B_KANAL[aktiv.kanal]||aktiv.kanal)),
    z.code!=='nicht angeboten'?el('ol',{class:'contact-progress','aria-label':'Ablauf'},CONTACT_SCREENS.map((label,index)=>el('li',{'aria-current':index===contactScreen?'step':null},el('span',{},index===2&&rating?(contactUI.ratingPage===1?'3b':'3a'):index+1),label))):null,
    el('h1',{class:'b-form-title',tabindex:'-1'},title),
    gesperrt()?el('p',{role:'alert',class:'b-alert'},'Diese Bank wurde schon genug kontaktiert. Bitte Salah melden.'):null,
    lateAnswer?el('p',{class:'contact-note'},'Die Antwort kam nach der Wartezeit. Halte die Zeiten trotzdem fest. Bei «Im selben Gespräch geklärt?» zählt sie nicht als rechtzeitig beantwortet.'):null,
    el('div',{class:'contact-content'},content.flat(Infinity)));
  const footer=document.getElementById('fuss');footer.hidden=contactSaved;
  const draft=document.getElementById('zwischen');draft.hidden=contactScreen!==1||isPractice();draft.textContent='Zwischenstand speichern';
  document.getElementById('b-step-status').textContent=window.PA6View.active()?'Nur lesen':'';
  fuelle(document.getElementById('b-nav-back'),contactScreen===2&&!rating?contactButton('Zurück zum Kontakt',()=>goContact(1),{'data-read-navigation':true}):null);
  fuelle(document.getElementById('b-nav-next'));
  const finish=document.getElementById('fertig');finish.hidden=contactScreen!==3||contactSaved;finish.textContent='Speichern';
  if(activeId)document.getElementById(activeId)?.focus({preventScroll:true});
  else if(focusKey)[...document.querySelectorAll('['+focusKey+']')].find(node=>node.getAttribute(focusKey)===focusValue)?.focus({preventScroll:true});
  bUpdateReadiness();
  if(contactScreen===1){updateContactClock();contactTicker=setInterval(updateContactClock,500);}
}
document.getElementById('zwischen').addEventListener('click',()=>speichern('laufend'));
document.getElementById('fertig').addEventListener('click',()=>speichern('abgeschlossen'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateContactClock();});
start();
