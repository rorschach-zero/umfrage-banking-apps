'use strict';
(() => {
function node(tag, attr, ...kids) {
  if (typeof el === 'function') return el(tag, attr, ...kids);
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attr || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const QUICK = [0.25, 0.5, 1, 2, 3];
function todayIso() {
  return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
}
function fmtHours(value) { return String(value).replace('.', ','); }
function pruef(r) {
  if (r && r.ok === false) throw Error('Nicht gespeichert: ' + (r.fehler || r.error || 'bitte nochmals versuchen') + '.');
  return r || {};
}
function roundQuarterMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0.25;
  return Math.max(0.25, Math.ceil(minutes / 15) * 0.25);
}
function servicePaket(datum) {
  const tag = String(datum || todayIso()).slice(0, 10);
  return tag <= '2026-11-18' ? 'AP-002' : 'AP-035';
}
function codierungPaket(datum) {
  const tag = String(datum || todayIso()).slice(0, 10);
  return tag <= '2026-11-18' ? 'AP-003' : 'AP-036';
}
function taskPaket(row) {
  return /^AP-\d{3}$/.test(row?.ref || '') ? row.ref : '';
}
function closureId(opts) {
  if (opts && /^[a-zA-Z0-9_-]{16,80}$/.test(opts.id || '')) return opts.id;
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  const bytes = new Uint8Array(16);
  try { crypto.getRandomValues(bytes); } catch (e) { for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256); }
  return 'z' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function closureQuelle(opts) {
  return ['abschluss', 'werkzeug_b', 'werkzeug_c', 'schreibplatz', 'hand'].includes(opts && opts.quelle) ? opts.quelle : 'abschluss';
}
function closureAufgabe(opts, typed, paket) {
  let text = String(typed || opts.aufgabe || '').trim() || (opts.row && opts.row.title) || 'Auftrag';
  if (!paket) {
    const ref = String(opts.ref || '').trim();
    if (ref && !text.includes(ref)) text = ref + ' · ' + text;
    const auftrag = String(opts.auftrag || '').trim();
    if (auftrag && !text.includes(auftrag)) text = text + ' · ' + auftrag;
  }
  return text.slice(0, 6000);
}
function closureMount(container, opts) {
  opts = opts || {};
  if (!container) return;
  if (opts.einAufruf) return abschlussMount(container, opts);
  let busy = false, choice = null, op = 0, held = '';
  const bisher = +opts.bisher || 0;
  const paket = opts.paket || taskPaket(opts.row) || '';
  const send = typeof opts.save === 'function' ? opts.save : payload => sende(payload);
  // Kennung einmal je geöffnetem Abschluss: Wiederholen nach einem Fehler trifft dieselbe Zeile, ein neuer Abschluss eine neue.
  const attemptId = closureId(opts);
  const hint = node('p', {class: 'zeit-closure-hint', role: 'status'});
  const finish = node('button', {type: 'button', class: 'knopf', disabled: true}, 'Abschliessen');
  const dateInput = node('input', {type: 'date', value: todayIso(), 'aria-label': 'Datum'});
  const taskInput = node('input', {type: 'text', value: opts.aufgabe || '', maxlength: 6000, 'aria-label': 'Tätigkeit', placeholder: 'Tätigkeit'});
  const customHours = node('input', {type: 'text', inputMode: 'decimal', maxlength: 8, placeholder: 'z. B. 1,5', 'aria-label': 'Andere Stunden'});
  const customWrap = node('label', {class: 'zeit-meta zeit-custom'}, 'Stunden ', customHours);
  customWrap.hidden = true;
  const vorwahl = Number(opts.vorwahl);
  const quickHit = QUICK.find(value => Math.abs(value - vorwahl) < 0.001);
  if (quickHit) choice = quickHit;
  else if (Number.isFinite(vorwahl) && vorwahl > 0 && vorwahl <= 24) {
    choice = 'custom';
    customHours.value = fmtHours(vorwahl);
    customWrap.hidden = false;
  }
  function parseCustom() {
    const text = String(customHours.value || '').trim().replace(',', '.');
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return null;
    const value = +text;
    return value > 0 && value <= 24 ? value : null;
  }
  function ready() {
    if (choice === 'confirm') return true;
    if (choice === 'custom') return parseCustom() !== null;
    return typeof choice === 'number' && choice > 0;
  }
  function refresh() {
    finish.disabled = busy || !ready() || window.PA6View?.active();
    customWrap.hidden = choice !== 'custom';
    if (held) hint.textContent = held;
    else if (busy) hint.textContent = 'Speichert …';
    else if (choice === 'custom' && !ready()) hint.textContent = 'Trag die Stunden ein, zum Beispiel 1,5.';
    else hint.textContent = ready() ? '' : 'Wähle eine Zeit oder bestätige die bisher erfasste Arbeitszeit.';
  }
  function pick(next) { choice = next; held = ''; refresh(); }
  const hours = node('div', {class: 'zeit-hours', role: 'group', 'aria-label': 'Stunden wählen'});
  QUICK.forEach(value => hours.append(node('button', {
    type: 'button', class: 'chip' + (choice === value ? ' is-on' : ''), on: {click: () => pick(value)}
  }, fmtHours(value) + ' h')));
  hours.append(node('button', {
    type: 'button', class: 'chip' + (choice === 'custom' ? ' is-on' : ''), on: {click: () => pick('custom')}
  }, 'andere Zeit'));
  if (bisher > 0) {
    hours.append(node('button', {
      type: 'button', class: 'chip' + (choice === 'confirm' ? ' is-on' : ''), on: {click: () => pick('confirm')}
    }, 'Bisher erfasst ' + fmtHours(bisher) + ' h bestätigen'));
  }
  const details = node('details', {class: 'zeit-details'},
    node('summary', {}, 'Details'),
    node('div', {class: 'zeit-meta'},
      node('label', {}, 'Datum ', dateInput),
      node('label', {}, 'Tätigkeit ', taskInput)));
  customHours.addEventListener('input', () => { held = ''; refresh(); });
  const back = node('button', {type: 'button', class: 'chip'}, 'Zurück');
  back.addEventListener('click', () => {
    op += 1;
    busy = false;
    if (opts.onCancel) opts.onCancel();
  });
  async function submit() {
    if (busy || !ready() || window.PA6View?.active()) return;
    const mine = ++op;
    busy = true; held = ''; refresh();
    try {
      let stunden, aufgabe = closureAufgabe(opts, taskInput.value, paket);
      if (choice === 'confirm') {
        stunden = '0';
        aufgabe = aufgabe + ' · bestätigt';
      } else if (choice === 'custom') {
        const value = parseCustom();
        if (value === null || mine !== op) return;
        stunden = String(value);
      } else stunden = String(choice);
      const id = attemptId;
      const felder = {datum: dateInput.value || todayIso(), person: opts.person, stunden, aufgabe, paket, storniert: '', quelle: closureQuelle(opts)};
      pruef(await send({typ: 'projekt_save', formular: 'arbeitszeit', id, felder}));
      if (mine !== op) return;
      if (opts.onDone) await opts.onDone({confirm: choice === 'confirm', hours: +stunden, paket, id, felder});
    } catch (error) {
      if (mine !== op) return;
      held = error.message || 'Nicht gespeichert.';
    } finally { if (mine === op) { busy = false; refresh(); } }
  }
  finish.addEventListener('click', submit);
  container.replaceChildren(
    node('div', {class: 'zeit-closure'},
      node('h3', {}, 'Wie lange hast du daran gearbeitet?'),
      Number.isFinite(vorwahl) && vorwahl > 0 ? node('p', {class: 'leise'}, 'Seit dem Start gemessen: ' + fmtHours(vorwahl) + ' h, gerundet auf 15 Minuten.') : null,
      bisher > 0 ? node('p', {class: 'leise'}, 'Bisher erfasst ' + fmtHours(bisher) + ' h zu ' + (paket || 'diesem Auftrag') + '.') : null,
      hours, customWrap, details, hint,
      node('div', {class: 'zeit-closure-actions'}, finish, back)));
  refresh();
}
async function autoBook(opts) {
  opts = opts || {};
  const send = typeof opts.save === 'function' ? opts.save : payload => sende(payload);
  const id = 'auto-wb-' + String(opts.stornoKey || '').replace(/[^a-zA-Z0-9_-]/g, '-');
  const felder = {
    datum: opts.datum || todayIso(), person: opts.person, stunden: String(opts.stunden || 0.25),
    aufgabe: opts.aufgabe || 'Belegnachtrag', paket: opts.paket || servicePaket(opts.datum), storniert: '', quelle: 'werkzeug_b'
  };
  const receipt = node('p', {class: 'zeit-receipt', role: 'status'});
  async function undo() {
    try {
      pruef(await send({typ: 'projekt_save', formular: 'arbeitszeit', id, felder: Object.assign({}, felder, {storniert: 'ja'})}));
      receipt.textContent = 'Automatische Buchung zurückgenommen.';
      opts.onUndone && opts.onUndone();
    } catch (error) { receipt.textContent = error.message; }
  }
  try {
    pruef(await send({typ: 'projekt_save', formular: 'arbeitszeit', id, felder}));
    receipt.replaceChildren(fmtHours(felder.stunden) + ' h automatisch erfasst · ', node('button', {type: 'button', class: 'chip', on: {click: undo}}, 'Rückgängig'));
    opts.onSaved && opts.onSaved();
  } catch (error) { receipt.textContent = error.message; }
  return receipt;
}
function mount(container, opts) {
  opts = opts || {};
  if (!container || !opts.person || (typeof sende !== 'function' && typeof opts.save !== 'function')) return;
  let busy = false, last = null;
  const pakete = Array.isArray(opts.pakete) ? opts.pakete : [];
  const wrap = node('div', {class: 'zeit-wrap' + (opts.compact ? ' compact' : '')});
  if (opts.label) wrap.append(node('span', {class: 'zeit-label'}, opts.label));
  const receipt = node('p', {class: 'zeit-receipt', role: 'status', hidden: true});
  const meta = node('div', {class: 'zeit-meta'});
  const dateInput = node('input', {type: 'date', value: opts.datum || todayIso(), 'aria-label': 'Datum'});
  const taskInput = node('input', {type: 'text', value: opts.aufgabe || '', maxlength: 6000, 'aria-label': 'Tätigkeit', placeholder: 'Tätigkeit'});
  const paketSelect = node('select', {'aria-label': 'Arbeitspaket'},
    node('option', {value: ''}, 'Paket optional'),
    ...pakete.map(row => node('option', {value: row.ref}, row.ref + (row.title ? ' · ' + row.title : ''))),
    node('option', {value: 'anderes'}, 'anderes'));
  if (opts.paket && ![...paketSelect.options].some(o => o.value === opts.paket)) paketSelect.insertBefore(node('option', {value: opts.paket}, opts.paket), paketSelect.lastChild);
  if (opts.paket) paketSelect.value = opts.paket;
  meta.append(node('label', {}, 'Datum ', dateInput), node('label', {}, 'Tätigkeit ', taskInput), node('label', {}, 'Paket ', paketSelect));
  const hours = node('div', {class: 'zeit-hours', role: 'group', 'aria-label': 'Stunden wählen'});
  async function undo() {
    if (!last || busy || window.PA6View?.active()) return;
    busy = true; receipt.textContent = 'Wird zurückgenommen …';
    const send = typeof opts.save === 'function' ? opts.save : payload => sende(payload);
    try {
      pruef(await send({typ: 'projekt_save', formular: 'arbeitszeit', id: last.id, felder: Object.assign({}, last.felder, {storniert: 'ja'})}));
      receipt.hidden = true; last = null; opts.onChange && opts.onChange();
    } catch (error) { receipt.textContent = error.message; }
    finally { busy = false; }
  }
  async function save(stunden) {
    if (busy || window.PA6View?.active()) return;
    const aufgabe = String(taskInput.value || '').trim();
    if (!aufgabe) { receipt.hidden = false; receipt.textContent = 'Bitte kurz die Tätigkeit nennen.'; return; }
    const paket = paketSelect.value === 'anderes' ? '' : String(paketSelect.value || '').trim();
    busy = true; receipt.hidden = false; receipt.textContent = 'Speichert …';
    const id = crypto.randomUUID();
    const felder = {datum: dateInput.value || todayIso(), person: opts.person, stunden: String(stunden), aufgabe, paket, storniert: '', quelle: 'hand'};
    try {
      const send = typeof opts.save === 'function' ? opts.save : payload => sende(payload);
      const r = pruef(await send({typ: 'projekt_save', formular: 'arbeitszeit', id, felder}));
      last = {id: r.id || id, felder};
      receipt.replaceChildren(fmtHours(stunden) + ' h für ' + (paket || 'ohne Paket') + ' gespeichert · ', node('button', {type: 'button', class: 'chip', on: {click: undo}}, 'Rückgängig'));
      opts.onSaved && opts.onSaved(r);
    } catch (error) { receipt.textContent = error.message; last = null; }
    finally { busy = false; }
  }
  QUICK.forEach(value => hours.append(node('button', {type: 'button', class: 'chip', on: {click: () => save(value)}}, fmtHours(value) + ' h')));
  wrap.append(hours, meta, receipt);
  container.replaceChildren(wrap);
}
// ---------- Abschlussfenster in einer Anfrage (Projektseite Paket 2, Bauplan Abschnitt 4.2) ----------
// Texte wörtlich nach Abschnitt 4.2. Das Fenster fragt nur; senden tut der Ablauf «abschliessen» weiter unten (eine Anfrage).
function mk(tag, attr, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attr || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
const ZEITEN = [[0.25, '15 Min'], [0.5, '30 Min'], [1, '1 Std'], [2, '2 Std'], [3, '3 Std']];
const HUERDEN = [['zeit', 'Zeit war knapp'], ['angaben', 'Mir fehlten Angaben'], ['technik', 'Technik oder Zugang'], ['warten', 'Ich musste auf jemanden warten'], ['anderes', 'Etwas anderes']];
const WIEDER = [['ja', 'Ja'], ['nein', 'Nein'], ['weiss_nicht', 'Weiss nicht']];
const KI_WERKZEUGE = [['ChatGPT', 'ChatGPT'], ['Claude', 'Claude'], ['Gemini', 'Gemini'], ['Copilot', 'Copilot'], ['DeepL', 'DeepL'], ['andere', 'andere']];
const KI_ZWECKE = [['ideen', 'Ideen sammeln'], ['verbessern', 'Text verbessern'], ['uebersetzen', 'Übersetzen'], ['recherche', 'Recherche'], ['anderes', 'Etwas anderes']];
const FEHLER_TEXT = 'Bitte ohne Adressen, Links und Telefonnummern.';
const FEHLER_SPEICHERN = 'Das hat nicht geklappt. Deine Angaben sind noch da.';
// Dauer in Alltagssprache: 0,25 → «15 Min», 1,5 → «1,5 Std».
function dauerText(stunden) {
  const h = Math.round(+stunden * 100) / 100;
  if (!(h > 0)) return '0 Min';
  if (h < 1) return Math.round(h * 60) + ' Min';
  return fmtHours(h) + ' Std';
}
// Dieselbe enge Prüfung wie auf dem Server (projektTextPruefen): nur Adressen, Links, Telefon- und Kontonummern.
function textFehler(text, max) {
  const t = String(text || '').trim();
  if (t.length > max) return 'Bitte höchstens ' + max + ' Zeichen.';
  if (/^=/.test(t)) return 'Bitte nicht mit einem Gleichheitszeichen beginnen.';
  if (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(t) || /https?:\/\/|\bwww\./i.test(t)) return FEHLER_TEXT;
  if (/(?:\+|\b00)\d{2,3}[\s\/-]*\d(?:[\s\/-]*\d){5,}/.test(t) || /\b0\d{2}[\s\/-]*\d{3}[\s\/-]*\d{2}[\s\/-]*\d{2}\b/.test(t)) return FEHLER_TEXT;
  if (/\d{9,}/.test(t) || /\bCH\d{2}\s?\d{4}/i.test(t)) return FEHLER_TEXT;
  return '';
}
// Auswahl als Knopfgruppe: ein Tipp wählt, nochmals tippen ändert nichts. Gibt {box, set(wert)} zurück.
function wahl(label, optionen, onPick, cls) {
  const box = mk('div', {class: 'zeit-wahlen' + (cls ? ' ' + cls : ''), role: 'radiogroup', 'aria-label': label});
  const knoepfe = optionen.map(([wert, text]) => mk('button', {type: 'button', class: 'zeit-wahl', role: 'radio', 'aria-checked': 'false', 'data-wert': String(wert),
    on: {click: () => onPick(wert)}}, text));
  box.append(...knoepfe);
  return {box, set(wert) { knoepfe.forEach(k => k.setAttribute('aria-checked', String(k.getAttribute('data-wert') === String(wert)))); }};
}
function abschlussMount(container, opts) {
  const fragen = Object.assign({lief: true, ki: false}, opts.fragen || {});
  const gezaehlt = +opts.gezaehlt > 0 ? Math.round(+opts.gezaehlt * 100) / 100 : 0;
  const s = {zeit: null, gezaehlt: gezaehlt ? null : 'aus', lief: null, art: null, wieder: '', ki: null, werkzeug: null, zweck: null};
  let busy = false, fehler = '', versucht = false, op = 0, neuLaden = false;
  const heute = todayIso();
  // Frage 1, 1a, 1b, 1c
  const q1Titel = mk('h3', {class: 'zeit-frage', id: 'zeit-q1'}, 'Wie lange hast du daran gearbeitet?');
  const vorwahl = Number(opts.vorwahl);
  const gemessen = Number.isFinite(vorwahl) && vorwahl > 0 && vorwahl <= 24 ? vorwahl : 0;
  const zeitWahl = wahl('Wie lange hast du daran gearbeitet?', ZEITEN.concat([['custom', 'andere Zeit']]), wert => { s.zeit = wert; fehler = ''; refresh(); if (wert === 'custom') eigeneZeit.focus(); }, 'zeit-wahlen-zeit');
  const eigeneZeit = mk('input', {type: 'text', inputmode: 'decimal', maxlength: 5, placeholder: 'z. B. 1,5', 'aria-label': 'Andere Zeit in Stunden', autocomplete: 'off', class: 'zeit-feld zeit-feld-kurz'});
  const eigeneWrap = mk('label', {class: 'zeit-eigen'}, eigeneZeit, mk('span', {}, 'Stunden'));
  eigeneZeit.addEventListener('input', () => { fehler = ''; refresh(); });
  if (gemessen) {
    const treffer = ZEITEN.find(([wert]) => Math.abs(wert - gemessen) < 0.001);
    if (treffer) s.zeit = treffer[0]; else { s.zeit = 'custom'; eigeneZeit.value = fmtHours(gemessen); }
  }
  const q1 = mk('div', {class: 'zeit-teil'}, q1Titel,
    gemessen ? mk('p', {class: 'zeit-klein'}, 'Seit dem Start heute gemessen: ' + dauerText(gemessen) + '.') : null,
    zeitWahl.box, eigeneWrap);
  let q1b = null, gezaehltWahl = null;
  if (gezaehlt) {
    gezaehltWahl = wahl('Stimmt die gezählte Zeit?', [['ja', 'Ja, stimmt'], ['mehr', 'Es war mehr']], wert => { s.gezaehlt = wert; fehler = ''; refresh(); });
    q1b = mk('div', {class: 'zeit-teil'},
      mk('h3', {class: 'zeit-frage'}, 'Die App hat ' + (opts.gezaehltText === 'in diesem Zeitraum' ? 'in diesem Zeitraum' : 'für diese Arbeit') + ' schon ' + dauerText(gezaehlt) + ' gezählt. Stimmt das?'),
      gezaehltWahl.box);
  }
  const tag = mk('input', {type: 'date', value: heute, max: heute, min: '2026-10-01', 'aria-label': 'Anderer Tag', class: 'zeit-feld'});
  tag.addEventListener('input', () => { fehler = ''; refresh(); });
  const tagWrap = mk('details', {class: 'zeit-tag'}, mk('summary', {}, 'Anderer Tag'), mk('label', {class: 'zeit-label'}, 'An welchem Tag?', tag));
  // Frage 2, 2a bis 2d
  const liefWahl = wahl('Lief alles rund?', [['ja', 'Ja, lief gut'], ['nein', 'Nein, es hat geklemmt']], wert => { s.lief = wert; fehler = ''; refresh(); });
  const artWahl = wahl('Woran lag es?', HUERDEN, wert => { s.art = wert; fehler = ''; refresh(); }, 'zeit-wahlen-liste');
  const huerdeText = mk('textarea', {rows: 2, maxlength: 300, class: 'zeit-feld', placeholder: 'Die Zahlen von Yuh waren noch nicht da.', 'aria-labelledby': 'zeit-q2b'});
  const wiederWahl = wahl('Kann das wieder passieren?', WIEDER, wert => { s.wieder = s.wieder === wert ? '' : wert; refresh(); }, 'zeit-wahlen-drei');
  const lernsatz = mk('textarea', {rows: 2, maxlength: 300, class: 'zeit-feld', 'aria-labelledby': 'zeit-q2d'});
  [huerdeText, lernsatz].forEach(f => f.addEventListener('input', () => { fehler = ''; refresh(); }));
  const huerde = mk('div', {class: 'zeit-nachfrage'},
    mk('p', {class: 'zeit-unterfrage'}, 'Woran lag es?'), artWahl.box,
    mk('p', {class: 'zeit-unterfrage', id: 'zeit-q2b'}, 'Was war los? Ein Satz genügt.'), huerdeText,
    mk('p', {class: 'zeit-unterfrage'}, 'Kann das wieder passieren?'), wiederWahl.box,
    mk('p', {class: 'zeit-unterfrage', id: 'zeit-q2d'}, 'Was hat geholfen, oder was würdest du nächstes Mal anders machen?'), lernsatz);
  const q2 = fragen.lief ? mk('section', {class: 'zeit-block'},
    mk('h3', {class: 'zeit-frage'}, 'Lief alles rund?'), liefWahl.box, huerde,
    mk('p', {class: 'zeit-klein'}, 'Deine Antwort hilft uns, Probleme früh zu sehen. Sie ist kein Vorwurf. Salah liest sie, und Leonie für das Kapitel über unsere Zusammenarbeit. Bitte keine Namen von Personen ausserhalb der Gruppe.')) : null;
  // Frage 3, 3a bis 3c
  const kiWahl = wahl('KI ausserhalb der Team-App', [['nein', 'Nein'], ['ja', 'Ja']], wert => { s.ki = wert; fehler = ''; refresh(); });
  const werkzeugWahl = wahl('Welche?', KI_WERKZEUGE, wert => { s.werkzeug = wert; fehler = ''; refresh(); if (wert === 'andere') werkzeugFrei.focus(); }, 'zeit-wahlen-drei');
  const werkzeugFrei = mk('input', {type: 'text', maxlength: 40, class: 'zeit-feld', placeholder: 'Name der KI', 'aria-label': 'Welche andere KI?', autocomplete: 'off'});
  const zweckWahl = wahl('Wofür?', KI_ZWECKE, wert => { s.zweck = wert; fehler = ''; refresh(); }, 'zeit-wahlen-zwei');
  const beleg = mk('input', {type: 'url', maxlength: 500, class: 'zeit-feld', placeholder: 'https://', 'aria-labelledby': 'zeit-q3c', autocomplete: 'off', inputmode: 'url'});
  [werkzeugFrei, beleg].forEach(f => f.addEventListener('input', () => { fehler = ''; refresh(); }));
  const kiNachfrage = mk('div', {class: 'zeit-nachfrage'},
    mk('p', {class: 'zeit-unterfrage'}, 'Welche?'), werkzeugWahl.box, werkzeugFrei,
    mk('p', {class: 'zeit-unterfrage'}, 'Wofür?'), zweckWahl.box,
    mk('p', {class: 'zeit-unterfrage', id: 'zeit-q3c'}, 'Link zum Chat, wenn es einen gibt. Sonst leg ein Bildschirmfoto in den Ordner Schreibwerk.'), beleg);
  // Review Paket 2 Nr. 2: 0 gilt als unbekannt (Zahl nur aus diesem Browser), die Zeile entfällt, bis Paket 3 die Zahl vom Server liefert.
  const appFragen = Number.isInteger(opts.appFragen) && opts.appFragen > 0 ? opts.appFragen : null;
  const q3 = fragen.ki ? mk('section', {class: 'zeit-block'},
    !(appFragen > 0) ? null : mk('p', {class: 'zeit-zeile'}, 'In der Team-App gezählt: ' + (appFragen === 1 ? '1 Frage' : appFragen + ' Fragen') + ' an die Schreibhilfe.'),
    mk('h3', {class: 'zeit-frage'}, 'Hast du dafür eine KI ausserhalb der Team-App benutzt?'), kiWahl.box, kiNachfrage,
    mk('p', {class: 'zeit-klein'}, 'Wir müssen KI-Hilfen am Schluss in der Arbeit angeben. Darum fragen wir.')) : null;
  // Fuss: Hinweis, was fehlt, und die zwei Knöpfe
  const hinweis = mk('p', {class: 'zeit-hinweis', role: 'status', 'aria-live': 'polite'});
  const finish = mk('button', {type: 'button', class: 'zeit-haupt'}, 'Abschliessen');
  const back = mk('button', {type: 'button', class: 'zeit-zurueck'}, 'Zurück');
  function eigeneStunden() {
    const text = String(eigeneZeit.value || '').trim().replace(',', '.');
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(text)) return null;
    const value = +text;
    return value > 0 && value <= 24 ? value : null;
  }
  function zeitAntwort() {
    if (s.gezaehlt === 'ja') return {stunden: 0, bestaetigt: true};
    if (s.zeit === 'custom') { const v = eigeneStunden(); return v === null ? null : {stunden: v, bestaetigt: false}; }
    return typeof s.zeit === 'number' ? {stunden: s.zeit, bestaetigt: false} : null;
  }
  // Was fehlt, in der Reihenfolge der Fragen. Leer heisst: alles beantwortet.
  function fehlt() {
    if (s.gezaehlt === null) return 'Wähle noch, ob die gezählte Zeit stimmt.';
    if (s.gezaehlt !== 'ja') {
      if (s.zeit === null) return 'Wähle noch, wie lange du daran gearbeitet hast.';
      if (s.zeit === 'custom' && eigeneStunden() === null) return 'Trag die Zeit ein, zum Beispiel 1,5.';
    }
    if (tag.value && (tag.value > heute || tag.value < '2026-10-01')) return 'Bitte prüfe das Datum.';
    if (fragen.lief) {
      if (!s.lief) return 'Wähle noch, ob alles rund lief.';
      if (s.lief === 'nein') {
        if (!s.art) return 'Wähle noch, woran es lag.';
        if (!huerdeText.value.trim()) return 'Schreib noch kurz, was los war.';
        const t = textFehler(huerdeText.value, 300) || textFehler(lernsatz.value, 300);
        if (t) return t;
      }
    }
    if (fragen.ki) {
      if (!s.ki) return 'Wähle noch, ob du eine KI ausserhalb der Team-App benutzt hast.';
      if (s.ki === 'ja') {
        if (!s.werkzeug) return 'Wähle noch, welche KI.';
        if (s.werkzeug === 'andere') { if (!werkzeugFrei.value.trim()) return 'Schreib noch, welche KI.'; const t = textFehler(werkzeugFrei.value, 40); if (t) return t; }
        if (!s.zweck) return 'Wähle noch, wofür.';
        const b = beleg.value.trim();
        if (b && !/^https:\/\/\S+$/.test(b)) return 'Bitte eine Adresse, die mit https:// beginnt.';
      }
    }
    return '';
  }
  function antworten() {
    const zeit = zeitAntwort();
    if (tag.value && tag.value !== heute) zeit.datum = tag.value;
    const out = {zeit, lief: fragen.lief ? s.lief : null, huerde: null, ki: null};
    if (fragen.lief && s.lief === 'nein') out.huerde = {art: s.art, text: huerdeText.value.trim(), wieder: s.wieder || '', lernsatz: lernsatz.value.trim()};
    if (fragen.ki) out.ki = s.ki === 'ja' ? {extern: 'ja', werkzeug: s.werkzeug === 'andere' ? werkzeugFrei.value.trim() : s.werkzeug, zweck: s.zweck, beleg: beleg.value.trim()} : {extern: 'nein'};
    return out;
  }
  function refresh() {
    const nurLesen = !!window.PA6View?.active();
    const offen = fehlt();
    if (gezaehltWahl) gezaehltWahl.set(s.gezaehlt);
    q1.hidden = !!gezaehlt && s.gezaehlt !== 'mehr';
    q1Titel.textContent = gezaehlt ? 'Wie viel kam dazu?' : 'Wie lange hast du daran gearbeitet?';
    zeitWahl.set(s.zeit);
    eigeneWrap.hidden = s.zeit !== 'custom';
    liefWahl.set(s.lief); artWahl.set(s.art); wiederWahl.set(s.wieder);
    huerde.hidden = s.lief !== 'nein';
    kiWahl.set(s.ki); werkzeugWahl.set(s.werkzeug); zweckWahl.set(s.zweck);
    kiNachfrage.hidden = s.ki !== 'ja';
    werkzeugFrei.hidden = s.werkzeug !== 'andere';
    finish.disabled = neuLaden ? busy : busy || !!offen || nurLesen;
    // Review Paket 2 Nr. 4: Verlangt der Server ein Neuladen (conflict, forbidden), sagt der Knopf das und tut es.
    finish.textContent = busy ? 'Wird gespeichert …' : neuLaden ? 'Seite neu laden' : versucht && fehler ? 'Nochmals versuchen' : 'Abschliessen';
    back.disabled = busy;
    hinweis.classList.toggle('is-fehler', !!fehler && !busy);
    hinweis.textContent = nurLesen ? 'Diese Ansicht ist nur zum Lesen.' : busy ? '' : fehler || offen;
  }
  back.addEventListener('click', () => { if (busy) return; op += 1; if (opts.onCancel) opts.onCancel(); });
  finish.addEventListener('click', async () => {
    if (neuLaden && !busy) { try { location.reload(); } catch (e) {} return; }
    if (busy || fehlt() || window.PA6View?.active()) return;
    const mine = ++op;
    busy = true; versucht = true; fehler = ''; refresh();
    try {
      if (opts.onDone) await opts.onDone(antworten());
      if (mine !== op) return;
      busy = false; fehler = ''; refresh();
    } catch (error) {
      if (mine !== op) return;
      busy = false; fehler = (error && error.message) || FEHLER_SPEICHERN; neuLaden = !!(error && (error.code === 'conflict' || error.code === 'forbidden')); refresh();
    }
  });
  container.replaceChildren(mk('div', {class: 'zeit-ab'},
    mk('div', {class: 'zeit-inhalt'},
      mk('section', {class: 'zeit-block'}, q1b, q1, tagWrap),
      q2, q3),
    mk('div', {class: 'zeit-fuss'}, hinweis, mk('div', {class: 'zeit-knoepfe'}, finish, back))));
  refresh();
  return {antworten, refresh};
}

// Toast unten mit «Rückgängig». Eine Meldung zur Zeit.
let toastTimer = null;
function meldung(text, aktion, ms) {
  let t = document.getElementById('zeit-toast');
  if (!t) { t = mk('div', {id: 'zeit-toast', class: 'zeit-toast', role: 'status', 'aria-live': 'polite'}); document.body.append(t); }
  clearTimeout(toastTimer);
  t.replaceChildren(mk('span', {}, text), aktion || []);
  t.hidden = false;
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || 6000);
  return t;
}
function neueKennung() {
  let roh = '';
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) roh = crypto.randomUUID(); } catch (e) {}
  if (!roh) { const b = new Uint8Array(16); try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256); } roh = Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); }
  return 'ab-' + roh.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
}
// Ablauf «Auftrag abschliessen» (Abschnitt 4.2, «Was beim Tipp auf Abschliessen geschieht»):
// 1 Fenster, 2 eine Anfrage «abschluss» sofort und mit keepalive, 3 Dank erst nach der Antwort, 4 «Rückgängig» 5 Sekunden,
// 5 bei Fehler bleibt das Fenster mit allen Angaben offen, der neue Versuch nutzt dieselbe Kennung.
// opts: titel, auftrag {id, quelle}, fragen {lief, ki}, appFragen, gezaehlt, gezaehltText, vorwahl, selbst (Salahs eigener Auftrag),
//       senden(body, {keepalive}) → Antwort des Servers, darf() → false bricht ab (Zugang gewechselt), onGespeichert, onZurueck, onAbbruch.
function abschliessen(opts) {
  opts = opts || {};
  const vorgang = neueKennung();   // eine Kennung je geöffnetem Fenster; nach Erfolg und nach Rückgängig wird sie verworfen
  const auftrag = opts.auftrag || {};
  const schreiben = !!(opts.fragen && opts.fragen.ki);
  const dlg = mk('dialog', {class: 'zeit-sheet', 'aria-labelledby': 'zeit-sheet-titel'});
  const host = mk('div', {class: 'zeit-sheet-host'});
  dlg.append(mk('header', {class: 'zeit-sheet-kopf'},
    opts.titel ? mk('p', {class: 'zeit-sheet-auftrag'}, opts.titel) : null,
    mk('h2', {id: 'zeit-sheet-titel'}, 'Auftrag abschliessen'),
    mk('p', {class: 'zeit-sheet-unter'}, (schreiben ? 'Drei' : 'Zwei') + ' kurze Fragen, dann bist du fertig.')), host);
  let speichert = false, fertig = false;
  const schliessen = () => { try { dlg.close(); } catch (e) {} dlg.remove(); };
  dlg.addEventListener('cancel', event => { event.preventDefault(); if (speichert) return; schliessen(); if (opts.onAbbruch) opts.onAbbruch(); });
  document.body.append(dlg);
  closureMount(host, {einAufruf: true, fragen: opts.fragen, appFragen: opts.appFragen, gezaehlt: opts.gezaehlt, gezaehltText: opts.gezaehltText, vorwahl: opts.vorwahl,
    onCancel: () => { schliessen(); if (opts.onAbbruch) opts.onAbbruch(); },
    onDone: async antwort => {
      if (fertig) return;
      if (opts.darf && !opts.darf()) throw Error('Dein Zugang hat gewechselt. Bitte lade die Seite neu.');
      const body = Object.assign({typ: 'abschluss', art: 'auftrag', id: auftrag.id, quelle: auftrag.quelle, vorgang}, antwort);
      if (!body.huerde) delete body.huerde;
      if (!body.ki) delete body.ki;
      speichert = true;
      let r;
      try { r = await opts.senden(body, {keepalive: true}); }
      catch (error) { throw Error(FEHLER_SPEICHERN); }
      finally { speichert = false; }
      if (!r || r.ok !== true || r.zurueck || r.storniert || r.status !== 'in Prüfung') {
        const code = r && r.code;
        const fehlerObjekt = Error(code === 'invalid' || code === 'conflict' || code === 'forbidden' ? (r.fehler || FEHLER_SPEICHERN) : FEHLER_SPEICHERN);
        fehlerObjekt.code = code || '';
        throw fehlerObjekt;
      }
      fertig = true;
      schliessen();
      if (opts.onGespeichert) opts.onGespeichert(r);
      // 16.11.2026 (t17): Kam die Antwort erst nach einem Wechsel des Zugangs an, weder Dank noch Rückgängig zeigen: Rückgängig
      // würde abschluss_zurueck mit dem alten Schlüssel für die frühere Person senden. Gespeichert ist die Meldung trotzdem.
      if (opts.darf && !opts.darf()) return;
      // Review Paket 2 Nr. 3: Scheitert «Rückgängig» innerhalb der 5 Sekunden, bleibt der Knopf; danach sagt der Text, was gilt.
      let undoOffen = true;
      const frist = Date.now() + 5000;
      const undo = mk('button', {type: 'button', class: 'zeit-toast-knopf'}, 'Rückgängig');
      const gescheitert = text => {
        if (Date.now() < frist) { undoOffen = true; undo.disabled = false; meldung(text || 'Das hat nicht geklappt. Bitte nochmals versuchen.', undo, Math.max(frist - Date.now(), 0) + 2000); }
        else meldung('Das hat nicht geklappt. Die Meldung bleibt gespeichert. Salah kann sie dir zurückgeben.');
      };
      undo.addEventListener('click', async () => {
        if (!undoOffen) return;
        if (opts.darf && !opts.darf()) { undoOffen = false; undo.remove(); meldung('Dein Zugang hat gewechselt. Bitte lade die Seite neu.'); return; }
        undoOffen = false; undo.disabled = true;
        meldung('Wird zurückgenommen …', null, 30000);
        try {
          const z = await opts.senden({typ: 'abschluss_zurueck', id: auftrag.id, quelle: auftrag.quelle, vorgang}, {keepalive: true});
          if (z && z.code === 'too_late') { meldung(z.fehler || 'Das geht nicht mehr.'); return; }
          if (!z || z.ok !== true) { gescheitert(); return; }
          meldung('Meldung zurückgenommen.');
          if (opts.onZurueck) opts.onZurueck(z);
        } catch (error) { gescheitert(); }
      });
      meldung(opts.selbst ? 'Danke, gespeichert. Der Auftrag steht bei dir unter Zur Abnahme.' : 'Danke. Salah schaut es sich an.', undo, 7000);
      setTimeout(() => { if (undoOffen) { undoOffen = false; undo.remove(); } }, 5000);
    }});
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  const kopf = dlg.querySelector('#zeit-sheet-titel');
  if (kopf) { kopf.setAttribute('tabindex', '-1'); try { kopf.focus({preventScroll: true}); } catch (e) {} }
  return {dialog: dlg, vorgang};
}
window.PA6Zeit = {mount, closureMount, abschliessen, meldung, dauerText, textFehler, autoBook, roundQuarterMinutes, servicePaket, codierungPaket, taskPaket, todayIso, fmtHours};
})();
