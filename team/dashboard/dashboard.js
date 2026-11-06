'use strict';
// Projekt-Dashboard der Gruppe 601, Gestalt v3 (Designspezifikation Teil B): Display-Zeile, Live-Zeile, Bento aus Haarlinien.
// Nur beschreibende Zahlen mit Fallzahl, keine Intervalle, keine Prognose. Werkzeuge mit Zusatzdaten (data.v3) erscheinen erst,
// wenn diese Daten geliefert und mit der Hauptzählung abgeglichen sind. Fällt eine Quelle aus, bleibt nur diese Zelle leer.
(() => {
  const root = document.getElementById('dashboard'), roleButton = document.getElementById('role'), refresh = document.getElementById('refresh');
  const params = new URLSearchParams(location.search), publicView = params.get('public') === '1';
  const CONFIG = window.TEAM_CONFIG || {};
  // Name des Frage-Assistenten an genau einer Stelle; die Umstellung erfolgt über TEAM_CONFIG.assistantName.
  const ASSISTANT = {name: CONFIG.assistantName || 'Pia', path: CONFIG.piaPath || '/team/frag/'};
  const TABS = [['marketing', 'Marketing'], ['pm', 'Projektmanagement']];
  let key = '', leadership = false, generation = 0, timer, last = null, tab = params.get('tab') === 'pm' ? 'pm' : 'marketing', range = 'feld', group = 'person', counted = false;
  try {
    const incoming = new URLSearchParams(location.hash.slice(1)).get('k');
    if (incoming && !publicView) localStorage.setItem('pa6k', incoming);
    key = publicView ? '' : localStorage.getItem('pa6k') || '';
    leadership = !publicView && sessionStorage.getItem('pa6_pia_role') === 'leitung';
    if (!params.get('tab') && sessionStorage.getItem('pa6_dashboard_tab') === 'pm') tab = 'pm';
  } catch {}
  history.replaceState({}, '', location.pathname + location.search);
  document.body.classList.toggle('public', publicView);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Formatierung ----------
  const NAMES = {SA: 'Salah', ES: 'Ernes', MG: 'Melisa', AM: 'Arber', LB: 'Leonie'}, PEOPLE = ['SA', 'ES', 'MG', 'AM', 'LB'];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const num = (v, digits = 1) => v == null || !Number.isFinite(+v) ? '–' : new Intl.NumberFormat('de-CH', {maximumFractionDigits: digits}).format(v).replace('.', ',');
  const pct = (v, digits = 0) => v == null || !Number.isFinite(v) ? '–' : (v * 100).toFixed(digits).replace('.', ',') + ' %';
  const zone = {timeZone: 'Europe/Zurich'};
  const day = v => v ? new Date(String(v).slice(0, 10) + 'T12:00:00Z') : null;
  const dateShort = v => v ? new Intl.DateTimeFormat('de-CH', {day: '2-digit', month: '2-digit', ...zone}).format(day(v)) : 'offen';
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const dateWd = v => v ? WD[day(v).getUTCDay()] + ' ' + dateShort(v) : 'offen';
  const weekday = v => ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][day(v).getUTCDay()];
  const stamp = v => new Intl.DateTimeFormat('de-CH', {dateStyle: 'short', timeStyle: 'short', ...zone}).format(new Date(v));
  const clockTime = v => new Intl.DateTimeFormat('de-CH', {hour: '2-digit', minute: '2-digit', ...zone}).format(new Date(v));
  const clock = s => s == null ? '–' : Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
  const name = code => NAMES[code] || 'ohne Zuordnung';
  const sum = obj => Object.values(obj || {}).reduce((a, b) => a + (+b || 0), 0);
  const sorted = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const ready = x => x && x.state === 'ready';
  const addDays = (d, n) => {const t = day(d); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);};
  const diffDays = (a, b) => Math.round((day(b) - day(a)) / 864e5);
  const todayOf = data => new Intl.DateTimeFormat('sv-SE', {...zone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(data.generated_at));
  const plural = (n, one, many) => num(n) + ' ' + (n === 1 ? one : many);

  // ---------- Bausteine ----------
  let standText = '';
  const empty = text => `<p class="empty">${esc(text)}</p>`;
  const unknown = () => empty('Stand unbekannt. Die Quelle ist gerade nicht erreichbar; fehlende Werte sind nicht null.');
  const how = (id, body, source) => `<details class="how" data-key="how-${id}"><summary>So gemessen</summary><div class="how-body">${body}${source ? `<p class="src">Quelle: ${esc(source)} · Stand ${esc(standText)}</p>` : ''}</div></details>`;
  const cell = ({id, cls = 'c6', label, right = '', body, explain, source}) => `<section class="cell ${cls}" id="karte-${id}" aria-labelledby="titel-${id}">${label ? `<div class="k"><h2 id="titel-${id}">${esc(label)}</h2>${right}</div>` : ''}${body}${explain ? how(id, explain, source) : ''}</section>`;
  const safe = (id, build) => {try {return build();} catch (error) {return cell({id, label: 'Nicht berechenbar', body: empty('Diese Zelle konnte nicht berechnet werden. Die übrigen sind davon nicht betroffen.')});}};
  const row = (label, sub, value, cls = '') => `<div class="ln ${cls}"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><span class="v">${value}</span></div>`;
  const chip = (label, value, n) => `<span>${esc(label)} <b${n != null ? ` data-n="${n}"` : ''}>${value}</b></span>`;
  const live = items => `<div class="live" aria-label="Live heute"><span class="lead">Live heute</span><span class="sep" aria-hidden="true"></span>${items.join('')}</div>`;
  const display = (main, rest) => `<h1 class="display">${esc(main)}${rest ? ` <span>${esc(rest)}</span>` : ''}</h1>`;
  const NS = 'http://www.w3.org/2000/svg';

  // ---------- Marketing ----------
  const CHANNELS = {WA: 'WhatsApp', RD: 'Reddit', HS: 'Andere Schulen', OR: 'Organisationen', SCH: 'Schulhaus', KL: 'Klasse', GE: 'Geschäft', CL: 'Club', IG: 'Instagram', LI: 'LinkedIn', FB: 'Facebook', SM: 'Jodel und andere', DZ: 'Dozierende', TEIL: 'Weitergeleitet', AD: 'Anzeigen', YU: 'Yuh-Nutzerkreise (eigene Kanäle)', YUH: 'Yuh-Kanäle', Sonstige: 'Sonstige'};
  // Rücklauf-Etappen: feste Zuordnung Meilenstein → Schwelle (Designspezifikation Teil A 8). Datum aus dem PSP.
  const STAGES = [['MS-07', 30], ['MS-08', 60], ['MS-10', 85], ['MS-11', 100]];
  const stages = data => {const ms = (data.pm && data.pm.milestones) || []; return STAGES.map(([ref, n]) => ({ref, n, due: (ms.find(m => m.ref === ref) || {}).due || null})).filter(s => s.due);};
  const ages = {'16 bis 29': '16–29', '30 bis 49': '30–49', '50 bis 65': '50–65'};
  const cellKey = q => q.age + '|' + (q.neobank ? 'neobank' : 'klassisch');
  const dailyRows = f => Object.entries(f.daily || {}).filter(([d]) => d !== 'unbekannt').sort((a, b) => a[0].localeCompare(b[0]));
  const cumulative = f => {let c = 0; return dailyRows(f).map(([d, n]) => [d, n, c += n]);};
  function windowOf(data, f) {
    const rows = dailyRows(f), today = todayOf(data), st = stages(data);
    const first = rows.length ? rows[0][0] : today, end = st.length ? st[st.length - 1].due : addDays(today, 7);
    if (range === '7') return [addDays(today, -6), today];
    if (range === '30') return [addDays(today, -29), today];
    return [first < today ? first : today, end > today ? end : today];
  }

  function heroCell(data) {
    const f = data.methods.A.field, ext = data.v3 && ready(data.v3.survey);
    if (!ready(f)) return cell({id: 'etappe', cls: 'c8', label: 'Gültige Antworten', body: unknown()});
    const today = todayOf(data), starts = f.starts, yuh = f.totals ? f.totals.yuh : {n: (f.yuh_target || {}).n, target: 30};
    const kpis = `<div class="kpis"><div class="kpi on"><small>Gültig</small><b data-n="${f.n}">${num(f.n)}</b>${f.daily && f.daily[today] ? `<em class="up">+${num(f.daily[today])} heute</em>` : ''}</div>
      <div class="kpi"><small>Mit Yuh</small><b>${num(yuh.n)}</b><em>von ${num(yuh.target)}</em></div>
      <div class="kpi"><small>Starts</small><b>${ready(starts) ? num(starts.total.begonnen) : '–'}</b><em>${starts && starts.since ? 'seit ' + esc(clockTime(starts.since)) : 'nicht erfasst'}</em></div>
      <div class="kpi"><small>Fertig</small><b>${f.quality ? num(f.quality.complete) : '–'}</b><em>${f.quality ? num(f.quality.valid) + ' gültig' : ''}</em></div></div>`;
    const [from, to] = windowOf(data, f), hasDaily = f.daily && typeof f.daily === 'object';
    const startText = !starts || starts.state === 'nicht erfasst' ? '<p>Starts werden erst ab Messbeginn gezählt; davor gilt «nicht erfasst», weder null noch geschätzt.</p>'
      : ready(starts) ? `<p>Starts seit ${esc(stamp(starts.since))}: geöffnet ${num(starts.total.geoeffnet)}, begonnen ${num(starts.total.begonnen)}, passt nicht in die Zielgruppe ${num(starts.total.screenouts)}, vollständig ${num(starts.total.vollstaendig)}, gültig ${num(starts.total.gueltig)}.${starts.total.begonnen - starts.total.screenouts > 0 ? ` Abbruchquote ${pct(starts.total.abbruchquote)} (n = ${num(starts.total.begonnen - starts.total.screenouts)} begonnen ohne Screen-outs).` : ' Noch keine auswertbaren Starts, darum keine Quote.'}</p>` : '<p>Starts: Stand unbekannt.</p>';
    return `<section class="cell c8 hero" id="karte-etappe" aria-labelledby="titel-etappe">${kpis}
      <div class="k"><h2 id="titel-etappe">Gültige Antworten, zusammengezählt${hasDaily ? ` · ${esc(dateShort(from))}–${esc(dateShort(to))}` : ''}</h2>${hasDaily ? '<button class="link" type="button" data-table="burn">Als Tabelle</button>' : ''}</div>
      ${hasDaily ? `<div class="chart" data-chart="burn"><svg role="img" aria-label="${esc(burnLabel(data, f))}"></svg><div class="tip" hidden></div></div>
      <p class="tapline" aria-live="polite"></p>
      <div class="legend"><span><i class="l-ist"></i>gültige Antworten</span>${stages(data).length ? '<span><i class="l-plan"></i>Etappenplan</span>' : ''}<span><i class="l-today"></i>heute</span></div>` : empty(`Tageswerte gerade nicht verfügbar. Bekannt ist der Stand von ${num(f.n)} gültigen Antworten, nicht sein Verlauf; fehlende Tage sind nicht null.`)}
      <div class="burn-table" hidden${hasDaily ? '' : ' data-off'}>${dailyRows(f).length ? `<table class="plain"><thead><tr><th scope="col">Tag</th><th scope="col">neu</th><th scope="col">zusammen</th></tr></thead><tbody>${cumulative(f).map(([d, n, c]) => `<tr><th scope="row">${esc(dateWd(d))}</th><td>${num(n)}</td><td>${num(c)}</td></tr>`).join('')}</tbody></table>` : empty('Noch keine datierten Antworten.')}${f.daily && f.daily.unbekannt ? `<p class="note">${num(f.daily.unbekannt)} gültige Antworten ohne zuordenbares Datum.</p>` : ''}</div>
      ${how('etappe', `<p>Gültige Antworten nach dem Tag des Eingangs (Europe/Zurich), zusammengezählt. Die gestrichelte Linie verbindet nur die festen Etappen 30, 60, 85 und 100 an ihren Meilensteindaten; sie ist ein Plan, keine Prognose.</p>${ext ? '<p>Kanal je Tag: gleiche Bereinigung, nach Kennungspräfix getrennt und mit der Hauptzählung abgeglichen.</p>' : ''}${startText}`, 'Umfrage, Blatt Antworten, bereinigt; Notion PSP (Meilensteine)')}
    </section>`;
  }
  const burnLabel = (data, f) => 'Gültige Antworten zusammengezählt: ' + (cumulative(f).slice(-3).map(([d, , c]) => dateShort(d) + ' ' + c).join(', ') || 'noch keine') + (stages(data).length ? '; Etappen ' + stages(data).map(s => s.n + ' am ' + dateShort(s.due)).join(', ') : '');

  function nextCell(data) {
    const f = data.methods.A.field;
    if (!ready(f)) return cell({id: 'naechste', cls: 'c4', label: 'Nächste Etappe', body: unknown()});
    const st = stages(data), next = st.find(s => s.n > f.n), today = todayOf(data), people = f.people && typeof f.people === 'object' ? f.people : null, target = f.people_target || 20;
    const yuh = f.totals ? f.totals.yuh : {n: (f.yuh_target || {}).n, target: 30};
    const ms09 = ((data.pm && data.pm.milestones) || []).find(m => m.ref === 'MS-09');
    const own = people ? PEOPLE.reduce((a, c) => a + (people[c] || 0), 0) : null;
    const big = next ? `<div class="big signal" data-n="${next.n - f.n}">${num(next.n - f.n)}</div><p class="say">gültige Antworten fehlen bis ${num(next.n)}. <span>${st.filter(s => s.n > next.n).map(s => num(s.n) + ' (' + dateShort(s.due) + ')').join(', ') || 'Danach das Streckenziel 300.'}</span></p>`
      : f.n >= 100 ? `<div class="big signal">${num(f.n)}</div><p class="say">Das Mindestziel von 100 ist erreicht. <span>Streckenziel 300.</span></p>` : `<div class="big">${num(Math.max(0, 100 - f.n))}</div><p class="say">gültige Antworten fehlen bis 100.</p>`;
    const days = next ? diffDays(today, next.due) : null;
    const label = next ? `Nächste Etappe · ${dateWd(next.due)}${days >= 0 ? ' · ' + (days === 0 ? 'heute' : plural(days, 'Tag', 'Tage')) : ''}` : 'Mindestziel';
    const personList = people ? `<details class="more" data-key="personen"><summary>Je Person</summary><div class="list">${PEOPLE.map(c => row(esc(NAMES[c]), '', num(people[c] || 0) + ' von ' + num(target))).join('')}${row('ohne Zuordnung', 'Schul- und Organisationslinks, ältere Links, Weiterleitungen', num(people.ohne || 0))}</div></details>` : '';
    return `<section class="cell c4" id="karte-naechste" aria-labelledby="titel-naechste"><div class="k"><h2 id="titel-naechste">${esc(label)}</h2></div>${big}
      ${row('Mit Yuh', ms09 && ms09.due ? 'Ziel ' + num(yuh.target) + ' bis ' + esc(dateWd(ms09.due)) : 'Ziel ' + num(yuh.target), num(yuh.n) + ' / ' + num(yuh.target))}
      <div id="karte-personen">${people ? row('Eigene Links', own ? `zusammen ${num(own)} über eure Kürzel; bestes Ergebnis je Person` : `noch keine Antwort mit eurem Kürzel; ${num(people.ohne || 0)} kamen über Schul- und Gruppenlinks`, `${num(Math.max(0, ...PEOPLE.map(c => people[c] || 0)))} von ${num(target)}`) : row('Eigene Links', 'Stand unbekannt', '–')}${personList}</div>
      <a class="btn dark" href="/team/?view=sharing">Meinen Link teilen <span aria-hidden="true">↗</span></a></section>`;
  }

  function channelsCell(data) {
    const f = data.methods.A.field;
    if (!ready(f)) return cell({id: 'kanaele', label: 'Top Kanäle', body: unknown()});
    const ext = data.v3 && ready(data.v3.survey) ? data.v3.survey.daily_by_channel : null, [from, to] = windowOf(data, f);
    const inRange = c => ext && range !== 'feld' ? sum(Object.fromEntries(Object.entries(ext[c] || {}).filter(([d]) => d >= from && d <= to))) : (f.channels || {})[c] || 0;
    const rows = Object.keys(f.channels || {}).map(c => [c, inRange(c)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), n = rows.reduce((a, r) => a + r[1], 0), max = Math.max(1, ...rows.map(r => r[1]));
    const days = ext ? Array.from({length: 7}, (_, i) => addDays(todayOf(data), i - 6)) : [], top = ext ? Math.max(1, ...Object.values(ext).flatMap(o => days.map(x => o[x] || 0))) : 1;
    const spark = c => ext ? `<span class="t" aria-hidden="true"><span class="sp">${days.map(d => {const v = (ext[c] || {})[d] || 0; return `<i style="height:${v ? Math.max(10, v / top * 100) : 0}%"></i>`;}).join('')}</span></span>` : '';
    const label = range === 'feld' || !ext ? 'Top Kanäle · Feldzeit' : `Top Kanäle · ${range === '7' ? 'letzte 7 Tage' : 'letzte 30 Tage'}`;
    const body = rows.length ? `<ul class="rank${ext ? ' with-t' : ''}"><li class="h"><span>Kanal</span><span class="v">Gültig</span><span class="p">Anteil</span>${ext ? '<span class="t">7 Tage</span>' : ''}</li>${rows.map(([c, v]) => `<li style="--w:${v / max * 100}%"><span>${esc(CHANNELS[c] || c)}</span><span class="v">${num(v)}</span><span class="p">${pct(v / n)}</span>${spark(c)}</li>`).join('')}</ul>
      <p class="note">Anteil an ${num(n)} gültigen Antworten${range === 'feld' || !ext ? '' : ' im Zeitraum'}. YU ${num((f.channels || {}).YU || 0)} · YUH ${num((f.channels || {}).YUH || 0)} (Yuh-Kanäle getrennt).</p>`
      : empty(range === 'feld' || !ext ? 'Noch keine gültigen Antworten.' : 'Im gewählten Zeitraum keine gültigen Antworten.');
    return cell({id: 'kanaele', label, body, explain: '<p>Gültige Antworten je Kanalpräfix der Kennung. Yuh-Kundinnen und -Kunden werden nur über eigene und öffentliche Kanäle angesprochen; YUH-Kanäle kommen nur dazu, wenn Yuh sie anbietet.</p>' + (ext ? '' : '<p>Der Zeitraum filtert die Kanäle erst, wenn die Tageswerte je Kanal geliefert werden; bis dahin gilt die ganze Feldzeit.</p>'), source: 'Umfrage, Blatt Antworten, Kennungspräfix'});
  }

  function quotaCell(data) {
    const f = data.methods.A.field;
    if (!ready(f)) return cell({id: 'quoten', cls: 'c6 r2', label: 'Quotenplan', body: unknown()});
    const total = f.totals || {valid: {n: f.n, target: 100, stretch: 300, missing: Math.max(0, 100 - f.n)}, yuh: f.yuh_target};
    const cells = f.quotas || [], drill = data.v3 && ready(data.v3.survey) ? data.v3.survey.quota_by_channel : null;
    const missing = q => q.missing ?? Math.max(0, q.target - q.n), maxGap = Math.max(0, ...cells.map(missing));
    const ageGap = Object.keys(ages).map(a => [a, cells.filter(q => q.age === a).reduce((s, q) => s + missing(q), 0)]).sort((a, b) => b[1] - a[1])[0];
    const tr = q => `<tr class="${maxGap > 0 && missing(q) === maxGap ? 'gap' : ''}${drill ? ' drillable' : ''}" ${drill ? `data-cell="${esc(cellKey(q))}" tabindex="0" aria-expanded="false"` : ''}><th scope="row">${esc(ages[q.age] || q.age)} · ${q.neobank ? 'nutzt Neobank' : 'nur klassische Bank'}</th><td>${num(q.target)}</td><td class="ist">${num(q.n)}<span class="bar" aria-hidden="true"><i style="width:${Math.min(100, q.n / q.target * 100)}%"></i></span></td><td class="miss">${num(missing(q))}</td></tr>`;
    const body = `<p class="say">${ageGap && ageGap[1] ? `Am meisten fehlt bei ${esc(ages[ageGap[0]])}-Jährigen. <span>${num(ageGap[1])} von ${num(cells.filter(q => q.age === ageGap[0]).reduce((s, q) => s + q.target, 0))} offen.</span>` : 'Alle Gruppen haben ihr Soll.'}</p>
      <table class="quota"><caption class="sr-only">Quotentabelle: Soll, Ist und fehlende gültige Antworten je Gruppe</caption><thead><tr><th scope="col">Gruppe</th><th scope="col">Soll</th><th scope="col">Ist</th><th scope="col">Fehlt</th></tr></thead><tbody>
      ${cells.map(tr).join('')}
      <tr class="tot first"><th scope="row">Gültig gesamt<small>Streckenziel ${num(total.valid.stretch || 300)}</small></th><td>${num(total.valid.target)}</td><td class="ist">${num(total.valid.n)}</td><td class="miss">${num(total.valid.missing)}</td></tr>
      <tr class="tot"><th scope="row">davon mit Yuh<small>Haupt- oder Nebenapp</small></th><td>${num(total.yuh.target)}</td><td class="ist">${num(total.yuh.n)}</td><td class="miss">${num(total.yuh.missing)}</td></tr></tbody></table>`;
    return cell({id: 'quoten', cls: 'c6 r2', label: 'Quotenplan', right: drill ? '<span class="hint">Zeile antippen für Kanäle</span>' : '', body,
      explain: `<p>Gezählt werden nur <b>gültige Fälle</b> nach der Bereinigung: Screening bestanden, alle Pflichtfragen der Route beantwortet, mindestens 150 Sekunden, kein Durchklicken, jede Kennung einmal.</p>
        <p>«Nutzt Neobank» heisst: mindestens eine von Yuh, Neon, Zak oder Revolut unter den genutzten Apps. Yuh zählt als Haupt- oder Nebenapp, einmal je Person.</p>
        <p>«Fehlt» = Soll minus Ist, nie unter null. Die eine grösste Lücke ist farbig hervorgehoben, sonst gibt es keine Ampel. Der Quotenplan sorgt dafür, dass jede Gruppe vertreten ist; die Stichprobe ist keine Zufallsstichprobe und erlaubt keine Aussage über die ganze Bevölkerung.</p>`,
      source: 'Umfrage, Blatt Antworten (S2, T1), bereinigt'});
  }
  function drillRow(data, k) {
    const all = data.v3.survey.quota_by_channel, by = all[k] || {}, entries = sorted(by), age = k.split('|')[0];
    const rel = Object.keys(all).filter(x => x !== k && x.startsWith(age + '|')).flatMap(x => sorted(all[x]));
    const text = entries.length ? `<b>${num(sum(by))} gültige Antworten in dieser Gruppe</b>, über ${entries.map(([c, n]) => esc(CHANNELS[c] || c) + ' ' + num(n)).join(', ')}.`
      : `<b>Noch keine Antwort in dieser Gruppe.</b>${rel.length ? ` Die gleiche Altersgruppe kam bisher über ${rel.map(([c, n]) => esc(CHANNELS[c] || c) + ' ' + num(n)).join(', ')}.` : ''}`;
    return `<tr class="drill"><td colspan="4">${text}</td></tr>`;
  }

  // Ertrag über Organisationslinks: Fälle der Befragung, unabhängig vom Versandblatt (M6).
  const yieldLists = f => `<h3>Gültige Antworten über Organisationslinks nach Kategorie</h3><div class="list">${sorted(f.organization_categories).map(([k, v]) => row(esc(k), '', num(v))).join('') || empty('Noch keine.')}</div>
        <h3>Gültige Antworten über Organisationslinks nach Rekrutierungssprache</h3><div class="list">${sorted(f.recruitment_languages).map(([k, v]) => row(esc(({de: 'Deutsch', fr: 'Französisch', it: 'Italienisch', en: 'Englisch'})[k] || k), '', num(v))).join('') || empty('Noch keine.')}</div>`;
  function outreachCell(data) {
    const O = data.outreach, f = data.methods.A.field;
    if (!ready(O)) return cell({id: 'organisationen', label: 'Organisationen', body: unknown() + (ready(f) ? `<p class="aside"><b>${num(sum(f.organizations))}</b> gültige Antworten über Organisationslinks.</p><details class="more" data-key="org-gruppen"><summary>Je Kategorie und Sprache</summary>${yieldLists(f)}</details>` : '')});
    const w = n => O.sent ? Math.max(n ? 0.6 : 0, n / O.sent * 100) : 0, yieldN = ready(f) ? sum(f.organizations) : null, zusage = O.kinds.Zusage || 0;
    const group = obj => `<div class="list">${Object.entries(obj || {}).sort((a, b) => b[1].sent - a[1].sent || a[0].localeCompare(b[0])).map(([k, v]) => row(esc(k), '', `${num(v.answered)} von ${num(v.sent)}`)).join('')}</div>`;
    const kinds = [['Zusage', 'Zusage'], ['Weiterleitung', 'Weitergeleitet'], ['Absage', 'Absage'], ['Frage', 'Rückfrage'], ['Unklar', 'Unklar'], ['Automatisch', 'nur automatisch'], ['Unzustellbar', 'unzustellbar']];
    const body = O.sent ? `<div class="fun" role="img" aria-label="${num(O.sent)} angeschrieben, ${num(O.answered)} geantwortet, ${num(zusage)} machen mit">
        <div><span>angeschrieben</span><span class="b"><i style="width:100%"></i></span><span class="v">${num(O.sent)}</span></div>
        <div><span>haben geantwortet</span><span class="b"><i style="width:${w(O.answered)}%"></i></span><span class="v">${num(O.answered)}</span></div>
        <div><span>machen mit</span><span class="b"><i style="width:${w(zusage)}%"></i></span><span class="v">${num(zusage)}</span></div></div>
      <p class="note">${pct(O.share, 1)} der angeschriebenen Organisationen haben geantwortet.</p>
      <p class="aside">Andere Einheit, darum nicht im Trichter: ${yieldN == null ? 'unbekannt' : `<b>${num(yieldN)}</b> ${yieldN === 1 ? 'gültige Antwort kam' : 'gültige Antworten kamen'}`} über Organisationslinks.</p>
      <details class="more" data-key="org-gruppen"><summary>Je Art, Kategorie und Sprache</summary><div class="list">${kinds.map(([k, l]) => row(esc(l), '', num(O.kinds[k] || 0))).join('')}${row('ohne Antwort', '', num(O.no_reply))}</div>
        <h3>Organisationen je Kategorie</h3>${group(O.by_category)}<h3>Organisationen je Sprache</h3>${group(O.by_language)}
        ${ready(f) ? yieldLists(f) : ''}</details>`
      : empty('Noch keine Organisation angeschrieben.');
    return cell({id: 'organisationen', label: 'Organisationen · Trichter', body,
      explain: `<p>Gezählt wird je <b>Organisation</b>, nicht je Mailverlauf. Nenner: ${num(O.sent)} verschiedene Organisationen mit mindestens einer versandten Mail (aus ${num(O.rows.sent)} Versandzeilen; ${num(O.rows.deferred)} zurückgestellt und ${num(O.rows.errors)} Fehler gelten nicht als versandt).</p><p>Geantwortet: mindestens eine inhaltliche Antwort; massgeblich ist die jüngste Einordnung. Eigene Adressen, Unzustellbares und automatische Antworten zählen nicht. ${num(O.replies.unassigned)} Rückmeldungen ohne sichere Zuordnung bleiben ausserhalb.</p><p>Die gültigen Antworten über Organisationslinks sind Fälle der Befragung, nicht Organisationen; sie stehen deshalb neben dem Trichter.</p>`,
      source: 'Team-Blatt, Versand und Rückmeldungen; Umfrage (OR-Kennungen)'});
  }

  function qualityCell(data) {
    const f = data.methods.A.field, q = f && f.quality;
    if (!ready(f) || !q) return cell({id: 'qualitaet', label: 'Datenqualität', body: unknown()});
    return cell({id: 'qualitaet', label: 'Datenqualität', body: `<p class="say">${num(q.valid)} von ${num(q.complete)} fertigen Fragebogen zählen.</p>
      ${row('unter der Zeitgrenze', `${q.threshold_s === 150 ? '2½' : num(q.threshold_s / 60)} Min., Regel der Gruppe`, `${num(q.speeders)} · ${q.complete ? pct(q.speeders / q.complete) : '–'}`)}
      ${row('durchgeklickt', '', num(q.straightline))}
      ${row('typische Dauer', `Median, n = ${num(q.duration.n)}; mittlere Hälfte ${clock(q.duration.q1)}–${clock(q.duration.q3)}`, clock(q.duration.median))}
      ${row('vorher entfernt', 'doppelte Kennung, nicht in den fertigen Fragebogen', num(q.duplicates))}`,
      explain: `<p>Gespeicherte Zeilen ohne Test, Pretest und alte Versionen: ${num(q.stored)}. Passt nicht in die Zielgruppe: S1 ${num(q.screenouts.s1)} · S2 ${num(q.screenouts.s2)} · S3 ${num(q.screenouts.s3)}. Fertig heisst: Screening bestanden und alle Pflichtfragen der Route beantwortet.</p>
        <p>Ausschlüsse in fester Reihenfolge, je Fall nur ein Grund: Duplikat, Screening, unvollständig, unter ${q.threshold_s} Sekunden, Durchklicken (gleicher Wert in allen zehn Zeilen von mindestens zwei Matrizen).</p>
        <p>Die Schwelle von ${q.threshold_s} Sekunden ist eine Projektregel (rund 40 % des Pretest-Medians), kein Beweis schlechter Qualität. Dauer: Median und Quartile ohne Kappung.</p>`, source: 'Umfrage, Blatt Antworten'});
  }

  const FAIL_LABELS = {'nicht angeboten': 'nicht angeboten', 'nicht zugaenglich': 'nicht zugänglich', erfolglos: 'erfolglos', ausgefallen: 'ausgefallen'};
  const bStarted = B => ready(B) && (B.n || Object.values(B.failures || {}).some(v => v > 0) || B.banks.some(b => b.stop || b.contacts || b.messages || b.minutes));
  function pendingCell(data) {
    const B = data.methods.B.field, C = data.methods.C.field, rows = [];
    if (ready(B) && !bStarted(B)) rows.push(row('Servicetest', 'noch kein Kontakt · keine Ausfälle · keine Belastung', '0 / ' + num(B.target)));
    if (ready(C) && !C.n) rows.push(row('Bewertungen codiert', 'doppelt codiert: noch keine · Übereinstimmung noch nicht berechenbar' + (C.consensus_state === 'unknown' ? ' · Konsensblatt unbekannt' : ''), '0 / ' + num(C.planned)));
    rows.push(`<div class="ln" id="karte-freigabe"><span>Ergebnisse der Umfrage<small>${data.released ? 'freigegeben' : 'erscheinen erst nach der Freigabe'}</small></span><span class="v">${data.released ? 'da' : 'ab ' + esc(dateWd(todayOf({generated_at: data.release_at})))}</span></div>`);
    return cell({id: 'ohne-abschluss', label: data.released ? 'Auswertung' : 'Noch ohne Abschluss', body: rows.join('')});
  }
  function serviceCell(data) {
    const f = data.methods.B.field;
    if (!ready(f)) return cell({id: 'servicetest', label: 'Servicetest', body: unknown()});
    const failed = Object.entries(f.failures || {}).filter(([, v]) => v > 0);
    return cell({id: 'servicetest', label: 'Servicetest', body: `<p class="say">${num(f.n)} von ${num(f.target)} Kontakten durchgeführt.</p><div class="two"><i style="width:${Math.min(100, f.n / f.target * 100)}%;background:var(--ink)"></i></div>
      <p class="note">${failed.length ? 'Ausfälle, nicht im Soll: ' + failed.map(([k, v]) => `${FAIL_LABELS[k] || k} ${num(v)}`).join(' · ') : 'Keine Ausfälle.'}</p>
      ${f.banks.map(b => row(esc(b.bank), `${num(b.contacts)} von 14 Kontakten · ${num(b.messages)} von 42 Nachrichten · ${num(b.minutes)} von 140 Minuten`, `${num(b.n)} / ${num(b.planned)}${b.stop ? ' · Stopp' : ''}`)).join('')}`,
      explain: '<p>Nur durchgeführte Kontakte zählen gegen die 48 geplanten (4 Anbieter × 3 Anliegen × 2 Kanäle × 2 Wiederholungen). Ausfälle stehen je Code getrennt und füllen das Soll nie auf.</p><p>Belastung je Anbieter inklusive echter Proben: Stopp ab 14 Kontakten, 42 Nachrichten oder 140 Gesprächsminuten.</p>', source: 'Team-Blatt, Plan und Beobachtung; Testprotokoll B'});
  }
  function codingCell(data) {
    const f = data.methods.C.field;
    if (!ready(f)) return cell({id: 'codierung', label: 'Bewertungen', body: unknown()});
    const rest = f.rest || {};
    return cell({id: 'codierung', label: 'Bewertungen', body: `<p class="say">${num(f.n)} von ${num(f.planned)} Bewertungen codiert.</p><div class="two"><i style="width:${f.planned ? Math.min(100, f.n / f.planned * 100) : 0}%;background:var(--ink)"></i></div>
      ${row('doppelt codiert', 'Soll: aufgerundet 20 % der codierten je Zelle', `${num(f.double)} / ${num(f.double_target)}`)}${row('noch zu klären', f.consensus_open == null ? 'Konsensblatt unbekannt' : 'Abweichung ohne Entscheid', f.consensus_open == null ? '–' : num(f.consensus_open))}${row('Sonstiges', f.rest ? `Restkategorie, n = ${num(rest.n)}` : 'Restkategorie unbekannt', rest.n ? pct(rest.share) : '–')}
      <details class="more" data-key="c-zellen"><summary>Abgleich je Zelle (${num(f.cells.length)})</summary><div class="list">${f.cells.map(c => row(esc(c.cell.join(' · ')), `n = ${num(c.n)} · ${pct(c.double_share)} doppelt · ${c.consensus_open == null ? 'Konsens unbekannt' : num(c.consensus_open) + ' offen'}`, `${num(c.double)} / ${num(c.double_target)}`)).join('')}</div></details>`,
      explain: '<p>Doppelcodierung: mindestens aufgerundet 20 % je Anbieter, Quelle, Zeitfenster und Schicht. Konsens offen: Abweichung in einem der acht Vergleichsfelder ohne Entscheid. Restkategorie (10 Sonstiges): Alarm über 15 % ab n = 20.</p>', source: 'Team-Blatt, Zuordnung, Bewertungen, Doppelcodierung, Konsens'});
  }
  function kappaCell(data) {
    const f = data.methods.C.field, ag = f && f.agreement;
    if (!ready(f) || !ag) return cell({id: 'kappa', label: 'Übereinstimmung', body: unknown()});
    const c = x => x.state === 'keine Fälle' ? '<td colspan="2" class="muted">keine Fälle</td>' : `<td>${pct(x.agree)}</td><td class="${x.state === 'unter Schwelle' ? 'below' : ''}">${x.state === 'undefiniert' ? 'undefiniert' : num(x.kappa, 2)}</td>`;
    const below = ag.pairs.reduce((a, p) => a + p.features.filter(x => x.state === 'unter Schwelle').length, 0);
    return cell({id: 'kappa', label: 'Übereinstimmung', body: ag.pairs.length ? `<p class="say">${below ? `${num(below)} Merkmale liegen unter Kappa 0,6.` : 'Alle berechenbaren Merkmale liegen bei Kappa 0,6 oder höher.'}</p>${ag.pairs.map((p, i) => `<details class="pair" data-key="kappa-${esc(p.pair.join('-'))}" ${i === 0 ? 'data-default-open' : ''}><summary><span>${esc(name(p.pair[0]))} und ${esc(name(p.pair[1]))}</span><small>${esc(p.providers.join(', '))} · n = ${num(p.n)}</small></summary>
      <div class="table-wrap"><table class="kappa plain"><thead><tr><th scope="col">Merkmal</th><th scope="col">n</th><th scope="col">gleich</th><th scope="col">Kappa</th></tr></thead><tbody>${p.features.map(x => `<tr><th scope="row">${esc(x.label)}</th><td>${num(x.n)}</td>${c(x)}</tr>`).join('')}</tbody></table></div></details>`).join('')}`
      : empty('Sobald dieselbe Bewertung von zwei Personen codiert ist, erscheint hier die Übereinstimmung je Paar.'),
      explain: '<p><b>Cohens Kappa je festem Paar</b>: p<sub>o</sub> = Anteil gleicher Entscheide (Spalte «gleich», beobachtet), Kappa = (p<sub>o</sub> − p<sub>e</sub>) / (1 − p<sub>e</sub>), zufallskorrigiert. «Undefiniert» heisst p<sub>e</sub> = 1. Unter 0,6 (Gruppenentscheid) ist markiert, nie ausgeblendet. Kein Wert über alle Paare zusammen.</p>', source: 'Team-Blatt, Bewertungen und Doppelcodierung; Codebuch C'});
  }
  function auditCell(A) {
    const a = A.field.audit;
    return cell({id: 'bereinigung', cls: 'c12', label: 'Bereinigung nachvollziehen', body: `${row('ausgeschlossen', 'von ' + num(a.input) + ' Zeilen', num(a.excluded))}${row('gültig ohne Dauerregel', 'Sensitivitätsrechnung', num(a.sensitivity_n))}${Object.keys(a.reasons).length ? sorted(a.reasons).map(([k, v]) => row(esc(k), '', num(v))).join('') : empty('Keine Ausschlüsse im aktuellen Stand.')}`,
      explain: '<p>Erste Kennung bleibt; Ausschlussgründe exklusiv in Prüfreihenfolge.</p>', source: 'Umfrage, Blatt Antworten'});
  }
  function askCell() {
    const href = q => `${ASSISTANT.path}?q=${encodeURIComponent(q)}`;
    return cell({id: 'frag', cls: 'c12 soft', label: 'Frag ' + ASSISTANT.name, body: `<a class="ask" href="${esc(ASSISTANT.path)}">Frag nach dem Stand, zum Beispiel «Wo fehlen noch Antworten?»</a>
      <div class="chips">${['Wo fehlen Antworten?', 'Welcher Kanal bringt am meisten?', 'Was ist bis Sonntag zu tun?'].map(q => `<a href="${esc(href(q))}">${esc(q)}</a>`).join('')}</div>`});
  }
  // Ergebnisse erst nach der serverseitigen Freigabe (Inhalt wie bisher).
  const QUESTIONS = {t0: 'Ungestützte Bekanntheit', t1: 'Genutzte Banking-Apps', t2: 'Hauptapp', t2b: 'Rolle der Hauptapp', t3b: 'Erster Schritt bei einem Problem', t3c: 'Weniger Nutzung nach ungelöstem Problem', t3c2: 'Kontakt vor dem Wechsel', t3c_app: 'App des Wechsels', t4a: 'Erfahrung mit dem Kundendienst', t5: 'Kontakt in den letzten zwölf Monaten', t6: 'Anbieter des letzten Kontakts', t7: 'Erster Kontaktweg', t8: 'Anliegen', t9: 'Wartezeit auf einen Menschen', t10: 'Beim ersten Austausch gelöst', t10b: 'Heute gelöst', t11: 'Zufriedenheit', t12: 'Offene Kontakterfahrung', t4c: 'Erfahrung mit Yuh', t13a: 'Gestützte Bekanntheit von Yuh', t13: 'Offene Differenzierung', t14a: 'Schweizer Standort bekannt', t14b: 'Telefonkontakt bekannt', t15: 'Mehrwert Standort Schweiz', t15b: 'Mehrwert Telefon', t16p: 'Bevorzugter Lösungsweg', t16q: 'Grund für Selbstbedienung', t16b: 'Unterscheidung durch Kundendienst', t20: 'Kanton', t21: 'Sprache der Banking-App'};
  const FEATURES = ['Rasche Antwort eines Menschen', 'Beim ersten Kontakt gelöst', 'Direkter Austausch mit Menschen', 'Am Abend erreichbar', 'Am Wochenende erreichbar', 'Telefonkontakt', 'Mitarbeitende in der Schweiz', 'Bevorzugte Sprache', 'Weiteres Vorgehen erfahren', 'Selbst in der App lösen'];
  const question = k => { const m = /^(t3|t4|t4b)_(\d+)$/.exec(k); return k.toUpperCase() + ' · ' + (m ? ({t3: 'Wichtigkeit', t4: 'Hauptapp', t4b: 'Yuh'}[m[1]] + ' / ' + FEATURES[+m[2] - 1]) : QUESTIONS[k] || k); };
  const distribution = q => q.categories ? q.categories.map(c => `${esc(c.label)} ${pct(c.share)} (${num(c.count)})`).join(' · ') : `${num(q.n)} ausgefüllt · ${esc(q.kind)}`;
  function resultCells(data) {
    const A = data.methods.A.results, B = data.methods.B.results, C = data.methods.C.results, out = [];
    out.push(cell({id: 'ergebnisse-a', cls: 'c12', label: 'Ergebnisse der Befragung', body: A ? `<p class="note">${esc(A.main.note || '')}</p><h3>F1 · Bekanntheit und Mehrwert bei Neobank-Nutzenden (n = ${num(A.main.F1.n)})</h3><div class="table-wrap"><table class="plain result"><thead><tr><th scope="col">Frage</th><th scope="col">n</th><th scope="col">Verteilung</th></tr></thead><tbody>${A.main.F1.table.map(q => `<tr><th scope="row">${esc(question(q.question))}</th><td>${num(q.n)}</td><td class="wrap">${distribution(q)}</td></tr>`).join('')}</tbody></table></div>
      <details class="more" data-key="f2"><summary>F2 · Erwartungen und Yuh-Beurteilung</summary><div class="table-wrap"><table class="plain result"><thead><tr><th scope="col">Merkmal</th><th scope="col">Wichtig (4/5)</th><th scope="col">Yuh gut (4/5)</th></tr></thead><tbody>${A.main.F2.table.map(r => `<tr><th scope="row">${esc(FEATURES[r.feature - 1])}</th><td>${pct(r.importance.top2.share)} · n = ${num(r.importance.valid_n)}</td><td>${pct(r.yuh.top2.share)} · n = ${num(r.yuh.valid_n)}</td></tr>`).join('')}</tbody></table></div></details>
      <details class="more" data-key="alle-fragen"><summary>Alle Fragen mit Fallzahl</summary><div class="list">${A.main.questions.map(q => row(esc(question(q.question)), distribution(q), 'n = ' + num(q.n))).join('')}</div></details>
      <p class="note">Sensitivität ohne Dauerregel: n = ${num(A.sensitivity.n)}.</p>` : unknown(),
      explain: '<p>Anteile je Antwortkategorie mit der Fallzahl der Frage; der Nenner folgt der Route. «Kann ich nicht sagen» ist eine eigene Kategorie und wird nie gemittelt. Keine Intervalle und keine Tests: Die Stichprobe ist geeignet für die Fragestellung, aber keine Zufallsstichprobe.</p>', source: 'Umfrage, bereinigte Antworten'}));
    const part = p => p.share == null ? `${num(p.x)} von ${num(p.n)}` : `${pct(p.share)} <small>(${num(p.x)} von ${num(p.n)})</small>`;
    const CH = {telefon: 'Telefon', chat: 'Chat', mail: 'E-Mail', formular: 'Formular'};
    out.push(cell({id: 'ergebnisse-b', cls: 'c12', label: 'Ergebnisse Servicetest', body: B && B.cells ? `<div class="table-wrap"><table class="plain result"><thead><tr><th scope="col">Anbieter · Kanal</th><th scope="col">n</th><th scope="col">Mensch in Frist</th><th scope="col">Mindestantwort in Folgefrist</th><th scope="col">Median bis Mensch</th><th scope="col">Erster Kontakt beantwortet</th><th scope="col">Richtig</th></tr></thead><tbody>${B.cells.map(c => `<tr><th scope="row">${esc(c.bank)} · ${esc(CH[c.channel] || c.channel)}</th><td>${num(c.n)}</td><td>${part(c.first_human)}</td><td>${part(c.minimum_answer)}</td><td>${c.time_to_human.median == null ? '–' : num(Math.round(c.time_to_human.median)) + ' min'}</td><td>${part(c.first_contact.yes)}</td><td>${part(c.correct)}</td></tr>`).join('')}</tbody></table></div>` : unknown(),
      explain: `<p>Fristen je Ereignis: erste menschliche Antwort bei Telefon in 20 Minuten, Chat in 60 Minuten, E-Mail und Formular in 24 Stunden ab Start. «x von n» immer; ein Anteil erst ab n = ${B ? B.min_share_n : 4}, ein Median erst ab ${B ? B.min_median_n : 3} Werten. Explorative Beobachtung, keine Hochrechnung.</p>`, source: 'Team-Blatt, Beobachtung; Testprotokoll B'}));
    out.push(cell({id: 'ergebnisse-c', cls: 'c12', label: 'Themen je Auswertungszelle', body: C ? C.map(r => `<details class="more" data-key="c-${esc(r.cell.join('-'))}"><summary>${esc(r.cell.join(' · '))} · n = ${num(r.n)}</summary>${r.small_n ? '<p class="note">n unter 20: berichten, nicht vergleichen.</p>' : ''}<div class="list">${r.categories.map(c => row('Kategorie ' + num(c.category), '', `${num(c.count)} von ${num(c.n)} · ${pct(c.share)}`)).join('')}</div></details>`).join('') : unknown(),
      explain: '<p>Anteil Bewertungen mit der Kategorie an den codierten Bewertungen der Zelle. Verglichen wird nur gleich gegen gleich.</p>', source: 'Team-Blatt, Bewertungen mit Konsens'}));
    return out.join('');
  }

  function marketingPanel(data) {
    const A = data.methods.A, f = A.field, B = data.methods.B.field, C = data.methods.C.field, st = stages(data), today = todayOf(data);
    const next = ready(f) ? st.find(s => s.n > f.n) : null;
    const disp = !ready(f) ? display('Rücklauf gerade unbekannt.', 'Die Quelle ist nicht erreichbar; fehlende Werte sind nicht null.')
      : next ? display(`${num(f.n)} gültige Antworten.`, `Noch ${num(next.n - f.n)} bis zur nächsten Etappe ${diffDays(today, next.due) === 0 ? 'heute.' : 'am ' + weekday(next.due) + (diffDays(today, next.due) > 6 ? ', ' + dateShort(next.due) : '.')}`)
      : display(`${num(f.n)} gültige Antworten.`, f.n >= 100 ? 'Das Mindestziel von 100 ist erreicht.' : `Noch ${num(100 - f.n)} bis 100.`);
    const O = data.outreach, starts = ready(f) ? f.starts : null, yuh = ready(f) ? (f.totals ? f.totals.yuh : {n: (f.yuh_target || {}).n, target: 30}) : null;
    const hasDaily = f && f.daily && typeof f.daily === 'object';
    const chips = ready(f) ? [chip('Gültig', num(f.n), f.n), hasDaily ? chip('Heute', '+' + num(f.daily[today] || 0)) : '', hasDaily ? chip('Gestern', '+' + num(f.daily[addDays(today, -1)] || 0)) : '', chip('Mit Yuh', `${num(yuh.n)} / ${num(yuh.target)}`),
      ready(O) ? `<span>Organisationen <b>${num(O.answered)} / ${num(O.sent)}</b> geantwortet</span>` : '', ready(starts) ? chip('Starts seit ' + clockTime(starts.since), num(starts.total.begonnen)) : ''] : [];
    const cells = [safe('etappe', () => heroCell(data)), safe('naechste', () => nextCell(data)), safe('kanaele', () => channelsCell(data)), safe('quoten', () => quotaCell(data)), safe('organisationen', () => outreachCell(data))];
    // Halbe Zellen paarweise; bei ungerader Zahl wird die letzte ganz breit (keine Lücke im Raster).
    const halves = [safe('qualitaet', () => qualityCell(data))];
    if (bStarted(B) || !ready(B)) halves.push(safe('servicetest', () => serviceCell(data)));
    const cStarted = (ready(C) && C.n) || !ready(C);
    if (cStarted) halves.push(safe('codierung', () => codingCell(data)));
    halves.push(safe('ohne-abschluss', () => pendingCell(data)));
    if (halves.length % 2) halves[halves.length - 1] = halves[halves.length - 1].replace('class="cell c6', 'class="cell c12');
    cells.push(...halves);
    if (cStarted) cells.push(safe('kappa', () => kappaCell(data)).replace('class="cell c6', 'class="cell c12'));
    if (A.field && A.field.audit) cells.push(safe('bereinigung', () => auditCell(A)));
    if (data.released) cells.push(safe('ergebnisse', () => resultCells(data)));
    cells.push(askCell());
    return disp + (chips.length ? live(chips.filter(Boolean)) : '') + `<div class="bento">${cells.join('')}</div>`;
  }

  // ---------- Projektmanagement ----------
  const STATUS = {offen: 'offen', 'läuft': 'läuft', 'fällig': 'fällig', 'in Prüfung': 'in Prüfung', fertig: 'fertig'};
  // Nur Anzeige: angehängtes «bis TT.MM.» und ein vorangestelltes Rautenzeichen aus Notion-Titeln weglassen.
  const stripDate = t => String(t || '').replace(/^\s*◆\s*/, '').replace(/\s+bis\s+\d{1,2}\.\d{1,2}\.?$/, '');
  const extPm = (data, k) => data.v3 && ready(data.v3.pm) && ready(data.v3.pm[k]) ? data.v3.pm[k] : null;
  function pmSeriesCell(data) {
    const s = extPm(data, 'series');
    if (!s || s.points.length < 2) return '';
    const u = s.undated || {}, lastP = s.points[s.points.length - 1];
    return `<section class="cell c8" id="karte-verlauf" aria-labelledby="titel-verlauf"><div class="k"><h2 id="titel-verlauf">Projektverlauf · Umfang, begonnen, fertig</h2><button class="link" type="button" data-table="pmburn">Als Tabelle</button></div>
      ${s.points.length >= 2 ? `<div class="chart" data-chart="pmburn"><svg role="img" aria-label="Heute: Umfang ${num(lastP.scope)} Pakete, begonnen ${num(lastP.started)}, fertig ${num(lastP.done)}"></svg><div class="tip" hidden></div></div><p class="tapline" aria-live="polite"></p>
      <div class="legend"><span><i class="l-plan"></i>Umfang (Pakete)</span><span><i class="l-mid"></i>begonnen</span><span><i class="l-ist"></i>fertig</span><span><i class="l-today"></i>heute</span></div>`
      : empty(`Heute: Umfang ${num(lastP.scope)}, begonnen ${num(lastP.started)}, fertig ${num(lastP.done)}. Der Verlauf zeichnet sich ab dem zweiten Tag mit Daten.`)}
      <div class="burn-table" hidden><table class="plain"><thead><tr><th scope="col">Tag</th><th scope="col">Umfang</th><th scope="col">begonnen</th><th scope="col">fertig</th></tr></thead><tbody>${s.points.map(p => `<tr><th scope="row">${esc(dateWd(p.day))}</th><td>${num(p.scope)}</td><td>${num(p.started)}</td><td>${num(p.done)}</td></tr>`).join('')}</tbody></table></div>
      ${how('verlauf', `<p>Jeder Punkt entsteht nur aus festen Daten: Umfang nach dem Erstellungsdatum in Notion, begonnen nach dem Ist-Start (bei fertigen Paketen ohne Ist-Start nach dem Ist-Ende), fertig nach dem Ist-Ende. Fehlt einem Paket ein solches Datum (ohne festes Datum), wird kein Verlauf gezeigt, weil er sich sonst bei jeder Abfrage verschieben würde. Der heutige Punkt muss der Live-Zählung entsprechen. Keine Prognose.</p>`, 'Notion PSP')}</section>`;
  }
  function nextDueCell(data, pm) {
    const d = pm.deadline_buckets, ext = extPm(data, 'deadlines');
    if (!d) return cell({id: 'fristen', cls: 'c4', label: 'Fristen', body: unknown()});
    const list = ext ? ext.items : d.next, first = list[0], today = pm.today || todayOf(data), ms = (pm.milestones || []).filter(m => !m.reached && m.due && m.due >= today)[0];
    const days = first ? diffDays(today, first.due) : null;
    const label = first ? `Nächste Frist · ${dateWd(first.due)}` : 'Fristen';
    const more = [...(ms ? [{title: stripDate(ms.title), due: ms.due, ms: true}] : []), ...list.slice(1, 4)].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 3);
    const body = first ? `<div class="big ${days >= 0 ? 'signal' : 'late'}">${num(Math.abs(days))}<small>${days >= 0 ? (days === 1 ? 'Tag' : 'Tage') : 'Tage überfällig'}</small></div>
      <p class="say">${esc(stripDate(first.title))}. <span>${esc(name(first.owner))} · ${esc(STATUS[first.status] || 'Status unbekannt')}.${!d.overdue && !d.this_week ? ' Bis Sonntag ist kein Arbeitspaket fällig.' : ''}</span></p>
      ${more.map(x => row(esc(stripDate(x.title)), x.ms ? 'Meilenstein' : esc(name(x.owner)), esc(dateWd(x.due)), x.due < today ? 'late' : '')).join('')}`
      : empty('Keine offenen Pakete mit Frist.');
    const all = ext ? `<details class="more" data-key="fristen-alle"><summary>Alle ${num(ext.items.length)} Pakete bis ${esc(dateShort(ext.horizon))}</summary><div class="list">${ext.items.map(x => row(esc(stripDate(x.title)), `${esc(x.ref)} · ${esc(name(x.owner))} · ${esc(STATUS[x.status] || 'Status unbekannt')}`, esc(dateWd(x.due)), x.due < today ? 'late' : '')).join('')}</div></details>`
      : `<details class="more" data-key="fristen-alle"><summary>Die nächsten ${num(d.next.length)} offenen Pakete</summary><div class="list">${d.next.map(x => row(esc(stripDate(x.title)), `${esc(x.ref)} · ${esc(name(x.owner))} · ${esc(STATUS[x.status] || 'Status unbekannt')}`, esc(dateWd(x.due)), x.due < today ? 'late' : '')).join('')}</div></details>`;
    return `<section class="cell c4" id="karte-fristen" aria-labelledby="titel-fristen"><div class="k"><h2 id="titel-fristen">${esc(label)}</h2></div>${body}
      <p class="note">${num(d.overdue)} überfällig · ${num(d.this_week)} bis ${esc(dateWd(d.until))} · ${num(d.next_two_weeks)} bis ${esc(dateShort(d.horizon))}</p>${all}
      ${how('fristen', `<p>Offene Arbeitspakete nach Plan-Ende: überfällig (vor heute), bis Sonntag ${esc(dateShort(d.until))}, dann die zwei Wochen bis ${esc(dateShort(d.horizon))}.${ext ? ' «Alle» zeigt genau die Pakete dieser drei Zähler.' : ' Die Liste zeigt die nächsten offenen Pakete, auch nach dem Horizont.'}</p>`, 'Notion PSP')}</section>`;
  }
  function ganttCell(data, pm) {
    const ext = extPm(data, 'deadlines');
    if (!ext) return '';
    const today = pm.today || todayOf(data), days = Array.from({length: 14}, (_, i) => addDays(today, i));
    const abs = ready(pm.absences) ? pm.absences.items : [], items = ext.items.filter(x => x.due >= today && x.due <= days[13]);
    const lanes = group === 'paket' ? items.map(x => [stripDate(x.title), [x], x.owner]) : PEOPLE.map(c => [NAMES[c], items.filter(x => x.owner === c), c]);
    const pos = d => (diffDays(today, d) + 0.5) / 14 * 100;
    const lane = ([label, its, owner]) => {
      const a = abs.filter(x => x.person === owner && x.bis >= today && x.von <= days[13]).map(x => {const s = Math.max(0, diffDays(today, x.von)), e = Math.min(13, diffDays(today, x.bis)); return `<span class="away" style="left:${s / 14 * 100}%;width:${(e - s + 1) / 14 * 100}%" title="abwesend ${esc(dateShort(x.von))}–${esc(dateShort(x.bis))}"></span>`;}).join('');
      const short = t => t.length > 34 ? t.slice(0, 32).trim() + '…' : t;
      const marks = its.map((x, i) => `<span class="dl${x === items[0] ? ' sig' : ''}${pos(x.due) > 60 ? ' l' : ''}" style="left:${pos(x.due)}%;top:${14 + i * 22}px" title="${esc(stripDate(x.title))} · ${esc(dateWd(x.due))}">${esc(group === 'paket' ? dateWd(x.due) : short(stripDate(x.title)))}</span>`).join('');
      return `<div class="nm">${esc(label)}</div><div class="lane" style="min-height:${Math.max(46, its.length * 22 + 10)}px">${a}${marks}${its.length || a ? '' : '<span class="none">keine Frist in 14 Tagen</span>'}<span class="now" style="left:${0.5 / 14 * 100}%"></span></div>`;
    };
    const header = days.map((d, i) => `<div class="hd${i === 0 ? ' today' : ''}${[0, 6].includes(day(d).getUTCDay()) ? ' we' : ''}">${WD[day(d).getUTCDay()]} ${day(d).getUTCDate()}</div>`).join('');
    const free = PEOPLE.filter(c => !items.some(x => x.owner === c) && !abs.some(x => x.person === c));
    const mobile = `<div class="only-m">${PEOPLE.filter(c => !free.includes(c)).map(c => {const its = items.filter(x => x.owner === c), a = abs.filter(x => x.person === c); return row(esc(NAMES[c]), its.map(x => esc(stripDate(x.title))).join(' · ') + (a.length ? (its.length ? ' · ' : '') + 'abwesend ' + a.map(x => dateShort(x.von) + '–' + dateShort(x.bis)).join(', ') : ''), its.length ? esc(its[0].due === its[its.length - 1].due ? dateWd(its[0].due) : dateShort(its[0].due) + '–' + dateShort(its[its.length - 1].due)) : '–', its.length && its[0] === items[0] ? 'sig' : '');}).join('')}${free.length ? row(esc(free.map(c => NAMES[c]).join(', ')), 'keine Frist in 14 Tagen', '–') : ''}</div>`;
    return `<section class="cell c12" id="karte-gantt" aria-labelledby="titel-gantt"><div class="k"><h2 id="titel-gantt">Fristen der nächsten 14 Tage · je ${group === 'paket' ? 'Paket' : 'Person'}</h2></div>
      <div class="gantt only-d" role="img" aria-label="Plan-Enden der offenen Pakete in den nächsten 14 Tagen"><div class="hd"></div>${header}${(lanes.length ? lanes : [['keine Pakete', [], null]]).map(lane).join('')}</div>${mobile}
      <div class="legend only-d"><span><i class="l-dia"></i>Plan-Ende eines Pakets</span><span><i class="l-away"></i>abwesend${ready(pm.absences) ? (abs.length ? '' : ' (zurzeit niemand eingetragen)') : ' (Stand unbekannt)'}</span><span><i class="l-today"></i>heute</span></div></section>`;
  }
  function milestonesCell(pm) {
    const ms = pm.milestones || [], today = pm.today || '', upcoming = ms.filter(m => !m.reached), reached = ms.filter(m => m.reached).length;
    return `<section class="cell c4" id="karte-meilensteine" aria-labelledby="titel-meilensteine"><div class="k"><h2 id="titel-meilensteine">Meilensteine</h2><span class="hint">${num(reached)} von ${num(ms.length)} erreicht</span></div>
      ${upcoming.length ? `<ol class="steps">${upcoming.slice(0, 5).map((m, i) => `<li class="${i === 0 ? 'next' : ''}${m.due && m.due < today ? ' late' : ''}"><span>${esc(stripDate(m.title))}<small>${esc(m.ref || '')}${m.gate ? ' · Tor ' + esc(m.gate) : ''}</small></span><span class="v">${esc(dateWd(m.due))}</span></li>`).join('')}</ol>` : empty(ms.length ? 'Alle Meilensteine erreicht.' : 'Keine Meilensteine im Plan.')}
      ${ms.length > 5 ? `<details class="more" data-key="ms-alle"><summary>Alle ${num(ms.length)} Meilensteine</summary><div class="list">${ms.map(m => row(esc(stripDate(m.title)), esc(m.ref || '') + (m.gate ? ' · Tor ' + esc(m.gate) : ''), (m.reached ? 'erreicht · ' : '') + esc(dateShort(m.due)))).join('')}</div></details>` : ''}
      ${how('meilensteine', '<p>Erreicht heisst Status «fertig». Die Phasentore MS-05, MS-02, MS-03 und MS-06 brauchen zusätzlich die Freigabe «Tor freigegeben». Gezeigt werden die nächsten fünf offenen in Datumsreihenfolge.</p>', 'Notion PSP, Meilensteine')}</section>`;
  }
  function progressCell(data, pm) {
    const p = pm.progress;
    if (!p) return cell({id: 'fortschritt', label: 'Fortschritt', body: unknown()});
    const ext = extPm(data, 'progress'), d = pm.due || {x: pm.done_due, n: pm.planned_due}, t = pm.punctual;
    const bar = p.share == null ? '' : ext && ext.plan_h ? `<div class="two" role="img" aria-label="${pct(p.share)}: fertig ${pct(ext.done_h / ext.plan_h)}, begonnen halb angerechnet ${pct(ext.begun_h / 2 / ext.plan_h)}"><i style="width:${ext.done_h / ext.plan_h * 100}%;background:var(--ink)"></i><i style="width:${ext.begun_h / 2 / ext.plan_h * 100}%;background:var(--fill-2)"></i></div>`
      : `<div class="two" role="img" aria-label="${pct(p.share)}"><i style="width:${p.share * 100}%;background:var(--ink)"></i></div>`;
    const wk = extPm(data, 'punctual_weekly'), weekly = wk ? wk.weeks : null;
    const trend = weekly ? weekly.length >= 4 ? `<h3>Termintreue je Woche</h3><div class="wk" role="img" aria-label="${weekly.map(w => dateShort(w.week) + ': ' + w.x + ' von ' + w.n).join(', ')}">${weekly.slice(-8).map(w => `<div><b>${num(w.x)}/${num(w.n)}</b><span class="col"><i style="height:${w.n ? w.x / w.n * 100 : 0}%"></i></span><small>${esc(dateShort(w.week))}</small></div>`).join('')}</div>`
      : `<p class="note">Termintreue je Woche erscheint ab vier Wochen mit fälligen Paketen; bisher ${plural(weekly.length, 'Woche', 'Wochen')}.</p>` : '';
    return `<section class="cell c6" id="karte-fortschritt" aria-labelledby="titel-fortschritt"><div class="k"><h2 id="titel-fortschritt">Fortschritt nach Ergebnis</h2></div>
      <p class="say">${p.share == null ? 'Nicht berechenbar: Plan-Stunden fehlen.' : `${pct(p.share)} der geplanten Stunden sind als Ergebnis erreicht. <span>Begonnenes zählt halb.</span>`}</p>${bar}
      ${row('fertig · begonnen · offen', 'Pakete', `${num(p.counts.done)} · ${num(p.counts.begun)} · ${num(p.counts.open)}`)}
      <div id="karte-erledigt">${row('bisher fällige Pakete erledigt', 'Plan-Ende bis heute', d.n ? `${num(d.x)} / ${num(d.n)}` : 'noch keins fällig')}</div>
      <div id="karte-termintreue">${t ? row('nachweislich rechtzeitig', `Nenner: alle fälligen · ohne Enddatum, nicht beurteilbar: ${num(t.without_actual_end || 0)}`, t.n ? `${num(t.x)} / ${num(t.n)}` : 'noch nicht messbar') : row('nachweislich rechtzeitig', 'Stand unbekannt', '–')}</div>${trend}
      ${how('fortschritt', `<p>Je Arbeitspaket zählt das Ergebnis, nicht die verbrauchte Zeit: <b>0 %</b> offen, <b>50 %</b> begonnen (Ist-Start gesetzt oder in Arbeit), <b>100 %</b> Status «fertig». Gesamt = Summe (Fortschritt × Plan-Stunden) / Summe Plan-Stunden über ${num(p.weighted_n)} Pakete${p.without_plan ? `; ${num(p.without_plan)} ohne Plan-Stunden zählen nicht mit` : ''}.</p><p>Erledigt: Status «fertig», egal wann. Rechtzeitig: Ist-Ende auf oder vor dem Plan-Ende; Nenner sind alle fälligen Pakete.</p>`, 'Notion PSP')}</section>`;
  }
  function effortCell(pm) {
    const plan = pm.plan_by_person || {}, reserve = pm.reserve_by_person || {}, h = pm.hours || {state: 'unknown'}, max = Math.max(37, ...PEOPLE.map(c => plan[c] || 0));
    const note = h.state === 'leer' ? 'Noch keine Arbeitszeit erfasst. Die Zeit wird beim Abschliessen eines Auftrags automatisch gemessen.' : h.state !== 'ready' ? 'Arbeitszeit derzeit unbekannt: Das Zeitblatt ist nicht erreichbar.' : 'Gearbeitete Stunden: ' + PEOPLE.map(c => NAMES[c] + ' ' + num(h.per_person[c] || 0) + ' h').join(' · ');
    return `<section class="cell c6" id="karte-aufwand" aria-labelledby="titel-aufwand"><div class="k"><h2 id="titel-aufwand">Geplante Stunden je Person</h2></div>
      <p class="say">Strich bei 37 h Gruppenmassstab.</p>
      ${pm.plan_by_person ? PEOPLE.map(c => `<div class="pp"><span>${esc(NAMES[c])}</span><span class="t"><i style="width:${(plan[c] || 0) / max * 100}%"></i><u style="left:${37 / max * 100}%"></u></span><span class="v">${num(plan[c] || 0)} h</span></div>`).join('') : empty('Plan je Person unbekannt.')}
      <p class="note">${esc(note)}</p>
      ${how('aufwand', `<p>Drei Grössen bleiben getrennt: der <b>PSP-Plan</b> je Person aus Notion (Reserve separat: ${PEOPLE.filter(c => reserve[c]).map(c => NAMES[c] + ' ' + num(reserve[c]) + ' h').join(', ') || 'keine'}), der <b>Gruppenmassstab</b> von 37 Stunden je Person und die <b>Schätzung der Schule</b> («zusätzlich ca. 12 Stunden» für 6a, «geschätzter Aufwand 25 Stunden» für 6b, unverbindlich).</p><p>Ist-Stunden kommen aus der Zeiterfassung der Team-App; stornierte Einträge zählen nicht. Ein leeres Zeitblatt heisst «noch nichts erfasst», nicht null Stunden.</p>`, 'Notion PSP; Team-Blatt Projekt_Arbeitszeit; Konzept PA6')}</section>`;
  }
  const K = [['K1', 'Fazit der Analyse 6a korrekt übernommen', 'B1', ['6b-2']], ['K2', 'Ökonomische Ziele nach SMART mit 6 W', 'B2', ['6b-3']], ['K3', 'Vorökonomische Ziele nach SMART mit 6 W', 'B3', ['6b-3']], ['K4', 'Strategieansatz mit Definition und Begründung', 'B4', ['6b-7']],
    ['K5', 'Eine Massnahme im Marketing-Mix 7 P, mit belegtem Entscheid zu Kreativität, Erfolgspotenzial und Umsetzbarkeit', 'B5, B6', ['6b-8']], ['K6', 'Terminplan der Massnahme mit eingerechneter Reserve', 'B7', ['6b-8']], ['K7', 'Umsetzbarkeit und lückenlose Erfolgskontrolle je Ziel', 'B8', ['6b-8', '6b-10']],
    ['K8', 'Budget mit Kostenberechnung je Massnahme', 'B9', ['6b-10']], ['K9', 'Nachhaltigkeit: sozial, ökonomisch, ökologisch', 'B10', ['6b-9']], ['K10', 'Reflexion, Sprache, Quellen, Gestaltung', 'B11–B14', ['6b-12', '6b-13']]];
  function basicsCell(data, pm) {
    const c = pm.confirmations, comp = pm.completeness, r = pm.risks, a = pm.absences || {state: 'unknown'};
    const confirm = `<div id="karte-projektauftrag">${ready(c) ? row('Projektauftrag bestätigt', esc(c.version) + (c.open && c.open.length ? ' · offen: ' + c.open.map(name).join(', ') : '') + (c.objections && c.objections.length ? ' · Einwand: ' + c.objections.map(name).join(', ') : ''), `${num(c.confirmed.length)} von ${num(c.n)}`) : row('Projektauftrag bestätigt', 'Stand unbekannt', '–')}</div>`;
    const labels = {plan: 'ohne Plan-Stunden', owner: 'ohne Verantwortung', done_when: 'ohne «Fertig wenn»', risk: 'ohne verknüpftes Risiko'};
    const psp = pm.state === 'ready' && comp ? `<details class="ln-d" id="karte-psp" data-key="psp"><summary>${row('Arbeitspakete vollständig' + (comp.complete != null && comp.complete === comp.n ? ' <span class="ok" aria-label="erfüllt">✓</span>' : ''), (comp.complete == null ? 'Risiko-Verknüpfung nicht lesbar' : `${num(comp.complete)} von ${num(comp.n)} Paketen vollständig`) + ' · Plan-Stunden, Person, «Fertig wenn», Risiko', comp.complete == null ? '–' : `${num(comp.complete)} / ${num(comp.n)}`)}</summary><div class="list">${Object.keys(labels).map(k => row(labels[k], '', k === 'risk' && !comp.risk_known ? 'unbekannt' : num(comp.missing[k]))).join('')}</div></details>` : '';
    const open = ready(r) ? r.items.filter(x => !/erledigt|geschlossen/i.test(x.status || '')).length : null;
    const risks = ready(r) ? `<details class="ln-d" id="karte-risiken" data-key="risiken"><summary>${row('Risikoregister', 'Einträge mit Status', `${num(open)} von ${num(r.n)} offen`)}</summary><div class="list">${r.items.map(x => row(esc(x.title), '', esc(x.status || 'Status unbekannt'))).join('')}</div></details>` : `<div id="karte-risiken">${row('Risikoregister', 'Stand unbekannt', '–')}</div>`;
    const absence = `<div id="karte-abwesenheiten">${a.state === 'unknown' ? row('Abwesenheiten', 'Stand unbekannt', '–') : a.state !== 'ready' ? row('Abwesenheiten', 'Blatt noch nicht angelegt; es entsteht mit dem ersten Eintrag unter «Heute»', '0') : row('Abwesenheiten', a.n ? a.items.map(x => esc(name(x.person)) + ' ' + esc(dateShort(x.von)) + '–' + esc(dateShort(x.bis)) + (x.now ? ' (jetzt)' : '') + (x.grund ? ' · ' + esc(x.grund) : '')).join(', ') : 'keine laufende oder kommende', num(a.n))}</div>`;
    const ch = pm.chapters_6b && pm.chapters_6b.state === 'ready' ? pm.chapters_6b.items : null;
    const due = ids => {const dd = ids.map(id => ch && ch[id] && ch[id].due).filter(Boolean).sort(); return dd.length ? dateShort(dd[0]) : 'offen';};
    const status = ids => {const s = ids.map(id => ch && ch[id] && ch[id].status).filter(Boolean); return s.length ? Array.from(new Set(s)).join(', ') : 'nicht begonnen';};
    const pa6b = `<details class="ln-d" id="karte-pa6b" data-key="pa6b"><summary>${row('Bewertungskriterien PA6b', '0 von 10 Rasterkriterien mit Beleg erfüllt · Erfüllungsliste ab der Auftragserteilung', '0 / 10')}</summary><ol class="klist">${K.map(([k, text, raster, ids]) => `<li><span class="kk">${k}</span><span>${esc(text)}<small>Raster ${esc(raster)} · Kapitel ${esc(ids.join(', '))} · ${esc(status(ids))} · Frist ${esc(due(ids))}</small></span></li>`).join('')}</ol></details>`;
    const project = data.project && Array.isArray(data.project.forms) && data.role === 'leitung' ? `<details class="ln-d" id="karte-uebertrag" data-key="uebertrag"><summary>${row('Projekt-Übertrag', 'nur Leitung', data.project.enabled ? 'Abgleich mit Notion läuft stündlich' : 'Automatischer Übertrag aus')}</summary><div class="list">${data.project.forms.map(f => row(esc(({stakeholder: 'Stakeholder', coaching: 'Coaching', risiko: 'Risiken', arbeitszeit: 'Arbeitszeit', beitrag: '6b-Beiträge'})[f.formular] || f.formular), f.blatt_anzahl !== undefined && f.blatt_anzahl !== '' ? 'Blatt ' + num(f.blatt_anzahl) + ' · Notion ' + num(f.notion_anzahl) : 'Noch keine Zählung', esc(data.project.enabled ? (f.stale ? 'ausstehend oder veraltet' : f.status) : 'Übertrag aus'))).join('')}</div></details>` : '';
    return `<section class="cell c12 soft" id="karte-grundlagen" aria-labelledby="titel-grundlagen"><div class="k"><h2 id="titel-grundlagen">Projektgrundlagen</h2></div><div class="cols2">${psp}${confirm}${risks}${absence}${pa6b}${project}</div>
      ${how('grundlagen', '<p>Ein Haken steht nur dort, wo eine Abnahme definiert ist: Arbeitspakete mit Plan-Stunden, verantwortlicher Person, «Fertig wenn» und mindestens einem verknüpften Risiko (Raster C2). Projektauftrag: letzte Antwort je Person zur geltenden Version. Risiken: Einträge mit Status; Bewertung, Massnahme und Review-Takt folgen, sobald sie geführt werden. PA6b: nur offen, Entwurf, geprüft oder erfüllt mit Beleg.</p>', 'Notion PSP, Risikoregister, Kapitel; Team-Blatt Bestaetigungen, Abwesenheiten')}</section>`;
  }
  function pmPanel(data) {
    const pm = data.pm || {state: 'unknown'};
    if (pm.state !== 'ready') return display('Projektplan gerade unbekannt.', 'Notion ist nicht erreichbar; fehlende Werte sind nicht null.') + `<div class="bento">${cell({id: 'psp-quelle', cls: 'c12', label: 'Projektplan', body: unknown()})}${basicsCell(data, pm)}</div>`;
    const d = pm.deadline_buckets || {}, first = (d.next || [])[0], today = pm.today || todayOf(data), p = pm.progress, ms = pm.milestones || [];
    const rest = d.overdue ? `${plural(d.overdue, 'Paket ist', 'Pakete sind')} überfällig.` : first ? `Die nächste Frist ist ${diffDays(today, first.due) === 0 ? 'heute.' : 'am ' + weekday(first.due) + (diffDays(today, first.due) > 6 ? ', ' + dateShort(first.due) : '.')}` : 'Keine offene Frist.';
    const chips = [chip('Pakete', num(pm.n), pm.n), chip('Fertig', num(p ? p.counts.done : 0)), chip('Begonnen', num(p ? p.counts.begun : 0)), chip('Überfällig', num(d.overdue || 0)), d.horizon ? chip('Fällig bis ' + dateShort(d.horizon), num((d.this_week || 0) + (d.next_two_weeks || 0))) : '', chip('Meilensteine', `${num(ms.filter(m => m.reached).length)} / ${num(ms.length)}`), ready(pm.confirmations) ? chip('Projektauftrag', `${num(pm.confirmations.confirmed.length)} / ${num(pm.confirmations.n)}`) : ''];
    const series = pmSeriesCell(data), size = (html, cls) => html.replace(/class="cell (c\d+)/, 'class="cell ' + cls);
    // Mit Verlauf: Verlauf 8 + Fristen 4 | 14 Tage | Meilensteine, Fortschritt, Stunden je 4 | Grundlagen 12. Ohne: Fristen, Meilensteine, Fortschritt je 4 | 14 Tage | Stunden 6 + Grundlagen 6.
    const cells = series ? [series, safe('fristen', () => nextDueCell(data, pm)), safe('gantt', () => ganttCell(data, pm)), size(safe('meilensteine', () => milestonesCell(pm)), 'c4'), size(safe('fortschritt', () => progressCell(data, pm)), 'c4'), size(safe('aufwand', () => effortCell(pm)), 'c4'), safe('grundlagen', () => basicsCell(data, pm))]
      : [safe('fristen', () => nextDueCell(data, pm)), size(safe('meilensteine', () => milestonesCell(pm)), 'c4'), size(safe('fortschritt', () => progressCell(data, pm)), 'c4'), safe('gantt', () => ganttCell(data, pm)), size(safe('aufwand', () => effortCell(pm)), 'c6'), size(safe('grundlagen', () => basicsCell(data, pm)), 'c6 narrow')];
    return display(p && p.share != null ? `${pct(p.share)} der Arbeit geschafft.` : 'Fortschritt nicht berechenbar.', rest) + live(chips.filter(Boolean)) + `<div class="bento${series ? '' : ' no-series'}">${cells.join('')}</div>`;
  }

  // ---------- Diagramme: Achse bei 0, eine y-Achse, Plan gestrichelt, Direktbeschriftung ----------
  function svgTools(box, H) {
    const svg = box.querySelector('svg'), W = Math.max(280, Math.round(box.clientWidth || 700)), h = W < 500 ? H - 40 : H;
    svg.setAttribute('viewBox', `0 0 ${W} ${h}`); svg.replaceChildren();
    const el = (t, a, txt) => {const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt != null) e.textContent = txt; svg.appendChild(e); return e;};
    return {svg, W, H: h, el};
  }
  function drawBurn(data) {
    const box = root.querySelector('#panel-marketing [data-chart="burn"]') || root.querySelector('[data-chart="burn"]'); if (!box || !box.clientWidth) return;
    const f = data.methods.A.field, [from, to] = windowOf(data, f), {svg, W, H, el} = svgTools(box, 270);
    const span = Math.max(1, diffDays(from, to)), L = 34, R = W - 14, T = 12, B = H - 30, cum = cumulative(f), today = todayOf(data);
    const before = cum.filter(([d]) => d < from).pop(), base = before ? before[2] : 0;
    const top = Math.max(100, ...cum.map(c => c[2])), step = top > 100 ? 50 : 25;
    const X = d => L + (R - L) * diffDays(from, d) / span, Y = v => B - (B - T) * v / top;
    for (let v = 0; v <= top; v += step) {el('line', {x1: L, x2: R, y1: Y(v), y2: Y(v), class: 'gl'}); el('text', {x: L - 8, y: Y(v) + 4, 'text-anchor': 'end'}, v);}
    el('line', {x1: L, x2: R, y1: B, y2: B, class: 'ax'});
    const st = stages(data), next = st.find(s => s.n > f.n), shown = st.filter(s => s.due >= from && s.due <= to);
    const near = d => Math.min(diffDays(from, d), diffDays(d, to)) < span * 0.18, ticks = W < 500 ? [from, today >= from && today <= to && !near(today) ? today : null, to] : [from, ...shown.map(s => s.due).filter(d => d > from && d < to), to];
    Array.from(new Set(ticks.filter(Boolean))).forEach(d => el('text', {x: X(d), y: B + 18, 'text-anchor': d === to ? 'end' : d === from ? 'start' : 'middle'}, dateShort(d)));
    if (shown.length > 1) el('polyline', {points: shown.map(s => X(s.due) + ',' + Y(s.n)).join(' '), class: 'plan'});
    shown.forEach(s => {const isNext = next && s.ref === next.ref; el('circle', {cx: X(s.due), cy: Y(s.n), r: isNext ? 5 : 3.5, class: isNext ? 'pt-next' : 'pt'}); el('text', {x: s.due === to ? X(s.due) - 8 : X(s.due) + 8, y: Y(s.n) - 8, 'text-anchor': s.due === to ? 'end' : 'start', class: isNext ? 'signal' : ''}, num(s.n) + (isNext && W >= 500 ? ' · nächste Etappe' : ''));});
    const pts = [[from, base], ...cum.filter(([d]) => d >= from && d <= to && d <= today).map(([d, , c]) => [d, c])], endDay = today < to ? today : to;
    if (pts[pts.length - 1][0] < endDay) pts.push([endDay, pts[pts.length - 1][1]]);
    el('path', {d: 'M' + pts.map(([d, v]) => X(d) + ',' + Y(v)).join(' L') + ` L${X(pts[pts.length - 1][0])},${B} L${X(pts[0][0])},${B}Z`, class: 'area'});
    el('polyline', {points: pts.map(([d, v]) => X(d) + ',' + Y(v)).join(' '), class: 'ist'});
    if (today >= from && today <= to) {const v = pts[pts.length - 1][1]; el('line', {x1: X(today), x2: X(today), y1: T, y2: B, class: 'today'}); el('circle', {cx: X(today), cy: Y(v), r: 4.5, class: 'pt-ist'}); const right = X(today) > R - 80; el('text', {x: right ? X(today) - 8 : X(today) + 8, y: Math.min(B - 4, Y(v) + 16), 'text-anchor': right ? 'end' : 'start', class: 'ink'}, num(v) + ' heute');}
    const ext = data.v3 && ready(data.v3.survey) ? data.v3.survey.daily_by_channel : null;
    const info = d => {const n = (f.daily || {})[d] || 0, c = (cum.filter(([x]) => x <= d).pop() || [0, 0, base])[2], ch = ext ? sorted(Object.fromEntries(Object.entries(ext).map(([k, o]) => [k, o[d] || 0]).filter(([, v]) => v))) : [];
      return `<div class="row"><b>${esc(dateWd(d))}</b><span>${d === today ? 'heute' : ''}</span></div><div class="row"><span>zusammen</span><b>${num(c)}</b></div><div class="row"><span>neu an diesem Tag</span><b>+${num(n)}</b></div>${ch.length ? '<hr>' + ch.map(([k, v]) => `<div class="row"><span>${esc(CHANNELS[k] || k)}</span><b>${num(v)}</b></div>`).join('') : ''}`;};
    interact(box, svg, W, B, info, x => {const d = addDays(from, Math.max(0, Math.min(span, Math.round((x - L) / (R - L) * span)))); return d > today ? today : d;}, X);
  }
  function drawPm(data) {
    const box = root.querySelector('#panel-pm [data-chart="pmburn"]') || root.querySelector('[data-chart="pmburn"]'); if (!box || !box.clientWidth) return;
    const s = data.v3.pm.series, {svg, W, H, el} = svgTools(box, 250), from = s.from, to = s.to, span = Math.max(1, diffDays(from, to)), L = 34, R = W - 96, T = 12, B = H - 30;
    const top = Math.max(10, Math.ceil(Math.max(...s.points.map(p => p.scope)) / 10) * 10), step = top > 50 ? 20 : 10;
    const X = d => L + (R - L) * diffDays(from, d) / span, Y = v => B - (B - T) * v / top;
    for (let v = 0; v <= top; v += step) {el('line', {x1: L, x2: R, y1: Y(v), y2: Y(v), class: 'gl'}); el('text', {x: L - 8, y: Y(v) + 4, 'text-anchor': 'end'}, v);}
    el('line', {x1: L, x2: R, y1: B, y2: B, class: 'ax'});
    [from, to].forEach(d => el('text', {x: X(d), y: B + 18, 'text-anchor': d === to ? 'end' : 'start'}, dateShort(d)));
    [['scope', 'plan'], ['started', 'mid'], ['done', 'ist']].forEach(([k, c]) => el('polyline', {points: s.points.map(p => X(p.day) + ',' + Y(p[k])).join(' '), class: c}));
    el('line', {x1: X(to), x2: X(to), y1: T, y2: B, class: 'today'});
    const lastP = s.points[s.points.length - 1];
    let prev = -99; [['Umfang', lastP.scope], ['begonnen', lastP.started], ['fertig', lastP.done]].sort((a, b) => b[1] - a[1]).forEach(([t, v]) => {let y = Y(v) + 4; if (y - prev < 14) y = prev + 14; prev = y; el('text', {x: X(to) + 8, y, class: 'ink'}, t + ' ' + num(v));});
    interact(box, svg, W, B, d => {const p = s.points.find(x => x.day === d) || lastP; return `<div class="row"><b>${esc(dateWd(p.day))}</b></div><div class="row"><span>Umfang</span><b>${num(p.scope)}</b></div><div class="row"><span>begonnen</span><b>${num(p.started)}</b></div><div class="row"><span>fertig</span><b>${num(p.done)}</b></div>`;}, x => addDays(from, Math.max(0, Math.min(span, Math.round((x - L) / (R - L) * span)))), X);
  }
  // Fadenkreuz mit Tooltip (Maus) bzw. Zeile unter dem Diagramm (Antippen).
  function interact(box, svg, W, B, info, dayAt, X) {
    const tip = box.querySelector('.tip'), line = box.parentElement.querySelector('.tapline');
    let cross = null;
    const show = (clientX, touch) => {
      const r = svg.getBoundingClientRect(), x = (clientX - r.left) / r.width * W, d = dayAt(x), html = info(d);
      if (!cross) {cross = document.createElementNS(NS, 'line'); cross.setAttribute('class', 'cross'); svg.appendChild(cross);}
      cross.setAttribute('x1', X(d)); cross.setAttribute('x2', X(d)); cross.setAttribute('y1', 12); cross.setAttribute('y2', B);
      if (touch || W < 500) {tip.hidden = true; if (line) line.innerHTML = html.replace(/<hr>/g, '').replace(/<div class="row">/g, '<span>').replace(/<\/div>/g, '</span> ');}
      else {tip.innerHTML = html; tip.hidden = false; const px = X(d) / W * r.width; tip.style.left = Math.max(0, Math.min(r.width - 210, px + 14)) + 'px'; tip.style.top = '6px';}
    };
    svg.addEventListener('pointermove', e => show(e.clientX, e.pointerType === 'touch'));
    svg.addEventListener('pointerdown', e => show(e.clientX, e.pointerType !== 'mouse'));
    svg.addEventListener('pointerleave', () => {tip.hidden = true; if (cross) {cross.remove(); cross = null;}});
  }
  function countUp() {
    if (counted) return; counted = true; if (reduced()) return;
    root.querySelectorAll('[data-n]').forEach(el => {const end = +el.dataset.n, text = el.textContent, t0 = performance.now(); if (!Number.isFinite(end) || end <= 0) return;
      const step = t => {const p = Math.min(1, (t - t0) / 700); el.textContent = p < 1 ? num(Math.round(end * (1 - Math.pow(1 - p, 3)))) : text; if (p < 1) requestAnimationFrame(step);}; requestAnimationFrame(step);});
  }

  // ---------- Öffentliche Ansicht: nur Gesamtrücklauf und Verlauf ----------
  function publicPanel(data) {
    const f = data.field, n = f && f.state === 'ready' ? f.n : null;
    return (n == null ? display('Rücklauf derzeit unbekannt.', '') : display(`${num(n)} gültige Teilnahmen.`, n >= 100 ? 'Das Mindestziel ist erreicht. Danke!' : 'Jede Teilnahme bringt uns weiter.'))
      + `<div class="bento">${cell({id: 'oeffentlich', cls: 'c12', label: 'Befragung zu Banking-Apps', body: n == null ? unknown() : `<div class="two"><i style="width:${Math.min(100, n)}%;background:var(--ink)"></i></div><p class="note">${num(n)} von 100 · Streckenziel 300 · ${pct(n / 300)} erreicht</p>${f.daily ? `<div class="list">${Object.entries(f.daily).filter(([d]) => d !== 'unbekannt').sort().slice(-7).map(([d, v]) => row(esc(dateWd(d)), '', num(v))).join('')}</div>` : ''}`})}</div>`;
  }

  // ---------- Seite ----------
  function controls() {
    return tab === 'pm' ? `<div class="seg" role="group" aria-label="Gruppieren nach">${[['person', 'Person'], ['paket', 'Paket']].map(([k, l]) => `<button type="button" data-group="${k}" aria-pressed="${group === k}">${l}</button>`).join('')}</div>`
      : `<div class="seg" role="group" aria-label="Zeitraum">${[['7', '7 Tage'], ['30', '30 Tage'], ['feld', 'Feldzeit']].map(([k, l]) => `<button type="button" data-range="${k}" aria-pressed="${range === k}">${l}</button>`).join('')}</div>`;
  }
  function render(data) {
    if (!data.ok) throw Error(data.fehler || 'Der Stand ist gerade nicht verfügbar.');
    last = data; standText = stamp(data.generated_at);
    const open = new Set(Array.from(root.querySelectorAll('details[data-key]')).filter(d => d.open).map(d => d.dataset.key)), first = !root.querySelector('.tabpanel');
    roleButton.hidden = publicView || !data.can_lead; roleButton.textContent = leadership ? 'Leitung an' : 'Leitung aus'; roleButton.setAttribute('aria-pressed', String(leadership));
    const stand = `<p class="stand"><span class="dot" aria-hidden="true"></span>Stand ${esc(standText)}</p>`;
    if (publicView) {root.innerHTML = `<div class="bar-row"><p class="eyebrow">Einblick in unsere Erhebung</p>${stand}</div>` + publicPanel(data); return;}
    const tabs = `<div class="tabs" role="tablist" aria-label="Bereiche">${TABS.map(([id, label]) => `<button role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}">${label}</button>`).join('')}</div>`;
    const panel = (id, html) => `<div class="tabpanel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" ${tab === id ? '' : 'hidden'}>${html}</div>`;
    root.innerHTML = `<div class="bar-row">${tabs}<div class="bar-right"><span class="ctl">${controls()}</span>${stand}</div></div>` + panel('marketing', marketingPanel(data)) + panel('pm', pmPanel(data));
    root.querySelectorAll('details[data-key]').forEach(d => {if (open.has(d.dataset.key) || (first && d.hasAttribute('data-default-open'))) d.open = true;});
    afterRender();
  }
  function afterRender() {
    if (!last || publicView) return;
    try {if (tab === 'marketing' && last.methods && ready(last.methods.A.field) && last.methods.A.field.daily) drawBurn(last);} catch (e) {}
    try {if (tab === 'pm' && extPm(last, 'series') && last.v3.pm.series.points.length >= 2) drawPm(last);} catch (e) {}
    countUp();
  }
  function rerender() {if (last) {const y = scrollY; render(last); scrollTo(0, y);}}
  function selectTab(id, focus) {
    tab = id;
    try { sessionStorage.setItem('pa6_dashboard_tab', id); } catch {}
    const q = new URLSearchParams(location.search); if (id === 'pm') q.set('tab', 'pm'); else q.delete('tab');
    history.replaceState({}, '', location.pathname + (q.toString() ? '?' + q : ''));
    root.querySelectorAll('[role=tab]').forEach(b => { const on = b.id === 'tab-' + id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    root.querySelectorAll('[role=tabpanel]').forEach(p => { p.hidden = p.id !== 'panel-' + id; });
    const ctl = root.querySelector('.ctl'); if (ctl) ctl.innerHTML = controls();
    afterRender();
  }
  function toggleDrill(tr) {
    const isOpen = tr.getAttribute('aria-expanded') === 'true', next = tr.nextElementSibling;
    if (isOpen) {if (next && next.classList.contains('drill')) next.remove(); tr.setAttribute('aria-expanded', 'false'); return;}
    tr.insertAdjacentHTML('afterend', drillRow(last, tr.dataset.cell)); tr.setAttribute('aria-expanded', 'true');
  }
  root.addEventListener('click', event => {
    const b = event.target.closest('[role=tab]'); if (b) return selectTab(b.id.slice(4), false);
    const r = event.target.closest('[data-range]'); if (r) {range = r.dataset.range; return rerender();}
    const g = event.target.closest('[data-group]'); if (g) {group = g.dataset.group; return rerender();}
    const t = event.target.closest('[data-table]'); if (t) {const tb = t.closest('.cell').querySelector('.burn-table'); tb.hidden = !tb.hidden; t.textContent = tb.hidden ? 'Als Tabelle' : 'Diagramm'; return;}
    const tr = event.target.closest('tr.drillable'); if (tr) toggleDrill(tr);
    if (event.target.id === 'retry') load();
  });
  root.addEventListener('keydown', event => {
    const tr = event.target.closest('tr.drillable'); if (tr && (event.key === 'Enter' || event.key === ' ')) {event.preventDefault(); return toggleDrill(tr);}
    const b = event.target.closest('[role=tab]'); if (!b) return;
    const ids = TABS.map(t => t[0]), i = ids.indexOf(b.id.slice(4));
    const next = {ArrowRight: (i + 1) % ids.length, ArrowLeft: (i - 1 + ids.length) % ids.length, Home: 0, End: ids.length - 1}[event.key];
    if (next !== undefined) { event.preventDefault(); selectTab(ids[next], true); }
  });
  let resizeTimer; addEventListener('resize', () => {clearTimeout(resizeTimer); resizeTimer = setTimeout(afterRender, 150);});
  const skeleton = () => `<p class="sr-only">Der Stand wird geladen.</p><div class="sk" aria-hidden="true"><i style="width:62%;height:56px"></i><i style="width:44%;height:56px"></i><i style="width:80%;height:14px;margin-top:28px"></i><div class="sk-grid"><i></i><i></i><i></i><i></i></div></div>`;
  async function load() {
    const version = ++generation; root.setAttribute('aria-busy', 'true'); refresh.disabled = true; clearTimeout(timer);
    if (!root.querySelector('.tabpanel') && !root.querySelector('.bento')) root.innerHTML = skeleton();
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 25000);
    try {
      let input = publicView ? {typ: 'dashboard', public: true} : {typ: 'dashboard', k: key, leitung: leadership};
      if (!publicView) { try { const target = sessionStorage.getItem('pa6-view-as'); if (target) input = {...input, als: target, leitung: true}; } catch {} }
      const response = await fetch(CONFIG.endpoint, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(input), cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw Error('Der Stand ist gerade nicht erreichbar.');
      const data = await response.json(); if (version !== generation) return; render(data);
    } catch (error) {
      if (version === generation) root.innerHTML = `<section class="error"><h1 class="display">${publicView ? 'Noch nicht öffentlich.' : 'Der Stand kommt gerade nicht durch.'}</h1><p>${esc(error.name === 'AbortError' ? 'Die Abfrage hat zu lange gedauert. Bitte in einer Minute neu laden.' : error.message)}${publicView ? '' : ' Eingaben in der Team-App sind davon nicht betroffen.'}</p><p><button type="button" class="btn dark" id="retry">Neu laden</button> <a class="btn" href="/team/">Zur Team-Startseite</a></p></section>`;
    } finally { clearTimeout(timeout); if (version === generation) { root.setAttribute('aria-busy', 'false'); refresh.disabled = false; timer = setTimeout(load, 60000); } }
  }
  function changeAccess() {
    try { const incoming = new URLSearchParams(location.hash.slice(1)).get('k'); if (incoming && !publicView) { localStorage.setItem('pa6k', incoming); sessionStorage.removeItem('pa6-view-as'); } key = publicView ? '' : localStorage.getItem('pa6k') || ''; } catch { key = ''; }
    leadership = false; roleButton.hidden = true; root.replaceChildren(); history.replaceState({}, '', location.pathname + location.search); load();
  }
  window.addEventListener('hashchange', changeAccess); window.addEventListener('storage', event => { if (event.key === 'pa6k') changeAccess(); });
  refresh.addEventListener('click', load);
  roleButton.addEventListener('click', () => { leadership = !leadership; try { sessionStorage.setItem('pa6_pia_role', leadership ? 'leitung' : 'mitglied'); } catch {} load(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  load();
})();
