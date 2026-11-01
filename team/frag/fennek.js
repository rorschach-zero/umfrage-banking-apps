/* State-specific PNG presentation; the conversation never waits for artwork. */
(() => {
  'use strict';
  const base = new URL('assets/c/', document.currentScript.src);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const poses = {waiting:'wartet', thinking:'denkt', writing:'schreibt', answering:'antwortet', happy:'freut', error:'fehler'};
  const aliases = {wartet:'waiting', denkt:'thinking', schreibt:'writing', antwortet:'answering', freut:'happy', fehler:'error'};
  const slots = [...document.querySelectorAll('[data-fennek="pose"]')];
  const cache = new Map();
  let state = document.body.dataset.state || 'waiting', generation = 0, suspended = false;

  function load(name) {
    if (!cache.has(name)) {
      const promise = new Promise((resolve, reject) => {
        const img = new Image();
        const timeout = setTimeout(() => finish(new Error('Image timeout')), 8000);
        function finish(error) {
          clearTimeout(timeout); img.onload = img.onerror = null;
          if (error) reject(error); else resolve(img);
        }
        img.onload = () => finish();
        img.onerror = () => finish(new Error('Image unavailable'));
        img.src = new URL(`pose_${name}.png`, base).href;
      });
      cache.set(name, promise);
      promise.catch(() => cache.delete(name));
    }
    return cache.get(name);
  }

  function settle(slot) {
    clearTimeout(slot.fadeTimer);
    cancelAnimationFrame(slot.fadeFrame);
    const images = [...slot.querySelectorAll('img')];
    images.slice(0,-1).forEach(img => img.remove());
    const last = images.at(-1);
    if (last) { last.style.transition = 'none'; last.style.opacity = '1'; }
  }

  async function show(next) {
    if (suspended) return;
    const current = ++generation;
    try {
      const source = await load(poses[next]);
      if (current !== generation || suspended) return;
      for (const slot of slots) {
        settle(slot);
        const previous = slot.querySelector('img');
        slot.dataset.pose = next; slot.dataset.renderStatus = 'ready';
        if (previous?.src === source.src) continue;
        const img = document.createElement('img');
        img.src = source.src; img.alt = ''; img.width = 512; img.height = 512;
        if (motion.matches || !previous) { slot.replaceChildren(img); continue; }
        img.style.opacity = '0'; slot.append(img);
        // Establish both starting opacities before the shared 320-ms transition.
        void img.offsetWidth;
        previous.style.transition = '';
        slot.fadeFrame = requestAnimationFrame(() => {
          if (current !== generation) return;
          img.style.opacity = '1'; previous.style.opacity = '0';
          slot.fadeTimer = setTimeout(() => settle(slot), 340);
        });
      }
    } catch {
      if (current !== generation) return;
      // A missing pose must not replace the last successfully displayed image.
      slots.forEach(slot => { settle(slot); slot.dataset.renderStatus = 'image-error'; });
    }
  }

  for (const slot of slots) {
    const initial = slot.querySelector('img');
    initial?.addEventListener('error', () => {
      if (initial.src.endsWith('/avatar.png')) { initial.style.visibility = 'hidden'; return; }
      initial.src = new URL('avatar.png', base).href;
    });
  }
  window.PiaFigure = Object.freeze({
    setState(next) {
      next = aliases[next] || next;
      if (!Object.hasOwn(poses,next)) return;
      state = next; show(state);
    }
  });
  motion.addEventListener('change', () => { slots.forEach(settle); show(state); });
  window.addEventListener('pagehide', () => { suspended = true; generation++; slots.forEach(settle); });
  window.addEventListener('pageshow', () => { suspended = false; show(state); });
  show(state);
})();
