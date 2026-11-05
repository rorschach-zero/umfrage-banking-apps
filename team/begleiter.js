'use strict';
// Auftragsbegleiter (05.11.2026, Salah): der geöffnete Auftrag geht als dieselbe Seitenleiste mit ins Werkzeug.
// Laptop: rechts, volle Höhe, die Arbeitsfläche rückt nach links; einklappbar zu einer schmalen Leiste, kein Wegklicken.
// Handy: oben eine einklappbare Zeile. Teilt den Stand mit dem Auftrag (gleiche Schritt-Schlüssel) und misst wie der Auftrag.
(() => {
  const K = 'pa6-begleiter';
  let s; try { s = JSON.parse(localStorage.getItem(K) || 'null'); } catch { s = null; }
  if (!s || s.v !== 1 || !Array.isArray(s.steps) || !s.steps.length || !(Date.now() < s.until)) return;
  let viewAs = false; try { viewAs = !!sessionStorage.getItem('pa6-view-as'); } catch {}
  if (viewAs) return;   // lesende Ansicht: kein Begleiter, er gehört zum eigenen Arbeitsfluss
  const path = h => { try { const u = new URL(h, location.origin); return u.pathname.replace(/index\.html$/, '') + (u.pathname === '/team/' ? u.search : ''); } catch { return ''; } };
  const here = location.pathname.replace(/index\.html$/, '') + (location.pathname === '/team/' ? location.search : '');
  const n = s.steps.length, on = i => !!s.steps[i] && !!s.steps[i].href && path(s.steps[i].href) === here;
  const done = i => { try { return localStorage.getItem(s.steps[i].key) === '1'; } catch { return false; } };
  const save = () => { try { localStorage.setItem(K, JSON.stringify(s)); } catch {} };
  const track = (aktion, wert) => {
    let k = '', endpoint = ''; try { k = localStorage.getItem('pa6k') || ''; } catch {}
    try { endpoint = (window.TEAM_CONFIG && window.TEAM_CONFIG.endpoint) || (typeof ENDPUNKT === 'string' ? ENDPUNKT : ''); } catch {}
    if (!k || !endpoint) return;
    try { fetch(endpoint, {method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify({typ:'auftragsweg', k, id:s.id, ref:s.ref || '', quelle:s.source, aktion, wert:wert == null ? '' : String(wert)}), referrerPolicy:'no-referrer'}).catch(() => {}); } catch {}
  };
  const el = (t, a, ...kids) => { const e = document.createElement(t); for (const [k, v] of Object.entries(a || {})) { if (v == null || v === false) continue; if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'class') e.className = v; else e.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); return e; };
  const panel = () => innerWidth >= 1100;
  if (typeof s.open !== 'boolean') s.open = panel();
  const root = el('aside', {class:'begleiter', 'aria-label':'Dein Auftrag'});
  let note = '';
  const dots = () => el('span', {class:'bg-dots', 'aria-hidden':'true'}, s.steps.map((x, i) => el('i', {class:done(i) ? 'on' : i === s.cur ? 'now' : ''})));
  const count = () => Math.min(s.cur + 1, n) + '/' + n;
  const help = text => { const u = new URL('/team/frag/', location.origin); u.searchParams.set('q', ('Ich bin beim Auftrag «' + s.title + '», Schritt ' + (s.cur + 1) + ': «' + text + '». Wie mache ich das genau?').slice(0, 400)); return el('a', {class:'bg-help', href:u.pathname + u.search}, 'Hilfe zu diesem Schritt'); };
  function toggle() { s.open = !s.open; save(); render(); layout(); }
  function end() { try { localStorage.removeItem(K); } catch {} root.remove(); document.body.classList.remove('bgl-offen', 'bgl-leiste'); }
  function markDone() {
    const step = s.steps[s.cur]; try { localStorage.setItem(step.key, '1'); } catch {}
    track('schritt_erledigt', s.cur + 1); note = 'Schritt ' + (s.cur + 1) + ' erledigt';
    const next = s.steps.findIndex((x, i) => i > s.cur && !done(i)), first = s.steps.findIndex((x, i) => !done(i));
    s.cur = next >= 0 ? next : first >= 0 ? first : n; save(); render(); root.querySelector('.bg-step')?.focus({preventScroll:true});
  }
  function render() {
    const finished = s.cur >= n, step = s.steps[s.cur];
    root.className = 'begleiter ' + (panel() ? 'is-panel' : 'is-bar') + (s.open ? '' : ' is-closed');
    if (!s.open) {
      root.replaceChildren(el('button', {type:'button', class:'bg-rail', 'aria-expanded':'false', onclick:toggle, title:'Auftrag aufklappen'},
        el('span', {class:'bg-chev', 'aria-hidden':'true'}), el('span', {class:'bg-rail-k'}, 'Auftrag'), el('span', {class:'bg-rail-n'}, finished ? '✓' : count()),
        panel() ? null : el('span', {class:'bg-peek'}, finished ? 'Alle Schritte erledigt' : step.text)));
      return;
    }
    const head = el('div', {class:'bg-head'}, el('span', {class:'bg-kicker'}, 'Dein Auftrag'),
      el('button', {type:'button', class:'bg-collapse', 'aria-expanded':'true', 'aria-label':'Auftrag einklappen', title:'Einklappen', onclick:toggle}, el('span', {class:'bg-chev', 'aria-hidden':'true'})));
    const progress = el('div', {class:'bg-progress'}, el('span', {class:'bg-k'}, finished ? 'Alle Schritte erledigt' : 'Schritt ' + (s.cur + 1) + ' von ' + n), dots());
    let body;
    if (finished) body = [el('p', {class:'bg-step', tabindex:'-1'}, 'Super, alles erledigt.'), el('p', {class:'bg-sub'}, 'Melde den Auftrag jetzt als fertig.'), el('div', {class:'bg-act'}, el('a', {class:'bg-btn', href:s.from}, 'Zum Auftrag und fertig melden'))];
    else {
      const here_ = on(s.cur) || !step.href;
      body = [el('p', {class:'bg-step', tabindex:'-1'}, step.text),
        el('div', {class:'bg-act'}, here_ ? el('button', {type:'button', class:'bg-btn', onclick:markDone}, 'Erledigt') : el('a', {class:'bg-btn', href:step.href}, (step.label || 'Öffnen') + ' →'),
          here_ ? null : el('button', {type:'button', class:'bg-btn bg-sec', onclick:markDone}, 'Erledigt')),
        help(step.text)];
    }
    const list = el('details', {class:'bg-all'}, el('summary', {}, 'Alle Schritte'), el('ol', {}, s.steps.map((x, i) => el('li', {class:(done(i) ? 'done' : '') + (i === s.cur ? ' cur' : '')}, x.text))));
    const foot = el('div', {class:'bg-foot'}, el('a', {class:'bg-link', href:s.from}, 'Zum Auftrag'), el('button', {type:'button', class:'bg-end', onclick:end}, 'Begleitung beenden'));
    root.replaceChildren(...[head, el('p', {class:'bg-title'}, s.title), progress, note ? el('p', {class:'bg-note', role:'status'}, '✓ ' + note) : null, ...body, list, foot].filter(Boolean));
  }
  function layout() {
    document.body.classList.toggle('bgl-offen', panel() && s.open);
    document.body.classList.toggle('bgl-leiste', panel() && !s.open);
    if (panel()) { if (root.parentNode !== document.body) document.body.append(root); root.style.top = ''; return; }
    const head = document.querySelector('body > header') || document.querySelector('.bar'), main = document.querySelector('main');
    const first = head ? [...document.body.children].find(x => x !== head && x !== root && x.getBoundingClientRect().height > 0 && x.compareDocumentPosition(head) & Node.DOCUMENT_POSITION_PRECEDING) : null;
    if (first) first.before(root); else if (main) main.parentNode.insertBefore(root, main); else document.body.prepend(root);
    const pos = head ? getComputedStyle(head).position : '';
    root.style.top = (pos === 'sticky' || pos === 'fixed' ? Math.ceil(head.getBoundingClientRect().height) + 8 : 8) + 'px';
  }
  const mount = () => { render(); layout(); let t, was = panel(); addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (panel() !== was) { was = panel(); render(); } layout(); }, 120); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
