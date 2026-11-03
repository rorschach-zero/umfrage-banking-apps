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
const STAND = {'Entwurf':'draft', 'In Prüfung':'review', 'fertig':'done'};
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
function renderAll() {
  const c = state.chapter, g = state.guide[c.ref] || {};
  document.title = c.ref + ' · Schreibplatz';
  $('part').textContent = (c.ref.startsWith('6b') ? 'PA6b' : 'PA6a') + ' · Kapitel ' + c.ref.replace(/^6[ab]-/, '');
  $('title').textContent = g.titel || c.title;
  fill($('meta'),
    el('span', {class:'chip role'}, roleOf(c)),
    c.due ? el('span', {class:'chip'}, 'Frist ' + day(c.due)) : null,
    g.seiten ? el('span', {class:'chip'}, 'rund ' + String(g.seiten).replace('.', ',') + (g.seiten === 1 ? ' Seite' : ' Seiten')) : null,
    c.reader && c.owner === state.person ? el('span', {class:'chip soft'}, 'Gegenlesen: ' + (NAMES[c.reader] || c.reader)) : null);
  // Zeitleiste entfernt (Salah 03.11.): Zeit wird mit dem Auftrag erfasst, nicht separat im Schreibplatz.
  const picker = $('picker');
  picker.replaceChildren(...state.chapters.filter(x => state.lead || state.person === 'SA' || x.owner === state.person || x.reader === state.person)
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

// Kleine Markdown-Darstellung fuer Antworten: Fett, Aufzaehlungen, Absaetze. Kein HTML aus der Antwort.
function inline(t) { const out = []; String(t).split(/(\*\*[^*]+\*\*)/).forEach(p => { if (/^\*\*[^*]+\*\*$/.test(p)) out.push(el('strong', {}, p.slice(2, -2))); else if (p) out.push(p); }); return out; }
function rich(t) {
  const nodes = []; let list = null;
  for (const line of String(t).split('\n')) {
    const m = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (m) { if (!list) { list = el('ul', {class:'md'}); nodes.push(list); } list.append(el('li', {}, inline(m[1]))); continue; }
    list = null;
    if (line.trim()) nodes.push(el('p', {class:'md'}, inline(line.replace(/^#+\s*/, ''))));
  }
  return nodes;
}
// ---------- Hilfe (Gliederung, keine Absätze) ----------
const PROMPTS = ['Schlag mir eine Gliederung in Stichworten vor.', 'Was fehlt mir noch für volle Punkte?', 'Wo finde ich die Daten und Quellen dafür?', 'Worauf muss ich bei APA hier achten?'];
function renderHilfe(c, g) {
  const histKey = 'pa6-sp-chat:' + state.person + ':' + c.ref;
  state.chat = store.get(histKey, []);
  const thread = el('div', {class:'thread', 'aria-live':'polite'});
  const input = el('textarea', {rows:'3', maxlength:'900', placeholder:'Frag nach Gliederung, Leitfragen, Quellen oder APA …', 'aria-label':'Frage an die Schreibhilfe'});
  const send = el('button', {class:'btn', type:'submit'}, 'Fragen');
  const draw = () => { thread.replaceChildren(...(state.chat.length ? state.chat.map(m => el('div', {class:'msg ' + m.r + (m.err ? ' err' : '')}, el('p', {class:'who'}, m.r === 'du' ? 'Du' : 'Schreibhilfe'), el('div', {class:'txt'}, m.r === 'du' ? m.t : rich(m.t)))) :
    [el('p', {class:'quiet'}, 'Die Hilfe kennt den Auftrag dieses Kapitels. Sie gibt Stichworte und Hinweise, schreibt aber keine Absätze für dich.')])); thread.scrollTop = thread.scrollHeight; };
  async function ask(text) {
    text = String(text || '').trim(); if (!text || state.busy) return;
    state.busy = true; send.disabled = true; input.value = '';
    state.chat.push({r:'du', t:text}); draw();
    const wait = el('div', {class:'msg as wait'}, el('p', {class:'who'}, 'Schreibhilfe'), el('div', {class:'txt'}, 'Schaut in den Auftrag …')); thread.append(wait);
    try {
      const verlauf = state.chat.slice(-7, -1).filter(m => !m.err).map(m => ({rolle:m.r === 'du' ? 'du' : 'assistent', text:m.t}));
      const r = await post({typ:'frage', k:state.key, text, leitung:false, ctx:c.overview ? undefined : c.id, verlauf, modus:'schreiben', kapitel:c.ref}, 90000);
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
  if (!url && c.plan) { fill($('doc'), el('div', {class:'doc-empty'}, el('p', {}, 'Das Doc dieses Kapitels sehen Pate und Gegenleser.'), el('p', {class:'quiet'}, 'Den Auftrag kannst du links lesen.'))); return; }
  if (!url) { fill($('doc'), el('div', {class:'doc-empty'}, el('p', {}, 'Für dieses Kapitel ist noch kein Doc verknüpft.'), el('p', {class:'quiet'}, 'Salah legt es an.'))); return; }
  // Safari und iOS sperren Drittanbieter-Cookies: dort ist man im eingebetteten Doc nicht angemeldet und kann nicht schreiben.
  const ua = navigator.userAgent, safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua);
  if (safari) { fill($('doc'), el('div', {class:'doc-empty'}, el('p', {class:'big-note'}, 'In Safari öffnet sich dein Doc im eigenen Fenster.'), el('p', {class:'quiet'}, 'Safari erlaubt das Schreiben im eingebetteten Doc nicht. Stell die Fenster nebeneinander, dann hast du den Auftrag immer daneben.'), el('a', {class:'btn', href:url + '/edit', target:'_blank', rel:'noopener noreferrer'}, 'Doc öffnen ↗'))); return; }
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
