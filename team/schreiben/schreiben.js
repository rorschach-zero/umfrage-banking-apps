// Schreibplatz (03.11.2026): Auftrag, Regeln und Gliederungshilfe direkt neben dem Kapitel-Doc.
// Inhalte der Aufträge sind statisch (auftraege.json, apa_kurz.json, wiar_kurz.json); Zuteilung, Fristen und Doc kommen mit dem eigenen Schlüssel aus dem Team-Empfänger.
'use strict';
const $ = id => document.getElementById(id);
const ENDPOINT = (window.TEAM_CONFIG || {}).endpoint || '';
const DEMO = location.hostname === '127.0.0.1' && new URLSearchParams(location.search).has('demo');
const NAMES = {SA:'Salah', ES:'Ernes', MG:'Melisa', AM:'Arber', LB:'Leonie'};
const state = {key:'', person:'', chapters:[], chapter:null, guide:{}, apa:null, wiar:null, tab:'auftrag', chat:[], busy:false};

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
function fill(node, ...kids) { node.replaceChildren(...kids.flat().filter(k => k !== null && k !== undefined && k !== false)); }
function announce(t) { $('live').textContent = t; }
function readKey() {
  const hash = new URLSearchParams(location.hash.slice(1)).get('k');
  if (hash) { try { localStorage.setItem('pa6k', hash); } catch {} history.replaceState(null, '', location.pathname + location.search); return hash; }
  try { return localStorage.getItem('pa6k') || ''; } catch { return ''; }
}
async function post(body, ms = 60000) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(ENDPOINT)) throw Error('Der Projektzugang ist nicht verbunden.');
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(ENDPOINT, {method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify(body), signal:ctrl.signal, referrerPolicy:'no-referrer', cache:'no-store'});
    if (!r.ok) throw Error('Gerade nicht erreichbar.');
    return await r.json();
  } catch (e) { throw e.name === 'AbortError' ? Error('Die Verbindung dauert zu lange. Bitte nochmals versuchen.') : e; }
  finally { clearTimeout(t); }
}
async function json(path) { try { const r = await fetch(path, {cache:'no-cache'}); return r.ok ? await r.json() : null; } catch { return null; } }

function day(iso) {
  if (!iso) return null;
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
  if (isNaN(d)) return null;
  return ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.';
}
function roleOf(c) { return c.owner === state.person ? 'Du schreibst' : c.reader === state.person ? 'Du liest gegen' : 'Übersicht'; }
function docUrl(c) { return c && /^https:\/\/docs\.google\.com\/document\/d\/[A-Za-z0-9_-]+(?:\/edit)?$/.test(c.doc || '') ? c.doc.replace(/\/edit$/, '') : null; }

// ---------- Laden ----------
async function load() {
  state.key = readKey();
  const [guide, apa, wiar] = await Promise.all([json('auftraege.json'), json('apa_kurz.json'), json('wiar_kurz.json')]);
  state.guide = guide || {}; state.apa = apa; state.wiar = wiar;
  if (DEMO) { state.person = 'LB'; state.chapters = [{id:'demo', ref:'6a-5', title:'Reflexion der Gruppenarbeit', owner:'LB', reader:'MG', due:'2026-12-08', doc:'https://docs.google.com/document/d/1HSNMA_5ZfPf4WguWlUWD1n7VDfrk6SaUKDq5utgIng4/edit'}, {id:'demo2', ref:'6a-1', title:'Ausgangslage und Problemstellung', owner:'SA', reader:'LB', due:'2026-11-27', doc:null}]; state.chapter = state.chapters.find(c => c.ref === new URLSearchParams(location.search).get('k')) || null; return state.chapter ? renderAll() : chooser(state.chapters.filter(c => c.owner === 'LB')); }
  if (!state.key) return fatal('Öffne den Schreibplatz über deinen persönlichen Link zur Team-App.', true);
  try {
    let r = await post({typ:'team', k:state.key, leitung:false});
    if (!r || r.ok === false) return fatal(r && r.fehler || 'Kein Zugriff.', true);
    if (r.person === 'SA') { const lead = await post({typ:'team', k:state.key, leitung:true}).catch(() => null); if (lead && lead.ok !== false && Array.isArray(lead.chapters)) r = lead; }
    state.person = r.person;
    state.chapters = (r.chapters || []).slice().sort((a, b) => (a.ref || '').localeCompare(b.ref || '', 'de', {numeric:true}));
  } catch (e) { return fatal(e.message || 'Gerade nicht erreichbar.'); }
  const wanted = new URLSearchParams(location.search).get('k');
  const mine = state.chapters.filter(c => c.owner === state.person);
  state.chapter = state.chapters.find(c => c.ref === wanted) || null;
  if (!state.chapter) return chooser(mine);
  renderAll();
}
function fatal(text, keyProblem) {
  $('title').textContent = 'Schreibplatz';
  fill($('tab-auftrag'), el('div', {class:'empty'}, el('h2', {}, keyProblem ? 'Kein Zugang' : 'Nicht geladen'), el('p', {}, text),
    el('a', {class:'btn', href:'/team/'}, 'Zur Team-App')));
  fill($('doc'), );
}
function chooser(mine) {
  $('title').textContent = 'Wähle dein Kapitel';
  $('part').textContent = 'Schreibplatz';
  const list = (rows, label) => rows.length ? el('section', {class:'block'}, el('h2', {}, label), el('ul', {class:'choose'}, rows.map(c =>
    el('li', {}, el('a', {href:'?k=' + encodeURIComponent(c.ref) + (DEMO ? '&demo' : '')}, el('span', {class:'ref'}, c.ref), el('span', {class:'ct'}, c.title),
      el('span', {class:'cm'}, [c.due ? 'Frist ' + day(c.due) : null, state.guide[c.ref] && state.guide[c.ref].seiten ? 'rund ' + state.guide[c.ref].seiten + ' S.' : null].filter(Boolean).join(' · '))))))) : null;
  const reading = state.chapters.filter(c => c.reader === state.person);
  const others = state.person === 'SA' ? state.chapters.filter(c => c.owner !== 'SA' && c.reader !== 'SA') : [];
  fill($('tab-auftrag'), 
    el('div', {class:'intro'}, el('p', {}, 'Hier schreibst du dein Kapitel. Links steht, was gefordert ist, rechts dein Google Doc.')),
    list(mine, 'Deine Kapitel') || el('p', {class:'quiet'}, 'Dir ist noch kein Kapitel zugeteilt.'),
    list(reading, 'Du liest gegen'), list(others, 'Alle weiteren Kapitel'));
  fill($('doc'), el('div', {class:'doc-empty'}, el('p', {}, 'Wähle links ein Kapitel. Das Doc öffnet sich hier.')));
  $('tabs').hidden = true;
}

// ---------- Darstellung ----------
function renderAll() {
  const c = state.chapter, g = state.guide[c.ref] || {};
  document.title = c.ref + ' · Schreibplatz';
  $('part').textContent = (c.ref.startsWith('6b') ? 'PA6b' : 'PA6a') + ' · Kapitel ' + c.ref.replace(/^6[ab]-/, '');
  $('title').textContent = g.titel || c.title;
  fill($('meta'), 
    el('span', {class:'chip role'}, roleOf(c)),
    c.due ? el('span', {class:'chip'}, 'Frist ' + day(c.due)) : null,
    g.seiten ? el('span', {class:'chip'}, 'rund ' + g.seiten + (g.seiten === 1 ? ' Seite' : ' Seiten')) : null,
    c.reader && c.owner === state.person ? el('span', {class:'chip soft'}, 'Gegenlesen: ' + (NAMES[c.reader] || c.reader)) : null);
  const picker = $('picker');
  picker.replaceChildren(...state.chapters.filter(x => state.person === 'SA' || x.owner === state.person || x.reader === state.person)
    .map(x => el('option', {value:x.ref, selected:x.ref === c.ref}, x.ref + ' · ' + x.title)));
  picker.hidden = picker.options.length < 2;
  picker.onchange = () => { location.search = '?k=' + encodeURIComponent(picker.value) + (DEMO ? '&demo' : ''); };
  renderAuftrag(c, g); renderInfos(g); renderRegeln(g); renderHilfe(c, g); renderDoc(c);
  setTab(store.get('pa6-sp-tab', 'auftrag'));
}
function block(title, ...kids) { const body = kids.flat().filter(Boolean); return body.length ? el('section', {class:'block'}, el('h2', {}, title), body) : null; }
function sourceTag(t) { return t ? el('span', {class:'src'}, t) : null; }

function renderAuftrag(c, g) {
  const checksKey = 'pa6-sp-muss:' + c.ref, done = store.get(checksKey, {});
  const muss = (g.muss || []).map((m, i) => {
    const id = 'm' + i, input = el('input', {type:'checkbox', id});
    input.checked = !!done[i];
    input.addEventListener('change', () => { done[i] = input.checked; store.set(checksKey, done); progress(); });
    return el('li', {}, input, el('label', {for:id}, m.punkt, sourceTag(m.quelle)));
  });
  const bar = el('span', {}), meter = el('div', {class:'meter'}, el('i', {}, bar), el('b', {}));
  function progress() { const n = Object.values(done).filter(Boolean).length, all = muss.length; bar.style.width = (all ? n / all * 100 : 0) + '%'; meter.lastChild.textContent = all ? n + ' von ' + all + ' drin' : ''; }
  const hasGuide = !!(g.kurz || (g.muss || []).length);
  fill($('tab-auftrag'), 
    hasGuide ? el('div', {class:'lead'}, el('p', {class:'k'}, 'Das schreibst du'), el('p', {class:'big'}, g.kurz || c.Was || '')) :
      el('div', {class:'lead'}, el('p', {class:'k'}, 'Auftrag'), el('p', {class:'big'}, c.Was && c.Was !== 'noch offen' ? c.Was : 'Der ausführliche Auftrag für dieses Kapitel wird gerade ergänzt.')),
    g.daten_ab ? el('p', {class:'note'}, 'Daten liegen vor ab ' + g.daten_ab + '. Bis dahin Aufbau und Methode schreiben, keine Ergebnisse.') : null,
    block('Diese Fragen beantwortet dein Text', el('ol', {class:'qs'}, (g.fragen || []).map(q => el('li', {}, q)))),
    muss.length ? el('section', {class:'block'}, el('div', {class:'row'}, el('h2', {}, 'Muss drin sein'), meter), el('ul', {class:'checks'}, muss)) : null,
    block('So gibt es volle Punkte', (g.raster || []).map(r => el('div', {class:'pts'}, el('span', {class:'pn'}, r.punkte + ' P.'), el('p', {}, r.volle_punkte_wenn)))),
    block('Aufbau laut Vorgabe', (g.gliederung || []).length ? el('ol', {class:'outline'}, g.gliederung.map(x => el('li', {}, x))) : null),
    block('Gehört nicht hierhin', (g.nicht || []).length ? el('ul', {class:'plain'}, g.nicht.map(x => el('li', {}, x))) : null),
    block('Typische Fehler', (g.fallen || []).length ? el('ul', {class:'plain warn'}, g.fallen.map(x => el('li', {}, x))) : null),
    c.reader === state.person && c.owner !== state.person ? block('Beim Gegenlesen', el('p', {}, 'Prüfe mit der Liste «Muss drin sein» und den Punkten oben. Schreib Kommentare ins Doc, ändere den Text nicht selbst.')) : null);
  progress();
}
function renderInfos(g) {
  const inApp = [
    {titel:'Servicetest', wo:'Team-App', href:'/team/b/', inhalt:'Eure Testkontakte bei den Banken.'},
    {titel:'Bewertungen', wo:'Team-App', href:'/team/c/', inhalt:'Codierte öffentliche Bewertungen.'},
    {titel:'Dashboard', wo:'Team-App', href:'/team/dashboard/', inhalt:'Rücklauf und Stand der Erhebung.'},
    {titel:'Pia fragen', wo:'Team-App', href:'/team/frag/', inhalt:'Fragen zu Regeln, Terminen und Unterlagen.'}];
  fill($('tab-infos'), 
    block('Hier findest du, was du brauchst', (g.infos || []).map(i => el('article', {class:'info'}, el('h3', {}, i.titel), el('p', {}, i.inhalt), el('p', {class:'where'}, i.wo)))),
    block('Direkt in der Team-App', el('div', {class:'links'}, inApp.map(i => el('a', {class:'lnk', href:i.href}, el('b', {}, i.titel), el('span', {}, i.inhalt))))));
}
function copyBtn(text) {
  return el('button', {class:'copy', type:'button', onclick:async e => { try { await navigator.clipboard.writeText(text); e.currentTarget.textContent = 'Kopiert'; announce('Beispiel kopiert'); } catch { announce('Kopieren nicht möglich'); } }}, 'Kopieren');
}
function rule(r, key) {
  return el('details', {class:'rule'}, el('summary', {}, r.thema || r.titel || 'Regel'),
    el('div', {}, r.regel ? el('p', {}, r.regel) : null,
      r.beispiel ? el('div', {class:'ex'}, el('code', {}, r.beispiel), copyBtn(r.beispiel)) : null,
      r.pruefen ? el('p', {class:'check'}, 'Prüffrage: ' + r.pruefen) : null,
      r.seite || r.quelle ? el('p', {class:'src-line'}, (state[key] && state[key].quelle ? state[key].quelle + ', ' : '') + (r.seite ? 'S. ' + r.seite : r.quelle)) : null));
}
function kiBlock(ki) {
  const f = ki.format || {}, list = a => Array.isArray(a) ? a : (a ? [{punkt:String(a)}] : []);
  return [
    el('ul', {class:'checks static'}, list(ki.was_verlangt).map(x => el('li', {}, el('span', {}, x.punkt, sourceTag(x.quelle))))),
    f.spalten ? el('details', {class:'rule'}, el('summary', {}, 'Hilfsmittelverzeichnis (Vorlage)'), el('div', {},
      f.hilfsmittelverzeichnis ? el('p', {}, f.hilfsmittelverzeichnis) : null,
      el('div', {class:'tbl'}, el('table', {}, el('thead', {}, el('tr', {}, f.spalten.map(h => el('th', {}, h)))),
        el('tbody', {}, (f.beispiel_aus_vorlage || []).slice(0, 6).map(r => el('tr', {}, r.map(c => el('td', {}, c))))))),
      el('div', {class:'ex'}, el('code', {}, 'Schreibhilfe Schreibplatz (Claude, Anthropic) | Gliederung und Hinweise zu Kapitel … | Kapitel …'), copyBtn('Schreibhilfe Schreibplatz (Claude, Anthropic)\tGliederung und Hinweise zu Kapitel …\tKapitel …')))) : null,
    f.kurzbeleg_im_text ? el('details', {class:'rule'}, el('summary', {}, 'Beleg im Text und Anhang'), el('div', {}, el('p', {}, f.kurzbeleg_im_text), f.anhang ? el('p', {}, f.anhang) : null)) : null,
    f.erklaerung_wortlaut ? el('details', {class:'rule'}, el('summary', {}, 'Ehrenwörtliche Erklärung (Wortlaut)'), el('div', {}, el('p', {class:'pre'}, f.erklaerung_wortlaut), el('p', {class:'src-line'}, f.quelle || ''))) : null,
    list(ki.verboten).length ? el('div', {class:'nogo'}, el('p', {class:'k'}, 'Nicht erlaubt'), el('ul', {class:'plain warn'}, list(ki.verboten).map(x => el('li', {}, x.punkt, sourceTag(x.quelle))))) : null];
}
function renderRegeln(g) {
  const ki = state.wiar && state.wiar.ki_nachweis;
  fill($('tab-regeln'), 
    block('APA in diesem Kapitel', (g.apa || []).length ? el('ul', {class:'plain'}, g.apa.map(x => el('li', {}, x))) : null),
    block('KI-Nutzung nachweisen', ki ? kiBlock(ki) : null,
      el('p', {class:'quiet'}, 'Jede Frage an die Hilfe auf diesem Schreibplatz wird mit Antwort im KI-Protokoll der Gruppe gespeichert. Daraus entstehen Hilfsmittelverzeichnis und Anhang.')),
    block('Zitieren nach APA (HFW 2025)', state.apa && state.apa.regeln ? state.apa.regeln.map(r => rule(r, 'apa')) : el('p', {class:'quiet'}, 'Die APA-Kurzhilfe wird gerade ergänzt.')),
    block('Wissenschaftlich schreiben (Unterricht)', state.wiar && state.wiar.regeln ? state.wiar.regeln.map(r => rule(r, 'wiar')) : el('p', {class:'quiet'}, 'Die Regeln aus dem Unterricht werden gerade ergänzt.')));
}

// ---------- Hilfe (Gliederung, keine Absätze) ----------
const PROMPTS = ['Schlag mir eine Gliederung in Stichworten vor.', 'Was fehlt mir noch für volle Punkte?', 'Wo finde ich die Daten und Quellen dafür?', 'Worauf muss ich bei APA hier achten?'];
function renderHilfe(c, g) {
  const histKey = 'pa6-sp-chat:' + state.person + ':' + c.ref;
  state.chat = store.get(histKey, []);
  const thread = el('div', {class:'thread', 'aria-live':'polite'});
  const input = el('textarea', {rows:'3', maxlength:'900', placeholder:'Frag nach Gliederung, Leitfragen, Quellen oder APA …', 'aria-label':'Frage an die Schreibhilfe'});
  const send = el('button', {class:'btn', type:'submit'}, 'Fragen');
  const draw = () => { thread.replaceChildren(...(state.chat.length ? state.chat.map(m => el('div', {class:'msg ' + m.r + (m.err ? ' err' : '')}, el('p', {class:'who'}, m.r === 'du' ? 'Du' : 'Schreibhilfe'), el('div', {class:'txt'}, m.t))) :
    [el('p', {class:'quiet'}, 'Die Hilfe kennt den Auftrag dieses Kapitels. Sie gibt Stichworte und Hinweise, schreibt aber keine Absätze für dich.')])); thread.scrollTop = thread.scrollHeight; };
  async function ask(text) {
    text = String(text || '').trim(); if (!text || state.busy) return;
    state.busy = true; send.disabled = true; input.value = '';
    state.chat.push({r:'du', t:text}); draw();
    const wait = el('div', {class:'msg as wait'}, el('p', {class:'who'}, 'Schreibhilfe'), el('div', {class:'txt'}, 'Schaut in den Auftrag …')); thread.append(wait);
    try {
      const verlauf = state.chat.slice(-7, -1).filter(m => !m.err).map(m => ({rolle:m.r === 'du' ? 'du' : 'assistent', text:m.t}));
      const r = await post({typ:'frage', k:state.key, text, leitung:false, ctx:c.id, verlauf, modus:'schreiben', kapitel:c.ref}, 90000);
      if (!r || r.ok === false || typeof r.antwort !== 'string') throw Error(r && r.fehler || 'Keine Antwort erhalten.');
      state.chat.push({r:'as', t:r.antwort});
    } catch (e) { state.chat.push({r:'as', t:e.message || 'Gerade nicht erreichbar.', err:true}); }
    finally { wait.remove(); state.chat = state.chat.slice(-30); store.set(histKey, state.chat); state.busy = false; send.disabled = false; draw(); }
  }
  const form = el('form', {class:'ask', onsubmit:e => { e.preventDefault(); ask(input.value); }}, input, el('div', {class:'row'}, el('p', {class:'quiet small'}, 'Wird als KI-Nutzung protokolliert.'), send));
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
  fill($('tab-hilfe'), 
    el('div', {class:'chips'}, PROMPTS.map(p => el('button', {type:'button', class:'chip-btn', onclick:() => ask(p)}, p))),
    thread, form);
  draw();
}

// ---------- Doc ----------
function renderDoc(c) {
  const url = docUrl(c);
  if (!url) { fill($('doc'), el('div', {class:'doc-empty'}, el('p', {}, 'Für dieses Kapitel ist noch kein Doc verknüpft.'), el('p', {class:'quiet'}, 'Salah legt es an.'))); return; }
  const frame = el('iframe', {src:url + '/edit?usp=sharing', title:'Google Doc ' + c.ref, allow:'clipboard-read; clipboard-write', referrerpolicy:'no-referrer'});
  fill($('doc'), 
    el('div', {class:'doc-bar'}, el('span', {}, 'Google Doc · speichert automatisch'), el('a', {href:url + '/edit', target:'_blank', rel:'noopener noreferrer'}, 'Im eigenen Fenster öffnen ↗')),
    frame,
    el('p', {class:'doc-hint'}, 'Leer oder Anmeldung verlangt? Einmal «Im eigenen Fenster öffnen», bei Google anmelden, dann hier neu laden.'));
}

// ---------- Tabs ----------
function setTab(name) {
  const small = matchMedia('(max-width: 1099px)').matches;
  if (name === 'doc' && !small) name = 'auftrag';
  if (name === 'doc' && small) { const u = docUrl(state.chapter); if (u) window.open(u + '/edit', '_blank', 'noopener'); return; }
  state.tab = name; store.set('pa6-sp-tab', name);
  for (const b of $('tabs').querySelectorAll('button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const t of ['auftrag', 'infos', 'regeln', 'hilfe']) $('tab-' + t).hidden = t !== name;
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
load();
