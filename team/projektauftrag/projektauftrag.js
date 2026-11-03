'use strict';
// Bestaetigung des Projektauftrags (Claudette 03.11.2026). Liest den eigenen Stand, speichert «ja» oder einen Einwand.
// Inhalt: Notion-Projektauftrag PA-V1, in Alltagssprache zusammengefasst. Gespeichert wird im Blatt «Bestaetigungen».
const DOK = 'projektauftrag';
const PUNKTE = [
  ['Was wir liefern', 'Die PA6a mit Forschung und Analyse in sieben Kapiteln, Abgabe 12.12.2026. Die PA6b mit einer ausgearbeiteten Massnahme für Yuh, Abgabe 27.02.2027. Die Präsentation mit Fachgespräch am 22.03.2027.'],
  ['Was nicht dazugehört', 'Wir setzen die Massnahme nicht selbst bei Yuh um, versprechen keine Umsatzwirkung und rechnen unsere Umfrage nicht auf die ganze Schweiz hoch.'],
  ['Wer wofür zuständig ist', 'Salah leitet das Projekt, hält den Kontakt zur Schule und gibt am Schluss ab. Den Kontakt zu Yuh halten wir alle. Ernes führt den Servicetest, Melisa die Bewertungen und die SWOT, Arber die Umfrage, Leonie das Schreibwerk mit Terminen und Formalem. Die Lead-Person ist verantwortlich, mitarbeiten dürfen alle.'],
  ['Wie viel Aufwand', 'Das Konzept der Schule rechnet mit rund 37 Stunden pro Person, 25 für die 6b und 12 für die 6a. Unser Plan liegt höher, weil die drei Erhebungen und die Präsentation dazukommen. Alle erfassen ihre Stunden selbst in der Team-App.'],
  ['Was Vorrang hat', 'Die Termine der Schule stehen fest. Danach kommt die Qualität. Über Stunden und Verteilung reden wir, wenn es eng wird, und verteilen bei Bedarf am Sonntag um.'],
  ['Unsere Termine', 'Arbeitsplan final am 18.11.2026. Auftrag für die PA6b am 16.11.2026. Abgaben am 12.12.2026 und 27.02.2027, Präsentation am 22.03.2027.'],
  ['Wie wir uns abstimmen', 'Ab dem 16.11. gibt es jede Woche einen kurzen Statusbericht und ein Meeting von 30 Minuten auf Teams, in dem wir uns absprechen. Wir entscheiden nach der Nein-Regel, wer bis zur Frist nicht widerspricht, stimmt zu.']
];
const $ = id => document.getElementById(id);
let stand = null, busy = false, einwandOffen = false, nachricht = {text: '', art: ''};

function datum(zeit) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(zeit || ''));
  return m ? m[3] + '.' + m[2] + '.' + m[1] : '';
}
function punkte() {
  return el('ol', {class: 'pa-punkte'}, PUNKTE.map(([titel, text]) => el('li', {}, el('h2', {}, titel), el('p', {}, text))));
}
function zustand() {
  if (!stand) return null;
  const eigene = stand.eigene;
  const satz = eigene && eigene.antwort === 'ja' ? 'Du hast am ' + datum(eigene.zeit) + ' bestätigt. Danke!'
    : eigene && eigene.antwort === 'einwand' ? 'Dein Einwand vom ' + datum(eigene.zeit) + ' ist bei Salah angekommen.' : '';
  const wer = stand.bestaetigt.length ? 'Bestätigt haben bisher ' + stand.bestaetigt.join(', ') + '.' : 'Bisher hat noch niemand bestätigt.';
  return el('div', {class: 'pa-stand', role: 'status'}, satz ? el('p', {class: 'pa-eigen'}, satz) : null, el('p', {class: 'leise'}, wer + ' (' + stand.bestaetigt.length + ' von 5)'));
}
function meldung(text, art) {
  nachricht = {text: text || '', art: art || ''};
  const m = $('pa-meldung'); if (!m) return;
  m.textContent = nachricht.text; m.className = 'meldung' + (nachricht.art ? ' ' + nachricht.art : ''); m.hidden = !nachricht.text;
}
async function speichern(antwort) {
  if (busy) return;
  const einwand = antwort === 'einwand' ? String(($('pa-einwand') || {}).value || '').trim() : '';
  if (antwort === 'einwand' && einwand.length < 3) { meldung('Bitte schreib kurz, was dich stört.', 'fehler'); $('pa-einwand').focus(); return; }
  busy = true; render(); meldung('Wird gespeichert …');
  try {
    await sende({typ: 'bestaetigung', dokument: DOK, antwort, einwand});
    einwandOffen = false;
    await laden(true);
    meldung(antwort === 'ja' ? 'Gespeichert. Danke für deine Bestätigung!' : 'Gespeichert. Salah meldet sich bei dir.', 'ok');
  } catch (e) { meldung('Nicht gespeichert. ' + e.message, 'fehler'); }
  finally { busy = false; render(); }
}
function knoepfe() {
  if (window.PA6View && PA6View.active()) return el('p', {class: 'leise'}, 'In der lesenden Ansicht kannst du nichts bestätigen.');
  const ja = stand && stand.eigene && stand.eigene.antwort === 'ja';
  const box = el('div', {class: 'pa-aktion'},
    el('button', {type: 'button', class: 'knopf', disabled: busy || ja, on: {click: () => speichern('ja')}}, ja ? 'Bestätigt' : 'Ich bestätige den Projektauftrag'),
    el('button', {type: 'button', class: 'chip', 'aria-expanded': String(einwandOffen), disabled: busy, on: {click: () => { einwandOffen = !einwandOffen; render(); if (einwandOffen) $('pa-einwand').focus(); }}}, 'Ich habe einen Einwand'));
  const einwand = einwandOffen ? el('div', {class: 'pa-einwand'},
    el('label', {for: 'pa-einwand'}, 'Was stört dich? Salah bekommt deinen Text direkt.'),
    el('textarea', {id: 'pa-einwand', rows: '4', maxlength: '2000'}),
    el('button', {type: 'button', class: 'knopf', disabled: busy, on: {click: () => speichern('einwand')}}, 'Einwand senden')) : null;
  return el('div', {}, box, einwand);
}
function render() {
  const main = $('main');
  const einwandText = $('pa-einwand') ? $('pa-einwand').value : '';
  main.replaceChildren(
    el('h1', {}, 'Unser Projektauftrag'),
    el('p', {class: 'project-lead'}, 'Das sind die Spielregeln für unsere PA6. Lies die sieben Punkte kurz durch und bestätige sie, oder sag, was dich stört.'),
    punkte(), zustand(), knoepfe(),
    el('p', {id: 'pa-meldung', class: 'meldung', hidden: true, role: 'status'}));
  if ($('pa-einwand')) $('pa-einwand').value = einwandText;
  meldung(nachricht.text, nachricht.art);
  if (stand) $('wer').textContent = stand.name;
}
async function laden(still) {
  try { stand = await sende({typ: 'bestaetigung_stand', dokument: DOK}); }
  catch (e) { if (!still) { render(); meldung(e.denied ? 'Dein Zugang fehlt. Öffne bitte den Link aus der Mail noch einmal.' : 'Gerade nicht erreichbar. ' + e.message, 'fehler'); } return; }
  render();
}
document.addEventListener('DOMContentLoaded', () => { schluessel(); laden(false); });
