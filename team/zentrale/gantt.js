'use strict';
(() => {
  const M=window.CentralModel, E=window.CentralRender.esc;
  const DAY=12, ROW=48, PAD=24;
  let data=null, loading=null, failure=false, filter='all', selected='', expanded=new Set();
  const short=d=>d.slice(8,10)+'.'+d.slice(5,7)+'.';
  const full=d=>short(d)+d.slice(0,4);
  const today=()=>M.dateOf(new Date().toISOString());
  const week=d=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));return Math.ceil((((x-new Date(Date.UTC(x.getUTCFullYear(),0,1)))/864e5)+1)/7);};
  const inFilter=i=>filter==='all'||(i.stages||[i.stage]).includes(filter);
  function live(item,v) {
    const candidate=[...(v?.own||[]),...(v?.packages||[]),...(v?.milestones||[])].find(p=>p.id===item.id&&p.status);
    return {status:candidate?.status||null,candidate};
  }
  async function load() {
    if(data)return data;
    if(loading)return loading;
    failure=false;
    loading=fetch('zeitplan.json?v=4251cffdee54',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Zeitplan nicht verfügbar');return r.json();}).then(d=>{
      if(d.schema!=='pa6.schedule.v1'||!Array.isArray(d.items)||!Array.isArray(d.phases))throw Error('Zeitplan ungültig');
      data=d;return d;
    }).catch(()=>{failure=true;return null;}).finally(()=>{loading=null;});
    return loading;
  }
  function layout() {
    const visible=data.items.filter(inFilter), phases=data.phases.filter(p=>visible.some(i=>i.phase===p.id));
    let first=visible.reduce((d,i)=>i.start<d?i.start:d,phases[0].start),last=visible.reduce((d,i)=>i.end>d?i.end:d,phases.at(-1).end);
    const dow=new Date(first+'T12:00:00Z').getUTCDay()||7;first=M.addDays(first,1-dow);
    last=M.addDays(last,7); const width=(M.days(first,last)+1)*DAY+PAD*2;
    const x=d=>PAD+M.days(first,d)*DAY;
    const rows=[];
    for(const p of phases){
      const children=visible.filter(i=>i.phase===p.id).sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
      const start=children.reduce((d,i)=>i.start<d?i.start:d,p.start),end=children.reduce((d,i)=>i.end>d?i.end:d,p.end);
      rows.push({...p,start,end,kind:'phase',count:children.filter(i=>i.kind==='package').length});
      rows.push(...children.filter(i=>expanded.has(p.id)||i.critical||['MS-01','MS-05','MS-06'].includes(i.id)));
    }
    return {rows,first,last,width,x};
  }
  function page(v) {
    if(!data)return `<section class="card gantt-loading"><h1>Zeitplan</h1><p role="status">${failure?'Der Zeitplan konnte nicht geladen werden.':'Zeitplan wird geladen …'}</p>${failure?'<button class="btn" data-gantt-retry>Erneut versuchen</button>':''}</section>`;
    const {rows,first,last,width,x}=layout(),now=today(),currentX=x(now);
    const critical=data.items.filter(i=>i.critical);
    const summary=critical.map((i,n)=>`<button class="gantt-deadline" data-gantt-item="${i.id}"><span class="gantt-eyebrow">${['01 · Analyse','02 · Konzept & Planung','03 · Präsentation'][n]}</span><strong>${full(i.date)}</strong><span>${E(i.title)} <b>↗</b></span><small>${E(i.time)} · verbindlicher Termin</small></button>`).join('');
    let weeks='';for(let d=first;d<=last;d=M.addDays(d,7))weeks+=`<div class="gantt-week" style="left:${x(d)}px;width:${7*DAY}px"><strong>KW ${week(d)}</strong><span>${short(d)}</span></div>`;
    const yMap=new Map(rows.map((i,n)=>[i.id,n*ROW+ROW/2]));
    const edges=rows.flatMap(i=>(i.dependencies||[]).filter(dep=>yMap.has(dep.id)).map(dep=>{
      const pre=rows.find(r=>r.id===dep.id),sx=x(dep.type==='SS'?pre.start:pre.end)+DAY/2,ex=x(dep.type==='FF'?i.end:i.start)+DAY/2,sy=yMap.get(dep.id),ey=yMap.get(i.id),bend=Math.max(sx+10,ex-12);
      return `<path class="gantt-edge${selected===i.id||selected===dep.id?' is-selected':''}" d="M${sx},${sy} H${bend} V${ey} H${ex}" marker-end="url(#gantt-arrow)"><title>${E(dep.id+' → '+i.id+' · '+dep.type)}</title></path>`;
    })).join('');
    const body=rows.map((i,index)=>{
      const phaseIndex=data.phases.findIndex(p=>p.id===(i.kind==='phase'?i.id:i.phase)),tone='tone-'+phaseIndex;
      const state=i.kind==='phase'?null:live(i,v).status;
      const left=x(i.start),barWidth=Math.max(DAY,(M.days(i.start,i.end)+1)*DAY);
      const label=i.kind==='phase'?`<button class="gantt-label phase-label ${tone}" data-gantt-phase="${i.id}" aria-expanded="${expanded.has(i.id)}"><span>${expanded.has(i.id)?'−':'+'} ${E(i.title)}</span><small>${i.count} Pakete · ${short(i.start)}–${full(i.end)}</small></button>`:`<button class="gantt-label" id="gantt-${i.id}" data-gantt-item="${i.id}"><span>${E(i.title)}</span><small>${E(i.id)} · ${E(i.owner||i.category||'Zuständigkeit offen')}${state?' · '+E(M.statusLabel(state)):''}</small></button>`;
      const aria=E(i.title+', '+full(i.start)+(i.end!==i.start?' bis '+full(i.end):''));
      let mark;
      if(i.kind==='milestone')mark=`<button class="gantt-milestone${i.critical?' critical':''}" data-gantt-item="${i.id}" style="left:${left-16}px" aria-label="${aria}"><i></i><span>${short(i.date)}${i.time?' · '+E(i.time):''}</span></button>`;
      else mark=`<button class="gantt-bar ${tone} ${i.kind==='reserve'?'is-reserve':''} ${i.kind==='phase'?'is-phase':''} ${state==='fertig'?'is-done':''}" ${i.kind==='phase'?`data-gantt-phase="${i.id}" aria-expanded="${expanded.has(i.id)}"`:`data-gantt-item="${i.id}"`} style="left:${left}px;width:${barWidth}px" aria-label="${aria}">${barWidth>68?`<span>${i.kind==='phase'?E(i.title):E(i.owner||'')}${state==='fertig'?' ✓':''}</span>`:''}</button>`;
      return `<div class="gantt-row ${i.kind==='phase'?'phase-row':''} ${selected===i.id?'is-selected':''}" style="--row-index:${index}">${label}<div class="gantt-track" style="width:${width}px">${mark}</div></div>`;
    }).join('');
    return `<section class="gantt-page" aria-labelledby="gantt-title"><div class="gantt-heading"><div><p class="gantt-eyebrow">UNSER FAHRPLAN · OKT 2026 — MÄR 2027</p><h1 id="gantt-title">Gemeinsam bis zur Abgabe.</h1><p>Vier Phasen. Ein Zeitplan für unsere Gruppenarbeit.</p></div><span class="gantt-plan-stamp">Planstand ${full(data.asOf)}<br><b>M1 · Entwurf</b></span></div><div class="gantt-deadlines">${summary}</div><section class="gantt-board" aria-label="Gantt der Gruppenarbeit"><div class="gantt-toolbar"><div class="seg" role="group" aria-label="Zeitplan filtern">${[['a','PA6a'],['b','PA6b'],['all','alles']].map(([id,label])=>`<button data-gantt-filter="${id}" aria-pressed="${filter===id}">${label}</button>`).join('')}</div><div class="gantt-actions"><button class="btn" data-gantt-expand>${expanded.size===data.phases.length?'Übersicht':'Alle Pakete'}</button><button class="btn" data-gantt-today>Heute ↗</button></div></div><div class="gantt-legend"><span><i class="legend-bar"></i>Arbeitspaket</span><span>◇ Meilenstein</span><span><i class="legend-reserve"></i>Reserve</span><span>↳ Abhängigkeit</span></div><div class="gantt-scroll" tabindex="0" role="region" aria-label="Zeitplan, horizontal und vertikal scrollbar"><div class="gantt-canvas" style="--timeline-width:${width}px"><div class="gantt-axis"><div class="gantt-label axis-label">Phase / Arbeitspaket<small>Antippen für Details</small></div><div class="gantt-weeks" style="width:${width}px">${weeks}</div></div><div class="gantt-body">${body}<svg class="gantt-links" width="${width}" height="${rows.length*ROW}" aria-hidden="true"><defs><marker id="gantt-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5" fill="currentColor"/></marker></defs>${edges}</svg>${currentX>=0&&currentX<=width?`<div class="gantt-today" style="left:calc(var(--label-width) + ${currentX}px)"><span>Heute ${short(now)}</span></div>`:''}</div></div></div><div class="gantt-foot"><span>${E(data.absenceNote)}</span><span>${data.items.filter(i=>i.kind==='package').length} Arbeitspakete · ${data.items.filter(i=>i.kind==='reserve').length} Reserven</span></div></section><details class="gantt-notes"><summary>Planungsannahmen und Quellen</summary>${data.notes.map(n=>`<p>${E(n)}</p>`).join('')}<p>Phasenbalken umschliessen ihre Pakete; verbindliche Phasenfenster stehen in den Quellen. Kapitelübergaben stehen in den Paketdetails. Abhängigkeiten zu ausgeblendeten Paketen bleiben dort lesbar.</p><p>Termine.md hat Vorrang. Status: ${E(M.stamp(v?.generatedAt))}${v?.cached?' · gespeicherter Stand':''}. Fehlende Status werden nicht als «offen» angenommen.</p><ul>${data.sources.map(s=>`<li>${E(s.path)}</li>`).join('')}</ul></details></section>`;
  }
  function detail(id,v) {
    const i=data?.items.find(i=>i.id===id);if(!i)return null;
    selected=id;
    const state=live(i,v), chapters=data.chapters.filter(c=>(i.notes||[]).some(n=>n.includes(c.id+' ')));
    const row=(label,value)=>`<dt>${E(label)}</dt><dd>${value}</dd>`;
    const deps=i.dependencies.map(d=>{const p=data.items.find(i=>i.id===d.id);return `<li>${E(d.id+' · '+(p?.title||'')+' · '+d.type)}${d.note?' — '+E(d.note):''}</li>`;}).join('');
    const mismatch=state.candidate&&((state.candidate.start&&state.candidate.start!==i.start)||(state.candidate.due&&state.candidate.due!==i.end));
    return {title:i.title,body:`<p class="gantt-eyebrow">${E(i.id)} · ${E(i.kind==='reserve'?'Reserve':i.category||'Arbeitspaket')}</p><dl class="kv">${row('Zuständig',E(i.owner||'noch nicht erfasst'))}${row('Zeitraum',E(i.kind==='milestone'?full(i.date)+(i.time?' · '+i.time:''):full(i.start)+' '+i.startTime+' – '+full(i.end)+' '+i.endTime))}${row('Dauer',i.kind==='milestone'?'Meilenstein':i.durationDays+' Kalendertage (inklusive Randtage)')}${row('Planaufwand',i.effortHours===null?'nicht erfasst':i.effortHours+' Stunden')}${row('Status',E(M.statusLabel(state.status))+(state.status?' · '+E(M.stamp(v.generatedAt)):''))}${row('Quelle',E(i.source))}${row('Lieferobjekte',E(i.deliverables.join(', ')||'Termin / Planbezug'))}</dl>${mismatch?'<p class="gantt-warning">Abweichender Live-Termin: '+E(state.candidate.start||'Start fehlt')+' – '+E(state.candidate.due||'Ende fehlt')+'. Der belegte Plantermin bleibt massgebend.</p>':''}<h3>Abhängig von</h3>${deps?'<ul>'+deps+'</ul>':'<p>Keine Vorgänger im Plan erfasst.</p>'}<p class="muted">FS: nach Abschluss · FS0: Übergabe am selben Tag · FF: Ende nach Teilen · SS: Kontrollpunkt im laufenden Paket</p>${i.deliverables.length?'<details><summary>Lieferplan: Solltermine</summary>'+data.deliveryTargets.filter(t=>i.deliverables.includes(t.id)).map(t=>'<p><b>'+E(t.id)+'</b> · '+E(t.targetText)+'<br><small>'+E(t.source)+'</small></p>').join('')+'</details>':''}${i.notes.length?`<details><summary>Fachliche Übergaben und Hinweise (${i.notes.length})</summary><ul>${i.notes.map(n=>`<li>${E(n)}</li>`).join('')}</ul>${chapters.length?'<h3>Kapitel und Zweitlesung</h3>'+chapters.map(c=>`<p>${E(c.id)} · ${E(c.owner)} bis ${full(c.end)}; Zweitlesung ${E(c.reviewer)} bis ${full(c.reviewBy)} ${E(c.reviewTime)}.</p>`).join(''):''}</details>`:''}`};
  }
  function action(type,value){if(type==='filter')filter=value;if(type==='phase')expanded.has(value)?expanded.delete(value):expanded.add(value);if(type==='expand')expanded=expanded.size===data.phases.length?new Set():new Set(data.phases.map(p=>p.id));}
  function scrollToday(){const el=document.querySelector('.gantt-scroll');if(!el||!data)return;const {x,width}=layout(),label=parseFloat(getComputedStyle(el).getPropertyValue('--label-width'));el.scrollLeft=Math.max(0,Math.min(width,x(today())-(el.clientWidth-label)/2));}
  window.CentralGantt={load,page,detail,action,scrollToday};
})();
