'use strict';
// Projekt-Dashboard der Gruppe 601: Tabs Marketing und Projektmanagement.
// Nur beschreibende Zahlen (Anteil mit Fallzahl n), keine Intervalle. Jede Karte trägt eine Aussage,
// die Erklärung liegt einen Tipp entfernt unter «So gemessen». Fällt eine Quelle aus, bleibt nur diese Karte leer.
(() => {
  const root = document.getElementById('dashboard'), roleButton = document.getElementById('role'), refresh = document.getElementById('refresh');
  const params = new URLSearchParams(location.search), publicView = params.get('public') === '1';
  const TABS = [['marketing', 'Marketing'], ['pm', 'Projektmanagement']];
  let key = '', leadership = false, generation = 0, timer, tab = params.get('tab') === 'pm' ? 'pm' : 'marketing';
  try {
    const incoming = new URLSearchParams(location.hash.slice(1)).get('k');
    if (incoming && !publicView) localStorage.setItem('pa6k', incoming);
    key = publicView ? '' : localStorage.getItem('pa6k') || '';
    leadership = !publicView && sessionStorage.getItem('pa6_pia_role') === 'leitung';
    if (!params.get('tab') && sessionStorage.getItem('pa6_dashboard_tab') === 'pm') tab = 'pm';
  } catch {}
  history.replaceState({}, '', location.pathname + location.search);
  document.body.classList.toggle('public', publicView);

  // ---------- Formatierung ----------
  const NAMES = {SA: 'Salah', ES: 'Ernes', MG: 'Melisa', AM: 'Arber', LB: 'Leonie'}, PEOPLE = ['SA', 'ES', 'MG', 'AM', 'LB'];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  // Dezimalkomma wie in den Anteilen; Tausender mit Apostroph (de-CH).
  const num = (v, digits = 1) => v == null || !Number.isFinite(+v) ? '–' : new Intl.NumberFormat('de-CH', {maximumFractionDigits: digits}).format(v).replace('.', ',');
  const pct = (v, digits = 0) => v == null || !Number.isFinite(v) ? '–' : (v * 100).toFixed(digits).replace('.', ',') + ' %';
  const zone = {timeZone: 'Europe/Zurich'};
  const day = v => v ? new Date(String(v).slice(0, 10) + 'T12:00:00Z') : null;
  const dateShort = v => v ? new Intl.DateTimeFormat('de-CH', {day: '2-digit', month: '2-digit', ...zone}).format(day(v)) : 'offen';
  const dateLong = v => v ? new Intl.DateTimeFormat('de-CH', {weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', ...zone}).format(day(v)) : 'offen';
  const stamp = v => new Intl.DateTimeFormat('de-CH', {dateStyle: 'short', timeStyle: 'short', ...zone}).format(new Date(v));
  const releaseDay = v => new Intl.DateTimeFormat('de-CH', {day: 'numeric', month: 'long', ...zone}).format(new Date(v));
  const clock = s => s == null ? '–' : Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0') + ' min';
  const name = code => NAMES[code] || 'ohne Zuordnung';
  const sum = obj => Object.values(obj || {}).reduce((a, b) => a + (+b || 0), 0);
  const sorted = obj => Object.entries(obj || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const ready = x => x && x.state === 'ready';

  // ---------- Bausteine ----------
  let standText = '';
  const empty = text => `<p class="empty">${esc(text)}</p>`;
  const unknown = () => empty('Stand unbekannt. Die Quelle ist gerade nicht vollständig erreichbar; fehlende Werte sind nicht null.');
  const big = (value, unit) => `<p class="big"><span>${value}</span>${unit ? `<small>${unit}</small>` : ''}</p>`;
  const meter = (value, target, label) => `<div class="meter" role="img" aria-label="${esc(label)}"><i style="width:${Math.max(0, Math.min(100, target ? value / target * 100 : 0))}%"></i></div>`;
  const stat = (value, label, cls = '') => `<div class="stat ${cls}"><b>${value}</b><span>${esc(label)}</span></div>`;
  const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
  const bars = (pairs, max, fmt = v => num(v)) => pairs.length ? '<div class="bars">' + pairs.map(([label, n]) => `<div class="bar"><div class="bar-label"><span>${esc(label)}</span><b>${fmt(n)}</b></div><div class="track"><i style="width:${Math.min(100, (n || 0) / Math.max(1, max) * 100)}%"></i></div></div>`).join('') + '</div>' : empty('Noch keine Werte.');
  // A card: eyebrow, one statement (h2), body, and the explanation one tap away.
  function card({id, eyebrow, title, body, how, source, span = 'span6', tone = ''}) {
    return `<section class="card ${span} ${tone}" id="karte-${id}" aria-labelledby="titel-${id}">
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}<h2 id="titel-${id}">${title}</h2>${body}
      ${how ? `<details class="how" data-key="${id}"><summary>So gemessen</summary><div class="how-body">${how}${source ? `<p class="src">Quelle: ${esc(source)} · Stand ${esc(standText)}</p>` : ''}</div></details>` : ''}</section>`;
  }
  function safeCard(id, build) {
    try { return build(); }
    catch (error) { return card({id, title: 'Diese Karte konnte nicht berechnet werden.', body: empty('Die übrigen Karten sind davon nicht betroffen. Bitte später erneut aktualisieren.')}); }
  }

  // ---------- Tab Marketing ----------
  function quotaCard(A) {
    const f = A.field;
    if (!ready(f)) return card({id: 'quoten', eyebrow: 'Stichprobe · Quotenplan', title: 'Quoten derzeit unbekannt.', body: unknown(), span: 'span12'});
    const total = f.totals || {valid: {n: f.n, target: 100, stretch: 300, missing: Math.max(0, 100 - f.n)}, yuh: f.yuh_target, cell_target: 15};
    const cells = f.quotas || [], open = cells.filter(q => q.n < q.target);
    const row = (label, sub, target, n, missing, cls = '') => `<tr class="${cls}${missing === 0 ? ' met' : ''}"><th scope="row">${label}${sub ? `<small>${esc(sub)}</small>` : ''}</th><td>${num(target)}</td><td><b>${num(n)}</b></td><td>${missing === 0 ? '<span class="tick" aria-label="erfüllt">✓</span>' : num(missing)}</td></tr>`;
    const ages = {'16 bis 29': '16–29', '30 bis 49': '30–49', '50 bis 65': '50–65'};
    const table = `<div class="table-wrap"><table class="quota"><caption class="sr-only">Quotentabelle: Soll, Ist und fehlende gültige Antworten je Zelle</caption>
      <thead><tr><th scope="col">Zelle</th><th scope="col">Soll</th><th scope="col">Ist</th><th scope="col">fehlt</th></tr></thead><tbody>
      ${cells.map(q => row(esc(ages[q.age] || q.age) + ' Jahre', q.neobank ? 'nutzt Neobank' : 'nur klassische Bank', q.target, q.n, q.missing ?? Math.max(0, q.target - q.n))).join('')}
      ${row('Gültig gesamt', 'Streckenziel ' + num(total.valid.stretch), total.valid.target, total.valid.n, total.valid.missing, 'sum')}
      ${row('davon mit Yuh', 'Haupt- oder Nebenapp', total.yuh.target, total.yuh.n, total.yuh.missing, 'sum')}
      </tbody></table></div>`;
    const title = total.valid.missing === 0 ? 'Das Ziel von 100 gültigen Antworten ist erreicht.' : `Noch ${num(total.valid.missing)} gültige Antworten bis 100.`;
    const lead = `<div class="quota-lead">${big(num(total.valid.n), '/ ' + num(total.valid.target) + ' gültig')}${meter(total.valid.n, total.valid.target, num(total.valid.n) + ' von ' + num(total.valid.target) + ' gültigen Antworten')}
      <p class="lead-note">${open.length ? `${open.length} von 6 Zellen unter ${num(total.cell_target)}` : 'Alle sechs Zellen haben ihr Soll'} · Yuh ${num(total.yuh.n)} von ${num(total.yuh.target)}</p></div>`;
    return card({id: 'quoten', eyebrow: 'Stichprobe · Quotenplan', title, span: 'span12', tone: 'feature',
      body: `<div class="quota-grid">${lead}${table}</div>`,
      how: `<p>Gezählt werden nur <b>gültige Fälle</b> nach der Bereinigung: Screening bestanden, alle Pflichtfragen der Route beantwortet, mindestens 150 Sekunden, kein Durchklicken, jede Kennung einmal.</p>
        <p>«Nutzt Neobank» heisst: mindestens eine von Yuh, Neon, Zak oder Revolut unter den genutzten Apps. Yuh zählt als Haupt- oder Nebenapp, einmal je Person; dieselbe Zahl löst die Aufstockung aus.</p>
        <p>«fehlt» = Soll minus Ist, nie unter null. Der Quotenplan sorgt dafür, dass jede Gruppe vertreten ist. Die Stichprobe ist damit geeignet für die Fragestellung; sie ist keine Zufallsstichprobe und erlaubt keine Aussage über die ganze Bevölkerung.</p>`,
      source: 'Umfrage, Blatt Antworten (S2, T1), bereinigt'});
  }
  function startsCard(A) {
    const s = A.field.starts, since = s && s.since ? stamp(s.since) : '';
    if (!s || s.state === 'nicht erfasst') return card({id: 'starts', eyebrow: 'Befragung · Starts', title: 'Starts werden erst ab Messbeginn erfasst.', body: empty(`Die Messung beginnt ${since ? 'am ' + since : 'mit der Umfrage 3.35'}. Für die Zeit davor gilt: nicht erfasst, also weder null noch geschätzt.`),
      how: '<p>Abbruchquote = (begonnen − Screen-outs − vollständig) / (begonnen − Screen-outs). Sie wird nur aus Ereignissen nach dem Messbeginn berechnet.</p>', source: 'Umfrage, Blatt Starts'});
    if (!ready(s)) return card({id: 'starts', eyebrow: 'Befragung · Starts', title: 'Starts derzeit unbekannt.', body: unknown()});
    const t = s.total, base = t.begonnen - t.screenouts;
    const channels = sorted(Object.fromEntries(Object.entries(s.channels || {}).map(([k, v]) => [k, v.begonnen])));
    return card({id: 'starts', eyebrow: 'Befragung · Starts seit ' + since,
      title: base > 0 ? `${pct(t.abbruchquote)} brechen nach dem Start ab.` : 'Seit Messbeginn noch keine auswertbaren Starts.',
      body: `${big(base > 0 ? pct(t.abbruchquote) : '–', base > 0 ? `n = ${num(base)} begonnen ohne Screen-outs` : '')}
        <div class="stats">${stat(num(t.geoeffnet), 'geöffnet')}${stat(num(t.begonnen), 'begonnen')}${stat(num(t.screenouts), 'Screen-outs')}${stat(num(t.vollstaendig), 'vollständig')}${stat(num(t.gueltig), 'gültig')}</div>
        ${channels.length ? `<details class="more" data-key="starts-kanal"><summary>Begonnen je Kanal</summary>${bars(channels.map(([k, v]) => [CHANNELS[k] || k, v]), Math.max(1, ...channels.map(c => c[1])))}</details>` : ''}`,
      how: `<p>Gezählt wird jede Kennung einmal, ab ${esc(since)}. Eine Antwort ab Version 3.35 belegt einen Start, auch wenn das Startsignal verloren ging (${num(t.ohne_startereignis)} solche Fälle). Test- und Pretest-Kennungen zählen nicht.</p>
        <p>Abbruchquote = (begonnen − Screen-outs − vollständig) / (begonnen − Screen-outs). Für die Zeit vor dem Messbeginn gibt es keine Quote: nicht erfasst.</p>`,
      source: 'Umfrage, Blätter Starts und Antworten'});
  }
  function peopleCard(A) {
    const f = A.field, people = ready(f) && f.people && typeof f.people === 'object' ? f.people : null, target = f.people_target || 20;
    if (!people) return card({id: 'personen', eyebrow: 'Befragung · eigene Links', title: 'Wer bringt Antworten?', body: unknown()});
    const reached = PEOPLE.filter(c => (people[c] || 0) >= target).length;
    return card({id: 'personen', eyebrow: 'Befragung · eigene Links', title: 'Wer bringt Antworten?',
      body: `<p class="statement">${reached ? `${reached} von 5 haben ihre ${target} gültigen Antworten erreicht.` : `Zusammen ${num(PEOPLE.reduce((a, c) => a + (people[c] || 0), 0))} gültige Antworten über eigene Links.`}</p>
        ${bars(PEOPLE.map(c => [NAMES[c], people[c] || 0]), target, v => num(v) + ' von ' + target)}
        <p class="note">Ohne Zuordnung: ${num(people.ohne || 0)} (Schul- und Organisationslinks, ältere Links, Weiterleitungen).</p>`,
      how: `<p>Je Person zählen gültige Antworten, deren Kennung ihr Kürzel trägt (zum Beispiel WA-ES-…). Ziel je Person: ${target}.</p><p>Schul- und Organisationslinks sowie Antworten vor Version 3.34 bleiben als «ohne Zuordnung» sichtbar.</p>`,
      source: 'Umfrage, Blatt Antworten, bereinigt; Kürzel im geteilten Link'});
  }
  const CHANNELS = {WA: 'WhatsApp', RD: 'Reddit', HS: 'Andere Schulen', OR: 'Organisationen', SCH: 'Schulhaus', KL: 'Klasse', GE: 'Geschäft', CL: 'Club', IG: 'Instagram', LI: 'LinkedIn', FB: 'Facebook', SM: 'Jodel und andere', DZ: 'Dozierende', TEIL: 'Weitergeleitet', AD: 'Anzeigen', YU: 'Yuh-Nutzerkreise (eigene Kanäle)', YUH: 'Yuh-Kanäle', Sonstige: 'Sonstige'};
  function channelCard(A) {
    const f = A.field;
    if (!ready(f)) return card({id: 'kanaele', eyebrow: 'Befragung · Kanäle', title: 'Kanäle derzeit unbekannt.', body: unknown()});
    const rows = sorted(f.channels), top = rows[0];
    return card({id: 'kanaele', eyebrow: 'Befragung · Kanäle', title: top ? `Am meisten trägt ${esc(CHANNELS[top[0]] || top[0])} bei.` : 'Noch keine gültigen Antworten.',
      body: bars(rows.map(([k, v]) => [CHANNELS[k] || k, v]), Math.max(1, ...rows.map(r => r[1]))) + `<p class="note">YU (eigene Kanäle) und YUH (Kanäle von Yuh) bleiben getrennt. YUH: ${num((f.channels || {}).YUH || 0)}.</p>`,
      how: '<p>Gültige Antworten je Kanalpräfix der Kennung (WA, IG, GE, HS, OR, YU, YUH …). Yuh-Kundinnen und -Kunden werden nur über eigene und öffentliche Kanäle angesprochen; YUH-Kanäle kommen nur dazu, wenn Yuh sie anbietet.</p>',
      source: 'Umfrage, Blatt Antworten, Kennungspräfix'});
  }
  function dailyCard(A) {
    const f = A.field;
    if (!ready(f)) return card({id: 'verlauf', eyebrow: 'Befragung · Verlauf', title: 'Rücklauf derzeit unbekannt.', body: unknown()});
    const rows = Object.entries(f.daily || {}).filter(([d]) => d !== 'unbekannt').sort(), max = Math.max(1, ...rows.map(r => r[1])), every = Math.max(1, Math.ceil(rows.length / 7));
    const chart = rows.length ? `<div class="columns" role="img" aria-label="Gültige Antworten pro Tag">${rows.map(([d, n], i) => `<div class="col" title="${esc(dateShort(d))}: ${n}"><b>${rows.length <= 14 ? n : ''}</b><i style="height:${Math.max(3, n / max * 100)}%"></i><span>${i % every === 0 ? esc(dateShort(d)) : ''}</span></div>`).join('')}</div>` : empty('Noch keine datierten Antworten.');
    return card({id: 'verlauf', eyebrow: 'Befragung · Verlauf', title: 'So wächst der Rücklauf.',
      body: chart + (f.daily && f.daily.unbekannt ? `<p class="note">${num(f.daily.unbekannt)} Antworten ohne zuordenbares Datum.</p>` : '') + (rows.length ? `<details class="more" data-key="verlauf-werte"><summary>Tageswerte lesen</summary><div class="list">${rows.map(([d, n]) => `<div class="row"><span>${esc(dateLong(d))}</span><b>${n}</b></div>`).join('')}</div></details>` : ''),
      how: '<p>Gültige Antworten nach dem Tag des Eingangs (Zeit Europe/Zurich).</p>', source: 'Umfrage, Blatt Antworten, bereinigt'});
  }
  function qualityCard(A) {
    const f = A.field, q = f.quality;
    if (!ready(f) || !q) return card({id: 'qualitaet', eyebrow: 'Befragung · Datenqualität', title: 'Datenqualität derzeit unbekannt.', body: unknown()});
    const share = (x, n) => n ? pct(x / n) : '–';
    return card({id: 'qualitaet', eyebrow: 'Befragung · Datenqualität', title: `${num(q.valid)} von ${num(q.complete)} vollständigen Eingängen sind gültig.`,
      body: `<div class="stats">${stat(share(q.speeders, q.complete), `unter ${q.threshold_s} s (${num(q.speeders)} von ${num(q.complete)})`)}${stat(num(q.straightline), 'Durchklicken')}${stat(num(q.duplicates), 'Duplikate')}${stat(clock(q.duration.median), `Median Dauer, n = ${num(q.duration.n)}`)}</div>
        <p class="note">Mittlere Hälfte der Bearbeitungsdauer: ${clock(q.duration.q1)} bis ${clock(q.duration.q3)}. Screen-outs: S1 ${num(q.screenouts.s1)} · S2 ${num(q.screenouts.s2)} · S3 ${num(q.screenouts.s3)}.</p>`,
      how: `<p>Gespeicherte Zeilen ohne Test, Pretest und alte Versionen: ${num(q.stored)}. Vollständige Eingänge haben das Screening bestanden und alle Pflichtfragen ihrer Route beantwortet.</p>
        <p>Ausschlüsse in fester Reihenfolge, je Fall nur ein Grund: Duplikat, Screening, unvollständig, unter ${q.threshold_s} Sekunden, Durchklicken (gleicher Wert in allen zehn Zeilen von mindestens zwei Matrizen).</p>
        <p>Die Schwelle von ${q.threshold_s} Sekunden ist eine Projektregel (rund 40 % des Pretest-Medians), kein Beweis schlechter Qualität. Dauer: Median und Quartile ohne Kappung.</p>`,
      source: 'Umfrage, Blatt Antworten'});
  }
  const KIND_LABELS = [['Zusage', 'Zusage'], ['Weiterleitung', 'Weitergeleitet'], ['Absage', 'Absage'], ['Frage', 'Rückfrage'], ['Unklar', 'Unklar'], ['Automatisch', 'nur automatisch'], ['Unzustellbar', 'unzustellbar']];
  function outreachCard(O) {
    if (!ready(O)) return card({id: 'organisationen', eyebrow: 'Verbreitung · Organisationen', title: 'Rückmeldungen derzeit unbekannt.', body: unknown()});
    const group = obj => `<div class="list">${Object.entries(obj || {}).sort((a, b) => b[1].sent - a[1].sent || a[0].localeCompare(b[0])).map(([k, v]) => `<div class="row"><span>${esc(k)}</span><b>${num(v.answered)} von ${num(v.sent)}</b></div>`).join('')}</div>`;
    return card({id: 'organisationen', eyebrow: 'Verbreitung · Organisationen',
      title: O.sent ? `${pct(O.share, 1)} der angeschriebenen Organisationen haben geantwortet.` : 'Noch keine Organisation angeschrieben.',
      body: `${big(num(O.answered), '/ ' + num(O.sent) + ' Organisationen')}
        ${bars(KIND_LABELS.map(([k, label]) => [label, O.kinds[k] || 0]).concat([['ohne Antwort', O.no_reply]]), Math.max(1, O.sent))}
        <details class="more" data-key="org-gruppen"><summary>Je Kategorie und Sprache</summary><h3>Je Kategorie</h3>${group(O.by_category)}<h3>Je Sprache</h3>${group(O.by_language)}</details>`,
      how: `<p>Gezählt wird je <b>Organisation</b>, nicht je Mailverlauf. Nenner: ${num(O.sent)} verschiedene Organisationen mit mindestens einer versandten Mail (aus ${num(O.rows.sent)} Versandzeilen; Standorte zählen zur Organisation, ${num(O.rows.deferred)} zurückgestellt und ${num(O.rows.errors)} Fehler gelten nicht als versandt).</p>
        <p>Zähler: Organisationen mit mindestens einer inhaltlichen Antwort. Massgeblich ist die jüngste inhaltliche Einordnung. Eigene Adressen, Unzustellbares und automatische Antworten zählen nicht als Antwort. ${num(O.replies.unassigned)} Rückmeldungen ohne sichere Zuordnung bleiben ausserhalb.</p>`,
      source: 'Team-Blatt, Versand und Rückmeldungen'});
  }
  function yieldCard(A) {
    const f = A.field;
    if (!ready(f)) return card({id: 'ertrag', eyebrow: 'Verbreitung · Ertrag', title: 'Ertrag derzeit unbekannt.', body: unknown()});
    const n = sum(f.organizations), cats = sorted(f.organization_categories), langs = sorted(f.recruitment_languages);
    return card({id: 'ertrag', eyebrow: 'Verbreitung · Ertrag', title: n ? `${num(n)} gültige Antworten kamen über Organisationslinks.` : 'Über Organisationslinks noch keine gültige Antwort.',
      body: `<h3>Organisationen nach Kategorie</h3>${bars(cats, Math.max(1, ...cats.map(c => c[1])))}<h3>Organisationen nach Rekrutierungssprache</h3>${bars(langs.map(([k, v]) => [({de: 'Deutsch', fr: 'Französisch', it: 'Italienisch', en: 'Englisch'})[k] || k, v]), Math.max(1, ...langs.map(c => c[1])))}`,
      how: '<p>Gültige Antworten mit OR-Kennung, zugeordnet über die Organisationsliste. Die Rekrutierungssprache bezeichnet den Verteiler, nicht die Sprache, in der jemand den Fragebogen ausgefüllt hat. Schulen (HS) laufen separat.</p>',
      source: 'Umfrage, Blatt Antworten (OR-Kennungen); Organisationsliste'});
  }
  const FAIL_LABELS = {'nicht angeboten': 'nicht angeboten', 'nicht zugaenglich': 'nicht zugänglich', erfolglos: 'erfolglos', ausgefallen: 'ausgefallen'};
  function serviceCard(B) {
    const f = B.field;
    if (!ready(f)) return card({id: 'servicetest', eyebrow: 'Methode B · Servicetest', title: 'Servicetest derzeit unbekannt.', body: unknown()});
    const failed = Object.entries(f.failures || {}).filter(([, v]) => v > 0);
    return card({id: 'servicetest', eyebrow: 'Methode B · Servicetest', title: f.n ? `${num(f.n)} von ${num(f.target)} Kontakten durchgeführt.` : 'Noch kein Kontakt durchgeführt.',
      body: `${big(num(f.n), '/ ' + num(f.target))}${meter(f.n, f.target, num(f.n) + ' von ' + num(f.target) + ' Kontakten')}
        <p class="note">${failed.length ? 'Ausfälle, nicht im Soll: ' + failed.map(([k, v]) => `${FAIL_LABELS[k] || k} ${num(v)}`).join(' · ') : 'Keine Ausfälle.'}</p>
        <div class="list">${f.banks.map(b => `<div class="row"><span>${esc(b.bank)}<small>${num(b.contacts)} von 14 Kontakten · ${num(b.messages)} von 42 Nachrichten · ${num(b.minutes)} von 140 Minuten</small></span><b>${num(b.n)} / ${num(b.planned)} ${b.stop ? chip('Stopp', 'warn') : ''}</b></div>`).join('')}</div>`,
      how: '<p>Nur durchgeführte Kontakte zählen gegen die 48 geplanten (4 Anbieter × 3 Anliegen × 2 Kanäle × 2 Wiederholungen). Ausfälle stehen je Code getrennt und füllen das Soll nie auf.</p><p>Belastung je Anbieter inklusive echter Proben: Stopp ab 14 Kontakten, 42 Nachrichten oder 140 Gesprächsminuten. Interne Simulationen zählen nicht.</p>',
      source: 'Team-Blatt, Plan und Beobachtung; Testprotokoll B'});
  }
  function codingCard(C) {
    const f = C.field;
    if (!ready(f)) return card({id: 'codierung', eyebrow: 'Methode C · Bewertungen', title: 'Codierstand derzeit unbekannt.', body: unknown()});
    const rest = f.rest || {};
    return card({id: 'codierung', eyebrow: 'Methode C · Bewertungen', title: f.planned ? `${num(f.n)} von ${num(f.planned)} Bewertungen codiert.` : 'Noch keine Bewertungen zugeteilt.',
      body: `${big(num(f.n), '/ ' + num(f.planned))}${meter(f.n, f.planned, num(f.n) + ' von ' + num(f.planned) + ' codiert')}
        <div class="stats">${stat(num(f.double) + ' / ' + num(f.double_target), 'doppelt codiert / Soll')}${stat(num(f.consensus_open), 'Konsens offen', f.consensus_open ? 'attention' : '')}${stat(rest.n ? pct(rest.share) : '–', `Restkategorie, n = ${num(rest.n)}`, rest.alarm ? 'attention' : '')}</div>
        <details class="more" data-key="c-zellen"><summary>Abgleich je Zelle (${num(f.cells.length)})</summary><div class="list">${f.cells.map(c => `<div class="row"><span>${esc(c.cell.join(' · '))}<small>n = ${num(c.n)} · ${pct(c.double_share)} doppelt · ${num(c.consensus_open)} Konsens offen</small></span><b>${num(c.double)} / ${num(c.double_target)}</b></div>`).join('')}</div></details>`,
      how: '<p>Doppelcodierung: mindestens aufgerundet 20 % je Anbieter, Quelle, Zeitfenster und Schicht. Konsens offen: Abweichung in einem der acht Vergleichsfelder ohne Entscheid.</p><p>Restkategorie (10 Sonstiges): Alarm über 15 % ab n = 20. Probefälle zählen nirgends.</p>',
      source: 'Team-Blatt, Zuordnung, Bewertungen, Doppelcodierung, Konsens'});
  }
  function kappaCard(C) {
    const f = C.field, ag = f && f.agreement;
    if (!ready(f) || !ag) return card({id: 'kappa', eyebrow: 'Methode C · Übereinstimmung', title: 'Übereinstimmung derzeit unbekannt.', body: unknown(), span: 'span12'});
    const cell = x => x.state === 'keine Fälle' ? '<td colspan="2" class="muted">keine Fälle</td>' : `<td>${pct(x.agree)}</td><td class="${x.state === 'unter Schwelle' ? 'below' : ''}">${x.state === 'undefiniert' ? 'undefiniert' : num(x.kappa, 2)}</td>`;
    const pairs = ag.pairs.map((p, i) => `<details class="pair" data-key="kappa-${esc(p.pair.join('-'))}" ${i === 0 ? 'data-default-open' : ''}><summary><span>${esc(name(p.pair[0]))} und ${esc(name(p.pair[1]))}</span><small>${esc(p.providers.join(', '))} · n = ${num(p.n)}${p.features.some(x => x.state === 'unter Schwelle') ? ' · unter 0,6' : ''}</small></summary>
      <div class="table-wrap"><table class="kappa"><thead><tr><th scope="col">Merkmal</th><th scope="col">n</th><th scope="col">gleich</th><th scope="col">Kappa</th></tr></thead><tbody>${p.features.map(x => `<tr><th scope="row">${esc(x.label)}</th><td>${num(x.n)}</td>${cell(x)}</tr>`).join('')}</tbody></table></div></details>`).join('');
    const below = ag.pairs.reduce((a, p) => a + p.features.filter(x => x.state === 'unter Schwelle').length, 0);
    return card({id: 'kappa', eyebrow: 'Methode C · Übereinstimmung',
      title: ag.pairs.length ? (below ? `${num(below)} Merkmale liegen unter Kappa 0,6.` : 'Alle berechenbaren Merkmale liegen bei Kappa 0,6 oder höher.') : 'Noch keine Doppelcodierung zum Vergleichen.',
      body: ag.pairs.length ? pairs : empty('Sobald dieselbe Bewertung von zwei Personen codiert ist, erscheint hier die Übereinstimmung je Paar.'),
      how: `<p><b>Cohens Kappa je festem Paar</b>, wie im Codebuch: p<sub>o</sub> = Anteil gleicher Entscheide, p<sub>e</sub> = Summe über alle Ausprägungen (Anteil Person 1 × Anteil Person 2), Kappa = (p<sub>o</sub> − p<sub>e</sub>) / (1 − p<sub>e</sub>).</p>
        <p>Je Kategorie zählt «vergeben oder nicht», dazu Kundendienst-Kontakt (ja, nein) und Valenz bedingt (nur Fälle, in denen beide die Kategorie vergeben haben). Alle Kategorien stehen da, auch seltene. «Undefiniert» heisst p<sub>e</sub> = 1; dann zeigt «gleich» die beobachtete Übereinstimmung. Unter 0,6 (Gruppenentscheid) ist rot markiert, nie ausgeblendet.</p>
        <p>Ein Wert über alle Paare zusammen wird nicht gezeigt, weil dahinter wechselnde Personen stehen.</p>`,
      source: 'Team-Blatt, Bewertungen und Doppelcodierung; Codebuch C'});
  }
  function auditCard(A) {
    const a = A.field.audit;
    return card({id: 'bereinigung', eyebrow: 'Leitung · Bereinigung', title: 'Bereinigung nachvollziehen', span: 'span12',
      body: `<div class="stats">${stat(num(a.excluded), 'von ' + num(a.input) + ' Zeilen ausgeschlossen')}${stat(num(a.sensitivity_n), 'gültig ohne Dauerregel')}</div>${Object.keys(a.reasons).length ? bars(sorted(a.reasons), Math.max(1, ...Object.values(a.reasons))) : empty('Keine Ausschlüsse im aktuellen Stand.')}`,
      how: '<p>Erste Kennung bleibt; Ausschlussgründe exklusiv in Prüfreihenfolge. Die Zahl ohne Dauerregel dient als Sensitivitätsrechnung.</p>', source: 'Umfrage, Blatt Antworten'});
  }
  // Ergebnisse erst nach der serverseitigen Freigabe.
  const QUESTIONS = {t0: 'Ungestützte Bekanntheit', t1: 'Genutzte Banking-Apps', t2: 'Hauptapp', t2b: 'Rolle der Hauptapp', t3b: 'Erster Schritt bei einem Problem', t3c: 'Weniger Nutzung nach ungelöstem Problem', t3c2: 'Kontakt vor dem Wechsel', t3c_app: 'App des Wechsels', t4a: 'Erfahrung mit dem Kundendienst', t5: 'Kontakt in den letzten zwölf Monaten', t6: 'Anbieter des letzten Kontakts', t7: 'Erster Kontaktweg', t8: 'Anliegen', t9: 'Wartezeit auf einen Menschen', t10: 'Beim ersten Austausch gelöst', t10b: 'Heute gelöst', t11: 'Zufriedenheit', t12: 'Offene Kontakterfahrung', t4c: 'Erfahrung mit Yuh', t13a: 'Gestützte Bekanntheit von Yuh', t13: 'Offene Differenzierung', t14a: 'Schweizer Standort bekannt', t14b: 'Telefonkontakt bekannt', t15: 'Mehrwert Standort Schweiz', t15b: 'Mehrwert Telefon', t16p: 'Bevorzugter Lösungsweg', t16q: 'Grund für Selbstbedienung', t16b: 'Unterscheidung durch Kundendienst', t20: 'Kanton', t21: 'Sprache der Banking-App'};
  const FEATURES = ['Rasche Antwort eines Menschen', 'Beim ersten Kontakt gelöst', 'Direkter Austausch mit Menschen', 'Am Abend erreichbar', 'Am Wochenende erreichbar', 'Telefonkontakt', 'Mitarbeitende in der Schweiz', 'Bevorzugte Sprache', 'Weiteres Vorgehen erfahren', 'Selbst in der App lösen'];
  const question = k => { const m = /^(t3|t4|t4b)_(\d+)$/.exec(k); return k.toUpperCase() + ' · ' + (m ? ({t3: 'Wichtigkeit', t4: 'Hauptapp', t4b: 'Yuh'}[m[1]] + ' / ' + FEATURES[+m[2] - 1]) : QUESTIONS[k] || k); };
  const distribution = q => q.categories ? q.categories.map(c => `${esc(c.label)} ${pct(c.share)} (${num(c.count)})`).join(' · ') : `${num(q.n)} ausgefüllt · ${esc(q.kind)}`;
  function resultCards(data) {
    const A = data.methods.A.results, B = data.methods.B.results, C = data.methods.C.results, out = [];
    out.push(card({id: 'ergebnisse-a', eyebrow: 'Ergebnisse · Befragung', title: 'Ergebnisse der Befragung', span: 'span12',
      body: A ? `<p class="note">${esc(A.main.note || '')}</p><h3>F1 · Bekanntheit und Mehrwert bei Neobank-Nutzenden (n = ${num(A.main.F1.n)})</h3><div class="table-wrap"><table class="result"><thead><tr><th scope="col">Frage</th><th scope="col">n</th><th scope="col">Verteilung</th></tr></thead><tbody>${A.main.F1.table.map(q => `<tr><th scope="row">${esc(question(q.question))}</th><td>${num(q.n)}</td><td>${distribution(q)}</td></tr>`).join('')}</tbody></table></div>
        <details class="more" data-key="f2"><summary>F2 · Erwartungen und Yuh-Beurteilung</summary><div class="table-wrap"><table class="result"><thead><tr><th scope="col">Merkmal</th><th scope="col">Wichtig (4/5)</th><th scope="col">Yuh gut (4/5)</th></tr></thead><tbody>${A.main.F2.table.map(r => `<tr><th scope="row">${esc(FEATURES[r.feature - 1])}</th><td>${pct(r.importance.top2.share)} · n = ${num(r.importance.valid_n)}</td><td>${pct(r.yuh.top2.share)} · n = ${num(r.yuh.valid_n)}</td></tr>`).join('')}</tbody></table></div></details>
        <details class="more" data-key="alle-fragen"><summary>Alle Fragen mit Fallzahl</summary><div class="list">${A.main.questions.map(q => `<div class="row"><span>${esc(question(q.question))}<small>${distribution(q)}</small></span><b>n = ${num(q.n)}</b></div>`).join('')}</div></details>
        <p class="note">Sensitivität ohne Dauerregel: n = ${num(A.sensitivity.n)}.</p>` : unknown(),
      how: '<p>Anteile je Antwortkategorie mit der Fallzahl der Frage; der Nenner folgt der Route. «Kann ich nicht sagen» ist eine eigene Kategorie und wird nie gemittelt. Keine Intervalle und keine Tests: Die Stichprobe ist geeignet für die Fragestellung, aber keine Zufallsstichprobe.</p>', source: 'Umfrage, bereinigte Antworten'}));
    const part = p => p.share == null ? `${num(p.x)} von ${num(p.n)}` : `${pct(p.share)} <small>(${num(p.x)} von ${num(p.n)})</small>`;
    const CH = {telefon: 'Telefon', chat: 'Chat', mail: 'E-Mail', formular: 'Formular'};
    out.push(card({id: 'ergebnisse-b', eyebrow: 'Ergebnisse · Servicetest', title: 'Erste menschliche Antwort und Mindestantwort in Frist', span: 'span12',
      body: B && B.cells ? `<div class="table-wrap"><table class="result wide"><thead><tr><th scope="col">Anbieter · Kanal</th><th scope="col">n</th><th scope="col">Mensch in Frist</th><th scope="col">Mindestantwort in Folgefrist</th><th scope="col">Median bis Mensch</th><th scope="col">Erster Kontakt beantwortet</th><th scope="col">Richtig</th></tr></thead><tbody>${B.cells.map(c => `<tr><th scope="row">${esc(c.bank)} · ${esc(CH[c.channel] || c.channel)}</th><td>${num(c.n)}</td><td>${part(c.first_human)}</td><td>${part(c.minimum_answer)}</td><td>${c.time_to_human.median == null ? '–' : num(Math.round(c.time_to_human.median)) + ' min'}</td><td>${part(c.first_contact.yes)}</td><td>${part(c.correct)}</td></tr>`).join('')}</tbody></table></div>
        <h3>Je Anbieter</h3><div class="list">${B.banks.map(b => `<div class="row"><span>${esc(b.bank)}<small>Mensch in Frist ${part(b.first_human)} · Mindestantwort ${part(b.minimum_answer)}</small></span><b>n = ${num(b.n)}</b></div>`).join('')}</div>` : unknown(),
      how: `<p>Fristen je Ereignis: erste menschliche Antwort bei Telefon in 20 Minuten, Chat in 60 Minuten, E-Mail und Formular in 24 Stunden ab Start. Mindestantwort danach bei Telefon in 15 Minuten, Chat in 60 Minuten nach der ersten menschlichen Antwort, bei E-Mail und Formular bis 72 Stunden ab Start.</p>
        <p>«x von n» immer; ein Anteil erst ab n = ${B ? B.min_share_n : 4}, ein Median erst ab ${B ? B.min_median_n : 3} Werten. «Erster Kontakt beantwortet» ist beobachtet, keine betriebliche Lösungsquote. Explorative Beobachtung, keine Hochrechnung.</p>`, source: 'Team-Blatt, Beobachtung; Testprotokoll B'}));
    out.push(card({id: 'ergebnisse-c', eyebrow: 'Ergebnisse · Bewertungen', title: 'Themen je Auswertungszelle', span: 'span12',
      body: C ? C.map(r => `<details class="more" data-key="c-${esc(r.cell.join('-'))}"><summary>${esc(r.cell.join(' · '))} · n = ${num(r.n)}</summary>${r.small_n ? '<p class="note">n unter 20: berichten, nicht vergleichen.</p>' : ''}<div class="list">${r.categories.map(c => `<div class="row"><span>Kategorie ${num(c.category)}</span><b>${num(c.count)} von ${num(c.n)} · ${pct(c.share)}</b></div>`).join('')}</div></details>`).join('') : unknown(),
      how: '<p>Anteil Bewertungen mit der Kategorie an den codierten Bewertungen der Zelle. Verglichen wird nur gleich gegen gleich (gleiche Quelle, gleiches Zeitfenster, gleiche Schicht).</p>', source: 'Team-Blatt, Bewertungen mit Konsens'}));
    return out.join('');
  }
  function marketingPanel(data) {
    const A = data.methods.A, B = data.methods.B, C = data.methods.C, cards = [];
    cards.push(safeCard('quoten', () => quotaCard(A)));
    cards.push(safeCard('starts', () => startsCard(A)), safeCard('personen', () => peopleCard(A)), safeCard('kanaele', () => channelCard(A)), safeCard('verlauf', () => dailyCard(A)), safeCard('qualitaet', () => qualityCard(A)));
    cards.push(safeCard('organisationen', () => outreachCard(data.outreach)), safeCard('ertrag', () => yieldCard(A)));
    cards.push(safeCard('servicetest', () => serviceCard(B)), safeCard('codierung', () => codingCard(C)), safeCard('kappa', () => kappaCard(C)));
    if (A.field && A.field.audit) cards.push(safeCard('bereinigung', () => auditCard(A)));
    if (data.released) cards.push(safeCard('ergebnisse', () => resultCards(data)));
    return cards.join('');
  }

  // ---------- Tab Projektmanagement ----------
  const STATUS = {offen: 'offen', 'läuft': 'läuft', 'fällig': 'fällig', 'in Prüfung': 'in Prüfung', fertig: 'fertig'};
  function progressCard(pm) {
    const p = pm.progress;
    if (!p) return card({id: 'fortschritt', eyebrow: 'Fortschritt', title: 'Fortschritt derzeit unbekannt.', body: unknown(), span: 'span12'});
    const c = p.counts, total = Math.max(1, c.open + c.begun + c.done);
    return card({id: 'fortschritt', eyebrow: 'Fortschritt · nach Ergebnis', span: 'span12', tone: 'feature',
      title: p.share == null ? 'Fortschritt nicht berechenbar: Plan-Stunden fehlen.' : `${pct(p.share)} des geplanten Aufwands sind als Ergebnis erreicht.`,
      body: `<div class="progress-grid">${big(pct(p.share), 'gewichtet mit ' + num(p.plan_h) + ' Plan-Stunden')}
        <div><div class="stack" role="img" aria-label="${num(c.done)} fertig, ${num(c.begun)} begonnen, ${num(c.open)} offen"><i class="done" style="width:${c.done / total * 100}%"></i><i class="begun" style="width:${c.begun / total * 100}%"></i></div>
        <div class="legend"><span><i class="done"></i>${num(c.done)} fertig</span><span><i class="begun"></i>${num(c.begun)} begonnen</span><span><i></i>${num(c.open)} offen</span></div></div></div>`,
      how: `<p>Je Arbeitspaket zählt das Ergebnis, nicht die verbrauchte Zeit: <b>0 %</b> offen, <b>50 %</b> begonnen (Ist-Start gesetzt oder in Arbeit), <b>100 %</b> Status «fertig», also «Fertig wenn» erfüllt.</p>
        <p>Gesamt = Summe (Fortschritt × Plan-Stunden) / Summe Plan-Stunden über ${num(p.weighted_n)} Pakete mit Plan-Stunden${p.without_plan ? `; ${num(p.without_plan)} Pakete ohne Plan-Stunden zählen nicht mit` : ''}.</p>`,
      source: 'Notion PSP'});
  }
  function dueCard(pm) {
    const d = pm.due || {x: pm.done_due, n: pm.planned_due};
    return card({id: 'erledigt', eyebrow: 'Erledigungsstand', title: d.n ? `${num(d.x)} von ${num(d.n)} fälligen Paketen sind erledigt.` : 'Bis heute ist noch kein Paket fällig.',
      body: `${big(num(d.x), '/ ' + num(d.n) + ' fällig')}${meter(d.x, d.n, num(d.x) + ' von ' + num(d.n))}`,
      how: '<p>Fällig sind Arbeitspakete mit Plan-Ende bis heute. Erledigt heisst Status «fertig», egal wann. Ob es rechtzeitig war, zeigt die Karte Termintreue.</p>', source: 'Notion PSP'});
  }
  function punctualCard(pm) {
    const t = pm.punctual;
    if (!t) return card({id: 'termintreue', eyebrow: 'Termintreue', title: 'Termintreue derzeit unbekannt.', body: unknown()});
    const body = t.n ? `${big(num(t.x), '/ ' + num(t.n) + ' termintreu')}${meter(t.x, t.n, num(t.x) + ' von ' + num(t.n))}` : empty(t.without_actual_end ? `Noch nicht messbar: Bei ${num(t.without_actual_end)} erledigten Paketen fehlt das Ist-Ende in Notion.` : 'Noch nicht messbar: Bis heute ist kein Paket fällig.');
    return card({id: 'termintreue', eyebrow: 'Termintreue', title: t.n ? `${num(t.x)} von ${num(t.n)} fälligen Paketen wurden rechtzeitig fertig.` : 'Termintreue noch nicht messbar.',
      body: body + (t.n && t.without_actual_end ? `<p class="note">${num(t.without_actual_end)} erledigte Pakete ohne Ist-Ende sind nicht beurteilbar und nicht im Nenner.</p>` : ''),
      how: '<p>Termintreu ist ein fälliges Paket, wenn das Ist-Ende auf oder vor dem Plan-Ende liegt. Verspätet erledigte Pakete zählen nicht als termintreu, noch offene fällige Pakete ebenfalls nicht.</p>', source: 'Notion PSP, Ist-Ende und Plan-Ende'});
  }
  function deadlinesCard(pm) {
    const d = pm.deadline_buckets;
    if (!d) return card({id: 'fristen', eyebrow: 'Fristen', title: 'Fristen derzeit unbekannt.', body: unknown()});
    return card({id: 'fristen', eyebrow: 'Fristen', title: d.overdue === 1 ? '1 Paket ist überfällig.' : d.overdue ? `${num(d.overdue)} Pakete sind überfällig.` : 'Nichts ist überfällig.',
      body: `<div class="stats three">${stat(num(d.overdue), 'überfällig', d.overdue ? 'attention' : '')}${stat(num(d.this_week), 'bis Sonntag')}${stat(num(d.next_two_weeks), 'zwei Wochen danach')}</div>
        <div class="list">${d.next.length ? d.next.map(x => `<div class="row"><span>${esc(x.title)}<small>${esc(x.ref)} · ${esc(name(x.owner))} · ${esc(STATUS[x.status] || 'Status unbekannt')}</small></span><b class="${x.due < (pm.today || '') ? 'late' : ''}">${esc(dateShort(x.due))}</b></div>`).join('') : empty('Keine offenen Pakete mit Frist.')}</div>`,
      how: `<p>Offene Arbeitspakete nach Plan-Ende: überfällig (vor heute), bis Sonntag ${esc(dateShort(d.until))}, dann die zwei Wochen bis ${esc(dateShort(d.horizon))}.</p>`, source: 'Notion PSP'});
  }
  function milestonesCard(pm) {
    const ms = pm.milestones || [];
    const reached = ms.filter(m => m.reached).length, due = ms.filter(m => m.due && m.due <= (pm.today || '')).length;
    return card({id: 'meilensteine', eyebrow: 'Meilensteine und Tore', title: ms.length ? `${num(reached)} von ${num(ms.length)} Meilensteinen erreicht.` : 'Keine Meilensteine im Plan.',
      body: `<p class="note">${num(due)} davon sind bis heute fällig.</p><div class="list">${ms.map(m => `<div class="row"><span>${esc(m.title)}<small>${esc(m.ref || '')}${m.gate ? ' · Tor ' + esc(m.gate) : ''}</small></span><b>${m.reached ? chip('erreicht', 'ok') : ''} ${esc(dateShort(m.due))}</b></div>`).join('')}</div>`,
      how: '<p>Erreicht heisst Status «fertig». Die Phasentore MS-05, MS-02, MS-03 und MS-06 brauchen zusätzlich die Freigabe «Tor freigegeben»; ohne Freigabe beginnt die nächste Phase nicht.</p>', source: 'Notion PSP, Meilensteine'});
  }
  function effortCard(pm) {
    const plan = pm.plan_by_person || {}, reserve = pm.reserve_by_person || {}, h = pm.hours || {state: 'unknown'};
    const actual = c => h.state === 'ready' ? num(h.per_person[c] || 0) + '&nbsp;h' : '–';
    const table = `<div class="table-wrap"><table class="effort"><thead><tr><th scope="col">Person</th><th scope="col">PSP-Plan</th><th scope="col">Reserve</th><th scope="col">Ist</th><th scope="col">Massstab</th></tr></thead><tbody>${PEOPLE.map(c => `<tr><th scope="row">${esc(NAMES[c])}</th><td>${pm.plan_by_person ? num(plan[c] || 0) + '&nbsp;h' : '–'}</td><td>${reserve[c] ? num(reserve[c]) + '&nbsp;h' : '–'}</td><td>${actual(c)}</td><td>37&nbsp;h</td></tr>`).join('')}</tbody></table></div>`;
    const note = h.state === 'leer' ? empty('Noch keine Arbeitszeit erfasst. Sobald Stunden in der Team-App eingetragen sind, erscheinen sie hier je Person.') : h.state !== 'ready' ? empty('Arbeitszeit derzeit unbekannt: Das Zeitblatt ist nicht erreichbar.') : '';
    return card({id: 'aufwand', eyebrow: 'Aufwand', span: 'span12', title: 'Plan je Person, gemessen am Gruppenmassstab von 37 Stunden.',
      body: table + note + '<p class="note">Schätzung der Schule: ca. 12 h für 6a und geschätzt 25 h für 6b je Person, zusammen rund 37 h. Unverbindlich.</p>',
      how: '<p>Drei Grössen bleiben getrennt: der <b>PSP-Plan</b> je Person aus Notion (Arbeitspakete, Reserve separat), der <b>Gruppenmassstab</b> von 37 Stunden je Person (Entscheid der Gruppe) und die <b>Schätzung der Schule</b> («zusätzlich ca. 12 Stunden» für 6a, «geschätzter Aufwand 25 Stunden» für 6b).</p><p>Ist-Stunden kommen aus der Zeiterfassung der Team-App; stornierte Einträge zählen nicht. Ein leeres Zeitblatt heisst «noch nichts erfasst», nicht null Stunden.</p>',
      source: 'Notion PSP; Team-Blatt Projekt_Arbeitszeit; Konzept PA6'});
  }
  function confirmCard(pm) {
    const c = pm.confirmations;
    if (!ready(c)) return card({id: 'projektauftrag', eyebrow: 'Projektauftrag', title: 'Bestätigungen derzeit unbekannt.', body: unknown()});
    return card({id: 'projektauftrag', eyebrow: 'Projektauftrag · ' + c.version, title: `${num(c.confirmed.length)} von ${num(c.n)} haben den Projektauftrag bestätigt.`,
      body: `${big(num(c.confirmed.length), '/ ' + num(c.n))}${meter(c.confirmed.length, c.n, num(c.confirmed.length) + ' von ' + num(c.n))}
        <div class="people">${PEOPLE.map(p => chip(NAMES[p] + (c.confirmed.includes(p) ? ' · bestätigt' : c.objections.includes(p) ? ' · Einwand' : ' · offen'), c.confirmed.includes(p) ? 'ok' : c.objections.includes(p) ? 'warn' : '')).join('')}</div>`,
      how: `<p>Je Person zählt die letzte Antwort zur geltenden Version ${esc(c.version)}. Ein Einwand hebt eine frühere Bestätigung auf.</p>`, source: 'Team-Blatt, Bestaetigungen'});
  }
  function completenessCard(pm) {
    const c = pm.completeness;
    if (!c) return card({id: 'psp', eyebrow: 'PSP vollständig', title: 'PSP-Stand derzeit unbekannt.', body: unknown()});
    const labels = {plan: 'ohne Plan-Stunden', owner: 'ohne Verantwortung', done_when: 'ohne «Fertig wenn»', risk: 'ohne verknüpftes Risiko'};
    return card({id: 'psp', eyebrow: 'PSP vollständig', title: c.complete == null ? 'Vollständigkeit offen: Die Risiko-Verknüpfung ist nicht lesbar.' : `${num(c.complete)} von ${num(c.n)} Arbeitspaketen sind vollständig beschrieben.`,
      body: `${c.complete == null ? '' : big(num(c.complete), '/ ' + num(c.n))}<div class="list">${Object.keys(labels).map(k => `<div class="row"><span>${labels[k]}</span><b>${k === 'risk' && !c.risk_known ? 'unbekannt' : num(c.missing[k])}</b></div>`).join('')}</div>`,
      how: '<p>Vollständig ist ein Arbeitspaket mit Plan-Stunden, verantwortlicher Person, «Fertig wenn» und mindestens einem verknüpften Risiko (Raster C2).</p>', source: 'Notion PSP'});
  }
  function risksCard(pm) {
    const r = pm.risks;
    if (!ready(r)) return card({id: 'risiken', eyebrow: 'Risiken', title: 'Risikoregister derzeit unbekannt.', body: unknown()});
    const open = r.items.filter(x => !/erledigt|geschlossen/i.test(x.status || '')).length;
    const list = items => items.map(x => `<div class="row"><span>${esc(x.title)}</span><b>${chip(x.status || 'Status unbekannt')}</b></div>`).join('');
    return card({id: 'risiken', eyebrow: 'Risiken', title: `${num(open)} von ${num(r.n)} Risiken sind offen.`,
      body: `<div class="list">${list(r.items.slice(0, 6))}</div>${r.items.length > 6 ? `<details class="more" data-key="risiken-alle"><summary>Alle ${num(r.n)} Risiken</summary><div class="list">${list(r.items.slice(6))}</div></details>` : ''}`,
      how: '<p>Einträge des Risikoregisters mit ihrem Status. Bewertung, Massnahme und Review-Takt folgen, sobald sie im Register geführt werden.</p>', source: 'Notion Risikoregister'});
  }
  function absenceCard() {
    return card({id: 'abwesenheiten', eyebrow: 'Abwesenheiten', title: 'Abwesenheiten werden noch nicht erfasst.',
      body: empty('Es fehlt die Eingabe «Ich bin weg von … bis …» in der Team-App. Sobald sie steht, erscheinen die Abwesenheiten hier und im Gantt.'),
      how: '<p>Der Gantt verlangt Abwesenheiten (Raster C3). Die Gruppe hat entschieden, sie in der Team-App zu erfassen und nach Notion zu übertragen.</p>'});
  }
  const K = [['K1', 'Fazit der Analyse 6a korrekt übernommen', 'B1', ['6b-2']], ['K2', 'Ökonomische Ziele nach SMART mit 6 W', 'B2', ['6b-3']], ['K3', 'Vorökonomische Ziele nach SMART mit 6 W', 'B3', ['6b-3']], ['K4', 'Strategieansatz mit Definition und Begründung', 'B4', ['6b-7']],
    ['K5', 'Eine Massnahme im Marketing-Mix 7 P, mit belegtem Entscheid zu Kreativität, Erfolgspotenzial und Umsetzbarkeit', 'B5, B6', ['6b-8']], ['K6', 'Terminplan der Massnahme mit eingerechneter Reserve', 'B7', ['6b-8']], ['K7', 'Umsetzbarkeit und lückenlose Erfolgskontrolle je Ziel', 'B8', ['6b-8', '6b-10']],
    ['K8', 'Budget mit Kostenberechnung je Massnahme', 'B9', ['6b-10']], ['K9', 'Nachhaltigkeit: sozial, ökonomisch, ökologisch', 'B10', ['6b-9']], ['K10', 'Reflexion, Sprache, Quellen, Gestaltung', 'B11–B14', ['6b-12', '6b-13']]];
  function planningCard(pm) {
    const ch = pm.chapters_6b && pm.chapters_6b.state === 'ready' ? pm.chapters_6b.items : null;
    const due = ids => { const d = ids.map(id => ch && ch[id] && ch[id].due).filter(Boolean).sort(); return d.length ? dateShort(d[0]) : 'offen'; };
    const status = ids => { const s = ids.map(id => ch && ch[id] && ch[id].status).filter(Boolean); return s.length ? Array.from(new Set(s)).join(', ') : 'nicht begonnen'; };
    return card({id: 'pa6b', eyebrow: 'PA6b · Planung Marketing', span: 'span12', title: '0 von 10 Rasterkriterien mit Beleg erfüllt.',
      body: empty('Die Erfüllungsliste je Rasterkriterium fehlt noch; sie entsteht ab der Auftragserteilung. Bis dahin zeigt die Liste nur Kapitel, Status und Frist aus Notion.') +
        `<ol class="klist">${K.map(([k, text, raster, ids]) => `<li><span class="k">${k}</span><span class="ktext">${esc(text)}<small>Raster ${esc(raster)} · Kapitel ${esc(ids.join(', '))} · ${esc(status(ids))}</small></span><span class="kmeta">${chip('offen')}<small>Frist ${esc(due(ids))}</small></span></li>`).join('')}</ol>`,
      how: '<p>Jedes Kriterium wird nur als offen, Entwurf, geprüft oder erfüllt mit Beleg geführt; Wirkungs- oder Budgetwerte werden nicht vorweggenommen. Feldvollständigkeit allein gilt nicht als Erfüllung: K5 und K7 brauchen einen belegten Gruppenentscheid.</p>', source: 'Raster 6b; Notion Kapitel'});
  }
  function transferCard(project) {
    return card({id: 'uebertrag', eyebrow: 'Projekt-Übertrag', span: 'span12', title: project.enabled ? 'Der Abgleich mit Notion läuft stündlich.' : 'Der automatische Übertrag ist ausgeschaltet.',
      body: `<div class="list">${project.forms.map(row => { const warning = project.enabled && (row.stale || !['gleich', 'ungeprüft'].includes(row.status)), status = project.enabled ? (row.stale ? 'ausstehend oder veraltet' : row.status) : 'Übertrag aus'; return `<div class="row"><span>${esc(({stakeholder: 'Stakeholder', coaching: 'Coaching', risiko: 'Risiken', arbeitszeit: 'Arbeitszeit', beitrag: '6b-Beiträge'})[row.formular] || row.formular)}<small>${row.blatt_anzahl !== undefined && row.blatt_anzahl !== '' ? 'Blatt ' + num(row.blatt_anzahl) + ' · Notion ' + num(row.notion_anzahl) : 'Noch keine Zählung'}</small></span><b>${chip(status, warning ? 'warn' : '')}</b></div>`; }).join('')}</div>`,
      how: '<p>Anzahl Einträge im Projektblatt gegen Notion, mit Prüfsumme je Formular.</p>', source: 'Projektblätter, Notion-Abgleich'});
  }
  function pmPanel(data) {
    const pm = data.pm || {state: 'unknown'}, cards = [];
    if (pm.state !== 'ready') cards.push(card({id: 'psp-quelle', eyebrow: 'Projektplan', title: 'Der Projektplan ist gerade nicht erreichbar.', body: unknown(), span: 'span12'}));
    else cards.push(safeCard('fortschritt', () => progressCard(pm)), safeCard('erledigt', () => dueCard(pm)), safeCard('termintreue', () => punctualCard(pm)), safeCard('fristen', () => deadlinesCard(pm)), safeCard('meilensteine', () => milestonesCard(pm)));
    cards.push(safeCard('aufwand', () => effortCard(pm)), safeCard('projektauftrag', () => confirmCard(pm)));
    if (pm.state === 'ready') cards.push(safeCard('psp', () => completenessCard(pm)));
    cards.push(safeCard('risiken', () => risksCard(pm)), safeCard('abwesenheiten', () => absenceCard()), safeCard('pa6b', () => planningCard(pm)));
    if (data.project && Array.isArray(data.project.forms)) cards.push(safeCard('uebertrag', () => transferCard(data.project)));
    return cards.join('');
  }

  // ---------- Öffentliche Ansicht: nur Gesamtrücklauf, keine Personen- oder Organisationszahlen ----------
  function publicPanel(data) {
    const f = data.field, n = f && f.state === 'ready' ? f.n : null;
    return `<div class="grid">${card({id: 'oeffentlich', eyebrow: 'Befragung zu Banking-Apps', span: 'span12', tone: 'feature', title: n == null ? 'Rücklauf derzeit unbekannt.' : n >= 100 ? 'Das Mindestziel ist erreicht.' : 'Jede Teilnahme bringt uns weiter.',
      body: n == null ? unknown() : `${big(num(n), '/ 100 gültige Teilnahmen')}${meter(n, 100, num(n) + ' von 100')}<p class="note">Streckenziel 300 · ${pct(n / 300)} erreicht</p>`})}${dailyCard({field: f || {state: 'unknown'}})}</div>`;
  }

  // ---------- Seite ----------
  function render(data) {
    if (!data.ok) throw Error(data.fehler || 'Der Stand ist gerade nicht verfügbar.');
    standText = stamp(data.generated_at);
    const open = new Set(Array.from(root.querySelectorAll('details[data-key]')).filter(d => d.open).map(d => d.dataset.key)), first = !root.querySelector('.tabpanel');
    roleButton.hidden = publicView || !data.can_lead; roleButton.textContent = leadership ? 'Leitung an' : 'Leitung aus'; roleButton.setAttribute('aria-pressed', String(leadership));
    const intro = `<div class="intro"><div><p class="eyebrow">${publicView ? 'Einblick in unsere Erhebung' : data.role === 'leitung' ? 'Leitung · Gruppe 601' : 'Gruppe 601 · Praxisarbeit 6'}</p><h1>${publicView ? 'Jede Teilnahme zählt.' : 'Wo wir stehen.'}</h1></div><p class="stand"><span class="dot" aria-hidden="true"></span>Stand ${esc(standText)}</p></div>`;
    if (publicView) { root.innerHTML = intro + publicPanel(data); return; }
    const banner = data.released ? '<aside class="banner"><b>Auswertung freigegeben.</b> Anteile immer mit Fallzahl n; die Stichprobe ist geeignet für die Fragestellung.</aside>'
      : `<aside class="banner"><b>Feldsteuerung bis zur Freigabe.</b> Ergebnisse erscheinen frühestens am ${esc(releaseDay(data.release_at))}; bis dahin zeigt der Tab Marketing nur den Stand der Erhebung.</aside>`;
    const tabs = `<div class="tabs" role="tablist" aria-label="Bereiche">${TABS.map(([id, label]) => `<button role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${tab === id}" tabindex="${tab === id ? 0 : -1}">${label}</button>`).join('')}</div>`;
    const panel = (id, html) => `<div class="tabpanel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" ${tab === id ? '' : 'hidden'}><div class="grid">${html}</div></div>`;
    root.innerHTML = intro + tabs + banner + panel('marketing', marketingPanel(data)) + panel('pm', pmPanel(data));
    root.querySelectorAll('details[data-key]').forEach(d => { if (open.has(d.dataset.key) || (first && d.hasAttribute('data-default-open'))) d.open = true; });
  }
  function selectTab(id, focus) {
    tab = id;
    try { sessionStorage.setItem('pa6_dashboard_tab', id); } catch {}
    const q = new URLSearchParams(location.search); if (id === 'pm') q.set('tab', 'pm'); else q.delete('tab');
    history.replaceState({}, '', location.pathname + (q.toString() ? '?' + q : ''));
    root.querySelectorAll('[role=tab]').forEach(b => { const on = b.id === 'tab-' + id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    root.querySelectorAll('[role=tabpanel]').forEach(p => { p.hidden = p.id !== 'panel-' + id; });
  }
  root.addEventListener('click', event => { const b = event.target.closest('[role=tab]'); if (b) selectTab(b.id.slice(4), false); });
  root.addEventListener('keydown', event => {
    const b = event.target.closest('[role=tab]'); if (!b) return;
    const ids = TABS.map(t => t[0]), i = ids.indexOf(b.id.slice(4));
    const next = {ArrowRight: (i + 1) % ids.length, ArrowLeft: (i - 1 + ids.length) % ids.length, Home: 0, End: ids.length - 1}[event.key];
    if (next !== undefined) { event.preventDefault(); selectTab(ids[next], true); }
  });
  async function load() {
    const version = ++generation; root.setAttribute('aria-busy', 'true'); refresh.disabled = true; clearTimeout(timer);
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 25000);
    try {
      let input = publicView ? {typ: 'dashboard', public: true} : {typ: 'dashboard', k: key, leitung: leadership};
      if (!publicView) { try { const target = sessionStorage.getItem('pa6-view-as'); if (target) input = {...input, als: target, leitung: true}; } catch {} }
      const response = await fetch(window.TEAM_CONFIG.endpoint, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(input), cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw Error('Der Stand ist gerade nicht erreichbar.');
      const data = await response.json(); if (version !== generation) return; render(data);
    } catch (error) {
      if (version === generation) root.innerHTML = `<section class="error"><h1>${publicView ? 'Noch nicht öffentlich.' : 'Stand nicht verfügbar.'}</h1><p>${esc(error.name === 'AbortError' ? 'Die Abfrage hat zu lange gedauert. Bitte erneut aktualisieren.' : error.message)}</p><a href="/team/">Zur Team-Startseite</a></section>`;
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
