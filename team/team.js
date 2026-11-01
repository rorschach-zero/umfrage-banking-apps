// Gemeinsame Hilfen fuer die Erfassungsmasken (Schluessel, Abruf, Speichern). Kein Inhalt verlaesst das Geraet ausser an den Empfaenger.
// Notizen: keine Nummern, Mail- und Netzadressen (gleiche Regel wie im Empfaenger).
const VERBOTEN = /[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/|www\.|\b[\w-]+\.(ch|com|net|org|de|io|app|li)\b|(?:\+|00)?\d[\d\s\/.-]{6,}\d|\bCH\d{2}\s?\d{4}/i;
const ENDPUNKT = "https://script.google.com/macros/s/AKfycbwKYjD-T2hJvIi84_RlplTnkqDE7ilWuDftVvfRa4ZR61V3s6S83lQ7IcTygDzJkHRI/exec";   // Web-App-URL des Empfaengers erfassung.gs, nach der Bereitstellung eintragen
const TEAM = { SA: "Salah", ES: "Ernes", MG: "Melisa", AM: "Arber", LB: "Leonie" };
function schluessel() {
  const h = new URLSearchParams(location.hash.slice(1)).get("k");
  if (h) { try { localStorage.setItem("pa6k", h); } catch (e) {} history.replaceState(null, "", location.pathname); return h; }
  try { return localStorage.getItem("pa6k") || ""; } catch (e) { return ""; }
}
// Gelesen wird per POST: der Schluessel steht nur im Inhalt der Anfrage, nie in einer Adresse.
async function hole(a) { return sende({ typ: "lesen", a: a }); }
async function sende(obj) {
  if (!ENDPUNKT) throw new Error("Empfaenger noch nicht eingerichtet");
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(ENDPUNKT, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(Object.assign({ k: schluessel() }, obj)), signal: ctrl.signal });
    const j = await r.json(); if (!j.ok) throw new Error(j.fehler || "Fehler"); return j;
  } finally { clearTimeout(t); }
}
function el(tag, attr, ...kinder) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attr || {})) { if (k === "on") for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); else if (k === "class") e.className = v; else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? "" : v); }
  for (const k of kinder.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
function chips(werte, aktuell, beiWahl, opt) {
  opt = opt || {};
  return el("div", { class: "chips", role: "group" }, werte.map(w => {
    const [wert, text] = Array.isArray(w) ? w : [w, w];
    return el("button", { type: "button", class: "chip", "aria-pressed": String(aktuell === wert), on: { click: () => beiWahl(aktuell === wert && opt.abwaehlbar ? "" : wert) } }, text);
  }));
}
function lokal(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
function jetztLokal() { const d = new Date(); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function minuten(a, b) { if (!a || !b) return null; return Math.round((new Date(b) - new Date(a)) / 60000); }
function fuelle(ziel, ...kinder) { ziel.replaceChildren(...kinder.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false)); }

// A new personal link must replace the displayed queue before any further save.
window.addEventListener("hashchange", () => { if (new URLSearchParams(location.hash.slice(1)).has("k")) location.reload(); });
window.addEventListener("storage", event => { if (event.key === "pa6k") location.reload(); });
