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
    aufgabe: opts.aufgabe || 'Servicetest', paket: opts.paket || servicePaket(opts.datum), storniert: '', quelle: 'werkzeug_b'
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
window.PA6Zeit = {mount, closureMount, autoBook, roundQuarterMinutes, servicePaket, codierungPaket, taskPaket, todayIso, fmtHours};
})();
