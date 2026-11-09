'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.CentralRender = factory(root.CentralModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  const esc = value => M.cleanText(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (value,digits=1) => M.number(value)===null?'noch nicht geliefert':new Intl.NumberFormat('de-CH',{maximumFractionDigits:digits}).format(value);
  const empty = (state='missing',label='') => `<p class="empty">${esc(label)}${label?': ':''}${state==='error'?'Daten gerade nicht erreichbar':state==='empty'?'Noch keine Einträge':'noch nicht geliefert'}.</p>`;
  const pct = value => M.number(value)===null?'noch nicht geliefert':Math.round(value*100)+' %';
  const info = (id,source,body='') => `<details class="source"><summary class="info" aria-label="Quelle und Berechnung">i</summary><div class="pop"><b>Quelle</b><p>${esc(source)}</p>${body}</div></details>`;
  const card = (v,id,title,source,body,sub='',explain='',sourceTime=v.generatedAt) => `<section class="card" id="${id}" tabindex="0"><div class="card-h"><div><h2>${esc(title)}</h2>${sub?`<div class="sub">${esc(sub)}</div>`:''}</div>${info(id,`${source} · ${M.stamp(sourceTime)}`,explain)}</div>${body}</section>`;
  const meter = (share,cls='') => `<div class="meter ${cls}" aria-hidden="true"><span style="width:${Math.min(100,Math.max(0,share??0)*100)}%"></span></div>`;
  function ring(share,color='var(--accent)') {
    if(share===null)return '';
    const radius=19,circumference=2*Math.PI*radius;
    return `<svg class="metric-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${radius}" fill="none" stroke="var(--surface2)" stroke-width="6"/><circle cx="22" cy="22" r="${radius}" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="${circumference*Math.min(1,share)} ${circumference}" transform="rotate(-90 22 22)"/></svg>`;
  }
  const flag = text => `<span class="flag">${esc(text)}</span>`;
  function stand(v,mode) {
    const primary=mode==='marketing' ? `<div class="stand-row"><div><div class="big">${num(v.n)}<small> / ${num(v.target)} gültig</small></div>${meter(v.validShare)}</div><div><div class="big secondary">${num(v.yuh.n)}<small> / ${num(v.yuh.target)} Yuh-Nutzende</small></div>${meter(v.yuh.share,'coral')}</div></div><p>${v.checkpoint?.due?'Kontrollpunkt Yuh-Nutzende '+esc(M.dateLabel(v.checkpoint.due))+' · Aufstockung prüfen': 'Kontrollpunkt: noch nicht geliefert'}</p>` : `<div class="progress-ring">${ring(v.progress)}<div class="big">${pct(v.progress)}<small> geschätzter Fortschritt</small></div></div>${meter(v.progress)}<p>${v.counts?`${v.counts.done} fertig · ${v.counts.begun} begonnen · ${v.counts.open} offen`: 'Paketstatus: noch nicht geliefert'}</p>${v.countConflict?flag(`Export meldet ${v.exportCounts.done} · ${v.exportCounts.begun} · ${v.exportCounts.open}`):''}`;
    const next=(v.role==='leitung'?v.packages:v.own)?.filter(p=>p.status!=='fertig'&&p.due).sort((a,b)=>a.due.localeCompare(b.due))[0];
    const gap=mode==='marketing'?v.gap:null;
    const middle=mode==='marketing' ? gap?`<h3>${esc(M.quoteLabel(gap))}</h3><p>Schwächste Quotenzelle. Im Quoten-Raster markiert.</p>`:empty(v.quotas?.length===0?'empty':v.states.survey) : next?`<h3>${esc(next.title)}</h3><p>Nächste offene Paketfrist. Details unter Pakete.</p>`:empty();
    return `<section class="lage" id="stand"><div><div class="step">Stand ${info('stand',mode==='marketing'?'methods.A.field.totals; yuh_target; pm.milestones.MS-09':'pm.progress.share; pm.packages; pm.progress.counts',`<p>Stand ${esc(M.stamp(v.generatedAt))}. ${mode==='projekt'?'Status aus Einzelpaketen gezählt; begonnen = läuft und in Prüfung. Fortschritt aus gewichteten Planstunden, begonnene Pakete zählen halb. Planstunden je Paket werden noch nicht geliefert.':'Gesamte Feldzeit, gültige Antworten. Der Kontrollpunkt ist keine Frist.'}</p>`)}</div>${primary}</div><div class="eng"><div class="step">${mode==='marketing'?'Engpass':'Nächster Prüfbedarf'}</div>${middle}</div><div class="act"><div class="step">Nächster Schritt</div><h3>Juno bereitet vor</h3><p>Befund, Beleg und Vorschlag prüfen. Freigabe merkt den Auftrag nur lokal vor.</p><a class="btn primary" href="#juno">Karten prüfen</a></div></section>`;
  }
  function quotas(v) {
    const q=v.quotas;
    if(!q || !q.length) return card(v,'quotas','Quoten','methods.A.field.quotas',empty(q?'empty':v.states.survey));
    const body=`<div class="hm"><span></span><span class="ch">nutzt Neobank</span><span class="ch">keine Neobank</span>${['16 bis 29','30 bis 49','50 bis 65'].map(age=>`<span class="rh">${esc(age.replace(' bis ','–'))}</span>${[true,false].map(neo=>{
      const cell=q.find(c=>c.age===age&&c.neobank===neo);
      if(!cell)return '<div class="cell">noch nicht geliefert</div>';
      const share=M.ratio(cell.n,cell.target),gap=cell.id===v.gap?.id;
      return `<button class="cell${gap?' gap':''}" data-quote="${esc(cell.id)}" style="background:${share===null?'var(--surface2)':share<.25?'var(--coral-tint)':'var(--tint)'}" aria-label="${esc(M.quoteLabel(cell))}: ${num(cell.n)} von ${num(cell.target)}"><span class="v">${num(cell.n)}<small> / ${num(cell.target)}</small></span><span class="m">${num(cell.missing)} fehlen</span>${gap?'<span class="bdg">Lücke</span>':''}</button>`;
    }).join('')}`).join('')}</div><p class="muted">Zelle auswählen, um die Ansprache vorzumerken.</p>`;
    return card(v,'quotas','Quoten','methods.A.field.quotas',body,'Alter × Neobank-Nutzung',`<p>Minimum aller Zellen: ${num(v.quotaMinimum)}. ${v.target!==null&&v.quotaMinimum!==null?num(Math.max(0,v.target-v.quotaMinimum))+' Antworten frei verteilbar.':''} Engpass = tiefster Anteil am jeweiligen Ziel. Kein Beleg für Repräsentativität.</p>`);
  }
  function curve(v) {
    const points=v.curve;
    if(!points?.length || points.some(p=>p.total===null))return card(v,'curve','Rücklauf','methods.A.field.daily',empty(points?.length===0?'empty':v.states.survey));
    const W=280,H=180,left=28,right=12,top=16,bottom=34,from=points[0].day,to=v.fieldClose&&v.fieldClose>points.at(-1).day?v.fieldClose:points.at(-1).day,span=Math.max(1,M.days(from,to)),max=Math.max(1,v.target||0,...points.map(p=>p.total));
    const X=d=>left+(W-left-right)*M.days(from,d)/span,Y=n=>top+(H-top-bottom)*(1-n/max);
    const ticks=[from,M.addDays(from,Math.floor(span/2)),to].filter((d,i,a)=>a.indexOf(d)===i);
    const stages=(v.milestones||[]).filter(m=>m.target!==null&&m.due&&m.due>=from&&m.due<=to);
    const svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Rücklaufkurve der gültigen Antworten"><line x1="${left}" x2="${W-right}" y1="${Y(0)}" y2="${Y(0)}" stroke="#E3E8E4"/>${[0,max/2,max].map(n=>`<text x="${left-5}" y="${Y(n)+4}" text-anchor="end" font-size="11.5" fill="#687276">${num(n)}</text>`).join('')}${ticks.map((d,i)=>`<text x="${X(d)}" y="${H-10}" text-anchor="${i===0?'start':i===ticks.length-1?'end':'middle'}" font-size="11.5" fill="#687276">${esc(d.slice(8,10)+'.'+d.slice(5,7)+'.')}</text>`).join('')}${stages.length>1?`<polyline fill="none" stroke="#A5AFAB" stroke-dasharray="4 4" points="${stages.map(m=>X(m.due)+','+Y(m.target)).join(' ')}"/>`:''}<path d="M${X(from)},${Y(0)} ${points.map(p=>'L'+X(p.day)+','+Y(p.total)).join(' ')} L${X(points.at(-1).day)},${Y(0)} Z" fill="#237E79" opacity=".08"/><polyline fill="none" stroke="#237E79" stroke-width="2.5" points="${points.map(p=>X(p.day)+','+Y(p.total)).join(' ')}"/></svg>`;
    return card(v,'curve','Rücklauf','methods.A.field.daily; pm.milestones',svg+`<p class="muted">Datentag ${esc(M.dateLabel(v.today))}: ${v.todayGain===null?'Zugang nicht erfasst':'+'+num(v.todayGain)}. ${v.dailyConsistent?'':'Tagesreihe nicht mit Gesamtstand abgestimmt.'}</p><div class="legend">Grün: gemessen · gestrichelt: Etappenplan</div><p class="muted">Umfrage offen bis ${esc(M.dateLabel(v.fieldClose))}<br>Ergebnisse ab ${esc(M.dateLabel(M.dateOf(v.releaseAt)))}</p>`,'Gültige Antworten, kumuliert','<p>Tage chronologisch sortiert. Fehlende Tage sind nicht als Null gemessen. Die Planlinie ist keine Prognose. Tagesgrenzen gelten in Europe/Zurich.</p>');
  }
  function channels(v) {
    const max=Math.max(1,...(v.channels||[]).map(c=>c.n||0));
    const body=v.channels?.length?`<div class="bars">${v.channels.map(c=>`<div class="bar-r"><span>${esc(c.label)}</span><span class="t" aria-hidden="true"><span style="width:${100*(c.n||0)/max}%"></span></span><b>${num(c.n)}</b></div>`).join('')}</div>`:empty(v.channels?'empty':v.states.survey);
    return card(v,'channels','Kanäle','methods.A.field.channels; methods.A.field.people',body+`<p class="note">${v.people?`Über persönliche Links: ${num(v.people.coded)} · ohne Kürzel: ${num(v.people.without)}`:'Persönliche Links: noch nicht geliefert'}</p><a class="btn" href="/team/?view=sharing">Meinen Link öffnen</a>`,'Gültige Antworten je Kanal','<p>Absolute Zahlen; Aufwand je Kanal fehlt, deshalb keine Effizienzaussage. Ohne Kürzel enthält auch ältere Links vor der Umstellung. Keine Leistung je Person ableiten.</p>');
  }
  function funnel(v) {
    const labels=['Geöffnet','Begonnen','Vollständig','Gültig'];
    const body=v.funnel?`<div class="fun">${v.funnel.map((n,i)=>`${i?`<div class="fun-x">${pct(M.ratio(n,v.funnel[i-1]))} weiter</div>`:''}<div class="fun-r"><span>${labels[i]}</span><span class="t" aria-hidden="true"><span style="width:${Math.min(100,100*(M.ratio(n,v.funnel[0])||0))}%"></span></span><b>${num(n)}</b></div>`).join('')}</div>`:empty();
    return card(v,'funnel','Trichter','methods.A.field.starts.total; starts.since',body,v.funnelSince?'Seit '+M.stamp(v.funnelSince):'Messbeginn noch nicht geliefert','<p>Nur seit dem Messbeginn gezählt. Jede Übergangsquote bezieht sich auf den vorigen Schritt; bei Nenner Null keine Quote.</p>');
  }
  function organizations(v) {
    const o=v.outreach,k=o.kinds;
    const body=o.state!=='ready'?empty(o.state):`<div class="steps3">${[[o.sent,'angeschrieben'],[o.answered,'geantwortet'],[M.number(k?.Zusage),'Zusagen']].map(([n,l])=>`<div class="s"><strong class="num">${num(n)}</strong><span>${l}</span></div>`).join('<span class="arr">›</span>')}</div><div class="stack" aria-hidden="true">${[[k?.Zusage,'var(--accent)'],[k?.Absage,'var(--coral)'],[k?.Automatisch,'var(--honey)']].map(([n,c])=>`<span style="width:${Math.min(100,100*(M.ratio(n,o.sent)||0))}%;background:${c}"></span>`).join('')}</div><p>${num(M.number(k?.Absage))} Absagen · ${num(M.number(k?.Automatisch))} Abwesenheitsnotizen · ${num(o.noReply)} ohne Antwort</p><p class="note">Antwortquote ${o.share===null?'noch nicht geliefert':num(o.share*100)+' %'}</p><p class="muted">Zusagen-Referenz: ${o.reference===null?'noch nicht geliefert':num(o.reference)}</p>`;
    return card(v,'organizations','Organisationen','outreach',body,'Angeschrieben und Antworten','<p>Antwortquote = geantwortet / angeschrieben. Automatische Antworten zählen nicht als menschliche Antwort. Eine vermutete Fehlzuordnung wird nicht still korrigiert.</p>');
  }
  function waves(v) {
    const list=v.outreach.waves;
    return card(v,'waves','Wellen','outreach.waves',v.cached?'<p class="muted">Wellendetails werden nachgeladen.</p>':list?list.length?list.map(w=>`<p>${esc(w.label||w.id)} · ${esc(M.dateLabel(w.on))} · ${num(M.number(w.sent))} angeschrieben</p>`).join(''):empty('empty'):empty());
  }
  function methods(v) {
    const b=card(v,'method-b','Servicebeobachtung B','methods.B.field.n; methods.B.field.target',`${v.B.state==='error'?empty('error','Servicebeobachtung'):''}<div class="progress-ring">${ring(M.ratio(v.B.n,v.B.target),'var(--sky)')}<p class="method-count">${num(v.B.n)} von ${num(v.B.target)} Kontakten</p></div><a class="btn" href="/team/b/">Protokoll öffnen</a>`, '', '<p>Abgeschlossene Kontakte und Ziel laut Testprotokoll. Fehlende Messwerte bleiben unbekannt.</p>');
    const c=card(v,'method-c','Bewertungen C','methods.C.field.n; planned; cells',`${v.C.state==='error'?empty('error','Bewertungen'):''}<div class="progress-ring">${ring(M.ratio(v.C.n,v.C.planned),'var(--lilac)')}<p class="method-count">${num(v.C.n)} von ${num(v.C.planned)} eingeordnet</p></div>${v.C.conflict?flag('nicht abgestimmt'):''}<p><a class="btn" href="/team/c/">Codierungen öffnen</a></p>`,'',`<p>${v.C.cellTotals?`Zellsummen: ${num(v.C.cellTotals.n)} eingeordnet; ${num(v.C.cellTotals.captured)} erfasst; ${num(v.C.cellTotals.planned)} geplant.`:'Zellsummen noch nicht geliefert.'} Bei Widerspruch bleibt die Kopfzahl gekennzeichnet.</p>`);
    return `<div class="cols c2 methods">${b}${c}</div>`;
  }
  function tempo(v) {
    const body=v.next?`<p>Noch <strong>${num(v.remaining)}</strong> gültige bis Etappe ${num(v.next.target)} am ${esc(M.dateLabel(v.next.due))}.</p><p>${v.remainingDays>0?`${num(v.remainingDays)} Tage · nötig ${num(v.tempo)} pro Tag, rund ${Math.ceil(v.tempo)}.`:v.remainingDays===0?'Etappentermin ist am Datentag. Keine Tagesrate berechenbar.':'Etappentermin liegt vor dem Datenstand. Keine negative Tagesrate.'}</p><div class="bars">${(v.curve||[]).slice(-7).map(p=>`<div class="bar-r"><span>${esc(M.dateLabel(p.day))}</span><span class="t" aria-hidden="true"><span style="width:${100*(p.n||0)/Math.max(1,...v.curve.map(r=>r.n||0))}%"></span></span><b>${num(p.n)}</b></div>`).join('')}</div>`:empty(v.n!==null&&v.milestones?.length?'empty':'missing');
    return card(v,'tempo','Tempo','methods.A.field.daily; pm.milestones; pm.today',body,'Bis zur nächsten noch nicht erfüllten Rücklauf-Etappe','<p>Restmenge / Kalendertage ab Datenstand. Rechenhilfe, keine Prognose. Der Yuh-Kontrollpunkt wird nicht als Frist verwendet.</p>');
  }
  function packageRows(packages,v) {
    if(!packages)return empty(); if(!packages.length)return empty('empty');
    return `<div class="package-list">${[...packages].sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).map(p=>`<button class="package-row" data-package="${esc(p.id)}"><span><b>${esc(p.id)}</b> ${esc(p.title)}<small>${p.owner?M.NAMES[p.owner]:'Verantwortlich: noch nicht geliefert'} · ${M.statusLabel(p.status)}</small></span><time>${esc(M.dateLabel(p.due))}</time></button>`).join('')}</div>`;
  }
  function packages(v,own=false) {
    return card(v,own?'own-packages':'packages',own?'Meine Pakete und Fristen':'Pakete',own?'Persönliche Team-Leseroute: tasks, owner, due, status':'pm.packages; pm.deadline_buckets.next',v.cached?`<p class="muted">Paketdetails werden nachgeladen.</p>${own&&v.ownCounts?`<p>${num(v.ownCounts.total)} eigene Pakete · ${num(v.ownCounts.done)} erledigt</p>`:''}`:packageRows(own?v.own:v.packages,v),own?(v.identity?M.NAMES[v.identity]:'Person noch nicht geliefert'):'Je Paket gezählt',own?'':`<p>Zuständigkeiten zusätzlich aus persönlichen Aufgaben, Stand ${esc(M.stamp(v.personalAt))}.</p>`,own?v.personalAt:v.generatedAt);
  }
  function schedule(v) {
    const milestones=v.milestones;
    const pack=v.role==='leitung'?v.packages:v.own;
    const entries=[...(milestones||[]).map(m=>({...m,type:'milestone'})),...(pack||[]).map(p=>({...p,type:'package'}))].filter(p=>p.due).sort((a,b)=>a.due.localeCompare(b.due)||a.id.localeCompare(b.id));
    const from=v.today,until=v.horizon||M.addDays(v.today,14),span=Math.max(1,M.days(from,until));
    const X=d=>Math.min(100,Math.max(0,100*M.days(from,d)/span));
    const row=p=>`<button class="schedule-row" ${p.type==='package'?'data-package':'data-milestone'}="${esc(p.id)}"><span><b>${esc(p.id)}</b> ${esc(p.title)}<small>${p.type==='milestone'?p.kind==='kontrollpunkt'?'Kontrollpunkt · keine Frist':p.kind==='tor'?'Tor':p.met?'erfüllt laut Messung':'Meilenstein':M.statusLabel(p.status)}</small></span><span class="schedule-track" aria-hidden="true">${p.type==='milestone'?`<i class="milestone ${p.kind}" style="left:${X(p.due)}%;background:${p.met?'var(--accent)':'var(--surface)'}"></i>`:p.start?`<i class="schedule-bar ${p.status||''}" style="left:${X(p.start)}%;width:${Math.max(1,X(p.due)-X(p.start))}%"></i>`:''}</span><time>${esc(M.dateLabel(p.due))}</time></button>`;
    const upcoming=entries.filter(p=>p.due>=from&&p.due<=until),previous=entries.filter(p=>p.due<from),later=entries.filter(p=>p.due>until);
    return card(v,'schedule','Zeitplan','pm.milestones; pm.packages; persönliche tasks',(v.cached?'<p class="muted">Paketdetails werden nachgeladen.</p>':'')+(entries.length?`<p class="muted">${esc(M.dateLabel(from))} bis ${esc(M.dateLabel(until))} · ◇ Meilenstein · ■ Tor · ○ Kontrollpunkt</p>${upcoming.map(row).join('')||empty('empty')}${previous.length?`<details><summary>Vorgeschichte</summary>${previous.map(row).join('')}</details>`:''}${later.length?`<details><summary>Spätere Termine</summary>${later.map(row).join('')}</details>`:''}`:empty(milestones||pack?'empty':v.states.project)),'Meilensteine und Pakete chronologisch',`<p>Persönliche Aufgaben: ${esc(M.stamp(v.personalAt))}.</p><p>Zeitraum ab Datentag. Balken = geplanter Beginn bis Paketfrist, keine Behauptung über tatsächlichen Arbeitsbeginn. Erledigung ohne Abschlussdatum wird nicht als pünktlich oder verspätet gewertet.</p>`);
  }
  function team(v) {
    const people=Object.keys(v.plan||{}).filter(k=>M.NAMES[k]);
    const max=Math.max(1,...people.map(k=>(M.number(v.plan[k])||0)+(M.number(v.reserve?.[k])||0)));
    const bar=k=>`<span class="t hours-track" aria-hidden="true"><span class="p" style="width:${100*(M.number(v.plan[k])||0)/max}%"></span>${M.number(v.reserve?.[k])!==null?`<span class="rv" style="left:${100*(M.number(v.plan[k])||0)/max}%;width:${100*v.reserve[k]/max}%"></span>`:''}${M.number(v.hours?.[k])!==null?`<span class="a" style="width:${Math.min(100,100*v.hours[k]/max)}%"></span>`:''}</span>`;
    return card(v,'team','Team und Stunden','pm.hours.per_person; plan_by_person; reserve_by_person; confirmations',v.cached?'<p class="muted">Stunden und Bestätigungen werden nachgeladen.</p>':people.length?`<div class="team">${people.map(k=>`<div class="tm"><strong>${M.NAMES[k]}</strong>${bar(k)}<span>${v.states.hours==='error'?'Daten gerade nicht erreichbar':!v.hours||!Object.hasOwn(v.hours,k)?'noch nicht geliefert':v.hours[k]===null?'nicht erfasst':num(v.hours[k],2)+' h'} · Plan ${num(v.plan[k])} h</span><span>${v.reserve&&Object.hasOwn(v.reserve,k)?num(v.reserve[k])+' h Reserve':'Reserve: noch nicht geliefert'}</span><span class="chk ${v.confirmations?.confirmed?.includes(k)?'ok':'no'}">${v.confirmations?.confirmed?.includes(k)?'✓ Auftrag':v.confirmations?.open?.includes(k)?'Auftrag offen':'Bestätigung: noch nicht geliefert'}</span></div>`).join('')}</div><p><a class="btn" href="/team/projekt/">Projektwerkzeuge öffnen</a></p>`:empty(),'Plan, Erfassung und Bestätigung','<p>null heisst nicht erfasst; ein gemessener Nullwert bleibt 0 h. Reserve wird nur angezeigt, wenn für diese Person geliefert.</p>');
  }
  function risks(v) {
    const list=v.risks;
    return card(v,'risks','Risiken','pm.risks.items',v.cached?'<p class="muted">Risikodetails werden nachgeladen.</p>':list?.length?`<div class="risks">${list.map(r=>`<div class="rk${r.status==='erledigt'?' done':''}"><i aria-hidden="true"></i><span>${esc(r.title)}</span></div>`).join('')}</div>`:empty(list?'empty':v.states.risks),list?`${list.filter(r=>r.status==='offen').length} offen, ${list.filter(r=>r.status==='erledigt').length} erledigt${list.some(r=>!['offen','erledigt'].includes(r.status))?' · weitere Status nicht zugeordnet':''}`:'','<p>Risiko-IDs werden noch nicht geliefert; deshalb sind hier keine Statusaktionen möglich.</p>');
  }
  function ruleCard(rule,disabled=false) {
    return `<article class="qc" data-rule="${esc(rule.id)}"><div class="anl">${esc(rule.kind==='frei'?'Freier Auftrag':'Juno · Regelvorschlag')}</div><h3>${esc(rule.title)}</h3><dl><dt>Beleg</dt><dd>${esc(rule.evidence)}</dd><dt>Vorschlag</dt><dd>${esc(rule.suggestion)}</dd></dl>${info('rule',rule.source+' · Datenstand '+M.stamp(rule.generatedAt||rule.version)+(rule.kind==='paket_schritt'?' · Persönliche Aufgaben '+M.stamp(rule.personalAt):''))}<div class="row"><button class="btn primary" data-action="approve" data-id="${esc(rule.id)}" ${disabled?'disabled':''}>Freigabe</button><button class="btn" data-action="other" data-id="${esc(rule.id)}" ${disabled?'disabled':''}>Anders</button><button class="btn ghost" data-action="later" data-id="${esc(rule.id)}" ${disabled?'disabled':''}>Später</button></div></article>`;
  }
  function queue(v,rules,memos,lane,disabled=false) {
    const pending=rules.filter(r=>!memos.some(m=>m.id===r.id));
    const selected=lane==='vorgemerkt'?memos:lane==='spaeter'?memos.filter(m=>m.status==='spaeter'):pending;
    const content=selected.map(item=>lane==='offen'?ruleCard(item,disabled):`<article class="qc" data-memo="${esc(item.id)}"><div class="anl">${item.status==='spaeter'?'Später':'Vorgemerkt'} · nur auf diesem Gerät</div><h3>${esc(item.title)}</h3><p>${esc(item.evidence)}</p><p>${esc(item.suggestion)}</p>${item.wish?`<p class="wishline">Änderungswunsch: ${esc(item.wish)}</p>`:''}${M.memoChanged(item,rules.find(r=>r.id===item.id))?flag('Beleg geändert oder nicht mehr geliefert · erneut prüfen'):''}<p class="muted">Vorbereitet am ${esc(M.stamp(item.createdAt))}. Nichts ausgeführt.</p><button class="btn" data-undo="${esc(item.id)}">${item.status==='spaeter'?'Zurückholen':'Zurücknehmen'}</button></article>`).join('')||empty('empty');
    return `<aside class="juno" id="juno" tabindex="-1" aria-label="Juno"><div class="juno-h"><div><h2>Warteschlange</h2><p>Juno bereitet vor, mit Beleg. Alle Aktionen bleiben lokal; nichts wird gesendet oder geändert.</p></div></div><div class="tabs" role="group" aria-label="Aufträge">${[['offen','Vorschläge',pending.length],['vorgemerkt','Vorgemerkt',memos.length],['spaeter','Später',memos.filter(m=>m.status==='spaeter').length]].map(([id,label,n])=>`<button data-lane="${id}" aria-pressed="${lane===id}">${label} <span>${n}</span></button>`).join('')}</div><div class="q">${content}</div></aside>`;
  }
  function page(v,{mode='marketing',lane='offen',rules=[],memos=[],disabled=false}={}) {
    const modules=mode==='marketing'?`<div class="cols c2">${curve(v)}${quotas(v)}</div><div class="cols c3">${channels(v)}${funnel(v)}${organizations(v)}</div>${tempo(v)}${waves(v)}${methods(v)}`:`${schedule(v)}${v.role==='leitung'?packages(v):''}<div class="cols c2">${team(v)}${risks(v)}</div>`;
    return `${v.role!=='leitung'?packages(v,true):''}${stand(v,mode)}<div class="grid"><div class="cols" id="modules">${modules}</div>${queue(v,rules,memos,lane,disabled)}</div>`;
  }
  function skeleton(mode='marketing') {
    const module=(id,title)=>`<section class="card skeleton" id="${id}" aria-hidden="true"><div class="card-h"><h2>${title}</h2></div><div class="skeleton-lines"></div></section>`;
    const modules=mode==='marketing'?`<div class="cols c2">${module('curve','Rücklauf')}${module('quotas','Quoten')}</div><div class="cols c3">${module('channels','Kanäle')}${module('funnel','Trichter')}${module('organizations','Organisationen')}</div>${module('tempo','Tempo')}${module('waves','Wellen')}<div class="cols c2 methods">${module('method-b','Servicebeobachtung B')}${module('method-c','Bewertungen C')}</div>`:`${module('schedule','Zeitplan')}${module('packages','Pakete')}<div class="cols c2">${module('team','Team und Stunden')}${module('risks','Risiken')}</div>`;
    return `<section class="lage skeleton" id="stand" aria-hidden="true">${['Stand','Engpass','Nächster Schritt'].map(label=>`<div><div class="step">${label}</div><div class="skeleton-lines"></div></div>`).join('')}</section><div class="grid"><div class="cols" id="modules">${modules}</div><aside class="juno skeleton" id="juno" aria-hidden="true"><div class="juno-h"><h2>Warteschlange</h2></div><div class="skeleton-lines"></div></aside></div>`;
  }
  return {esc,num,empty,info,card,ruleCard,page,tempo,packageRows,skeleton};
});
