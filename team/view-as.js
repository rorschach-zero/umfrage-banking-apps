"use strict";
(() => {
  const names = {SA:'Salah', ES:'Ernes', MG:'Melisa', AM:'Arber', LB:'Leonie'};
  let target = '', returning = false;
  try {
    if (new URLSearchParams(location.hash.slice(1)).has('k')) sessionStorage.removeItem('pa6-view-as');
    target = sessionStorage.getItem('pa6-view-as') || '';
    returning = sessionStorage.getItem('pa6-view-return') === '1';
    sessionStorage.removeItem('pa6-view-return');
  } catch {}
  if (!Object.hasOwn(names, target)) target = '';
  const api = window.PA6View = {
    active: () => !!target,
    target: () => target,
    returning: () => { const value = returning; returning = false; return value; },
    clear() { target = ''; document.getElementById('view-as-banner')?.remove(); document.body.classList.remove('view-as-active'); try { sessionStorage.removeItem('pa6-view-as'); } catch {} },
    select(value) {
      if (!Object.hasOwn(names, value)) return;
      try { sessionStorage.setItem('pa6-view-as', value); }
      catch {
        const message = document.createElement('p'); message.setAttribute('role','alert');
        message.textContent = 'Die Personenansicht braucht den Sitzungsspeicher dieses Browsers.';
        document.getElementById('view-as-selector')?.append(message); return;
      }
      target = value;
      location.assign('/team/?view=today');
    },
    back() {
      api.clear();
      try { sessionStorage.setItem('pa6-view-return', '1'); } catch {}
      location.assign('/team/?view=today');
    },
    request(body) { return target ? {...body, als:target, leitung:true} : body; },
    assertRead(body) {
      if (target && !['team','lesen','frage'].includes(body.typ)) throw Error('Diese Personenansicht ist nur zum Lesen.');
    },
    mount() {
      if (!target || document.getElementById('view-as-banner')) return;
      document.body.classList.add('view-as-active');
      const banner = document.createElement('div');
      banner.id = 'view-as-banner'; banner.className = 'view-as-banner'; banner.setAttribute('role','note');
      const text = document.createElement('strong');
      text.textContent = 'Ansicht von ' + names[target] + ' · nur lesen';
      const back = document.createElement('button'); back.type = 'button'; back.textContent = 'zurück zu mir';
      back.addEventListener('click', api.back);
      banner.append(text, back);
      if (location.pathname.includes('/frag/')) {
        const hint = document.createElement('span'); hint.textContent = 'Pia antwortet Salah als Leitung.'; banner.append(hint);
      }
      (document.querySelector('.main-column') || document.body).prepend(banner);
    }
  };
  api.mount();
  document.addEventListener('DOMContentLoaded', api.mount, {once:true});
  window.addEventListener('storage', event => { if (event.key === 'pa6k') api.clear(); });
})();
