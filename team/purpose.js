'use strict';
(() => {
  const areas = {
    a: {
      question: 'die Umfrage',
      lines: [
        'Wir fragen Menschen, was sie vom Kundendienst ihrer Banking-App erwarten.',
        'eigene Daten für Kapitel 2.4 und 2.8, Grundlage der ganzen PA6b.',
        'zeigt, was Kundinnen und Kunden wirklich wichtig ist.'
      ]
    },
    b: {
      question: 'die Service-Momentaufnahmen',
      lines: [
        'Wir halten fest, was wir bei unseren Kontakten mit Yuh und Zak erlebt haben.',
        'subjektive Momentaufnahmen mit wenigen Kontakten, in einem kurzen Zeitraum und von wenigen Personen.',
        'liefert qualitative Hinweise und neue Fragen; keine Kennzahlen oder Rangfolge der Anbieter.'
      ]
    },
    c: {
      question: 'das Codieren von Bewertungen',
      lines: [
        'Wir ordnen öffentliche Bewertungen festen Themen zu, damit man sie zählen kann.',
        'belegte Stärken und Schwächen für Konkurrenzanalyse und SWOT.',
        'zeigt, was den Ruf des Kundendienstes heute prägt.'
      ]
    }
  };
  window.createPurposeCard = (area, onJuno) => {
    const content = areas[area];
    if (!content) return null;
    // Keep the current disclosure state during refreshes of the same view.
    const existing = document.querySelector('.purpose-card[data-area="' + area + '"]');
    if (existing) return existing;
    const card = document.createElement('details');
    card.className = 'purpose-card';
    card.dataset.area = area;
    card.open = true;
    try {
      const storageKey = 'pa6-purpose-seen:' + area;
      card.open = localStorage.getItem(storageKey) !== '1';
      if (!window.PA6View?.active()) localStorage.setItem(storageKey, '1');
    } catch {}
    const summary = document.createElement('summary');
    summary.textContent = 'Warum wir das machen';
    const body = document.createElement('div');
    body.className = 'purpose-body';
    content.lines.forEach((text, index) => {
      const line = document.createElement('p');
      line.className = 'purpose-section';
      const label = document.createElement('strong');
      label.textContent = ['Was:', 'Für die PA:', 'Für Yuh:'][index];
      line.append(label, ' ' + text);
      body.append(line);
    });
    const connection = document.createElement('p');
    connection.className = 'purpose-connection';
    connection.textContent = 'Zusammen ergeben A, B und C ein belegtes Bild, auf dem die PA6b aufbaut.';
    const link = document.createElement('a');
    const url = new URL(window.TEAM_CONFIG?.piaPath || '/team/frag/', location.origin);
    url.searchParams.set('q', 'Erklär mir in drei Sätzen, wozu wir ' + content.question + ' machen und wie es Yuh hilft.');
    link.href = url.pathname + url.search;
    link.className = 'purpose-juno';
    link.referrerPolicy = 'no-referrer';
    link.textContent = 'Mehr bei Juno';
    link.addEventListener('click', onJuno || (() => {
      try { sessionStorage.setItem('pa6_pia_role', window.PA6View?.active() ? 'leitung' : 'mitglied'); } catch {}
    }));
    body.append(connection, link);
    card.append(summary, body);
    return card;
  };
  const slot = document.querySelector('[data-purpose-area]');
  if (slot) slot.append(window.createPurposeCard(slot.dataset.purposeArea));
})();
