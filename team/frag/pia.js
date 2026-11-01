/* Presentation and conversation state for the personal question page. */
'use strict';
const MEMBER_PROMPTS = [
  ['Dein nächster Schritt', 'Was steht für mich als Nächstes an?', 'next'],
  ['Niemand nimmt ab', 'Was mache ich, wenn bei einer Bank niemand abnimmt?', 'phone'],
  ['Fristen & Abgabe', 'Wann ist meine Abgabe und wo steht das?', 'calendar'],
  ['Codierkonflikt', 'Was mache ich bei einem Codierkonflikt?', 'split'],
  ['Stoppregel', 'Was gilt bei der Stoppregel?', 'stop']
];
const LEAD_PROMPTS = [
  ['Die Lage heute', 'Wie ist die Lage heute?', 'next'],
  ['Knappe Fristen', 'Welche Fristen werden in den nächsten 14 Tagen knapp?', 'calendar'],
  ['Unterstützung', 'Wer braucht gerade Unterstützung?', 'people'],
  ['Der zweite Blick', 'Was übersehe ich?', 'search']
];
const ICONS = {
  next: 'M5 12h14m-6-6 6 6-6 6',
  phone: 'M7 3H4v4c0 7 6 13 13 13h4v-4l-5-2-2 2c-3-1-5-3-6-6l2-2-3-5Z',
  calendar: 'M5 5h14v15H5ZM8 3v4m8-4v4M5 10h14m-10 4h2m2 0h2m-6 3h2',
  split: 'M12 20V10m0 0L6 4m6 6 6-6M6 9V4h5m2 0h5v5',
  stop: 'M8 3h8l5 5v8l-5 5H8l-5-5V8ZM8 12h8',
  people: 'M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-2a7 7 0 0 1 14 0v2m1-16a4 4 0 0 1 0 8m2 3a5 5 0 0 1 3 5',
  search: 'M16 16l5 5M18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0Z'
};
const $ = id => document.getElementById(id);
const thread = $('verlauf'), input = $('text'), sendButton = $('senden');
// Decode once before reading the access fragment, then remove all query text from history.
const entryParams = new URLSearchParams(location.search);
const entryQuestion = (entryParams.get('q') || '').trim();
const entryHint = entryParams.get('ctx') || '';
let taskContext = /^(?:hang:(?:overdue|dependency|backlog|contact|stop|consensus):(?:[a-f0-9-]{32,36}|b|c|writing|tasks)|[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(entryHint) ? entryHint : '';
const accessKey = schluessel();
if (location.search) history.replaceState(null, '', location.pathname);
let entryConsumed = false, entryRole = '';
try {entryRole = sessionStorage.getItem('pa6_pia_role') || ''; sessionStorage.removeItem('pa6_pia_role');} catch {}
let isLead = false, isBusy = false, isReady = false, person = '', messages = [], storageAvailable = true;
let figureTimers = [];
const FIGURE_LABELS = {waiting:'Ein Schritt nach dem anderen.', thinking:'Ich denke kurz nach.', writing:'Ich schaue in die Unterlagen.', happy:'Ein Stück weiter.', answering:'Hier ist dein nächster Schritt.', error:'Versuchen wir es nochmals.'};
function setFigureState(state) {
  figureTimers.forEach(clearTimeout); figureTimers = [];
  const apply = next => {
    document.body.dataset.state = next;
    $('figure-status').textContent = FIGURE_LABELS[next];
    window.PiaFigure?.setState(next);
  };
  apply(state);
  if (state === 'thinking') {
    figureTimers.push(setTimeout(() => apply('writing'), 1800));
  }
  if (state === 'answering') {
    figureTimers.push(setTimeout(() => apply('happy'), 2800));
    figureTimers.push(setTimeout(() => apply('waiting'), 6500));
  }
}
function messageAvatar() {
  return el('span', {class:'message-avatar', 'aria-hidden':'true'},
    el('img', {src:'assets/c/avatar.png', alt:'', width:'160', height:'160'}));
}
// Keep the full key and an explicit role boundary: equal prefixes must never share a history.
const historyKey = () => 'pa6frag_v2_' + encodeURIComponent(accessKey) + (isLead ? '_lead' : '_member') + (taskContext ? '_ctx_' + taskContext : '');
function readHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(historyKey()) || '[]');
    return Array.isArray(saved) ? saved.filter(item => item && ['du', 'assistent'].includes(item.rolle) && typeof item.text === 'string').slice(-40) : [];
  } catch { storageAvailable = false; return []; }
}
function saveHistory() {
  try { localStorage.setItem(historyKey(), JSON.stringify(messages.slice(-40))); }
  catch { storageAvailable = false; }
  updateInput();
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', 'stroke-width':'1.6', 'stroke-linecap':'round', 'stroke-linejoin':'round', 'aria-hidden':'true'})) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', ICONS[name]); svg.append(path);
  return el('span', {class:'prompt-icon'}, svg);
}
function renderPrompts() {
  fuelle($('vorschlaege'), (isLead ? LEAD_PROMPTS : MEMBER_PROMPTS).map(([title, question, symbol]) => {
    const button = el('button', {type:'button', class:'prompt', 'aria-label':question, on:{click:() => ask(question)}}, icon(symbol),
      el('span', {class:'prompt-copy'}, el('span', {class:'prompt-title'}, title), el('span', {class:'prompt-description'}, question)),
      el('span', {class:'prompt-arrow', 'aria-hidden':'true'}, '↗'));
    button.disabled = !isReady || isBusy;
    return button;
  }));
}
// Only text nodes and explicit strong elements are created from reply content.
function appendInline(target, text) {
  text.split(/(\*\*[^*\n]+\*\*)/g).forEach(part => target.append(part.startsWith('**') && part.endsWith('**') ? el('strong', {}, part.slice(2,-2)) : document.createTextNode(part)));
}
function appendParagraphs(target, text) {
  text.split(/\n\s*\n/).filter(Boolean).forEach(paragraph => {
    const p = el('p'); appendInline(p, paragraph); target.append(p);
  });
}
function answerBody(text, error) {
  const body = el('div', {class:'answer-body'});
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sourceIndex = error ? -1 : lines.findIndex(line => /^(?:Fundstellen?|Quellen?|Wo es steht|Nachweis)\s*:/i.test(line.trim().replace(/\*\*/g, '')));
  if (sourceIndex < 0) appendParagraphs(body, text);
  else {
    appendParagraphs(body, lines.slice(0, sourceIndex).join('\n'));
    const source = el('div', {class:'source'}, el('span', {class:'source-label'}, 'Zum Nachlesen'));
    appendParagraphs(source, lines.slice(sourceIndex).join('\n'));
    body.append(source);
  }
  return body;
}
function messageElement(message) {
  if (message.rolle === 'du') return el('div', {class:'message message-user', 'aria-label':'Deine Frage'}, message.text);
  return el('article', {class:'message message-assistant' + (message.fehler ? ' message-error' : ''), 'aria-label':message.fehler ? 'Fehlermeldung' : 'Antwort von Pia'},
    messageAvatar(),
    el('div', {}, el('div', {class:'message-author'}, 'Pia', el('span', {}, message.fehler ? 'Das hat nicht geklappt' : 'Für dich nachgeschaut')), answerBody(message.text, message.fehler)));
}
function updateLayout() {
  const hasMessages = messages.length > 0;
  document.body.classList.toggle('has-conversation', hasMessages);
  $('empty-note').hidden = hasMessages;
  $('thread-header').hidden = !hasMessages;
  $('role-label').textContent = isLead ? 'Leitungsansicht' : 'Deine Fragen';
  $('suggestion-heading').textContent = hasMessages ? 'Eine andere Frage stellen' : (isLead ? 'Dein Überblick als Leitung' : 'Ein Einstieg für dich');
  document.querySelector('.welcome h1').textContent = taskContext ? 'Dein Auftrag, Schritt für Schritt.' : 'Was möchtest du klären?';
  $('greeting').textContent = person ? (isLead ? 'Hallo, Salah · Leitungsansicht' : 'Hallo, ' + (TEAM[person] || person) + '.') : 'Hallo.';
  $('datei').disabled = !hasMessages || isBusy;
  $('neu').disabled = !hasMessages || isBusy;
}
function renderHistory() {
  fuelle(thread, messages.map(messageElement));
  $('suggestions').open = messages.length === 0;
  updateLayout();
}
function addMessage(message) {
  messages.push(message); thread.append(messageElement(message));
  $('suggestions').open = false; updateLayout();
}
function updateInput() {
  input.style.height = 'auto';
  input.style.height = Math.min(160, input.scrollHeight) + 'px';
  sendButton.disabled = !isReady || isBusy || !input.value.trim();
  $('info').textContent = !storageAvailable ? 'Verlauf nur für diese Sitzung' : input.value.length > 800 ? input.value.length + ' / 1000' : '';
}
function setBusy(busy) {
  isBusy = busy;
  if (busy) setFigureState('thinking');
  $('leitung').disabled = busy;
  thread.setAttribute('aria-busy', String(busy));
  renderPrompts(); updateLayout(); updateInput();
}
function scrollToLatest() {
  requestAnimationFrame(() => {
    const latest = thread.lastElementChild;
    if (latest) latest.scrollIntoView({block:'start', behavior:'instant'});
  });
}
async function ask(rawText) {
  const text = (rawText || '').trim();
  if (!text || isBusy || !isReady) return;
  if (text.length > 1000 || VERBOTEN.test(text)) {
    setFigureState('error');
    addMessage({rolle:'assistent', text:text.length > 1000 ? 'Bitte kürzer: maximal 1000 Zeichen.' : 'Bitte ohne Nummern, Mail- und Netzadressen fragen.', fehler:true});
    saveHistory(); scrollToLatest(); return;
  }
  const requestHistory = messages.filter(item => !item.fehler).slice(-6);
  addMessage({rolle:'du', text}); input.value = ''; setBusy(true); saveHistory();
  const thinking = el('div', {id:'thinking', class:'message message-assistant', 'aria-label':'Pia schaut nach'},
    messageAvatar(),
    el('div', {}, el('div', {class:'message-author'}, 'Pia'), el('div', {class:'thinking-content'},
      el('span', {class:'thinking-dots', 'aria-hidden':'true'}, el('i'), el('i'), el('i')),
      el('span', {}, el('span', {class:'thinking-title'}, 'Ich schaue kurz nach.'), el('span', {class:'thinking-detail'}, 'Aufgaben, Regeln, Fundstellen.')))));
  thread.append(thinking); $('notice').textContent = 'Pia schaut in den Unterlagen nach.'; scrollToLatest();
  try {
    // Pin the key and role to this request, including when browser storage is unavailable.
    const reply = await sende({k:accessKey, typ:'frage', text, leitung:isLead, ctx:taskContext, verlauf:requestHistory});
    if (typeof reply.antwort !== 'string' || !reply.antwort.trim()) throw new Error('Es kam keine Antwort an. Versuch es bitte nochmals.');
    thinking.remove(); addMessage({rolle:'assistent', text:reply.antwort});
    setFigureState('answering');
  } catch (error) {
    setFigureState('error');
    thinking.remove(); addMessage({rolle:'assistent', text:error.name === 'AbortError' ? 'Die Antwort dauert gerade zu lange. Versuch es bitte nochmals.' : String(error.message || error), fehler:true});
  } finally {
    setBusy(false); saveHistory(); $('notice').textContent = '';
    // Keep a draft typed during the request and do not reopen a mobile keyboard.
    scrollToLatest();
  }
}
$('question-form').addEventListener('submit', event => { event.preventDefault(); ask(input.value); });
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); ask(input.value); }
});
input.addEventListener('input', updateInput);
$('leitung').addEventListener('click', () => {
  if (person !== 'SA' || isBusy) return;
  isLead = !isLead;
  $('leitung').setAttribute('aria-pressed', String(isLead));
  $('leitung').textContent = isLead ? 'Leitung an' : 'Leitung aus';
  input.value = ''; messages = readHistory(); renderPrompts(); renderHistory(); updateInput();
  setFigureState('waiting');
  $('notice').textContent = isLead ? 'Leitungsansicht geöffnet. Eigener Verlauf.' : 'Mitgliedsansicht geöffnet. Eigener Verlauf.';
});
$('neu').addEventListener('click', () => {
  if (isBusy) return;
  taskContext = ''; messages = []; input.value = ''; saveHistory(); renderHistory();
  setFigureState('waiting'); $('notice').textContent = 'Neues Gespräch begonnen.';
  input.focus({preventScroll:true});
});
$('datei').addEventListener('click', () => {
  if (isBusy || !messages.length) return;
  const text = 'Pia, Verlauf vom ' + new Date().toLocaleString('de-CH') + '\n' + (isLead ? 'Leitungsansicht' : 'Mitgliedsansicht') + '\n\n' + messages.map(item => (item.rolle === 'du' ? 'Frage: ' : item.fehler ? 'Fehler: ' : 'Antwort: ') + item.text).join('\n\n');
  const url = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
  const link = el('a', {href:url, download:'Pia_Verlauf.txt'});
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function initialize() {
  renderPrompts(); renderHistory();
  if (!accessKey) { showAccessError('Öffne Pia über deinen persönlichen Link. Wenn er dir fehlt, frag Salah.'); return; }
  try {
    const reply = await sende({k:accessKey, typ:'lesen', a:'info'});
    if (!TEAM[reply.person]) throw new Error('Kein Zugriff. Öffne Pia über deinen persönlichen Link.');
    person = reply.person; isReady = true;
    isLead = person === 'SA' && entryRole === 'leitung';
    $('leitung').setAttribute('aria-pressed',String(isLead));
    $('leitung').textContent = isLead ? 'Leitung an' : 'Leitung aus';
    $('wer').textContent = TEAM[person]; $('leitung').hidden = person !== 'SA';
    messages = readHistory(); input.disabled = false;
    renderPrompts(); renderHistory(); updateInput();
    if (entryQuestion && !entryConsumed) {entryConsumed = true; messages = []; renderHistory(); await ask(entryQuestion);}
  } catch (error) { showAccessError(String(error.message || error)); }
}
function showAccessError(text) {
  setFigureState('error');
  $('wer').textContent = 'Kein Zugriff';
  $('suggestions').hidden = true; $('empty-note').hidden = true;
  document.querySelector('.composer-dock').hidden = true;
  thread.append(el('div', {class:'access-message', role:'alert'}, text));
}
initialize();
