'use strict';
// Auftragsbegleiter (05.11.2026, Salah): wer aus einem Auftrag in ein Werkzeug springt, sieht dort den aktuellen Schritt.
// Erscheint nur, wenn der aktuelle Schritt genau auf diese Seite zeigt. Laptop rechts, Handy oben, einklappbar, wegklickbar.
// Teilt den Stand mit dem Auftrag (gleiche Schritt-Schlüssel) und misst wie der Auftrag (typ auftragsweg).
(() => {
  const K = 'pa6-begleiter';
  let s; try { s = JSON.parse(localStorage.getItem(K) || 'null'); } catch { s = null; }
  if (!s || s.v !== 1 || !Array.isArray(s.steps) || !s.steps.length || !(Date.now() < s.until)) return;
  let viewAs = false; try { viewAs = !!sessionStorage.getItem('pa6-view-as'); } catch {}
  if (viewAs) return;   // lesende Ansicht: kein Begleiter, er gehört zum eigenen Arbeitsfluss
  const path = h => { try { const u = new URL(h, location.origin); return u.pathname.replace(/index\.html$/, '') + (u.pathname === '/team/' ? u.search : ''); } catch { return ''; } };
  const here = location.pathname.replace(/index\.html$/, '') + (location.pathname === '/team/' ? location.search : '');
  const n = s.steps.length, on = i => !!s.steps[i] && !!s.steps[i].href && path(s.steps[i].href) === here;
  if (!on(s.cur)) return;
  const done = i => { try { return localStorage.getItem(s.steps[i].key) === '1'; } catch { return false; } };
  const save = () => { try { localStorage.setItem(K, JSON.stringify(s)); } catch {} };
  const track = (aktion, wert) => {
    if (viewAs) return;
    let k = '', endpoint = ''; try { k = localStorage.getItem('pa6k') || ''; } catch {}
    try { endpoint = (window.TEAM_CONFIG && window.TEAM_CONFIG.endpoint) || (typeof ENDPUNKT === 'string' ? ENDPUNKT : ''); } catch {}
    if (!k || !endpoint) return;
    try { fetch(endpoint, {method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify({typ:'auftragsweg', k, id:s.id, ref:s.ref || '', quelle:s.source, aktion, wert:wert == null ? '' : String(wert)}), referrerPolicy:'no-referrer'}).catch(() => {}); } catch {}
  };
  const el = (t, a, ...kids) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a || {})) { if (v == null || v === false) continue; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };
  // Rechts schweben nur, wenn neben dem Inhalt wirklich Platz ist; sonst oben im Fluss. Nie über dem Inhalt.
  const content = () => { const m = document.querySelector('main'); if (!m) return null; let r = 0; for (const c of [m, ...m.children]) { const b = c.getBoundingClientRect(); if (b.width && b.width < innerWidth - 40) r = Math.max(r, b.right); } return r || null; };
  const space = () => { const r = content(); return r ? innerWidth - r - 24 : 0; };
  const wide = () => space() >= 260;
  const root = el('aside', {class:'begleiter', 'aria-label':'Dein Auftrag'});
  const back = () => el('a', {class:'bg-link', href:s.from}, 'Zum Auftrag');
  const dots = () => el('span', {class:'bg-dots', 'aria-hidden':'true'}, s.steps.map((x, i) => el('i', {class:done(i) ? 'on' : i === s.cur ? 'now' : ''})));
  function close() { try { localStorage.removeItem(K); } catch {} root.remove(); }
  function render(note) {
    const step = s.steps[s.cur], finished = s.cur >= n;
    const head = el('div', {class:'bg-head'},
      el('button', {type:'button', class:'bg-toggle', 'aria-expanded':String(s.open), onclick:() => { s.open = !s.open; save(); render(); }},
        el('span', {class:'bg-kicker'}, finished ? 'Alle Schritte erledigt' : 'Schritt ' + (s.cur + 1) + ' von ' + n), dots(),
        s.open ? null : el('span', {class:'bg-peek'}, finished ? s.title : step.text), el('span', {class:'bg-chev', 'aria-hidden':'true'})),
      el('button', {type:'button', class:'bg-close', 'aria-label':'Begleiter ausblenden', onclick:close}, '×'));
    root.classList.toggle('is-closed', !s.open);   // nur diesen Zustand ändern, «is-docked» bleibt
    if (!s.open) { root.replaceChildren(head); return; }
    let body;
    if (finished) body = [el('p', {class:'bg-step'}, 'Super, alles erledigt.'), el('p', {class:'bg-sub'}, 'Melde den Auftrag jetzt als fertig.'), el('div', {class:'bg-act'}, el('a', {class:'bg-btn', href:s.from}, 'Zum Auftrag'))];
    else if (!on(s.cur)) body = [note ? el('p', {class:'bg-note'}, note) : null, el('p', {class:'bg-sub'}, 'Nächster Schritt'), el('p', {class:'bg-step'}, step.text),
      el('div', {class:'bg-act'}, step.href ? el('a', {class:'bg-btn', href:step.href}, step.label || 'Öffnen') : el('a', {class:'bg-btn', href:s.from}, 'Zum Auftrag'), step.href ? back() : null)];
    else body = [note ? el('p', {class:'bg-note'}, note) : null, el('p', {class:'bg-step'}, step.text),
      el('div', {class:'bg-act'}, el('button', {type:'button', class:'bg-btn', onclick:() => {
        try { localStorage.setItem(step.key, '1'); } catch {}
        track('schritt_erledigt', s.cur + 1);
        const next = s.steps.findIndex((x, i) => i > s.cur && !done(i)), first = s.steps.findIndex((x, i) => !done(i));
        s.cur = next >= 0 ? next : first >= 0 ? first : n; save(); render('Erledigt.');
        root.querySelector('.bg-step')?.focus({preventScroll:true});
      }}, 'Erledigt'), back())];
    root.replaceChildren(head, el('p', {class:'bg-title'}, s.title), ...body.filter(Boolean));
    root.querySelector('.bg-step')?.setAttribute('tabindex', '-1');
  }
  const place = () => {
    const sp = space(), main = document.querySelector('main');
    if (sp >= 260) { root.classList.add('is-docked'); root.style.width = Math.min(320, sp - 8) + 'px'; if (root.parentNode !== document.body) document.body.append(root); }
    else {
      root.classList.remove('is-docked'); root.style.width = '';
      // direkt unter den Seitenkopf, klebt beim Scrollen darunter (Werkzeuge scrollen oft selbst zum Arbeitsbereich)
      const head = document.querySelector('body > header') || document.querySelector('.bar');
      const first = head ? [...document.body.children].find(n => n !== head && n !== root && n.getBoundingClientRect().height > 0 && n.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_PRECEDING) : null;
      if (first) first.before(root); else if (main) main.parentNode.insertBefore(root, main); else document.body.prepend(root);
      const pos = head ? getComputedStyle(head).position : '';
      root.style.top = (pos === 'sticky' || pos === 'fixed' ? Math.ceil(head.getBoundingClientRect().height) + 8 : 8) + 'px';
    }
  };
  const mount = () => { place(); if (typeof s.open !== 'boolean') s.open = root.classList.contains('is-docked'); render(); let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(place, 120); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
