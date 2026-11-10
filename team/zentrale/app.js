'use strict';
(() => {
  const M=window.CentralModel,R=window.CentralRender,C=window.CentralCache,main=document.getElementById('main'),overlay=document.getElementById('overlay');
  const status=document.getElementById('status'),identity=document.getElementById('identity'),refresh=document.getElementById('refresh');
  let key='',generation=0,controller=null,timer=null,view=null,mode='marketing',chosenMode=false,lane='offen',rules=[],memos=[],slot='',pending=true,stale=false,lastFocus=null,extraRules=[];
  const G=window.CentralGantt;
  let storageWarning=false,noticeTimer,cacheSlot='',cacheWarning=false;
  const target=()=>window.PA6View?.target()||'';
  const announce=text=>{const n=document.getElementById('notice');n.textContent=text;n.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{n.hidden=true;},7000);};
  function render(focus) {
    if(!view){main.innerHTML=R.skeleton(mode);return;}
    rules=[...M.rules(view),...extraRules];
    const scroll=document.querySelector('.gantt-scroll'), position=scroll?{left:scroll.scrollLeft,top:scroll.scrollTop}:null;
    main.innerHTML=mode==='zeitplan'?G.page(view):R.page(view,{mode,lane,rules,memos,disabled:pending||stale||view.readOnly});
    if(mode==='zeitplan'){const next=document.querySelector('.gantt-scroll');if(next&&position){next.scrollLeft=position.left;next.scrollTop=position.top;}}
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    if(focus){const node=typeof focus==='string'?document.getElementById(focus):focus;node?.focus();}
  }
  function closeDialog() {
    overlay.replaceChildren();main.inert=false;document.querySelector('.top').inert=false;
    if(lastFocus?.isConnected)lastFocus.focus();else document.getElementById('juno')?.focus();
  }
  function dialog(title,body) {
    lastFocus=document.activeElement;
    overlay.innerHTML=`<div class="scrim"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><button class="btn close" data-close aria-label="Schliessen">×</button><h2 id="dialog-title">${R.esc(title)}</h2>${body}</section></div>`;
    main.inert=true;document.querySelector('.top').inert=true;
    overlay.querySelector('textarea,button,a')?.focus();
  }
  function persist() {
    if(!slot)return;
    try{localStorage.setItem(slot,JSON.stringify({schema:'pa6.local-orders.v1',items:memos}));}
    catch{storageWarning=true;announce('Vormerkung bleibt in dieser Sitzung. Der Gerätespeicher ist nicht verfügbar.');}
  }
  function validMemo(m) {
    return m && m.localOnly===true && ['vorgemerkt','spaeter'].includes(m.status) && ['approve','other','later'].includes(m.action) &&
      ['id','kind','target','title','evidence','suggestion','source','version','createdAt','wish'].every(k=>typeof m[k]==='string' && m[k].length<=8000) && Number.isFinite(Date.parse(m.createdAt));
  }
  async function memoSlot(access,person,as) {
    try{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(access));return 'pa6-central-orders-v1:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')+':'+person+':'+(as||'own');}
    catch{return '';}
  }
  function readMemos() {
    if(!slot)return;
    try{const saved=JSON.parse(localStorage.getItem(slot)||'null');memos=saved?.schema==='pa6.local-orders.v1'&&Array.isArray(saved.items)?saved.items.filter(validMemo).slice(0,100):[];}
    catch{memos=[];storageWarning=true;}
  }
  function remember(rule,action,wish='') {
    if(pending||stale||view?.readOnly){announce('Bitte zuerst einen aktuellen Stand in deiner eigenen Ansicht laden.');return;}
    const item=M.prepare(rule,action,wish);
    memos=memos.filter(m=>m.id!==item.id);memos.push(item);memos=memos.slice(-100);persist();lane='vorgemerkt';
    closeDialog();render('juno');announce(storageWarning?'Nur für diese Sitzung vorgemerkt; nichts ausgeführt.':'Lokal vorgemerkt; nichts ausgeführt oder gesendet.');
  }
  function undo(id) {memos=memos.filter(m=>m.id!==id);persist();render('juno');announce('Lokale Vormerkung zurückgenommen.');}
  function openTools() {
    if(!view){announce('Bitte zuerst den Live-Stand laden.');return;}
    dialog('Werkzeuge und Auftrag an Juno',`<div class="sugg"><button data-tool="quotas">Quotenlücke ansehen</button><button data-tool="tempo">Tempo bis zur nächsten Etappe</button><button data-tool="schedule">Zeitplan und Fristen</button></div><form id="free-form"><label for="free-text">Freien Auftrag vorbereiten</label><textarea id="free-text" maxlength="4000" required placeholder="Was soll vorbereitet werden?"></textarea><p class="muted">Dein Text wird als lokaler Entwurf gespeichert. Es wird nichts ausgeführt.</p><button class="btn primary" ${pending||stale||view.readOnly?'disabled':''}>Auftrag vormerken</button></form>`);
  }
  async function read(type,access,as,signal) {
    if(!['dashboard','team'].includes(type))throw Error('Diese Route ist nicht lesend.');
    const endpoint=window.TEAM_CONFIG?.endpoint;
    if(!endpoint)throw Error('Der Leseendpunkt ist noch nicht eingerichtet.');
    const body={typ:type,k:access,leitung:true,...(as?{als:as}:{})};
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),cache:'no-store',signal});
    if(!response.ok){const e=Error(response.status===401?'Bitte deinen persönlichen Team-Link zur Anmeldung öffnen.':response.status===403?'Für diese Ansicht fehlt die Rolle.':'Daten gerade nicht erreichbar.');e.denied=[401,403].includes(response.status);e.retry=response.headers?.get('Retry-After');throw e;}
    const data=await response.json();
    if(data.ok!==true){const denied=['unauthorized','forbidden'].includes(data.code)||data.fehler==='kein Zugriff';const e=Error(denied?'Bitte deinen persönlichen Team-Link zur Anmeldung öffnen.':'Daten gerade nicht erreichbar.');e.denied=denied;e.retry=data.retry_after;throw e;}
    if(type==='team'){
      if(!M.NAMES[data.person] || (as?(data.readOnly!==true||data.viewer!=='SA'||data.person!==as):(data.readOnly===true||data.viewer))){const e=Error('Die Personenansicht konnte nicht bestätigt werden.');e.denied=true;throw e;}
    } else if(as && data.role==='leitung'){const e=Error('Die lesende Personenansicht wurde nicht bestätigt.');e.denied=true;throw e;}
    return data;
  }
  async function load() {
    const ticket=++generation,access=key,as=target();controller?.abort();controller=new AbortController();clearTimeout(timer);
    pending=true;refresh.disabled=true;main.setAttribute('aria-busy','true');closeDialog();render();
    if(!access){main.innerHTML='<section class="card"><h1>Persönlichen Team-Link öffnen</h1><p>Für die Kommandozentrale brauchst du deine Anmeldung in der Team-App.</p><a class="btn" href="/team/">Zur Anmeldung</a></section>';status.textContent='Nicht angemeldet';pending=false;refresh.disabled=false;main.setAttribute('aria-busy','false');return;}
    status.textContent=view?'Stand '+C.stamp(view.generatedAt)+' · wird aktualisiert':'Stand wird geladen …';
    const activeController=controller;
    const timeout=setTimeout(()=>activeController.abort(),30000);
    try{
      // Start both reads before storage/crypto work; neither route waits for the other.
      const requests=Promise.allSettled([read('dashboard',access,as,controller.signal),read('team',access,as,controller.signal)]);
      const nextCacheSlot=await C.slot(access,as,crypto);
      if(ticket!==generation||access!==key||as!==target())return;
      cacheSlot=nextCacheSlot;
      if(!view&&cacheSlot){
        let entry=null;try{entry=C.get(localStorage,cacheSlot,as);}catch{}
        view=C.restore(entry,as);
        if(view){
          stale=true;
          if(!chosenMode)mode=view.role==='leitung'?'marketing':'projekt';
          identity.textContent=M.NAMES[view.identity]+' · '+(view.readOnly?'Personenansicht, nur lesen':view.role==='leitung'?'Leitung':'Mitglied');
          status.textContent='Stand '+C.stamp(view.generatedAt)+' · wird aktualisiert';
          render();
        }
      }
      const responses=await requests;
      if(ticket!==generation||access!==key||as!==target())return;
      const denied=responses.find(r=>r.status==='rejected'&&r.reason.denied);
      if(denied)throw denied.reason;
      const personal=responses[1].status==='fulfilled'?responses[1].value:null;
      let dashboard=null,dashboardError=responses[0].status==='rejected'?responses[0].reason:null;
      if(!dashboardError){
        try{dashboard=M.normalize(responses[0].value,personal);dashboard.role=responses[0].value.role==='leitung'?'leitung':'mitglied';}
        catch(error){dashboardError=error;}
      }
      try{cacheWarning=!C.save(localStorage,cacheSlot,as,{dashboard,team:personal});}catch{cacheWarning=true;}
      if(dashboardError)throw dashboardError;
      // A partial refresh must not replace a complete old stand with missing details.
      if(!personal&&view)throw responses[1].reason;
      const next=M.normalize(responses[0].value,personal);
      if(as)next.readOnly=true;
      const nextSlot=next.identity?await memoSlot(access,next.identity,as):'';
      if(ticket!==generation||access!==key||as!==target())return;
      if(slot!==nextSlot){slot=nextSlot;memos=[];readMemos();}
      storageWarning=!slot;
      view=next;extraRules=extraRules.filter(r=>r.kind==='frei');stale=false;pending=false;
      if(!chosenMode)mode=view.role==='leitung'?'marketing':'projekt';
      identity.textContent=(view.identity?M.NAMES[view.identity]:'Person noch nicht geliefert')+' · '+(view.readOnly?'Personenansicht, nur lesen':view.role==='leitung'?'Leitung':'Mitglied');
      status.textContent='Datenstand '+M.stamp(view.generatedAt)+(personal?'':' · persönliche Pakete gerade nicht erreichbar')+(!slot?' · Vormerkungen nur in dieser Sitzung':'')+(cacheWarning?' · Kennzahlen nur in dieser Sitzung':'');
      render();
    }catch(error){
      if(ticket!==generation||access!==key||as!==target())return;
      pending=false;stale=true;
      if(error.denied){try{if(cacheSlot)localStorage.removeItem(cacheSlot);}catch{}view=null;memos=[];slot='';extraRules=[];identity.textContent='';}
      status.textContent=(error.name==='AbortError'?'Daten gerade nicht erreichbar; Zeitlimit erreicht.':error.message)+(error.retry?' Erneut laden nach '+M.cleanText(error.retry)+' Sekunden.':'');
      if(view){status.textContent='Stand '+C.stamp(view.generatedAt)+' · Aktualisierung fehlgeschlagen. '+status.textContent+' Letzter Stand bleibt sichtbar. Vormerkungen pausiert.';render();}
      else main.innerHTML=`<section class="card"><h1>${error.denied?'Anmeldung erforderlich':'Daten gerade nicht erreichbar'}</h1><p>${R.esc(status.textContent)}</p><button class="btn" data-retry>Erneut laden</button> <a class="btn" href="/team/">Zur Team-App</a></section>`;
    }finally{
      clearTimeout(timeout);
      if(ticket===generation){refresh.disabled=false;main.setAttribute('aria-busy','false');timer=setTimeout(()=>{if(overlay.children.length){timer=setTimeout(load,60000);}else load();},60000);}
    }
  }
  function accessChanged() {
    generation++;controller?.abort();clearTimeout(timer);view=null;memos=[];slot='';extraRules=[];identity.textContent='';chosenMode=false;key='';cacheSlot='';cacheWarning=false;
    const incoming=new URLSearchParams(location.hash.slice(1)).get('k');
    try{if(incoming){localStorage.setItem('pa6k',incoming);window.PA6View?.clear();}key=incoming||localStorage.getItem('pa6k')||'';}catch{key=incoming||'';}
    history.replaceState(null,'',location.pathname+location.search);main.innerHTML=R.skeleton(mode);load();
  }
  document.addEventListener('click',event=>{
    const b=event.target.closest('button,a[data-tool]');if(!b||b.disabled)return;
    if(b.hasAttribute('data-close')){closeDialog();return;}
    if(b.hasAttribute('data-retry')){load();return;}
    if(b.dataset.mode){mode=b.dataset.mode;chosenMode=true;render();if(mode==='zeitplan')G.load().then(()=>{if(mode==='zeitplan'){render();G.scrollToday();}});return;}
    if(b.hasAttribute('data-gantt-retry')){G.load().then(()=>{if(mode==='zeitplan'){render();G.scrollToday();}});return;}
    if(b.hasAttribute('data-gantt-today')){G.scrollToday();return;}
    if(b.dataset.ganttFilter){G.action('filter',b.dataset.ganttFilter);render();G.scrollToday();main.querySelector('[data-gantt-filter="'+b.dataset.ganttFilter+'"]')?.focus({preventScroll:true});return;}
    if(b.dataset.ganttPhase){G.action('phase',b.dataset.ganttPhase);render();main.querySelector('[data-gantt-phase="'+b.dataset.ganttPhase+'"]')?.focus({preventScroll:true});return;}
    if(b.hasAttribute('data-gantt-expand')){G.action('expand');render();main.querySelector('[data-gantt-expand]')?.focus({preventScroll:true});return;}
    if(b.dataset.ganttItem){const card=G.detail(b.dataset.ganttItem,view);if(card){render();(document.getElementById('gantt-'+b.dataset.ganttItem)||main.querySelector('[data-gantt-item="'+b.dataset.ganttItem+'"]'))?.focus({preventScroll:true});dialog(card.title,card.body);}return;}
    if(b.dataset.lane){lane=b.dataset.lane;render('juno');return;}
    if(b.dataset.undo){undo(b.dataset.undo);return;}
    if(b.dataset.tool){const tool=b.dataset.tool;mode=tool==='schedule'?'projekt':'marketing';chosenMode=true;closeDialog();render(tool);document.getElementById(tool)?.scrollIntoView({block:'start'});return;}
    if(!view)return;
    if(b.dataset.quote){const q=view.quotas?.find(q=>q.id===b.dataset.quote);if(!q)return;if(q.n===null||q.target===null){announce('Für diese Zelle fehlen Messwerte.');return;}const rule={id:'quota:'+q.id,kind:'quote_ansprache',target:q.id,title:'Ansprache für '+M.quoteLabel(q),evidence:`${q.n} / ${q.target}; ${q.missing} fehlen.`,suggestion:'Einen Aufruf für genau diese Quotenzelle vorbereiten. Kanalwahl als Annahme prüfen.',source:'methods.A.field.quotas',version:view.version,generatedAt:view.generatedAt};extraRules=extraRules.filter(r=>r.id!==rule.id);if(!rules.some(r=>r.id===rule.id))extraRules.push(rule);rules=[...M.rules(view),...extraRules];dialog('Quotenzelle',R.ruleCard(rules.find(r=>r.id===rule.id),pending||stale||view.readOnly));return;}
    if(b.dataset.package||b.dataset.milestone){
      const id=b.dataset.package||b.dataset.milestone,entity=[...(view.packages||[]),...(view.own||[]),...(view.milestones||[])].find(p=>p.id===id);if(!entity)return;
      dialog(entity.title,`<dl class="kv"><dt>Kennung</dt><dd>${R.esc(id)}</dd><dt>Verantwortlich</dt><dd>${R.esc(M.NAMES[entity.owner]||'noch nicht geliefert')}</dd><dt>Geplanter Start</dt><dd>${R.esc(entity.kind?'Einzeltermin':M.dateLabel(entity.start))}</dd><dt>${entity.kind==='kontrollpunkt'?'Kontrollpunkt':'Frist'}</dt><dd>${R.esc(M.dateLabel(entity.due))}</dd><dt>Planstatus</dt><dd>${M.statusLabel(entity.status)}</dd><dt>Abgeschlossen</dt><dd>${entity.done_at?R.esc(M.stamp(entity.done_at)):entity.status==='fertig'?'Abschlussdatum nicht geliefert':'Noch nicht als abgeschlossen gemeldet'}</dd><dt>Messung</dt><dd>${entity.met===true?'erfüllt laut Messung'+(entity.reachedOn?' am '+R.esc(M.dateLabel(entity.reachedOn)):'; Datum noch nicht geliefert'):entity.met===false?'noch nicht erfüllt':'Kein zahlenbasiertes Zwischenziel'}</dd></dl><p>Quelle: ${b.dataset.package?'Pakete / persönliche Aufgaben':'Meilensteine'} · ${R.esc(M.stamp(view.generatedAt))}</p><p class="muted">Aufgaben kannst du in der Team-App bearbeiten.</p>`);return;
    }
    if(b.dataset.action){const rule=rules.find(r=>r.id===b.dataset.id);if(!rule)return;if(b.dataset.action==='other'){dialog('Anders vorbereiten',`<p>${R.esc(rule.evidence)}</p><form id="wish-form" data-id="${R.esc(rule.id)}"><label for="wish">Änderungswunsch</label><textarea id="wish" maxlength="4000" required></textarea><p>Das Ziel bleibt ${R.esc(rule.target)}. Der Wunsch bleibt lokal.</p><button class="btn primary">Änderung vormerken</button></form>`);}else remember(rule,b.dataset.action);}
  });
  document.addEventListener('submit',event=>{
    if(!['wish-form','free-form'].includes(event.target.id))return;event.preventDefault();
    if(event.target.id==='wish-form'){const rule=rules.find(r=>r.id===event.target.dataset.id),wish=event.target.querySelector('textarea').value.trim();if(rule&&wish)remember(rule,'other',wish);}
    else{const value=event.target.querySelector('textarea').value.trim();if(!value)return;const rule={id:'free:'+(crypto.randomUUID?.()||Date.now().toString(36)),kind:'frei',target:'request',title:'Freier Auftrag',evidence:'Von dir formuliert; fachliche Zuordnung noch offen.',suggestion:M.cleanText(value),source:'Eigene Eingabe',version:view.version};extraRules.push(rule);remember(rule,'approve');}
  });
  document.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openTools();}
    if(event.key==='Escape'){if(overlay.children.length)closeDialog();else document.querySelectorAll('.source[open]').forEach(d=>d.open=false);}
    if(event.key==='Tab'&&overlay.children.length){const nodes=[...overlay.querySelectorAll('button:not(:disabled),a,textarea,input,summary')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  });
  document.addEventListener('click',event=>{if(event.target.classList.contains('scrim'))closeDialog();if(!event.target.closest('.source'))document.querySelectorAll('.source[open]').forEach(d=>d.open=false);});
  refresh.addEventListener('click',load);document.getElementById('tools').addEventListener('click',openTools);
  window.addEventListener('hashchange',accessChanged);window.addEventListener('storage',event=>{if(event.key==='pa6k')accessChanged();else if(event.key===slot){readMemos();render();}});
  accessChanged();
})();
