'use strict';
// 22.11.2026 EA-005 (Ernes): Service-Momentaufnahmen prüfen. Je Anbieter Zusammenfassung und offene Punkte,
// als Entwurf speichern oder abgeben. Server: momentaufnahme_lesen (nur lesen) und momentaufnahme_pruefung (schreiben).
(() => {
  const status = document.getElementById('mp-status'), inhalt = document.getElementById('mp-inhalt');
  const formulare = document.getElementById('mp-formulare');
  const zeit = iso => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString('de-CH', {weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : ''; };
  const standText = z => z && z.stand === 'abgegeben' ? 'Abgegeben ' + zeit(z.geaendert_am) : z ? 'Entwurf gespeichert ' + zeit(z.geaendert_am) : 'Noch nichts gespeichert';
  let PERSON = '';
  const entwurfSchluessel = anbieter => 'pa6-mp-entwurf-' + PERSON + '-' + anbieter;   // je Person, ein anderer Link auf demselben Gerät sieht den Entwurf nicht

  function zaehler(feld, max) {
    const z = el('span', {class: 'mp-zaehler', 'aria-live': 'polite'});
    const neu = () => { z.textContent = feld.value.length + ' / ' + max + ' Zeichen'; };
    feld.addEventListener('input', neu); neu();
    return z;
  }

  function karte(anbieter, zeile, darf) {
    const lokalerEntwurf = darf ? lokal(entwurfSchluessel(anbieter)) : null;
    const zf = el('textarea', {id: 'mp-zf-' + anbieter, maxlength: '3000', rows: '7', readonly: !darf});
    const op = el('textarea', {id: 'mp-op-' + anbieter, class: 'klein', maxlength: '2000', rows: '4', readonly: !darf});
    zf.value = lokalerEntwurf && typeof lokalerEntwurf.zusammenfassung === 'string' ? lokalerEntwurf.zusammenfassung : (zeile && zeile.zusammenfassung) || '';
    op.value = lokalerEntwurf && typeof lokalerEntwurf.offene_punkte === 'string' ? lokalerEntwurf.offene_punkte : (zeile && zeile.offene_punkte) || '';
    const stand = el('span', {class: 'mp-stand' + (zeile && zeile.stand === 'abgegeben' ? ' abgegeben' : '')}, standText(zeile));
    const meldung = el('p', {class: 'mp-meldung', role: 'status'});
    const merken = () => { if (darf) lokal(entwurfSchluessel(anbieter), {zusammenfassung: zf.value, offene_punkte: op.value}); };
    zf.addEventListener('input', merken); op.addEventListener('input', merken);
    const knoepfe = [];
    async function speichern(art) {
      meldung.className = 'mp-meldung'; meldung.textContent = art === 'abgegeben' ? 'Wird abgegeben …' : 'Wird gespeichert …';
      knoepfe.forEach(b => { b.disabled = true; }); zf.readOnly = true; op.readOnly = true;
      try {
        const r = await sende({typ: 'momentaufnahme_pruefung', anbieter, zusammenfassung: zf.value, offene_punkte: op.value, stand: art}, 30000);
        lokal(entwurfSchluessel(anbieter), null);
        stand.textContent = standText(r.zeile); stand.className = 'mp-stand' + (r.zeile.stand === 'abgegeben' ? ' abgegeben' : '');
        meldung.className = 'mp-meldung ok';
        meldung.textContent = art === 'abgegeben' ? 'Abgegeben. Salah sieht deine Zusammenfassung zu ' + anbieter + '. Du kannst sie weiter verbessern und neu abgeben.' : 'Entwurf gespeichert.';
      } catch (e) {
        meldung.className = 'mp-meldung fehler';
        meldung.textContent = (e && e.message ? e.message : 'Nicht gespeichert.') + ' Dein Text bleibt auf diesem Gerät erhalten.';
      } finally { knoepfe.forEach(b => { b.disabled = false; }); zf.readOnly = false; op.readOnly = false; }
    }
    if (darf) {
      knoepfe.push(el('button', {type: 'button', class: 'button secondary', on: {click: () => speichern('entwurf')}}, 'Entwurf speichern'));
      knoepfe.push(el('button', {type: 'button', class: 'button', on: {click: () => speichern('abgegeben')}}, 'Abgeben'));
    }
    return el('section', {class: 'mp-anbieter', 'aria-labelledby': 'mp-titel-' + anbieter},
      el('div', {class: 'mp-anbieter-kopf'}, el('h3', {id: 'mp-titel-' + anbieter}, anbieter), stand),
      el('div', {class: 'mp-feld'}, el('label', {for: zf.id}, 'Zusammenfassung ' + anbieter),
        el('small', {}, 'Ablauf und Antwort · persönlicher Eindruck · Grenzen'), zf, zaehler(zf, 3000)),
      el('div', {class: 'mp-feld'}, el('label', {for: op.id}, 'Offene Punkte ' + anbieter),
        el('small', {}, 'Was fehlt oder widerspricht sich? Leer lassen, wenn nichts offen ist.'), op, zaehler(op, 2000)),
      darf ? el('div', {class: 'mp-aktionen'}, knoepfe) : el('p', {class: 'mp-hinweis'}, 'Diese Prüfung gehört zu Ernes\' Auftrag. Du kannst sie hier nur lesen.'),
      meldung);
  }

  function alleAbgaben(zeilen) {
    const ziel = document.getElementById('mp-alle-liste');
    const andere = (zeilen || []).filter(z => z.person !== 'SA');
    if (!andere.length) { fuelle(ziel, el('p', {}, 'Ernes hat noch nichts gespeichert.')); return; }
    fuelle(ziel, andere.map(z => el('article', {class: 'mp-abgabe'},
      el('strong', {}, (TEAM[z.person] || z.person) + ' · ' + z.anbieter + ' · ' + standText(z)),
      el('p', {}, z.zusammenfassung || '(leer)'),
      z.offene_punkte ? el('p', {}, el('em', {}, 'Offen: '), z.offene_punkte) : null)));
    document.getElementById('mp-alle').hidden = false;
  }

  async function start() {
    if (window.PA6View) window.PA6View.mount && window.PA6View.mount();
    if (window.PA6View && window.PA6View.active()) {
      status.textContent = 'In der Personenansicht ist diese Seite nicht verfügbar. Geh «zurück zu mir», dann siehst du alle Abgaben.';
      return;
    }
    if (!schluessel()) { status.textContent = 'Öffne diese Seite über deinen persönlichen Link zur Team-App.'; return; }
    try {
      const r = await sende({typ: 'momentaufnahme_lesen'}, 30000);
      PERSON = r.person; document.getElementById('wer').textContent = TEAM[r.person] || r.person;
      const nach = {}; (r.zeilen || []).forEach(z => { nach[z.anbieter] = z; });
      fuelle(formulare, (r.anbieter || ['Yuh', 'Zak']).map(a => karte(a, nach[a], !!r.darf_schreiben)));
      if (r.alle) alleAbgaben(r.alle);
      status.hidden = true; inhalt.hidden = false;
    } catch (e) {
      status.textContent = e && e.denied ? 'Kein Zugriff. Öffne die Seite über deinen persönlichen Link.' : 'Die Seite konnte nicht geladen werden. Bitte neu laden.';
    }
  }
  start();
})();
