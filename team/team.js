// Gemeinsame Hilfen fuer die Erfassungsmasken (Schluessel, Abruf, Speichern). Kein Inhalt verlaesst das Geraet ausser an den Empfaenger.
// Notizen: keine Nummern, Mail- und Netzadressen (gleiche Regel wie im Empfaenger).
const VERBOTEN = /[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/|www\.|\b[\w-]+\.(ch|com|net|org|de|io|app|li)\b|(?:\+|00)?\d[\d\s\/.-]{6,}\d|\bCH\d{2}\s?\d{4}/i;
const ENDPUNKT = "https://script.google.com/macros/s/AKfycbwKYjD-T2hJvIi84_RlplTnkqDE7ilWuDftVvfRa4ZR61V3s6S83lQ7IcTygDzJkHRI/exec";   // Web-App-URL des Empfaengers erfassung.gs, nach der Bereitstellung eintragen
const TEAM = { SA: "Salah", ES: "Ernes", MG: "Melisa", AM: "Arber", LB: "Leonie" };
function schluessel() {
  const h = new URLSearchParams(location.hash.slice(1)).get("k");
  if (h) { try { if ((localStorage.getItem("pa6k") || "") !== h) localStorage.removeItem("pa6-begleiter"); localStorage.setItem("pa6k", h); } catch (e) {} history.replaceState(null, "", location.pathname); return h; }
  try { return localStorage.getItem("pa6k") || ""; } catch (e) { return ""; }
}
// Gelesen wird per POST: der Schluessel steht nur im Inhalt der Anfrage, nie in einer Adresse.
async function hole(a) { return sende({ typ: "lesen", a: a }); }
async function sende(obj, ms) {
  if (fieldPending && !['lesen','team','frage'].includes(obj.typ)) throw Error('Bitte warte auf den aktuellen Stand.');
  window.PA6View.assertRead(obj); obj = window.PA6View.request(obj);
  if (!ENDPUNKT) throw new Error("Empfaenger noch nicht eingerichtet");
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms || 20000);
  try {
    const r = await fetch(ENDPUNKT, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(Object.assign({ k: schluessel() }, obj)), signal: ctrl.signal });
    const j = await r.json(); if (!j.ok) { const error = new Error(j.fehler || "Fehler"); error.denied = ["unauthorized","forbidden"].includes(j.code) || j.fehler === "kein Zugriff"; throw error; }
    if (window.PA6View.active() && ['team','lesen'].includes(obj.typ) &&
        (j.readOnly !== true || j.viewer !== 'SA' || j.person !== (obj.a === 'info' ? 'SA' : obj.als)))
      throw new Error('Die lesende Personenansicht ist noch nicht verfügbar.');
    return j;
  } catch (e) { if (e && e.name === 'AbortError') throw new Error('Die Verbindung hat zu lange gedauert. Lade die Seite neu, vielleicht ist es schon gespeichert.'); throw e; }
  finally { clearTimeout(t); }
}
function el(tag, attr, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attr || {})) { if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k === "class") e.className = v; else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? "" : v); }
  for (const k of kinder.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  if ((window.PA6View.active() || fieldPending) && /\/team\/(b|c)\//.test(location.pathname) && ['input','select','textarea','button'].includes(tag) && !e.hasAttribute('data-read-navigation')) e.disabled = true;
  return e;
}
function chips(werte, aktuell, beiWahl, opt) {
  opt = opt || {};
  return el("div", { class: "chips", role: "group" }, werte.map(w => {
    const [wert, text] = Array.isArray(w) ? w : [w, w];
    return el("button", { type: "button", class: "chip", "aria-pressed": String(aktuell === wert), on: { click: () => beiWahl(aktuell === wert && opt.abwaehlbar ? "" : wert) } }, text);
  }));
}
function lokal(k, v) { if (window.PA6View.active()) return null; try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
function jetztLokal() { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function minuten(a, b) { if (!a || !b) return null; return Math.round((new Date(b) - new Date(a)) / 60000); }
function fuelle(ziel, ...kinder) { ziel.replaceChildren(...kinder.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false)); }

// A new personal link must replace the displayed queue before any further save.
window.addEventListener("hashchange", () => { if (new URLSearchParams(location.hash.slice(1)).has("k")) location.reload(); });
window.addEventListener("storage", event => { if (event.key === "pa6k") { try { localStorage.removeItem("pa6-begleiter"); } catch (e) {} location.reload(); } });

// Responses only: access is hashed for isolation, never stored in a snapshot.
let fieldPending = false, fieldSlot = '', fieldValue = null, fieldGeneration = 0;
function fieldValid(value, area) {
  return value?.ok === true && Object.hasOwn(TEAM, value.person) && Array.isArray(value[area]) && value[area].every(row => row &&
      (area === 'plan' ? !row.person || row.person === value.person : !row.eigen?.codiert_von || row.eigen.codiert_von === value.person)) &&
    Number.isFinite(Date.parse(value.fetchedAt)) && Date.parse(value.fetchedAt) <= Date.now() &&
    (window.PA6View.active() ? value.readOnly === true && value.viewer === 'SA' && value.person === window.PA6View.target() : !value.readOnly && !value.viewer);
}
function fieldPersist(value = fieldValue) {
  if (!fieldSlot || !value) return;
  try { localStorage.setItem(fieldSlot, JSON.stringify(value)); } catch {}
}
function fieldSetPending(pending) {
  fieldPending = pending;
  for (const id of ['zwischen', 'fertig', 'speichern']) {
    const button = document.getElementById(id);
    if (button) button.disabled = pending || window.PA6View.active();
  }
}
function fieldStamp(value) {
  return new Intl.DateTimeFormat('de-CH', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Zurich'}).format(new Date(value.fetchedAt));
}
function fieldNotice(text) {
  let node = document.getElementById('field-updated');
  if (!node) { node = el('p', {id:'field-updated',class:'leise',role:'status',style:'max-width:880px;margin:8px auto;padding:0 20px'}); document.getElementById('main').before(node); }
  node.textContent = text;
}
async function fieldStart(area, apply) {
  const ticket = ++fieldGeneration, access = schluessel();
  if (!access) return;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(access));
    fieldSlot = 'pa6-field-v1:' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('') + ':' + area + ':' + (window.PA6View.target() || 'own');
  } catch { fieldSlot = ''; }
  if (ticket !== fieldGeneration) return;
  let previous = null;
  try { const value = JSON.parse(localStorage.getItem(fieldSlot)); if (fieldValid(value, area)) previous = value; } catch {}
  if (previous) { fieldSetPending(true); fieldValue = previous; apply(previous, true); }
  fieldNotice(previous ? 'Stand ' + fieldStamp(previous) + ' · aktualisiert …' : 'Stand wird geladen …');
  try {
    const value = await hole(area);
    if (ticket !== fieldGeneration || access !== schluessel()) return;
    value.fetchedAt ||= new Date().toISOString();
    if (!fieldValid(value, area)) throw Error('Die Antwort ist unvollständig.');
    fieldSetPending(false); fieldValue = value; fieldPersist(); apply(value, false);
    fieldNotice('aktualisiert ' + new Intl.DateTimeFormat('de-CH', {hour:'2-digit',minute:'2-digit',timeZone:'Europe/Zurich'}).format(new Date(value.fetchedAt)));
  } catch (error) {
    if (ticket !== fieldGeneration || access !== schluessel()) return;
    if (error.denied) { try { localStorage.removeItem(fieldSlot); } catch {} previous = null; fieldValue = null; }
    fieldSetPending(true);
    if (!previous) { document.getElementById('main').replaceChildren(el('h1', {}, 'Keine Verbindung'), el('p', {class:'leise'}, error.message)); document.getElementById('fuss').hidden = true; }
    fieldNotice(previous ? 'Stand ' + fieldStamp(previous) + ' · offline · nur lesen' : 'Aktueller Stand nicht verfügbar');
  }
}
// A cached view is navigable but cannot edit or submit until confirmed.
document.addEventListener('click', event => {
  if (fieldPending && event.target.closest('button,input,select,textarea') && !event.target.closest('[data-read-navigation]')) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
