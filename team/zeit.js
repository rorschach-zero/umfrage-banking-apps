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
const HOURS = [0.25, 0.5, 1, 1.5, 2];
function todayIso() {
  return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
}
function fmtHours(value) { return String(value).replace('.', ','); }
function paketLabel(row) { return row.ref + (row.title ? ' · ' + row.title : ''); }
function pruef(r) {
  if (r && r.ok === false) throw Error('Nicht gespeichert: ' + (r.fehler || r.error || 'bitte nochmals versuchen') + '.');
  return r || {};
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
    ...pakete.map(row => node('option', {value: row.ref}, paketLabel(row))),
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
    let paket = paketSelect.value === 'anderes' ? '' : String(paketSelect.value || '').trim();
    busy = true; receipt.hidden = false; receipt.textContent = 'Speichert …';
    const id = crypto.randomUUID();
    const felder = {datum: dateInput.value || todayIso(), person: opts.person, stunden: String(stunden), aufgabe, paket, storniert: ''};
    try {
      const send = typeof opts.save === 'function' ? opts.save : payload => sende(payload);
      const r = pruef(await send({typ: 'projekt_save', formular: 'arbeitszeit', id, felder}));
      last = {id: r.id || id, felder};
      const paketText = paket || 'ohne Paket';
      receipt.replaceChildren(fmtHours(stunden) + ' h für ' + paketText + ' gespeichert · ', node('button', {type: 'button', class: 'chip', on: {click: undo}}, 'Rückgängig'));
      opts.onSaved && opts.onSaved(r);
    } catch (error) { receipt.textContent = error.message; last = null; }
    finally { busy = false; }
  }
  HOURS.forEach(value => hours.append(node('button', {type: 'button', class: 'chip', on: {click: () => save(value)}}, fmtHours(value) + ' h')));
  wrap.append(hours, meta, receipt);
  container.replaceChildren(wrap);
}
function offer(container, opts) {
  opts = opts || {};
  if (!container) return;
  let busyOffer = false;
  const hours = opts.stunden || 0.25;
  const paket = opts.paket || '';
  const aufgabe = opts.aufgabe || 'Servicetest Kontakt';
  const mins = opts.minuten != null ? Math.round(opts.minuten) : Math.round(hours * 60);
  const send = typeof opts.save === 'function' ? opts.save : payload => sende(payload);
  const box = node('div', {class: 'zeit-offer', role: 'status'},
    node('p', {}, mins + ' Min übernehmen? · ' + fmtHours(hours) + ' h · ' + (paket || 'ohne Paket')),
    node('button', {type: 'button', class: 'knopf', on: {click: async () => {
      if (busyOffer || window.PA6View?.active()) return;
      busyOffer = true;
      try {
        pruef(await send({typ: 'projekt_save', formular: 'arbeitszeit', id: crypto.randomUUID(),
          felder: {datum: opts.datum || todayIso(), person: opts.person, stunden: String(hours), aufgabe, paket, storniert: ''}}));
        box.replaceChildren(node('p', {}, fmtHours(hours) + ' h übernommen.'));
        opts.onSaved && opts.onSaved();
        if (opts.onDone) setTimeout(opts.onDone, 900);
      } catch (error) { box.append(node('p', {class: 'leise'}, error.message)); }
      finally { busyOffer = false; }
    }}}, 'Übernehmen'),
    node('button', {type: 'button', class: 'chip', on: {click: () => { box.remove(); opts.onDone && opts.onDone(); }}}, 'Später'));
  container.append(box);
}
function roundQuarterMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0.25;
  return Math.max(0.25, Math.ceil(minutes / 15) * 0.25);
}
function servicePaket(datum) {
  const tag = String(datum || todayIso()).slice(0, 10);
  return tag <= '2026-11-18' ? 'AP-002' : 'AP-035';
}
window.PA6Zeit = {mount, offer, roundQuarterMinutes, servicePaket, todayIso};
})();
