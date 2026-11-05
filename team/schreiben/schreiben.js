// Schreibplatz (03.11.2026): Auftrag, Regeln und Gliederungshilfe direkt neben dem Kapitel-Doc.
// Inhalte der Aufträge sind statisch (auftraege.json, apa_kurz.json, wiar_kurz.json); Zuteilung, Fristen und Doc kommen mit dem eigenen Schlüssel aus dem Team-Empfänger.
'use strict';
const $ = id => document.getElementById(id);
const ENDPOINT = (window.TEAM_CONFIG || {}).endpoint || '';
const DEMO = location.hostname === '127.0.0.1' && new URLSearchParams(location.search).has('demo');
const NAMES = {SA:'Salah', ES:'Ernes', MG:'Melisa', AM:'Arber', LB:'Leonie'};
const state = {key:'', person:'', chapters:[], chapter:null, guide:{}, apa:null, wiar:null, tab:'auftrag', chat:[], busy:false, tasks:[]};

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'on' && typeof v === 'object') { for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn); continue; }
    if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return e;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { if (viewing() && /^pa6-sp-(weg|muss|teile|chat):/.test(k)) return; try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
function fill(node, ...kids) { node.replaceChildren(...kids.flat().filter(k => k !== null && k !== undefined && k !== false)); }
function announce(t) { $('live').textContent = t; }
function viewing() { return !!(window.PA6View && typeof PA6View.active === 'function' && PA6View.active()); }
function readKey() {
  const hash = new URLSearchParams(location.hash.slice(1)).get('k');
  if (hash) {
    try { if ((localStorage.getItem('pa6k') || '') !== hash) localStorage.removeItem('pa6-begleiter'); localStorage.setItem('pa6k', hash); } catch {}
    history.replaceState(null, '', location.pathname + location.search); return hash;
  }
  try { return localStorage.getItem('pa6k') || ''; } catch { return ''; }
}
async function post(body, ms = 60000) {
  if (viewing()) {
    if (!['team', 'lesen'].includes(body.typ)) throw Error('Diese Personenansicht ist nur zum Lesen.');
    body = PA6View.request(body);
  }
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
  const assets = Promise.all([json('auftraege.json'), json('apa_kurz.json'), json('wiar_kurz.json')]);
  if (DEMO) { const [guide, apa, wiar] = await assets; state.guide = guide || {}; state.apa = apa; state.wiar = wiar; state.person = 'LB'; state.chapters = [{id:'demo', ref:'6a-5', title:'Reflexion der Gruppenarbeit', owner:'LB', reader:'MG', due:'2026-12-08', doc:'https://docs.google.com/document/d/1HSNMA_5ZfPf4WguWlUWD1n7VDfrk6SaUKDq5utgIng4/edit'}, {id:'demo2', ref:'6a-1', title:'Ausgangslage und Problemstellung', owner:'SA', reader:'LB', due:'2026-11-27', doc:null}]; state.chapter = state.chapters.find(c => c.ref === new URLSearchParams(location.search).get('k')) || null; return state.chapter ? renderAll() : chooser(state.chapters.filter(c => c.owner === 'LB')); }
  if (!state.key) return fatal('Öffne den Schreibplatz über deinen persönlichen Link zur Team-App.', true);
  if (!new URLSearchParams(location.search).get('k')) renderLoading();
  // Schnell: letzter Stand sofort zeigen, frischen Stand im Hintergrund holen.
  let h = 0; for (const ch of state.key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const cacheKey = 'pa6-sp-stand:' + (h >>> 0).toString(36);   // je Zugang getrennt, ohne den Schlüssel zu speichern
  const cached = store.get(cacheKey, null);
  const fresh = (async () => {
    let r = await post({typ:'team', k:state.key, leitung:false});
    if (!r || r.ok === false) throw Object.assign(Error(r && r.fehler || 'Kein Zugriff.'), {key:true});
    if (r.person === 'SA') { const lead = await post({typ:'team', k:state.key, leitung:true}).catch(() => null); if (lead && lead.ok !== false && Array.isArray(lead.chapters)) r = lead; }
    return {person:r.person, chapters:r.chapters || [], chapterOverview:r.chapterOverview || null, chapterLeitung:r.chapterLeitung, tasks:r.tasks || []};
  })();
  const [guide, apa, wiar] = await assets; state.guide = guide || {}; state.apa = apa; state.wiar = wiar;
  if (cached && cached.person) { apply(cached); route(); }
  try {
    const f = await fresh;
    store.set(cacheKey, f);
    if (!cached || JSON.stringify(cached) !== JSON.stringify(f)) { apply(f); route(); }
  } catch (e) { if (!cached) return fatal(e.message || 'Gerade nicht erreichbar.', e.key); }
}
function apply(r) {
  state.person = r.person;
  state.tasks = r.tasks || [];
  const own = r.chapters || [], byRef = new Map(own.map(c => [c.ref, c]));
  // Schreibwerk-Leitung: Gesamtsicht aller Kapitel (eigene Zeilen behalten ihre volle Form).
  (r.chapterOverview || []).forEach(c => { if (!byRef.has(c.ref)) byRef.set(c.ref, Object.assign({overview:true}, c)); });
  state.lead = typeof r.chapterLeitung === 'boolean' ? r.chapterLeitung : Array.isArray(r.chapterOverview);
  state.chapters = [...byRef.values()].sort((a, b) => (a.ref || '').localeCompare(b.ref || '', 'de', {numeric:true}));
  planMerge();
}
function route() {
  const wanted = new URLSearchParams(location.search).get('k');
  const mine = state.chapters.filter(c => c.owner === state.person);
  state.chapter = state.chapters.find(c => c.ref === wanted) || null;
  if (!state.chapter) return chooser(mine);
  document.body.classList.remove('choosing');
  renderAll();
}
function fatal(text, keyProblem) {
  $('title').textContent = 'Schreibplatz';
  if (!new URLSearchParams(location.search).get('k')) { document.body.classList.add('choosing'); $('tabs').hidden = true; }
  fill($('tab-auftrag'), el('div', {class:'empty'}, el('h2', {}, keyProblem ? 'Kein Zugang' : 'Nicht geladen'), el('p', {}, text),
    el('a', {class:'btn', href:'/team/'}, 'Zur Team-App')));
  fill($('doc'), );
}
// ---------- Übersicht (Einstieg Schreibwerk, 03.11.2026) ----------
// Gesamtwerk auf einen Blick: alle Kapitel nach PA6a/PA6b und Hauptkapitel, mit Pate und Gegenleser als Initialen.
// Zuteilung laut Kapitelplan (Schreibwerk, 39 Kapitel). Der Team-Empfänger liefert Stand und Doc für die eigenen Kapitel
// (Leitung für alle); fehlt eine Zeile, füllt dieser Plan nur Titel, Pate und Gegenleser, nur zum Lesen.
const PLAN = [
  ['6a-1','SA','ES','Ausgangslage und Problemstellung'], ['6a-2','LB','AM','Analyse der aktuellen Markt- und Geschäftssituation'],
  ['6a-2-ziel','MG','AM','Zielsetzung'], ['6a-2-partner','MG','AM','Schlüsselpartner*Innen'], ['6a-2-sicherheit','MG','AM','Sicherheit'],
  ['6a-2-konkurrenz','ES','MG','Konkurrenzanalyse (Stärken und Schwächen der Mitbewerber)'], ['6a-2.4','AM','LB','Primäre Marktforschung'],
  ['6a-2.4-design','AM','LB','Forschungsdesign'], ['6a-2.4-instrumente','AM','LB','Erhebungsinstrumente'], ['6a-2.4-stichprobe','AM','LB','Beschreibung der Stichprobe'],
  ['6a-2.8','LB','AM','Auswertung'], ['6a-2.8-f12','AM','LB','F1/F2'], ['6a-2.8-f3','ES','MG','F3'], ['6a-2.8-f4','MG','AM','F4'],
  ['6a-2.9','MG','AM','SWOT-Analyse'], ['6a-3','SA','ES','Strategische Überlegungen und mögliche Methoden das Ziel zu erreichen'],
  ['6a-4','LB','SA','Fazit'], ['6a-5','LB','SA','Reflexion Gruppenarbeit'], ['6a-6','LB','SA','Literaturverzeichnis'],
  ['6a-6-abbildungen','LB','SA','Abbildungsverzeichnis'], ['6a-6-tabellen','LB','SA','Tabellenverzeichnis'], ['6a-6-anhang','LB','SA','Anhang'],
  ['6a-7','LB','SA','Eigenständigkeitserklärung'], ['6a-reserve-markt','ES','MG','Markt und Umfeld'],
  ['6a-reserve-unternehmen','SA','ES','Yuh als eigene Unternehmung und Prognose'],
  ['6b-1','SA','ES','Ausgangslage und Problemstellung'], ['6b-2','MG','AM','Fazit der Analyse und Diagnose der Datenanalyse PA6a'],
  ['6b-3','SA','ES','Ökonomische und Vorökonomische Zielsetzungen'], ['6b-4','ES','MG','Risiko Map'], ['6b-5','LB','SA','Stakeholder-Analyse'],
  ['6b-6','AM','LB','Zielgruppenanalyse'], ['6b-7','SA','ES','Strategische Ansätze und Begründungen'], ['6b-8','ES','MG','Marketing-Mix'],
  ['6b-9','MG','AM','Nachhaltigkeitserläuterungen'], ['6b-10','ES','SA','Budget- und Kostenplanung'], ['6b-11','LB','SA','Fazit'],
  ['6b-12','LB','SA','Reflexion'], ['6b-13','LB','SA','Alle nötigen Verzeichnisse'], ['6b-14','LB','SA','Eigenständigkeitserklärung']];
// Schreibfristen nach Abhängigkeiten (Salah 03.11.2026), gleich wie Notion «Kapitel», Feld Frist. Bei Änderung in Notion hier nachführen.
const PLAN_FRIST = {"6a-2-ziel": "2026-11-13", "6a-2.4-design": "2026-11-13", "6a-1": "2026-11-15", "6a-2.4": "2026-11-15", "6a-7": "2026-11-15", "6a-2-partner": "2026-11-17", "6a-2.4-instrumente": "2026-11-18", "6a-2-sicherheit": "2026-11-20", "6a-2-konkurrenz": "2026-11-22", "6a-reserve-markt": "2026-11-27", "6a-reserve-unternehmen": "2026-11-27", "6a-2.8-f3": "2026-11-28", "6a-2.8-f4": "2026-11-28", "6a-2": "2026-11-29", "6a-2.4-stichprobe": "2026-12-03", "6a-2.8-f12": "2026-12-04", "6a-2.8": "2026-12-05", "6a-2.9": "2026-12-06", "6a-5": "2026-12-08", "6a-3": "2026-12-09", "6a-4": "2026-12-09", "6a-6-anhang": "2026-12-09", "6a-6": "2026-12-10", "6a-6-abbildungen": "2026-12-10", "6a-6-tabellen": "2026-12-10", "6b-1": "2026-12-18", "6b-2": "2026-12-18", "6b-5": "2026-12-18", "6b-3": "2027-01-08", "6b-6": "2027-01-08", "6b-7": "2027-01-15", "6b-8": "2027-02-01", "6b-4": "2027-02-05", "6b-9": "2027-02-08", "6b-10": "2027-02-10", "6b-11": "2027-02-13", "6b-12": "2027-02-13", "6b-13": "2027-02-15", "6b-14": "2027-02-15"};
const PARTS = [
  {key:'6a', name:'PA6a', title:'Analyse und Marktforschung', due:'2026-12-12'},
  {key:'6b', name:'PA6b', title:'Marketingkonzept', due:'2027-02-27'}];
const PEOPLE = ['SA', 'ES', 'MG', 'AM', 'LB'];
const STAND = {'Entwurf':'draft', 'In Prüfung':'review', 'in Prüfung':'review', 'läuft':'draft', 'fertig':'done'};
function planMerge() {
  // Kapitel, die der Empfänger nicht liefert, aus dem Kapitelplan ergänzen (nur lesen, ohne Stand und Doc).
  const have = new Set(state.chapters.map(c => c.ref));
  PLAN.forEach(([ref, owner, reader, title], i) => { if (!have.has(ref)) state.chapters.push({ref, owner, reader, title, plan:true, overview:true, due:PLAN_FRIST[ref] || PARTS[ref.startsWith('6b') ? 1 : 0].due}); });
  const order = new Map(PLAN.map((p, i) => [p[0], i]));
  state.chapters.sort((a, b) => (order.has(a.ref) ? order.get(a.ref) : 999) - (order.has(b.ref) ? order.get(b.ref) : 999) || (a.ref || '').localeCompare(b.ref || '', 'de', {numeric:true}));
}
function anatomy(ref) {
  // «6a-2.4-design» → Teil 6a, Hauptkapitel 2, Nummer leer (Unterkapitel ohne eigene Nummer), Tiefe 2.
  const m = /^(6[ab])-(?:(\d+)((?:\.\d+)*))?(?:-?(.+))?$/.exec(ref || '') || [];
  const main = m[2] || 'reserve', dots = (m[3] || '').split('.').length - 1, suffix = m[4] && m[2] ? m[4] : '';
  return {part:m[1] || '', main, number:m[2] && !suffix ? m[2] + (m[3] || '') : '', depth:m[2] ? dots + (suffix ? 1 : 0) : 0};
}
function pages(n) { return n ? String(n).replace('.', ',') + (n === 1 ? ' Seite' : ' S.') : ''; }
function initials(code, kind) {
  if (!NAMES[code]) return null;
  const label = (kind === 'reader' ? 'Gegenlesen: ' : 'Pate: ') + NAMES[code];
  return el('span', {class:'ini ' + kind + ' p-' + code, title:label}, el('span', {'aria-hidden':'true'}, code), el('span', {class:'sr'}, label));
}
function standBadge(c) {
  if (c.plan) return el('span', {class:'stand none', title:'Stand sehen Pate und Gegenleser'}, el('span', {'aria-hidden':'true'}, '–'), el('span', {class:'sr'}, 'Stand nicht sichtbar'));
  const s = c.status || 'Offen', cls = STAND[s] || 'open';
  return el('span', {class:'stand ' + cls}, s === 'fertig' ? 'Fertig' : s === 'Nicht begonnen' ? 'Offen' : s);
}
function renderLoading() {
  document.body.classList.add('choosing');
  $('tabs').hidden = true;
  $('part').textContent = 'Schreibwerk';
  $('title').textContent = 'Kapitelübersicht';
  fill($('tab-auftrag'), el('div', {class:'ov ov-loading', 'aria-busy':'true'},
    el('div', {class:'sk sk-h'}), el('div', {class:'sk sk-p'}), el('div', {class:'sk sk-p short'}),
    el('div', {class:'sk sk-card'}), el('div', {class:'sk sk-card'}), el('p', {class:'sr'}, 'Kapitel werden geladen …')));
}
function chooser() {
  planMerge();
  document.title = 'Schreibwerk · PA6';
  $('part').textContent = 'Schreibwerk';
  $('title').textContent = 'Kapitelübersicht';
  $('tabs').hidden = true;
  document.body.classList.add('choosing');
  document.body.classList.remove('kapitel');
  $('side-toggle').hidden = true; docTrouble(false); applySide();
  $('tab-auftrag').removeAttribute('role');
  fill($('pick'));
  fill($('doc'));
  const me = state.person, all = state.chapters;
  const mineOf = c => c.owner === me || c.reader === me;
  let mode = store.get('pa6-sp-filter', 'meine') === 'alle' ? 'alle' : 'meine';
  const today = new Date().toISOString().slice(0, 10);
  const late = c => !c.plan && c.due && String(c.due).slice(0, 10) < today && c.status !== 'fertig';
  const known = all.filter(c => !c.plan), complete = known.length === all.length;
  const drafted = list => list.filter(c => STAND[c.status]).length;

  // Kopf: Gesamtauftrag in einem Satz, Fortschritt, Abgaben, Team.
  const seg = el('div', {class:'seg', role:'group', 'aria-label':'Welche Kapitel zeigen'});
  const segBtn = (value, label) => el('button', {type:'button', 'data-mode':value, 'aria-pressed':String(mode === value), onclick:() => setMode(value)}, label);
  seg.append(segBtn('meine', 'Meine'), segBtn('alle', 'Alle'));
  const progressBase = complete ? all : known.filter(mineOf);
  const n = progressBase.length, d = progressBase.filter(c => STAND[c.status] === 'done').length;
  const bar = el('div', {class:'prog', 'aria-hidden':'true'});
  ['done', 'review'].forEach(k => { const part = progressBase.filter(c => STAND[c.status] === k).length; if (part) { const s = el('span', {class:k}); s.style.width = (part / Math.max(n, 1) * 100) + '%'; bar.append(s); } });
  const count = (code, role) => all.filter(c => c[role] === code).length;
  const hero = el('header', {class:'ov-hero'},
    el('p', {class:'ov-eyebrow'}, 'PA6 · Praxisauftrag Yuh'),
    el('h2', {class:'ov-h'}, 'Ein Bericht in zwei Teilen'),
    el('p', {class:'ov-lede'}, 'Yuh fragt, wie bekannt sein Schweizer Kundendienst ist und wie er wirkt. In der PA6a untersuchen wir das mit Umfrage, Servicetest und Bewertungen, in der PA6b machen wir daraus ein Marketingkonzept mit einer ausgearbeiteten Massnahme.'),
    el('div', {class:'ov-facts'},
      el('div', {class:'fact wide'}, el('p', {class:'fk'}, complete ? 'Fortschritt' : 'Deine Kapitel'),
        el('p', {class:'fv'}, n ? d + ' von ' + n + (complete ? ' Kapiteln fertig' : ' fertig') : 'Noch kein Kapitel zugeteilt'), bar,
        n ? el('p', {class:'prog-key'}, [['done', 'Fertig'], ['review', 'In Prüfung'], ['draft', 'Entwurf']].map(([k, label]) => el('span', {class:'pk ' + k}, label + ' ' + progressBase.filter(c => STAND[c.status] === k).length))) : null),
      PARTS.map(p => el('div', {class:'fact'}, el('p', {class:'fk'}, 'Abgabe ' + p.name), el('p', {class:'fv'}, day(p.due))))),
    el('ul', {class:'team', 'aria-label':'Team'}, PEOPLE.map(code => el('li', {class:code === me ? 'me' : null},
      el('span', {class:'ini owner p-' + code, 'aria-hidden':'true'}, code), el('span', {class:'tn'}, NAMES[code] + (code === me ? ' (du)' : '')),
      el('span', {class:'tc', 'aria-hidden':'true'}, count(code, 'owner') + ' · ' + count(code, 'reader')),
      el('span', {class:'sr'}, ', schreibt ' + count(code, 'owner') + ', liest ' + count(code, 'reader') + ' gegen')))),
    el('p', {class:'legend'}, el('span', {class:'lg'}, el('span', {class:'ini owner p-legend', 'aria-hidden':'true'}, 'AB'), 'schreibt'),
      el('span', {class:'lg'}, el('span', {class:'ini reader p-legend', 'aria-hidden':'true'}, 'AB'), 'liest gegen'),
      el('span', {class:'lg'}, 'Die Zahlen beim Namen zählen beides.')));
  const bodyBox = el('div', {class:'ov-body'});
  const toolbar = el('div', {class:'ov-tools'}, seg, el('p', {class:'ov-count', 'aria-live':'polite'}));
  fill($('tab-auftrag'), el('div', {class:'ov'}, hero, toolbar, bodyBox));

  function row(c, context) {
    const a = anatomy(c.ref), g = state.guide[c.ref] || {}, role = c.owner === me ? 'Du schreibst' : c.reader === me ? 'Du liest gegen' : '';
    const sentence = g.kurz || '';
    return el('li', {class:'r d' + Math.min(a.depth, 2) + (context ? ' ctx' : '') + (role ? ' mine' : '')},
      el('a', {href:'?k=' + encodeURIComponent(c.ref) + (DEMO ? '&demo' : ''), title:c.ref},
        el('span', {class:'num'}, a.number),
        el('span', {class:'main'},
          el('span', {class:'tt'}, c.title || g.titel || c.ref, role ? el('span', {class:'role ' + (c.owner === me ? 'w' : 'l')}, role) : null),
          sentence && !context ? el('span', {class:'sum'}, sentence) : null),
        el('span', {class:'meta'},
          el('span', {class:'pg'}, g.seiten ? el('span', {}, el('span', {class:'sr'}, 'Umfang '), pages(g.seiten)) : el('span', {class:'dim', 'aria-hidden':'true'}, '–')),
          el('span', {class:'due' + (late(c) ? ' late' : '')}, c.due ? [el('span', {class:'sr'}, 'Frist '), day(c.due), late(c) ? el('small', {}, 'überfällig') : null] : '–'),
          standBadge(c),
          el('span', {class:'who'}, initials(c.owner, 'owner'), initials(c.reader, 'reader'))),
        el('span', {class:'go', 'aria-hidden':'true'}, '›')));
  }
  function draw() {
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    const visible = mode === 'alle' ? all : all.filter(mineOf);
    toolbar.lastChild.textContent = mode === 'alle' ? all.length + ' Kapitel' : visible.length === 1 ? '1 Kapitel mit dir' : visible.length + ' Kapitel mit dir';
    if (!visible.length) {
      fill(bodyBox, el('div', {class:'ov-empty'}, el('p', {class:'big'}, 'Dir ist noch kein Kapitel zugeteilt.'),
        el('p', {class:'quiet'}, 'Unter «Alle» siehst du, wer welches Kapitel schreibt.'),
        el('button', {type:'button', class:'btn ghost', onclick:() => setMode('alle')}, 'Alle Kapitel zeigen')));
      return;
    }
    const sections = PARTS.map(p => {
      const inPart = all.filter(c => (c.ref || '').startsWith(p.key + '-'));
      const shown = inPart.filter(c => visible.includes(c));
      if (!shown.length) return null;
      const groups = new Map();
      inPart.forEach(c => { const k = anatomy(c.ref).main; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
      const sum = inPart.reduce((s, c) => s + ((state.guide[c.ref] || {}).seiten || 0), 0);
      const cards = [...groups.entries()].map(([k, rows]) => {
        const vis = rows.filter(c => visible.includes(c));
        if (!vis.length) return null;
        const head = rows[0], items = vis.map(c => row(c, false));
        if (!vis.includes(head) && anatomy(head.ref).depth === 0 && k !== 'reserve') items.unshift(row(head, true));
        return el('section', {class:'grp', 'aria-label':k === 'reserve' ? 'Reserve' : 'Kapitel ' + k},
          k === 'reserve' ? el('p', {class:'grp-k'}, 'Reserve') : null, el('ul', {class:'rows'}, items));
      });
      return el('section', {class:'part', 'aria-labelledby':'part-' + p.key},
        el('div', {class:'part-head'},
          el('h3', {id:'part-' + p.key}, el('span', {class:'pn'}, p.name), p.title),
          el('p', {class:'part-meta'}, 'Abgabe ' + day(p.due) + ' · rund ' + String(sum).replace('.', ',') + ' Seiten · ' + inPart.length + ' Kapitel')),
        el('div', {class:'cols', 'aria-hidden':'true'}, el('span', {}, 'Kapitel'), el('span', {}, 'Umfang'), el('span', {}, 'Frist'), el('span', {}, 'Stand'), el('span', {}, 'Team')),
        cards);
    });
    fill(bodyBox, sections, !complete && mode === 'alle' ? el('p', {class:'quiet foot'}, 'Stand und Doc siehst du bei deinen eigenen Kapiteln. Die übrigen Kapitel kannst du öffnen und den Auftrag lesen.') : null);
  }
  function setMode(m) { mode = m; store.set('pa6-sp-filter', m); draw(); announce(m === 'alle' ? 'Alle Kapitel' : 'Deine Kapitel'); }
  draw();
}
// ---------- Darstellung ----------
function schreibZeitKontext(c) {
  let aufgabe = 'Kapitel ' + c.ref;
  if (c.owner === state.person) aufgabe = 'Kapitel ' + c.ref + ' schreiben';
  else if (c.reader === state.person) aufgabe = 'Kapitel ' + c.ref + ' gegenlesen';
  let paket = '';
  if (String(c.ref || '').startsWith('6a')) paket = 'AP-006';
  else if (String(c.ref || '').startsWith('6b')) {
    const row = (state.tasks || []).find(item => item.deliverable === 'pa6b_bericht' && item.owner === state.person);
    paket = row?.ref || '';
  }
  return {aufgabe, paket};
}
// ---------- Kapitelmenü (statt nativer Auswahl): gleiche Kapitel wie bisher, nach Frist sortiert, mit Tastatur bedienbar ----------
function renderMenu(c) {
  const me = state.person, box = $('pick');
  const list = state.chapters.filter(x => state.lead || me === 'SA' || x.owner === me || x.reader === me);
  if (list.length < 2) { fill(box); return; }
  const byDue = (x, y) => String(x.due || '9999').localeCompare(String(y.due || '9999')) || (x.ref || '').localeCompare(y.ref || '', 'de', {numeric:true});
  const groups = [
    ['Deine Kapitel', list.filter(x => x.owner === me)],
    ['Du liest gegen', list.filter(x => x.reader === me && x.owner !== me)],
    ['Weitere Kapitel', list.filter(x => x.owner !== me && x.reader !== me)]].filter(([, xs]) => xs.length);
  const btn = el('button', {type:'button', class:'pick-btn', id:'pick-btn', 'aria-haspopup':'true', 'aria-expanded':'false', 'aria-controls':'pick-menu'},
    el('span', {class:'pb-l'}, 'Kapitel wechseln'), el('span', {class:'pb-s'}, 'Wechseln'), el('span', {class:'chev', 'aria-hidden':'true'}));
  const item = x => {
    const an = anatomy(x.ref), cur = x.ref === c.ref, g = state.guide[x.ref] || {};
    return el('a', {role:'menuitem', class:'mi-row' + (cur ? ' cur' : ''), href:'?k=' + encodeURIComponent(x.ref) + (DEMO ? '&demo' : ''), 'aria-current':cur ? 'page' : null, tabindex:'-1'},
      el('span', {class:'mi-num'}, an.number || '–'),
      el('span', {class:'mi-main'}, el('span', {class:'mi-t'}, x.title || g.titel || x.ref),
        el('span', {class:'mi-s'}, (x.ref.startsWith('6b') ? 'PA6b' : 'PA6a') + (x.due ? ' · Frist ' + day(x.due) : '') + (STAND[x.status] ? ' · ' + (x.status === 'fertig' ? 'Fertig' : x.status) : ''))),
      cur ? el('span', {class:'mi-cur'}, el('span', {class:'sr'}, 'aktuell')) : null);
  };
  const menu = el('div', {class:'pick-menu', id:'pick-menu', role:'menu', 'aria-label':'Kapitel wechseln', hidden:true},
    el('p', {class:'pm-h', 'aria-hidden':'true'}, 'Kapitel wechseln'),
    groups.map(([name, xs], i) => el('div', {role:'group', 'aria-labelledby':'pm-g' + i, class:'pm-g'},
      el('p', {class:'pm-gh', id:'pm-g' + i}, name), xs.sort(byDue).map(item))),
    el('a', {role:'menuitem', class:'pm-all', href:'./' + (DEMO ? '?demo' : ''), tabindex:'-1'}, 'Alle Kapitel im Überblick', el('span', {'aria-hidden':'true'}, ' ›')));
  const scrim = el('div', {class:'pick-scrim', hidden:true, onclick:() => close(false)});
  const items = () => [...menu.querySelectorAll('[role=menuitem]')];
  function open(focusLast) {
    menu.hidden = false; scrim.hidden = false; btn.setAttribute('aria-expanded', 'true'); document.body.classList.add('menu-open');
    const all = items(), start = focusLast ? all[all.length - 1] : menu.querySelector('.cur') || all[0];
    start.focus({preventScroll:true}); start.scrollIntoView({block:'nearest'});
  }
  function close(refocus) {
    if (menu.hidden) return;
    menu.hidden = true; scrim.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.body.classList.remove('menu-open');
    if (refocus) btn.focus();
  }
  btn.addEventListener('click', () => menu.hidden ? open(false) : close(true));
  btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(e.key === 'ArrowUp'); } });
  menu.addEventListener('keydown', e => {
    const all = items(), i = all.indexOf(document.activeElement);
    const go = n => { const t = all[(n + all.length) % all.length]; t.focus(); t.scrollIntoView({block:'nearest'}); };
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(all.length - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
    else if (e.key === ' ' && document.activeElement.matches('a')) { e.preventDefault(); document.activeElement.click(); }
  });
  menu.addEventListener('focusout', e => { if (!box.contains(e.relatedTarget) && e.relatedTarget) close(false); });
  fill(box, btn, scrim, menu);
}
document.addEventListener('pointerdown', e => {
  const box = $('pick'), menu = $('pick-menu');
  if (menu && !menu.hidden && !box.contains(e.target)) { menu.hidden = true; box.querySelector('.pick-scrim').hidden = true; $('pick-btn').setAttribute('aria-expanded', 'false'); document.body.classList.remove('menu-open'); }
});
function renderAll() {
  const c = state.chapter, g = state.guide[c.ref] || {};
  document.title = c.ref + ' · Schreibplatz';
  document.body.classList.add('kapitel');
  $('tabs').hidden = false;
  $('tab-auftrag').setAttribute('role', 'tabpanel');
  const a = anatomy(c.ref), part = c.ref.startsWith('6b') ? 'PA6b' : 'PA6a';
  const label = a.number ? 'Kapitel ' + a.number : a.main === 'reserve' ? 'Reserve' : 'Kapitel ' + a.main + ' · Unterkapitel';
  fill($('part'), el('a', {class:'crumb', href:'./' + (DEMO ? '?demo' : '')}, el('span', {'aria-hidden':'true'}, '‹ '), 'Schreibwerk'), el('span', {class:'sep', 'aria-hidden':'true'}, '/'), part + ' · ' + label);
  $('title').textContent = g.titel || c.title;
  // Eine ruhige Metazeile statt gleichgewichteter Chips: Rolle, Frist, Umfang, Stand, Mitschreibende.
  const today = new Date().toISOString().slice(0, 10), late = c.due && String(c.due).slice(0, 10) < today && c.status !== 'fertig';
  const other = c.owner === state.person ? [c.reader, 'liest gegen', 'reader'] : c.reader === state.person ? [c.owner, 'schreibt', 'owner'] : null;
  const dot = () => el('span', {class:'dot', 'aria-hidden':'true'}, '·');
  fill($('meta'),
    el('span', {class:'role-pill ' + (c.owner === state.person ? 'w' : c.reader === state.person ? 'l' : 'o')}, roleOf(c)),
    c.due ? el('span', {class:'mi' + (late ? ' late' : '')}, 'Frist ' + day(c.due), late ? el('b', {}, ' überfällig') : null) : null,
    g.seiten ? [dot(), el('span', {class:'mi'}, 'rund ' + String(g.seiten).replace('.', ',') + (g.seiten === 1 ? ' Seite' : ' Seiten'))] : null,
    c.plan ? null : [dot(), standBadge(c)],
    other && NAMES[other[0]] ? [dot(), el('span', {class:'mi person'}, initials(other[0], other[2]), el('span', {'aria-hidden':'true'}, NAMES[other[0]] + ' ' + other[1]))] : null,
    !other ? [dot(), el('span', {class:'mi person'}, initials(c.owner, 'owner'), initials(c.reader, 'reader'), el('span', {'aria-hidden':'true'}, [NAMES[c.owner], NAMES[c.reader]].filter(Boolean).join(' und ')))] : null);
  // Zeitleiste entfernt (Salah 03.11.): Zeit wird mit dem Auftrag erfasst, nicht separat im Schreibplatz.
  renderMenu(c);
  $('side-toggle').hidden = false;
  renderAuftrag(c, g); renderInfos(g); renderRegeln(g); renderHilfe(c, g); renderDoc(c);
  applySide();
  setTab(store.get('pa6-sp-tab', 'auftrag'));
}
function block(title, ...kids) { return card(title, '', ...kids); }
function card(title, cls, ...kids) { const body = kids.flat().filter(Boolean); return body.length ? el('section', {class:'card' + (cls ? ' ' + cls : '')}, title ? el('h2', {class:'card-h'}, title) : null, body) : null; }
// Quellen einheitlich als kleiner Link «Quelle», der die Fundstelle aufklappt (Salah 03.11.2026).
function sourceTag(t) {
  if (!t) return null;
  const s = el('span', {class:'src', hidden:true}, t);
  const b = el('button', {type:'button', class:'src-btn', 'aria-expanded':'false', onclick:e => { e.preventDefault(); e.stopPropagation(); const zu = s.hidden; s.hidden = !zu; b.setAttribute('aria-expanded', String(zu)); }}, 'Quelle');
  return el('span', {class:'src-wrap'}, b, s);
}

// Messung (03.11.2026): jede Aktion im Schreibweg geht als Ereignis ins Blatt «Schreibweg». Nie blockierend, nie im Demo.
function track(aktion, schritt, wert) {
  if (DEMO || viewing() || !state.key || !state.chapter) return;
  post({typ:'schreibweg', k:state.key, kapitel:state.chapter.ref, schritt, aktion, wert}, 15000).then(r => {
    if (r && r.ok === false) track.still = (track.still || []).concat([{kapitel:state.chapter.ref, aktion, fehler:String(r.fehler || 'abgelehnt')}]);
  }).catch(() => {});
}
function chapterFrom(status) {
  const s = status || '';
  if (s === 'Abgezeichnet' || s === 'fertig' || s === 'erledigt') return 'fertig';
  if (s === 'In Prüfung' || s === 'in Prüfung') return 'in Prüfung';
  if (s === 'Entwurf' || s === 'läuft') return 'läuft';
  if (!s || s === 'Nicht begonnen' || s === 'Offen' || s === 'offen' || s === 'geplant') return 'offen';
  return s;
}
function newVorgang() {
  try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return (Date.now().toString(16) + '00000000').slice(0, 32);
}
async function handover(c) {
  if (viewing() || DEMO) return;
  if (!c || !c.id || c.plan || c.owner !== state.person) { announce('Dieses Kapitel meldest du aus deinem eigenen Zugang.'); return; }
  const from = chapterFrom(c.status);
  if (from === 'in Prüfung' || from === 'fertig') { announce(from === 'fertig' ? 'Das Kapitel ist schon fertig.' : 'Das Kapitel ist schon in der Prüfung.'); return; }
  if (from !== 'offen' && from !== 'läuft') { announce('Der Stand lässt sich so nicht übergeben.'); return; }
  if (!window.PA6Zeit) { announce('Die Zeiterfassung ist nicht geladen. Lade die Seite neu.'); return; }
  const spot = document.getElementById('zeit-uebergabe') || el('div', {id:'zeit-uebergabe'});
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent === 'Zur Prüfung geben');
  if (!spot.parentNode) (btn && btn.parentNode ? btn.parentNode : $('tab-auftrag')).append(spot);
  const lead = state.person === 'SA' && state.lead === true;
  // Eine Buchungskennung je Abschlussversuch: ein erneuter Abschluss nach Rückgabe legt eine neue Zeile an und ersetzt keine frühere Zeit.
  const buchung = 'abschluss-' + String(c.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 56) + '-' + newVorgang().replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
  // Zeitbuchung und Storno brauchen wie jede Schreibanfrage den persönlichen Zugang.
  const saveZeit = async body => {
    const saved = await post(Object.assign({}, body, {k: state.key}));
    if (!saved || saved.ok === false) throw Error((saved && saved.fehler) || 'Nicht gespeichert.');
    return saved;
  };
  PA6Zeit.closureMount(spot, {
    person: state.person,
    aufgabe: (c.ref ? c.ref + ' · ' : '') + (c.title || 'Kapitel'),
    paket: '',
    id: /^[a-zA-Z0-9_-]{16,80}$/.test(buchung) ? buchung : '',
    quelle: 'schreibplatz',
    ref: c.ref || '',
    save: saveZeit,
    onCancel: () => { spot.replaceChildren(); },
    onDone: async info => {
      try {
        const r = await post({typ:'status', k:state.key, leitung:lead, id:c.id, from, to:'In Prüfung'});
        if (!r || r.ok === false || (r.status !== 'In Prüfung' && r.status !== 'in Prüfung')) throw Error((r && r.fehler) || 'Nicht gemeldet.');
        const weg = await post({typ:'auftragsweg', k:state.key, leitung:lead, id:c.id, ref:c.ref || '', quelle:'chapters', aktion:'fertig_gemeldet', wert:'', vorgang:newVorgang()});
        if (!weg || weg.ok === false) throw Error((weg && weg.fehler) || 'Die Fertigmeldung wurde nicht gezählt.');
        c.status = 'In Prüfung';
        announce('Zur Prüfung gemeldet. Salah schaut es sich an.');
        renderAll();
      } catch (e) {
        try { await saveZeit({typ:'projekt_save', formular:'arbeitszeit', id:info.id, felder:Object.assign({}, info.felder, {storniert:'ja'})}); } catch (ignore) {}
        announce(e.message || 'Nicht gemeldet.');
      }
    }
  });
}
// Schreibweg (Salah 03.11.2026, Seitenleiste neu 05.11.2026): ein Schritt im Fokus, ein Satz, ein Knopf.
// Erledigte Schritte klappen zu, der Rest ist einen Tipp entfernt. «Weiter» lässt den Haken einrasten und öffnet dann den nächsten Schritt.
// Inhalte nur aus auftraege.json (aus Konzept PA6, Merkmalblatt und Raster). Stand je Kapitel im Browser, Messung wie bisher.
// Offizielle Kriterien des Bewertungsrasters (Konzept PA6), damit das Ziel zeigt, wofür es Punkte gibt.
const RASTER = {R1:'Ausgangslage, Formulierung Marktforschungsauftrag und Forschungsdesign', R2:'Erhebungsinstrument', R3:'Stichprobe', R4:'Auswertung der Daten',
  R5:'Interpretation der Daten', R6:'Niveau der Umsetzung', R7:'Reflexion der Arbeit und Ausblick', R8:'Grafische Gestaltung', R9:'Sprachliche Richtigkeit und Verständlichkeit',
  B1:'Analyse', B2:'Ziele ökonomisch', B3:'Ziele vorökonomisch', B4:'Strategieansatz', B5:'Massnahme', B6:'Massnahmen Kreativität', B7:'Terminplan (fachlich)',
  B8:'Umsetzbarkeit und Kontrolle', B9:'Budget', B10:'Nachhaltigkeit', B11:'Reflexion der Arbeit', B12:'Sprachliche Richtigkeit', B13:'Quellenarbeit', B14:'Grafische Gestaltung',
  C7:'Stakeholder Analyse', C8:'Initiale Risiko Map'};
// Seite der Kriterien im Konzept PA6 (Bewertungsraster), für den Hinweis auf den Wortlaut im Original.
const RASTER_SEITE = {R1:5, R2:6, R3:6, R4:6, R5:7, R6:7, R7:7, R8:8, R9:9, B1:14, B2:14, B3:15, B4:15, B5:15, B6:16, B7:16, B8:16, B9:17, B10:17, B11:17, B12:18, B13:18, B14:19, C7:22, C8:22};
const RASTER_TEIL = code => code[0] === 'R' ? 'PA6a Marketing' : code[0] === 'B' ? 'PA6b Marketing' : 'PA6b Projektmanagement';
// Quellen öffentlich zeigen (05.11.2026): nur Schulunterlagen, Unterricht und veröffentlichte Standards.
// Interne Arbeitspapiere der Gruppe erscheinen nicht; Verweise auf die Fachregeln werden zur Fundstelle im Unterricht.
const FACHREGEL = {"A1": "Marketing-Unterricht, Deck 2 Analyse, Folie 3", "A2": "Marketing-Unterricht, Deck 2 Analyse, Folie 4", "A3": "Marketing-Unterricht, Deck 2 Analyse, Folie 5", "A4": "Marketing-Unterricht, Deck 2 Analyse, Folien 6, 7, 12 bis 15", "A5": "Marketing-Unterricht, Deck 2 Analyse, Folie 10", "A6": "Marketing-Unterricht, Deck 2 Analyse, Folie 16", "A7": "Marketing-Unterricht, Deck 2 Analyse, Folien 18 bis 23", "A8": "Marketing-Unterricht, Deck 2 Analyse, Folien 24, 25", "A9": "Marketing-Unterricht, Deck 2 Analyse, Folien 26, 27", "A10": "Marketing-Unterricht, Deck 2 Analyse, Folie 28", "A11": "Marketing-Unterricht, Deck 2 Analyse, Folien 29 bis 31", "A12": "Marketing-Unterricht, Deck 2 Analyse, Folie 32", "A13": "Marketing-Unterricht, Deck 2 Analyse, Folie 33", "A14": "Marketing-Unterricht, Deck 2 Analyse, Folie 35", "A15": "Marketing-Unterricht, Deck 2 Analyse, Folie 36", "A16": "Marketing-Unterricht, Deck 2 Analyse, Folie 37", "A17": "Marketing-Unterricht, Deck 2 Analyse, Folie 38", "G2": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folie 24", "G4": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folie 27", "G6": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folie 31", "G7": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folie 20", "G9": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folien 16, 39, 40", "G10": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folie 44", "G11": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folien 41 bis 50", "G12": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folie 17", "G13": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folie 19", "G14": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folien 34, 36", "G15": "Marketing-Unterricht, Deck 1 Marketing-Grundlagen, Folie 14", "R1": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 4", "R2": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 12", "R3": "Marketing-Unterricht, Skript 2a Marktforschung, Folien 13, 19", "R5": "Marketing-Unterricht, Skript 2a Marktforschung, Folien 15, 22", "R7": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 23", "R8": "Marketing-Unterricht, Skript 2a Marktforschung, Folien 24, 25", "R9": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 17", "R10": "Marketing-Unterricht, Skript 2a Marktforschung, Folien 38, 39", "R11": "Marketing-Unterricht, Skript 2a Marktforschung, Folien 26, 27, 28", "R13": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 30", "R14": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 35", "R15": "Marketing-Unterricht, Skript 2a Marktforschung, Folien 36, 37", "R16": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 41", "R18": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 43", "R19": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 44", "R22": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 47", "R23": "Marketing-Unterricht, Skript 2a Marktforschung, Folie 5", "X1": "MRS Mystery Shopping Research Guidelines, Oktober 2011 (Datei 2013), Regel B44", "X2": "MRS 2011, Teil B Guidelines 1 und 2; ESOMAR Mystery Shopping Studies 2005, Abschnitte d und e", "X3": "MRS 2011, Teil B Guideline 3", "X4": "MRS 2011, Teil B Guidelines 4 und 5; ESOMAR 2005 Abschnitte f und g", "X5": "MRS 2011, Regel B46", "X6": "ESOMAR/GRBN Guideline for Online Research 2015, Abschnitte 3.2 bis 3.4", "X7": "MSPA EA Guidelines 2023, Abschnitte 4.1 und 4.2", "X8": "Blick, 28.04.2026", "X9": "Trustpilot, Terms of Use for Consumers, Version 8.0, gültig ab 01.10.2026, Abschnitte 4 und 6", "X10": "ESOMAR Guideline on Social Media Research, Juli 2011, Abschnitte 2.2, 2.3, 2.4", "X11": "Cohen, J. (1960). A coefficient of agreement for nominal scales. Educational and Psychological Measurement, 20(1), 37 bis 46; Landis, J. R. und Koch, G. G. (1977). The measurement of observer agreement for categorical data. Biometrics, 33(1), 159 bis 174", "X12": "Apple, Nutzungsbedingungen der Apple Media Services, Schweiz, Stand 14.09.2026, Abschnitt F", "X13": "Google, Nutzungsbedingungen, wirksam ab 30.07.2026, Abschnitte «Sie missbrauchen unsere Dienste nicht», «Andere Inhalte»"};
function fachregeln(text) {
  const codes = [];
  String(text).replace(/\([^)]*\)/g, '').replace(/\b([RAGX])(\d+)(?: bis [RAGX](\d+))?/g, (_, a, b, c) => { for (let i = +b; i <= (c ? +c : +b); i += 1) codes.push(a + i); return ''; });
  return codes.map(c => FACHREGEL[c]).filter(Boolean);
}
function publicSource(q) {
  if (!q) return null;
  const out = [];
  for (const raw of String(q).split(';')) {
    const part = raw.trim();
    if (!part) continue;
    if (/^(Konzept PA6|Merkmalblatt 6[ab]|Formale Vorschriften|Yuh-Praxisauftrag|Praxisauftrag|Auftrag PA6|WIAR Block|Wissenschaftlich schreiben)/.test(part)) out.push(part);
    else if (/^Kap\. \d/.test(part) && out.length && /^Formale Vorschriften/.test(out[out.length - 1])) out.push('Formale Vorschriften HFW 2025, ' + part);
    else if (/^Fachregel/.test(part)) out.push(...fachregeln(part.replace(/^Fachregeln?/, '')));
    else if (/Fachregel [RAGX]\d/.test(part)) out.push(...fachregeln(part.split(/Fachregel/)[1]));
    else if (/WIAR \(Block (\d+), Folie (\d+)\)/.test(part)) out.push(part.replace(/^.*WIAR \(Block (\d+), Folie (\d+)\).*$/, 'WIAR Block $1, Folie $2'));
    else if (/^Raster Terminplan/.test(part)) out.push('Konzept PA6, S. 16 (Raster Terminplan (fachlich))');
    else if (/^Raster-Checkliste A5/.test(part)) out.push('Vorlage SWOT aus dem Marketing-Unterricht');
  }
  const uniq = [...new Set(out)];
  return uniq.length ? uniq.join(' · ') : 'Arbeitsgrundlage der Gruppe, abgeleitet aus dem Auftrag';
}
function more(label, ...kids) { const body = kids.flat().filter(Boolean); return body.length ? el('details', {class:'w-more'}, el('summary', {}, label), el('div', {}, body)) : null; }
function renderAuftrag(c, g) {
  const reading = c.reader === state.person && c.owner !== state.person;
  const wegKey = 'pa6-sp-weg:' + c.ref, checksKey = 'pa6-sp-muss:' + c.ref, teileKey = 'pa6-sp-teile:' + c.ref;
  const weg = store.get(wegKey, {done:{}, open:null}), done = store.get(checksKey, {}), teile = store.get(teileKey, {});
  const fragen = g.fragen || [], glied = g.gliederung || [], raster = g.raster || [];
  // «Fertig, wenn …»: Pflichtpunkte aus Konzept und Merkmalblatt, danach die Form (APA in diesem Kapitel, Abbildungen nach Vorschrift).
  const wiarBild = state.wiar && (state.wiar.regeln || []).find(r => /Abbildungen/.test(r.thema || ''));
  const form = (g.apa || []).map(x => ({punkt:x, quelle:null, form:true}))
    .concat(wiarBild && wiarBild.pruefen ? [{punkt:wiarBild.pruefen, quelle:(state.wiar.quelle ? state.wiar.quelle + ', ' : '') + (wiarBild.seite ? 'S. ' + wiarBild.seite : wiarBild.quelle || ''), form:true}] : []);
  const muss = (g.muss || []).concat(form);
    const gegen = c.reader ? (NAMES[c.reader] || c.reader) : '';
  const autor = c.owner ? (NAMES[c.owner] || c.owner) : '';
  const auftrag = g.kurz || (c.Was && c.Was !== 'noch offen' ? c.Was : 'Der genaue Auftrag für dieses Kapitel wird gerade ergänzt.');
  const umfang = g.seiten ? 'rund ' + String(g.seiten).replace('.', ',') + (g.seiten === 1 ? ' Seite' : ' Seiten') : '';
  const check = (store_, key, i, text, quelle, onchange) => {
    const id = key + i, input = el('input', {type:'checkbox', id, disabled:viewing() ? true : null});
    input.checked = !!store_[i];
    input.addEventListener('change', () => { if (viewing()) { input.checked = !!store_[i]; return; } store_[i] = input.checked; onchange(); track(input.checked ? 'haken' : 'haken_weg', key === 'teil' ? 'schreiben' : 'pruefen', key + i); });
    return el('li', {}, input, el('label', {for:id}, el('span', {class:'lt'}, text, sourceTag(quelle))));
  };
  const linkBtn = (text, onclick) => el('button', {type:'button', class:'w-link', onclick}, text, el('span', {'aria-hidden':'true'}, ' ›'));
  // Rasterkriterien der ganzen Arbeit, die dieses Kapitel betreffen: Name, Teil, Höchstpunkte, eine als Zusammenfassung gekennzeichnete Höchststufe.
  // Keine Kapitelsumme: die Punkte gelten für die ganze Arbeit. Der Wortlaut steht im Original, die Quelle nennt die Seite.
  const punkte = list => el('ul', {class:'w-pts'}, list.map(r => el('li', {},
    el('span', {class:'w-pts-k'}, el('b', {}, RASTER[r.code] || r.code), el('span', {class:'w-pts-n'}, 'max. ' + r.punkte + ' P.')),
    el('span', {class:'w-pts-p'}, RASTER_TEIL(r.code)),
    el('span', {class:'w-pts-t'}, el('span', {class:'w-pts-z'}, 'Zusammenfassung: '), r.volle_punkte_wenn),
    sourceTag('Wortlaut im Original: Konzept PA6, Bewertungsraster' + (RASTER_SEITE[r.code] ? ', S. ' + RASTER_SEITE[r.code] : '') + ', Kriterium «' + (RASTER[r.code] || r.code) + '», höchste Stufe'))));

  const steps = [];
  steps.push({id:'ziel', t:'Ziel verstehen', s:raster.length ? 'Worum es geht und worauf das Raster achtet' : 'Worum es geht', body:() => [
    el('p', {class:'w-lead'}, auftrag),
    raster.length ? el('div', {class:'w-sub'}, el('h3', {}, 'Darauf achtet das Raster'),
      el('p', {class:'w-pts-note'}, 'Die Punkte gelten für die ganze Arbeit, nicht nur für dieses Kapitel. Welche Kriterien hierher gehören, ist eine Arbeitshilfe der Gruppe.'),
      punkte(raster.slice(0, 3)),
      raster.length > 3 ? more('Noch ' + (raster.length - 3) + (raster.length - 3 === 1 ? ' Kriterium' : ' Kriterien'), punkte(raster.slice(3))) : null) : null,
    fragen.length ? more((reading ? 'Diese Fragen muss der Text beantworten' : 'Diese Fragen beantwortet dein Text') + ' (' + fragen.length + ')', el('ol', {class:'qs'}, fragen.map(q => el('li', {}, q)))) : null,
    g.daten_ab ? el('p', {class:'note'}, 'Die Daten kommen ab ' + g.daten_ab + '. Bis dahin schreibst du Aufbau und Methode, noch keine Ergebnisse.') : null]});
  if (!reading) {
    // Material: nur was dieses Kapitel braucht, je mit «Quelle». Interne Ablagen bleiben weg.
    // Interne Ablagen erscheinen nicht. Dazu die Stellen aus den Vorgaben der Schule, die für dieses Kapitel gelten.
    const intern = wo => /notion/i.test(wo || '');
    const schule = [...new Set((g.muss || []).flatMap(m => String(m.quelle || '').split(';')).map(x => x.trim())
      .filter(x => /^(Konzept PA6|Merkmalblatt 6[ab]|Yuh-Praxisauftrag|Praxisauftrag|Auftrag PA6|Formale Vorschriften)/.test(x)))];
    const material = (g.infos || []).filter(i => !intern(i.wo))
      .map(i => ({titel:i.titel, inhalt:i.inhalt, quelle:intern(i.wo) ? null : i.wo, link:i.link}))
      .concat(schule.length ? [{titel:'Vorgaben der Schule', inhalt:'Diese Stellen gelten für dein Kapitel. Lies sie im Original nach.', quelle:schule.join(' · ')}] : []);
    steps.push({id:'material', t:'Material holen', s:'Was du für dieses Kapitel brauchst', body:() => [
      el('p', {}, 'Leg dir das bereit, bevor du schreibst. Zahlen nur aus Quellen, die du angeben kannst.'),
      material.length ? el('ul', {class:'w-infos'}, material.map(i => el('li', {}, el('b', {}, i.titel), i.inhalt ? el('span', {class:'w-infos-t'}, i.inhalt) : null, el('span', {class:'w-infos-a'}, safeLink(i.link), sourceTag(i.quelle))))) : el('p', {class:'quiet'}, 'Für dieses Kapitel ist noch kein Material eingetragen.'),
      g.daten_ab ? el('p', {class:'note'}, 'Die eigenen Daten kommen ab ' + g.daten_ab + '.') : null]});
    steps.push({id:'geruest', t:'Gerüst ins Doc', s:glied.length ? glied.length + ' Zwischentitel laut Vorgabe' : 'Aufbau laut Vorgabe', body:() => [
      el('p', {}, 'Kopier die Zwischentitel ins Doc. So weisst du beim Schreiben immer, wo du bist.'),
      glied.length ? el('ol', {class:'steps'}, glied.map(x => el('li', {}, x))) : el('p', {class:'quiet'}, 'Der Aufbau wird gerade ergänzt.'),
      glied.length ? copyBtnWide(glied.join('\n'), 'Gliederung kopieren') : null]});
    const teilListe = el('ul', {class:'checks'});
    const teilZahl = el('span', {class:'w-count'});
    const teilStand = () => { const n = glied.filter((_, i) => teile[i]).length; teilZahl.textContent = n + ' von ' + glied.length; store.set(teileKey, teile); kopf(); };
    fill(teilListe, glied.map((x, i) => check(teile, 'teil', i, x, null, teilStand)));
    steps.push({id:'schreiben', t:'Abschnitt für Abschnitt schreiben', s:umfang ? 'Ziel: ' + umfang : 'Hak jeden Abschnitt ab, sobald er steht', progress:() => glied.length ? [glied.filter((_, i) => teile[i]).length, glied.length] : null, body:() => [
      el('p', {}, 'Schreib einen Abschnitt nach dem anderen, in ganzen Sätzen. Jede fremde Aussage bekommt sofort ihren Beleg (Autor, Jahr).'),
      umfang ? el('p', {class:'w-goal'}, el('span', {}, 'Umfang'), el('b', {}, umfang)) : null,
      glied.length ? el('div', {class:'w-sub'}, el('div', {class:'row'}, el('h3', {}, 'Geschrieben'), teilZahl), teilListe) : null,
      linkBtn('Stichworte von der Schreibhilfe', () => { track('hilfe', 'schreiben'); setTab('hilfe'); state.askHilfe && state.askHilfe('Schlag mir eine Gliederung in Stichworten vor.'); })], after:teilStand});
  }
  const mussListe = el('ul', {class:'checks'}), mussZahl = el('span', {class:'w-count'});
  const mussStand = () => { const n = muss.filter((_, i) => done[i]).length; mussZahl.textContent = n + ' von ' + muss.length; store.set(checksKey, done); kopf(); };
  fill(mussListe, muss.flatMap((m, i) => [m.form && i > 0 && !muss[i - 1].form ? el('li', {class:'checks-h', 'aria-hidden':'true'}, 'Form') : null, check(done, 'm', i, m.punkt, publicSource(m.quelle), mussStand)]));
  steps.push({id:'pruefen', t:reading ? 'Gegenlesen mit der Liste' : 'Auf volle Punkte prüfen', s:muss.length ? 'Fertig, wenn alle ' + muss.length + ' Häkchen sitzen' : 'Pflichtpunkte prüfen', progress:() => muss.length ? [muss.filter((_, i) => done[i]).length, muss.length] : null, body:() => [
    el('p', {}, reading ? 'Geh Punkt für Punkt durch. Was fehlt, kommentierst du im Doc. Den Text änderst du nicht selbst.' : 'Hak nur ab, was wirklich im Text steht. Jeder fehlende Punkt kostet Punkte.'),
    muss.length ? el('div', {class:'w-sub'}, el('div', {class:'row'}, el('h3', {}, 'Fertig, wenn …'), mussZahl), mussListe) : null,
    (g.nicht || []).length || (g.fallen || []).length ? more('Typische Fehler und was nicht hierhin gehört',
      (g.fallen || []).length ? el('div', {class:'sub-block'}, el('h3', {class:'sub-h'}, 'Typische Fehler'), el('ul', {class:'plain'}, g.fallen.map(x => el('li', {}, x)))) : null,
      (g.nicht || []).length ? el('div', {class:'sub-block'}, el('h3', {class:'sub-h'}, 'Gehört nicht hierhin'), el('ul', {class:'plain'}, g.nicht.map(x => el('li', {}, x)))) : null) : null,
    reading ? null : linkBtn('Schreibhilfe fragen, was noch fehlt', () => { track('hilfe', 'pruefen'); setTab('hilfe'); state.askHilfe && state.askHilfe('Was fehlt mir noch für volle Punkte?'); })], after:mussStand});
  steps.push({id:'abgeben', t:reading ? 'Rückmeldung geben' : 'Übergeben', s:reading ? 'Kommentare ins Doc, dann Bescheid geben' : gegen ? 'An ' + gegen + ' zum Gegenlesen' : 'Zum Gegenlesen weitergeben', body:() => [
    el('p', {}, reading ? 'Wenn deine Kommentare im Doc stehen, sag ' + (autor || 'der Person') + ' Bescheid. Sie arbeitet sie ein.' : 'Wenn alles abgehakt ist, gib das Kapitel weiter. ' + (gegen ? gegen + ' liest gegen, ' : '') + 'Salah schaut es sich an. Du trägst dabei deine Zeit ein.'),
    reading ? null : el('button', {type:'button', class:'btn', disabled:viewing() || !c.id || c.plan ? true : null, onclick:() => handover(c)}, 'Zur Prüfung geben')]});

  const wrap = el('div', {class:'weg'}), dots = el('span', {class:'w-dots', 'aria-hidden':'true'}), stand = el('span', {class:'w-stand'});
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function kopf() {
    const n = steps.filter(s => weg.done[s.id]).length, cur = steps.findIndex(s => s.id === weg.open);
    stand.textContent = n === steps.length ? 'Alle Schritte erledigt' : 'Schritt ' + (cur >= 0 ? cur + 1 : Math.min(n + 1, steps.length)) + ' von ' + steps.length;
    fill(dots, steps.map(s => el('i', {class:s.id === weg.open ? 'now' : weg.done[s.id] ? 'on' : ''})));
    for (const s of steps) { const p = s.progress && s.progress(); if (s.countEl) s.countEl.textContent = p ? p[0] + '/' + p[1] : ''; }
    const open = steps[cur] || steps.find(s => !weg.done[s.id]);
    state.weg = {n, all:steps.length, cur:cur >= 0 ? cur + 1 : Math.min(n + 1, steps.length), title:n === steps.length && cur < 0 ? 'Alle Schritte erledigt' : open ? open.t : ''};
    drawRail();
  }
  function save() { store.set(wegKey, weg); }
  function open(id, focus, toggle) {
    weg.open = toggle && weg.open === id ? null : id; save(); apply();
    const s = steps.find(x => x.id === weg.open);
    if (s && focus) { s.head.focus({preventScroll:true}); s.node.scrollIntoView({block:'nearest', behavior:reduce() ? 'auto' : 'smooth'}); }
  }
  function apply() {
    for (const s of steps) { const on = s.id === weg.open; s.node.classList.toggle('open', on); s.head.setAttribute('aria-expanded', String(on)); s.panel.hidden = !on; }
    kopf();
  }
  steps.forEach((s, i) => {
    const next = steps[i + 1];
    s.countEl = el('span', {class:'w-prog'});
    s.head = el('button', {type:'button', class:'w-head', 'aria-expanded':'false', 'aria-controls':'w-' + s.id, onclick:() => { const auf = weg.open !== s.id; open(s.id, false, true); if (auf) track('geoeffnet', s.id); }},
      el('span', {class:'w-num', 'aria-hidden':'true'}, String(i + 1)),
      el('span', {class:'w-tt'}, el('span', {class:'w-t'}, s.t), el('span', {class:'w-s'}, s.s)),
      s.countEl, el('span', {class:'chev', 'aria-hidden':'true'}));
    // Haken rastet ein, kurz danach geht der nächste Schritt auf. Messung wie bisher: genau ein «erledigt» je Klick.
    const weiter = el('button', {type:'button', class:'btn w-go', disabled:viewing() ? true : null, onclick:() => {
      if (viewing()) return; weg.done[s.id] = true; save(); track('erledigt', s.id); s.node.classList.add('done', 'snap'); announce(s.t + ' erledigt');
      const go = () => { s.node.classList.remove('snap'); if (next) open(next.id, true); else { weg.open = null; save(); apply(); } };
      if (reduce()) go(); else { weiter.disabled = true; setTimeout(() => { weiter.disabled = false; go(); }, 420); }
    }}, next ? 'Weiter: ' + next.t : 'Fertig');
    const zurueck = weg.done[s.id] ? el('button', {type:'button', class:'btn ghost', disabled:viewing() ? true : null, onclick:() => { if (viewing()) return; delete weg.done[s.id]; save(); track('wieder_offen', s.id); s.node.classList.remove('done'); kopf(); }}, 'Wieder öffnen') : null;
    s.panel = el('div', {class:'w-body', id:'w-' + s.id, hidden:true}, s.body(), el('div', {class:'w-act'}, weiter, zurueck));
    s.node = el('section', {class:'w-step' + (weg.done[s.id] ? ' done' : '')}, s.head, s.panel);
    if (s.after) s.after();
  });
  fill(wrap, steps.map(s => s.node));
  fill($('tab-auftrag'), viewing() ? el('p', {class:'note'}, 'Diese Ansicht ist nur zum Lesen.') : null, el('div', {class:'w-top'}, stand, dots), wrap);
  const first = steps.find(s => !weg.done[s.id]);
  weg.open = weg.open && steps.some(s => s.id === weg.open) ? weg.open : first ? first.id : null;
  apply();
}
// Nur Links auf den Gruppenordner in der Drive, im neuen Fenster.
function safeLink(href) {
  if (!/^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+$/.test(href || '')) return null;
  return el('a', {class:'doc-ext', href, target:'_blank', rel:'noopener noreferrer'}, 'Gruppenordner öffnen', el('span', {class:'ext', 'aria-hidden':'true'}, '↗'));
}
function copyBtnWide(text, label) {
  return el('button', {class:'btn secondary', type:'button', disabled:viewing() ? true : null, onclick:async e => { if (viewing()) return; const b = e.currentTarget; try { await navigator.clipboard.writeText(text); b.textContent = 'Kopiert, jetzt im Doc einfügen'; announce('Gliederung kopiert'); track('kopiert', 'geruest'); setTimeout(() => { b.textContent = label; }, 2400); } catch { announce('Kopieren nicht möglich'); } }}, label);
}
function renderInfos(g) {
  const inApp = [
    {titel:'Servicetest', wo:'Team-App', href:'/team/b/', inhalt:'Eure Testkontakte bei den Banken.'},
    {titel:'Bewertungen', wo:'Team-App', href:'/team/c/', inhalt:'Codierte öffentliche Bewertungen.'},
    {titel:'Dashboard', wo:'Team-App', href:'/team/dashboard/', inhalt:'Rücklauf und Stand der Erhebung.'},
    {titel:'Pia fragen', wo:'Team-App', href:'/team/frag/', inhalt:'Fragen zu Regeln, Terminen und Unterlagen.'}];
  fill($('tab-infos'), 
    block('Hier findest du, was du brauchst', (g.infos || []).filter(i => !/notion/i.test(i.wo || '')).map(i => el('article', {class:'info'}, el('h3', {}, i.titel), el('p', {}, i.inhalt), !/notion/i.test(i.wo || '') ? el('p', {class:'where'}, i.wo) : null, safeLink(i.link) ? el('p', {}, safeLink(i.link)) : null))),
    block('Direkt in der Team-App', el('div', {class:'links'}, inApp.map(i => el('a', {class:'lnk', href:i.href}, el('b', {}, i.titel), el('span', {}, i.inhalt), el('i', {class:'go', 'aria-hidden':'true'}, '›'))))));
}
function copyBtn(text) {
  return el('button', {class:'copy', type:'button', onclick:async e => { try { await navigator.clipboard.writeText(text); e.currentTarget.textContent = 'Kopiert'; announce('Beispiel kopiert'); } catch { announce('Kopieren nicht möglich'); } }}, 'Kopieren');
}
function rule(r, key) {
  return el('details', {class:'rule'}, el('summary', {}, r.thema || r.titel || 'Regel'),
    el('div', {}, r.regel ? el('p', {}, r.regel) : null,
      r.beispiel ? el('div', {class:'ex'}, el('code', {}, r.beispiel), copyBtn(r.beispiel)) : null,
      r.pruefen ? el('p', {class:'check'}, 'Prüffrage: ' + r.pruefen) : null,
      r.seite || r.quelle ? el('p', {class:'src-line'}, sourceTag((state[key] && state[key].quelle ? state[key].quelle + ', ' : '') + (r.seite ? 'S. ' + r.seite : r.quelle))) : null));
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
    f.erklaerung_wortlaut ? el('details', {class:'rule'}, el('summary', {}, 'Ehrenwörtliche Erklärung (Wortlaut)'), el('div', {}, el('p', {class:'pre'}, f.erklaerung_wortlaut), f.quelle ? el('p', {class:'src-line'}, sourceTag(f.quelle)) : null)) : null,
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

// Kleine Markdown-Darstellung fuer Antworten: Fett, Aufzaehlungen, Absaetze. Kein HTML aus der Antwort.
function inline(t) { const out = []; String(t).split(/(\*\*[^*]+\*\*)/).forEach(p => { if (/^\*\*[^*]+\*\*$/.test(p)) out.push(el('strong', {}, p.slice(2, -2))); else if (p) out.push(p); }); return out; }
function rich(t) {
  const nodes = []; let list = null, kind = '';
  for (const line of String(t).split('\n')) {
    const m = /^\s*([-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (m) {
      const k = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (!list || kind !== k) { list = el(k, {class:'md'}); kind = k; nodes.push(list); }
      list.append(el('li', {}, inline(m[2]))); continue;
    }
    list = null;
    if (!line.trim()) continue;
    if (/^#+\s/.test(line)) nodes.push(el('p', {class:'md h'}, inline(line.replace(/^#+\s*/, ''))));
    else nodes.push(el('p', {class:'md'}, inline(line)));
  }
  return nodes;
}
// ---------- Hilfe (Gliederung, keine Absätze) ----------
const PROMPTS = ['Schlag mir eine Gliederung in Stichworten vor.', 'Was fehlt mir noch für volle Punkte?', 'Wo finde ich die Daten und Quellen dafür?', 'Worauf muss ich bei APA hier achten?'];
function renderHilfe(c, g) {
  const histKey = 'pa6-sp-chat:' + state.person + ':' + c.ref;
  state.chat = store.get(histKey, []);
  const thread = el('div', {class:'thread', 'aria-live':'polite'});
  const input = el('textarea', {rows:'2', maxlength:'900', placeholder:'Frag nach Gliederung, Leitfragen, Quellen oder APA …', 'aria-label':'Frage an die Schreibhilfe'});
  const send = el('button', {class:'btn send', type:'submit'}, 'Fragen');
  const head = m => el('p', {class:'msg-who'}, m.r === 'du' ? 'Du' : [el('span', {class:'mark', 'aria-hidden':'true'}), 'Schreibhilfe']);
  const suggest = el('div', {class:'suggest'}), composer = el('div', {class:'composer'});
  const drawSuggest = () => {
    const empty = !state.chat.length;
    suggest.className = 'suggest' + (empty ? ' list' : ' row');
    if (empty) thread.before(suggest); else composer.prepend(suggest);
    fill(suggest, empty ? el('p', {class:'sg-h'}, 'Zum Beispiel') : null,
      PROMPTS.map(p => el('button', {type:'button', class:'sg', onclick:() => ask(p)}, el('span', {}, p), empty ? el('i', {class:'go', 'aria-hidden':'true'}, '›') : null)));
  };
  const draw = scroll => {
    thread.replaceChildren(...state.chat.map(m => el('div', {class:'msg ' + m.r + (m.err ? ' err' : '')}, head(m), el('div', {class:'txt'}, m.r === 'du' ? m.t : rich(m.t)))));
    drawSuggest();
    if (scroll && thread.lastElementChild) thread.lastElementChild.scrollIntoView({block:'nearest', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  };
  state.askHilfe = t => ask(t);
  async function ask(text) {
    if (viewing()) { announce('Diese Ansicht ist nur zum Lesen.'); return; }
    text = String(text || '').trim(); if (!text || state.busy) return;
    state.busy = true; send.disabled = true; input.value = '';
    state.chat.push({r:'du', t:text}); draw(true);
    const wait = el('div', {class:'msg as wait', 'aria-busy':'true'}, head({r:'as'}), el('div', {class:'txt'}, el('span', {class:'dots', 'aria-hidden':'true'}, el('i'), el('i'), el('i')), 'Schaut in den Auftrag …'));
    thread.append(wait); wait.scrollIntoView({block:'nearest'});
    try {
      const verlauf = state.chat.slice(-7, -1).filter(m => !m.err).map(m => ({rolle:m.r === 'du' ? 'du' : 'assistent', text:m.t}));
      const r = await post({typ:'frage', k:state.key, text, leitung:false, ctx:c.overview ? undefined : c.id, verlauf, modus:'schreiben', kapitel:c.ref}, 90000);
      if (!r || r.ok === false || typeof r.antwort !== 'string') throw Error(r && r.fehler || 'Keine Antwort erhalten.');
      state.chat.push({r:'as', t:r.antwort});
    } catch (e) { state.chat.push({r:'as', t:e.message || 'Gerade nicht erreichbar.', err:true}); }
    finally { wait.remove(); state.chat = state.chat.slice(-30); store.set(histKey, state.chat); state.busy = false; send.disabled = false; draw(true); }
  }
  const form = el('form', {class:'ask', onsubmit:e => { e.preventDefault(); ask(input.value); }},
    el('div', {class:'field'}, input, send),
    el('p', {class:'ask-foot'}, el('span', {}, 'Wird als KI-Nutzung protokolliert.'), el('span', {class:'kbd-hint'}, 'Enter sendet, Shift und Enter macht eine neue Zeile.')));
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
  fill($('tab-hilfe'),
    el('div', {class:'help-intro'}, el('p', {class:'hi-t'}, 'Schreibhilfe für dieses Kapitel'),
      el('p', {class:'hi-s'}, 'Sie kennt den Auftrag und gibt Gliederung und Tipps, schreiben musst du selbst.')),
    thread, composer);
  composer.append(form);
  draw(false);
  if (viewing()) { send.disabled = true; input.disabled = true; suggest.querySelectorAll('button').forEach(b => { b.disabled = true; }); }
}

// ---------- Doc ----------
// 05.11.2026 Salah: über dem Doc steht nichts. Links die Seitenleiste, rechts das Doc über die volle Höhe.
// «Im eigenen Fenster öffnen» ist ein kleiner Link in der Seitenleiste; der Hinweis zum Anmelden erscheint nur, wenn das Doc wirklich nicht lädt.
function renderDoc(c) {
  const url = docUrl(c);
  clearTimeout(state.docTimer); docTrouble(false);
  const empty = (title, text, action) => fill($('doc'), el('div', {class:'doc-card doc-empty'}, el('span', {class:'doc-ico', 'aria-hidden':'true'}), el('p', {class:'big-note'}, title), el('p', {class:'quiet'}, text), action || null));
  fill($('bar-doc'));
  if (!url && c.plan) return empty('Das Doc dieses Kapitels sehen Pate und Gegenleser.', 'Den Auftrag kannst du links lesen.');
  if (!url) return empty('Für dieses Kapitel ist noch kein Doc verknüpft.', 'Salah legt es an.');
  const docMode = viewing() ? '/preview' : '/edit';
  state.docHref = url + docMode;
  fill($('bar-doc'), el('a', {class:'doc-ext', href:state.docHref, target:'_blank', rel:'noopener noreferrer'}, 'Im eigenen Fenster öffnen', el('span', {class:'ext', 'aria-hidden':'true'}, '↗')));
  // Safari und iOS sperren Drittanbieter-Cookies: dort ist man im eingebetteten Doc nicht angemeldet und kann nicht schreiben.
  const ua = navigator.userAgent, safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
  if (safari) return empty('In Safari öffnet sich dein Doc im eigenen Fenster.', 'Safari erlaubt das Schreiben im eingebetteten Doc nicht. Stell die Fenster nebeneinander, dann hast du den Auftrag immer daneben.',
    el('a', {class:'btn', href:state.docHref, target:'_blank', rel:'noopener noreferrer'}, 'Doc öffnen', el('span', {class:'ext', 'aria-hidden':'true'}, '↗')));
  const frame = el('iframe', {src:url + docMode + '?usp=sharing', title:'Google Doc ' + c.ref, allow:'clipboard-read; clipboard-write', referrerpolicy:'no-referrer'});
  let loaded = false;
  frame.addEventListener('load', () => { loaded = true; });
  state.docTimer = setTimeout(() => { if (!loaded) docTrouble(true); }, 15000);
  fill($('doc'), el('div', {class:'doc-card'}, frame));
}
// Fehlt die Google-Anmeldung, leitet das Doc auf die Anmeldeseite um. Die Seite lässt nur Docs zu, also meldet der Browser eine Sperre: daran erkennen wir es.
document.addEventListener('securitypolicyviolation', e => {
  if (/^frame-src|^child-src/.test(e.effectiveDirective || e.violatedDirective || '') && document.querySelector('#doc iframe')) docTrouble(true);
});
function docTrouble(on) {
  const box = $('doc-warn');
  document.body.classList.toggle('doc-problem', !!on);
  if (!on) { box.hidden = true; fill(box); drawRail(); return; }
  if (!box.hidden) return;
  fill(box, el('p', {class:'dw-t'}, 'Das Doc lädt nicht.'),
    el('p', {class:'dw-s'}, 'Öffne es einmal im eigenen Fenster und melde dich bei Google an. Dann lade diese Seite neu.'),
    el('div', {class:'dw-act'}, state.docHref ? el('a', {class:'btn secondary', href:state.docHref, target:'_blank', rel:'noopener noreferrer'}, 'Im eigenen Fenster öffnen', el('span', {class:'ext', 'aria-hidden':'true'}, '↗')) : null,
      el('button', {type:'button', class:'btn ghost', onclick:() => location.reload()}, 'Neu laden')));
  box.hidden = false;
  drawRail();
}

// ---------- Seitenleiste: einklappen am Laptop, unten als Blatt am Handy ----------
const NARROW = '(max-width: 899px)';
function narrow() { return !!(window.matchMedia && matchMedia(NARROW).matches); }
function sideKey() { return narrow() ? 'pa6-sp-blatt' : 'pa6-sp-leiste'; }
function sideClosed() { const v = store.get(sideKey(), null); return v === null ? narrow() : v === 'zu'; }
function applySide(focus) {
  const on = document.body.classList.contains('kapitel'), zu = on && sideClosed();
  document.body.classList.toggle('side-zu', zu);
  $('rail').hidden = !zu;
  $('rail').setAttribute('aria-expanded', String(!zu));
  $('side-toggle').setAttribute('aria-expanded', String(!zu));
  $('side-toggle-t').textContent = narrow() ? 'Schritte ausblenden' : 'Seitenleiste einklappen';
  drawRail();
  if (focus) (zu ? $('rail') : $('side-toggle')).focus({preventScroll:true});
}
function setSide(zu) { store.set(sideKey(), zu ? 'zu' : 'auf'); applySide(true); announce(zu ? 'Seitenleiste eingeklappt' : 'Seitenleiste offen'); }
function drawRail() {
  const w = state.weg || {}, trouble = document.body.classList.contains('doc-problem');
  fill($('rail'), el('span', {class:'rl-ico', 'aria-hidden':'true'}),
    w.all ? el('span', {class:'rl-n', 'aria-hidden':'true'}, (w.n === w.all ? w.all : w.cur) + '/' + w.all) : null,
    el('span', {class:'rl-t'}, el('span', {class:'rl-k'}, trouble ? 'Das Doc lädt nicht' : w.all ? (w.n === w.all ? 'Alle Schritte erledigt' : 'Schritt ' + w.cur + ' von ' + w.all) : 'Schreibweg'),
      el('span', {class:'rl-s'}, w.n === w.all ? (state.chapter && state.chapter.title) || '' : w.title || '')),
    el('span', {class:'sr'}, ' · Seitenleiste öffnen'),
    trouble ? el('span', {class:'rl-warn', 'aria-hidden':'true'}) : null);
}
$('side-toggle').addEventListener('click', () => setSide(true));
$('rail').addEventListener('click', () => setSide(false));
if (window.matchMedia) { const mq = matchMedia(NARROW); if (mq && mq.addEventListener) mq.addEventListener('change', () => applySide()); }

// ---------- Tabs ----------
function setTab(name) {
  if (!['auftrag', 'infos', 'regeln', 'hilfe'].includes(name)) name = 'auftrag';
  state.tab = name; store.set('pa6-sp-tab', name);
  for (const b of $('tabs').querySelectorAll('button')) { const on = b.dataset.tab === name; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
  for (const t of ['auftrag', 'infos', 'regeln', 'hilfe']) $('tab-' + t).hidden = t !== name;
  $('panel').scrollTop = 0;
  // Die Seitenleiste scrollt für sich: beim Wechsel an den Anfang des Bereichs, nicht mitten in den neuen Inhalt.
  const sb = $('side-body'), tabs = $('tabs');
  if (sb && tabs && sb.scrollTop > tabs.offsetTop) sb.scrollTop = tabs.offsetTop;
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
$('tabs').addEventListener('keydown', e => {
  const bs = [...$('tabs').querySelectorAll('button')], i = bs.indexOf(document.activeElement);
  const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : null;
  if (n === null || i < 0) return;
  e.preventDefault(); const b = bs[(n + bs.length) % bs.length]; setTab(b.dataset.tab); b.focus();
});
load();
