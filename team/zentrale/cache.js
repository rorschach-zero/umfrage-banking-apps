'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./model.js'));
  else root.CentralCache = factory(root.CentralModel);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  const PREFIX = 'pa6-central-metrics-v2:';
  const enumOf = values => value => values.includes(value) ? value : null;
  const bool = value => typeof value === 'boolean' ? value : null;
  const time = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
  const numeric = keys => Object.fromEntries(keys.split(' ').map(key => [key, M.number]));
  const count = numeric('done begun open');
  const metricState = enumOf(['ready', 'missing', 'empty', 'error']);
  const quota = {age:enumOf(['16 bis 29','30 bis 49','50 bis 65']),neobank:bool,...numeric('n target missing')};
  const milestone = {id:value=>/^MS-\d+$/.test(value) ? value : null,due:M.day,...numeric('target'),kind:enumOf(['meilenstein','kontrollpunkt','tor']),met:bool,reachedOn:M.day,status:enumOf(['offen','laeuft','in_pruefung','fertig'])};
  // Explicit projections exclude task text, contacts, credentials and per-person records.
  const dashboardShape = {
    generatedAt:time,releaseAt:time,today:M.day,role:enumOf(['leitung','mitglied']),
    ...numeric('n target validShare quotaMinimum todayGain progress remaining remainingDays tempo'),
    yuh:numeric('n target share'),quotas:[quota],channels:[{id:enumOf(Object.keys(M.CHANNELS)),n:M.number}],
    people:numeric('coded without'),curve:[{day:M.day,...numeric('n total')}],dailyConsistent:bool,funnel:[M.number],funnelSince:time,
    outreach:{state:metricState,...numeric('sent answered share noReply reference positive'),kinds:{Zusage:M.number,'Zusage mit Auftrag':M.number,Absage:M.number,Automatisch:M.number}},
    B:{state:metricState,...numeric('n target')},C:{state:metricState,...numeric('n planned'),cellTotals:numeric('n planned captured'),conflict:bool},
    counts:count,statusCounts:count,exportCounts:count,countConflict:bool,milestones:[milestone],next:milestone,checkpoint:milestone,fieldClose:M.day,horizon:M.day,
    states:{survey:metricState,project:metricState}
  };
  function project(shape, value) {
    if (value == null) return null;
    if (typeof shape === 'function') return shape(value);
    if (Array.isArray(shape)) return Array.isArray(value) ? value.slice(0,1000).map(item=>project(shape[0],item)) : null;
    if (typeof value !== 'object' || Array.isArray(value)) return null;
    return Object.fromEntries(Object.entries(shape).map(([key,child])=>[key,project(child,value[key])]));
  }
  function teamMetrics(personal, as) {
    if (!personal || !Object.hasOwn(M.NAMES,personal.person) || (as ? personal.person!==as || personal.readOnly!==true || personal.viewer!=='SA' : personal.readOnly===true || personal.viewer)) return null;
    const tasks=Array.isArray(personal.tasks)?personal.tasks.filter(task=>task.owner===personal.person||task.person===personal.person):null;
    return {person:personal.person,role:personal.role==='leitung'?'leitung':'mitglied',readOnly:!!as,viewer:as?'SA':null,fetchedAt:time(personal.fetchedAt),
      ownCounts:tasks?{total:tasks.length,done:tasks.filter(task=>['fertig','erledigt'].includes(task.status)).length}:project(numeric('total done'),personal.ownCounts)};
  }
  function get(storage, slot, as) {
    try {
      const entry=JSON.parse(storage.getItem(slot));
      if(entry?.schema!=='pa6.central-metrics.v1')return null;
      const team=teamMetrics(entry.team,as),dashboard=project(dashboardShape,entry.dashboard);
      return {schema:entry.schema,team,dashboard:dashboard?.generatedAt?dashboard:null};
    } catch {return null;}
  }
  function save(storage,slot,as,{dashboard,team}) {
    if(!slot)return false;
    try {
      const entry=get(storage,slot,as)||{schema:'pa6.central-metrics.v1',team:null,dashboard:null};
      if(dashboard)entry.dashboard=project(dashboardShape,dashboard);
      if(team)entry.team=teamMetrics(team,as);
      storage.setItem(slot,JSON.stringify(entry));return true;
    } catch {return false;}
  }
  function restore(entry,as) {
    if(!entry?.team || !entry.dashboard?.generatedAt || !['yuh','B','C','outreach','states'].every(key=>entry.dashboard[key]&&typeof entry.dashboard[key]==='object'))return null;
    const d=entry.dashboard,t=entry.team;
    if(d.curve?.some(p=>!p?.day)||d.milestones?.some(m=>!m?.id)||d.countConflict&&!d.exportCounts||d.C.conflict&&!d.C.cellTotals)return null;
    const v=Object.assign(M.normalize({ok:true,schema:'pa6.dashboard.v2',generated_at:d.generatedAt}),d);
    v.version=v.generatedAt;v.identity=t.person;v.personalAt=t.fetchedAt;v.readOnly=!!as;
    v.role=t.person==='SA'&&t.role==='leitung'&&d.role==='leitung'&&!as?'leitung':'mitglied';
    v.quotas=v.quotas?.filter(q=>q?.age&&typeof q.neobank==='boolean').map(q=>({...q,id:`zelle:${q.age.replace(' bis ','-')}:${q.neobank?'neobank':'keine-neobank'}`}))||null;
    v.gap=v.quotas?.filter(q=>q.n!==null&&q.target>0&&q.missing>0).sort((a,b)=>a.n/a.target-b.n/b.target||b.missing-a.missing||a.id.localeCompare(b.id))[0]||null;
    v.channels=v.channels?.filter(c=>c?.id).map(c=>({...c,label:M.CHANNELS[c.id]}))||null;
    const label=m=>m?{...m,title:m.target!==null?`Rücklauf ${m.target} gültige`:m.kind==='kontrollpunkt'?'Kontrollpunkt':'Meilenstein'}:null;
    v.milestones=v.milestones?.filter(m=>m?.id).map(label)||null;v.next=label(v.next);v.checkpoint=label(v.checkpoint);
    v.states={...v.states,hours:'missing',risks:'missing',confirmations:'missing'};
    v.cached=true;v.ownCounts=t.ownCounts;return v;
  }
  async function slot(access,as,crypto) {
    try {
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(access));
      return PREFIX+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')+':'+(as||'own');
    } catch {return '';}
  }
  const stamp=value=>time(value)?new Intl.DateTimeFormat('de-CH',{timeZone:M.TZ,hour:'2-digit',minute:'2-digit'}).format(new Date(value)):'unbekannt';
  return {PREFIX,get,save,restore,slot,stamp};
});
