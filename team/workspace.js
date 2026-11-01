'use strict';
(() => {
  const area=location.pathname.includes('/team/b')?'b':'c',container=document.getElementById('workspace-progress');
  async function refresh(){
    if(!schluessel())return;
    try{
      const data=await sende({typ:'team'}),module=(data.areas||[]).find(row=>row.id===area);
      if(area==='c'&&data.practice?.total){container.replaceChildren(el('a',{href:'../?view=tasks&area=c'},'Meine Arbeit / Bewertungen codieren'),el('p',{},'Probe: '+data.practice.done+' von '+data.practice.total+' · zählt nicht zur Erhebung'),el('p',{},module?.state==='ready'?'Erhebung: '+module.done+' von '+module.total+' Bewertungen':'Erhebung: noch keine Bewertungen zugeteilt. Ziehung am 03.11.'));return;}
      if(!module){container.replaceChildren(el('p',{},'Bereichsstand noch unbekannt.'));return;}
      const text=module.state==='ready'?module.done+' von '+module.total+(area==='b'?' Kontakten':' Bewertungen · Soll bis heute '+module.expected):'Bereichsstand unbekannt';
      container.replaceChildren(el('a',{href:'../?view=tasks&area='+area},'Meine Arbeit / '+module.title),el('div',{class:'workspace-meter'},el('span',{},text),el('progress',{max:Math.max(1,module.total||0),value:module.done||0,'aria-label':text})),
        ...(data.blockers||[]).filter(b=>b.area===area).map(b=>el('p',{},'Hier hängt es: '+b.text+' ',el('a',{href:'../frag/?q='+encodeURIComponent(b.question)+'&ctx='+encodeURIComponent(b.ctx)},'Pia hilft'))));
    }catch{container.replaceChildren(el('p',{},'Bereichsstand gerade nicht erreichbar.'));}
  }
  refresh();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  window.addEventListener('workspace-saved',refresh);
})();
