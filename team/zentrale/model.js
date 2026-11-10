'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CentralModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TZ = 'Europe/Zurich';
  const NAMES = {SA:'Salah', ES:'Ernes', MG:'Melisa', AM:'Arber', LB:'Leonie'};
  const CHANNELS = {OR:'Organisationen', GE:'Geschäft', WA:'WhatsApp', IG:'Instagram', HS:'Schulen', SCH:'Schulhaus', TEIL:'Weitergeleitet', RD:'Reddit', KL:'Klasse', LI:'LinkedIn', FB:'Facebook', Y:'Foren', YU:'Eigene Yuh-Nutzerkreise', YUH:'Yuh-Kanäle', Sonstige:'Sonstige'};
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value ? value : null;
  const dateOf = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-CA', {timeZone:TZ, year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)) : null;
  const stamp = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('de-CH',{timeZone:TZ,weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : 'noch nicht geliefert';
  const dateLabel = value => day(value) ? new Intl.DateTimeFormat('de-CH',{timeZone:'UTC',weekday:'short',day:'2-digit',month:'2-digit'}).format(new Date(value+'T12:00:00Z')) : 'noch nicht geliefert';
  const days = (a,b) => day(a) && day(b) ? Math.round((Date.parse(b)-Date.parse(a))/864e5) : null;
  const addDays = (value,n) => day(value) ? new Date(Date.parse(value)+n*864e5).toISOString().slice(0,10) : null;
  const sum = list => Array.isArray(list) && list.every(x=>number(x)!==null) ? list.reduce((a,b)=>a+b,0) : null;
  const ratio = (n,d) => number(n)!==null && number(d)>0 ? n/d : null;
  const state = value => value == null ? 'missing' : ['ready','leer','empty'].includes(value.state) || !value.state ? 'ready' : 'error';
  const rows = value => Array.isArray(value) ? value : null;
  const cleanText = value => String(value ?? '').replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.-]+/gi,'[Verweis ausgeblendet]').replace(/\bNotion\b/gi,'Projektablage').replace(/(?:\+|00)\d[\d ()/.-]{7,}\d/g,'[Kontakt ausgeblendet]').replace(/\b0[1-9]\d(?:[ ()./-]*\d){7}\b/g,'[Kontakt ausgeblendet]');
  const status = value => ({offen:'offen','läuft':'laeuft',laeuft:'laeuft','in Prüfung':'in_pruefung',in_pruefung:'in_pruefung',fertig:'fertig',erledigt:'fertig',erreicht:'fertig'})[value] || null;
  const statusLabel = value => ({offen:'offen',laeuft:'läuft',in_pruefung:'in Prüfung',fertig:'fertig'})[value] || 'noch nicht geliefert';
  const milestoneTarget = m => number(m.target) ?? (String(m.title).match(/Rücklauf (\d+) gültige/) ? +String(m.title).match(/Rücklauf (\d+) gültige/)[1] : null);
  const quoteId = q => ['16 bis 29','30 bis 49','50 bis 65'].includes(q.age) && typeof q.neobank === 'boolean' ? `zelle:${q.age.replace(' bis ','-')}:${q.neobank?'neobank':'keine-neobank'}` : null;
  const quoteLabel = q => `${q.age.replace(' bis ','–')} ${q.neobank?'mit':'ohne'} Neobank`;
  function normalize(raw, personal = null) {
    if (!raw || raw.ok === false || !['pa6.dashboard.v2','pa6.metrics.v1'].includes(raw.schema)) throw Error('Das Antwortschema wird noch nicht unterstützt.');
    if (!dateOf(raw.generated_at)) throw Error('Der Datenstand fehlt oder ist ungültig.');
    const methods = raw.schema === 'pa6.metrics.v1' ? {[raw.method || 'A']: raw} : raw.methods || {};
    const A = state(methods.A?.field)==='ready' ? methods.A?.field || {} : {};
    const B = state(methods.B?.field)==='ready' ? methods.B?.field || {} : {};
    const C = state(methods.C?.field)==='ready' ? methods.C?.field || {} : {};
    const P = state(raw.pm)==='ready' ? raw.pm || {} : {};
    const O = state(raw.outreach)==='ready' ? raw.outreach || {} : {};
    const today = day(P.today) || dateOf(raw.generated_at);
    const n = number(A.totals?.valid?.n) ?? number(A.n), target = number(A.totals?.valid?.target) ?? number(A.targets?.[0]);
    const quotas = rows(A.quotas)?.map(q=>({...q,id:quoteId(q),n:number(q.n),target:number(q.target),missing:number(q.n)!==null&&number(q.target)!==null?Math.max(0,q.target-q.n):null})).filter(q=>q.id) ?? null;
    const gap = quotas?.filter(q=>q.n!==null && q.target>0 && q.missing>0).sort((a,b)=>a.n/a.target-b.n/b.target || b.missing-a.missing || a.id.localeCompare(b.id))[0] || null;
    const daily = A.daily && typeof A.daily==='object' && !Array.isArray(A.daily) ? Object.entries(A.daily).filter(([d])=>day(d)).sort(([a],[b])=>a.localeCompare(b)).map(([d,v])=>({day:d,n:number(v)})) : null;
    let cumulative = 0;
    const curve = daily?.map(r=>{cumulative=cumulative===null||r.n===null?null:cumulative+r.n;return {...r,total:cumulative};}) ?? null;
    const dailyConsistent = curve?.length>0 && sum(curve.map(r=>r.n))===n && !(number(A.daily?.unbekannt)>0);
    const reachedOn = threshold => number(threshold)!==null && dailyConsistent ? curve.find(r=>r.total>=threshold)?.day || null : null;
    const milestones = rows(P.milestones)?.filter(m=>m.ref).map(m=>({...m,id:m.ref,title:cleanText(m.title),due:day(m.due),target:milestoneTarget(m),kind:m.ref==='MS-09'?'kontrollpunkt':m.gate?'tor':'meilenstein',met:milestoneTarget(m)!==null && n!==null ? n>=milestoneTarget(m):null,reachedOn:reachedOn(milestoneTarget(m)),status:status(m.status),owner:NAMES[m.owner]?m.owner:null})) ?? null;
    const owners = Object.fromEntries((rows(P.deadline_buckets?.next)||[]).filter(p=>p.ref&&NAMES[p.owner]).map(p=>[p.ref,p.owner]));
    const personalTasks=personal?.ok===true && rows(personal.tasks);
    for(const p of personalTasks||[]) if(p.ref && NAMES[p.owner] && (personal.person==='SA'&&personal.role==='leitung'&&!personal.readOnly || p.owner===personal.person)) owners[p.ref]=p.owner;
    const pack = p=>({id:p.ref,title:cleanText(p.title),start:day(p.start),due:day(p.due),status:status(p.status),owner:NAMES[p.owner]?p.owner:owners[p.ref]||null,revision:number(p.revision),done_at:p.done_at||null});
    const packages = rows(P.packages)?.filter(p=>p.ref).map(pack) ?? null;
    const identity = personal?.ok===true && NAMES[personal.person] ? personal.person : null;
    const own = identity && rows(personal.tasks) ? personal.tasks.filter(p=>p.ref && (p.owner===identity || p.person===identity)).map(pack) : null;
    const statusCounts = packages && packages.every(p=>p.status) ? {done:packages.filter(p=>p.status==='fertig').length,begun:packages.filter(p=>['laeuft','in_pruefung'].includes(p.status)).length,open:packages.filter(p=>p.status==='offen').length} : null;
    const exportedCounts = P.progress?.counts;
    const counts = exportedCounts && ['done','begun','open'].every(k=>number(exportedCounts[k])!==null) ? {...exportedCounts} : null;
    const cells = rows(C.cells);
    const cellTotals = cells ? {n:sum(cells.map(c=>c.n)),planned:sum(cells.map(c=>c.planned)),captured:sum(cells.map(c=>c.captured))} : null;
    // Unique review IDs and assignments to overlapping windows have different units.
    const codeConflict = number(C.n)!==null && number(C.planned)!==null && C.n>C.planned;
    // Progress also counts recorded actual starts; status-only counts need not match.
    const countConflict = counts && statusCounts && (sum(Object.values(counts))!==packages.length || counts.done!==statusCounts.done || counts.begun<statusCounts.begun);
    const stages = milestones?.filter(m=>m.kind==='meilenstein' && m.target!==null && m.due).sort((a,b)=>a.due.localeCompare(b.due))||[];
    const next = n!==null ? stages.find(m=>m.target>n)||null : null;
    const remaining = next ? Math.max(0,next.target-n) : null, remainingDays = next ? days(today,next.due) : null;
    const people = A.people && typeof A.people==='object' ? A.people:null;
    const channels = A.channels && typeof A.channels==='object' ? Object.entries(A.channels).map(([id,value])=>({id,label:CHANNELS[id]||cleanText(id),n:number(value)})).sort((a,b)=>(b.n??-1)-(a.n??-1)) : null;
    const starts = state(A.starts)==='ready' ? A.starts:null;
    const funnel = starts?.total ? ['geoeffnet','begonnen','vollstaendig','gueltig'].map(k=>number(starts.total[k])) : null;
    const view = {schema:raw.schema,version:raw.version||raw.generated_at,generatedAt:raw.generated_at,personalAt:personal?.fetchedAt||null,releaseAt:raw.release_at,today,
      role:identity==='SA' && raw.role==='leitung' && personal?.role==='leitung' && personal?.readOnly!==true?'leitung':'mitglied',identity,readOnly:personal?.readOnly===true,
      n,target,validShare:ratio(n,target),yuh:{n:number(A.yuh_target?.n)??number(A.totals?.yuh?.n),target:number(A.yuh_target?.target)??number(A.totals?.yuh?.target)},
      quotas,gap,quotaMinimum:quotas?sum(quotas.map(q=>q.target)):null,channels,people:people?{coded:sum(Object.entries(people).filter(([k])=>k!=='ohne').map(([,v])=>v)),without:number(people.ohne)}:null,
      curve,dailyConsistent,todayGain:number(A.daily?.[today]),funnel,funnelSince:starts?.since,
      outreach:{state:state(raw.outreach),sent:number(O.sent),answered:number(O.answered),share:ratio(number(O.answered),number(O.sent)),kinds:O.kinds||null,noReply:number(O.no_reply),reference:number(O.reference?.kinds?.Zusage),waves:rows(O.waves)||rows(raw.v3?.outreach?.waves)},
      B:{state:state(methods.B?.field),n:number(B.n),target:number(B.target)},C:{state:state(methods.C?.field),n:number(C.n),planned:number(C.planned),cellTotals,conflict:!!codeConflict},
      packages,own,milestones,counts,statusCounts,countConflict:!!countConflict,exportCounts:exportedCounts||null,progress:number(P.progress?.share),next,remaining,remainingDays,tempo:remainingDays>0?remaining/remainingDays:null,
      hours:state(P.hours)==='ready'?P.hours?.per_person||null:null,plan:P.plan_by_person||null,reserve:P.reserve_by_person&&typeof P.reserve_by_person==='object'&&!Array.isArray(P.reserve_by_person)?Object.fromEntries(Object.keys(NAMES).map(k=>[k,Object.hasOwn(P.reserve_by_person,k)?number(P.reserve_by_person[k]):0])):null,confirmations:state(P.confirmations)==='ready'?P.confirmations||null:null,
      risks:state(P.risks)==='ready'?rows(P.risks?.items)?.map(r=>({title:cleanText(r.title),status:r.status}))||null:null,horizon:day(P.deadline_buckets?.horizon),
      states:{survey:state(methods.A?.field),project:state(raw.pm),risks:state(P.risks),hours:state(P.hours),confirmations:state(P.confirmations)},personalState:personal?.ok===true?'ready':'missing'};
    view.yuh.share=ratio(view.yuh.n,view.yuh.target);
    view.checkpoint=milestones?.find(m=>m.id==='MS-09')||null;
    view.fieldClose=milestones?.find(m=>m.id==='MS-11')?.due||null;
    return view;
  }
  function rules(v) {
    const result=[], add=(id,kind,target,title,evidence,suggestion,source,owner=null)=>result.push({id,kind,target,title,evidence,suggestion,source,owner,version:v.version,generatedAt:v.generatedAt,personalAt:v.personalAt});
    for(const m of v.milestones||[]) if(m.kind==='meilenstein' && m.met && m.status==='offen' && m.reached!==true) add('milestone:'+m.id,'meilenstein_setzen',m.id,'Meilenstein laut Messung erfüllt',`${v.n} gültige Antworten ≥ ${m.target}; ${m.id} steht offen.${m.reachedOn?' Erstmals belegt am '+dateLabel(m.reachedOn):' Erreichungsdatum noch nicht geliefert.'}`,'Planstatus nach Prüfung als erreicht vormerken; kein automatischer Abschluss.','methods.A.field.totals.valid.n / field.n; pm.milestones',m.owner);
    if(v.gap) {
      const q=v.gap, channel=q.neobank?'eigene Neobank-Community oder Instagram':'persönliches Umfeld oder Quartierorganisationen';
      add('quota:'+q.id,'quote_ansprache',q.id,'Grösste Quotenlücke',`${quoteLabel(q)}: ${q.n} / ${q.target}; ${q.missing} fehlen.`, `Ansprache über ${channel} entwerfen. Kanalvorschlag als Annahme; keine gemessene Kanalwirkung.`, 'methods.A.field.quotas');
    }
    if(v.yuh.n!==null && v.yuh.target>v.yuh.n && v.checkpoint?.due) {
      const distance=days(v.today,v.checkpoint.due);
      add('yuh:'+v.checkpoint.id,'yuh_ansprache',v.checkpoint.id,'Yuh-Stichprobe prüfen',`${v.yuh.n} / ${v.yuh.target} Yuh-Nutzende; Abstand zum Kontrollpunkt ${dateLabel(v.checkpoint.due)}: ${distance>=0?distance+' Tage':Math.abs(distance)+' Tage seit dem Kontrollpunkt'}.`, 'Aufstockung über eigene oder öffentliche Kanäle vorbereiten. Der Kontrollpunkt ist keine Abgabefrist.', 'methods.A.field.yuh_target; pm.milestones.MS-09',v.checkpoint.owner);
    }
    const packs=v.role==='leitung'?v.packages:v.own;
    for(const p of packs||[]) if(p.status==='offen' && days(v.today,p.due)!==null && days(v.today,p.due)<=2) add('package:'+p.id,'paket_schritt',p.id,'Paketfrist ohne gemeldeten Start',`${p.id}: ${dateLabel(p.due)}; ${days(v.today,p.due)<0?'überfällig':'in '+days(v.today,p.due)+' Tagen'}; Status offen.`,'Nächsten Schritt und Zuständigkeit prüfen und einen Arbeitsauftrag vorbereiten. Ein geplantes Startdatum belegt keinen tatsächlichen Start.', 'pm.packages / persönliche tasks',p.owner);
    if(v.C.conflict) add('conflict:C','zahlen_pruefen','C','Bewertungen prüfen',`${v.C.n} erstmals eingeordnet, aber nur ${v.C.planned} Bewertungen geplant.`,'Die Zahl der einzelnen Bewertungen prüfen.','methods.C.field');
    if(v.countConflict) add('conflict:packages','zahlen_pruefen','packages','Projektzählung prüfen',`Paketstatus ${v.statusCounts.done} / ${v.statusCounts.begun} / ${v.statusCounts.open}; Fortschrittszählung ${v.counts.done} / ${v.counts.begun} / ${v.counts.open} (fertig / begonnen / offen).`,'Anzahl und Fertigmeldungen abgleichen; ein erfasster Arbeitsbeginn zählt im Fortschritt ebenfalls als begonnen.','pm.packages; pm.progress.counts');
    if(v.outreach.reference!==null && number(v.outreach.kinds?.Zusage)!==null && v.outreach.reference!==v.outreach.kinds.Zusage) add('conflict:outreach','zahlen_pruefen','outreach','Zusagen widersprechen der Referenz',`Dashboard ${v.outreach.kinds.Zusage}; Referenz ${v.outreach.reference}.`,'Zuordnungen prüfen; keine bereinigte Quote behaupten.','outreach.kinds.Zusage; outreach.reference.kinds.Zusage');
    return result;
  }
  function prepare(rule,action,wish='',now=new Date().toISOString()) {
    if(!['approve','other','later'].includes(action)) throw Error('Unbekannte Aktion');
    return {...rule,action,wish:cleanText(wish).slice(0,4000),status:action==='later'?'spaeter':'vorgemerkt',createdAt:now,localOnly:true};
  }
  function memoChanged(memo,current) {return memo.kind==='frei'?false:!current||memo.evidence!==current.evidence||memo.suggestion!==current.suggestion||memo.owner!==current.owner||memo.target!==current.target;}
  return {TZ,NAMES,CHANNELS,number,day,dateOf,stamp,dateLabel,days,addDays,sum,ratio,cleanText,statusLabel,quoteLabel,normalize,rules,prepare,memoChanged};
});
