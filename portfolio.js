import { createPortfolioUI } from './portfolio-ui.js';

const panels=new Set(['project','about','contact']);
const routeKey=route=>`${route.name}${route.id?`/${route.id}`:''}`;

// One route owner: animation may finish later, but the most recent destination wins.
export function createPortfolio({content,gallery,player,product,homeMaterial,controls,stage,resetView}){
  const projects=content.projects;
  const records=content.records||projects;
  let route={name:'home'},panelStack=[],collectionReturn={name:'home'};
  let renderedKey='',lastMode='',lastIndex=-1,appliedRecord='',needsHomeReset=true;
  let homePlayback=null;
  let scrollDistance=0,lastScrollAt=0;
  const scrollHint=document.querySelector('#home-scroll-hint');
  function resetHomePlayback(){
    homePlayback=null;scrollDistance=lastScrollAt=0;scrollHint.hidden=true;
  }
  const listeners=[];
  const on=(target,event,fn,options)=>{target.addEventListener(event,fn,options);listeners.push(()=>target.removeEventListener(event,fn,options));};
  const valid=(next)=>{
    const value=typeof next==='string'?{name:next}:next;
    if(!['home','projects','record','project','about','contact'].includes(value?.name))return {name:'home'};
    if(['record','project'].includes(value.name)){
      const record=records.find(p=>p.id===value.id);
      if(value.name==='project'&&record?.destination==='about')return {name:'about'};
      return record?{name:value.name,id:value.id}:{name:'projects'};
    }
    return {name:value.name};
  };
  const fromLocation=()=>{
    const [name,id]=location.hash.slice(1).split('/');
    try{return valid({name:decodeURIComponent(name||'home'),id:id?decodeURIComponent(id):undefined});}catch{return {name:'home'};}
  };
  const indexFor=(value=route)=>Math.max(0,records.findIndex(p=>p.id===value.id));
  function navigate(next,{replace=false,fromHistory=false,returning=false}={}){
    if(homePlayback)resetHomePlayback();
    next=valid(next);
    const changed=routeKey(next)!==routeKey(route);
    if(changed){
      if(renderedKey)player.sound(next.name==='record'?'load':'navigate',{wake:!fromHistory});
      if(fromHistory){
        panelStack=Array.isArray(history.state?.panelStack)?history.state.panelStack.map(valid):[];
        collectionReturn=valid(history.state?.collectionReturn||{name:'home'});
      }else if(['about','contact'].includes(next.name)){
        if(!returning)panelStack.push({...route});
      }else panelStack=[];
      if(!fromHistory&&next.name==='projects'&&['home','record'].includes(route.name))collectionReturn={...route};
      if(next.name==='home')needsHomeReset=true;
      route=next;
    }
    if(!fromHistory){
      const hash=`#${routeKey(next)}`;
      if(location.hash!==hash)history[replace?'replaceState':'pushState']({portfolio:true,panelStack:panelStack.map(r=>({...r})),collectionReturn:{...collectionReturn}},'',hash);
    }
    if(changed||!renderedKey)render(true);
    else if(next.name==='home'){needsHomeReset=true;}
  }
  function back(){
    if(route.name==='project'){navigate({name:'projects'});return;}
    if(['about','contact'].includes(route.name)){navigate(panelStack.pop()||{name:'home'},{returning:true});return;}
    if(route.name==='projects'){navigate(collectionReturn);return;}
    navigate({name:'home'});
  }
  function step(delta){
    const index=(projects.findIndex(p=>p.id===route.id)+delta+projects.length)%projects.length;
    navigate({name:'project',id:projects[index].id});
  }
  function startHomePlayback(destination){
    if(route.name!=='home'||destination!=='projects')return;
    if(homePlayback?.destination===destination)return;
    player.setPlaying(true,{sound:true});
    homePlayback={destination};
    scrollDistance=lastScrollAt=0;
    scrollHint.hidden=destination!=='projects';
  }
  function homeMotorChanged(playing){
    if(route.name!=='home')return;
    if(playing)startHomePlayback('projects');else resetHomePlayback();
  }
  function activateRecord(){
    if(['home','record'].includes(route.name))navigate({name:'projects'});
  }
  function openRecord(){
    if(route.name!=='record')return;
    const record=records[indexFor()];
    navigate(record.destination==='about'?{name:'about'}:{name:'project',id:record.id});
  }
  const ui=createPortfolioUI({content,onNavigate:navigate,onBack:back,onProjectStep:step,onRecordOpen:openRecord,
    onPreviewHold:value=>gallery.setPreviewHeld(value),
    onPreviewMove:value=>gallery.movePreview(value),
    onPreviewDrag:value=>gallery.beginPreviewDrag(value),
    onPreviewOpen:value=>{if(gallery.selectPreview(value.slot))navigate({name:'record',id:value.id});}});
  const nav={home:document.querySelector('#nav-home'),projects:document.querySelector('#nav-projects'),about:document.querySelector('#nav-about'),contact:document.querySelector('#nav-contact')};
  for(const [name,button] of Object.entries(nav))on(button,'click',()=>navigate({name}));
  on(document.querySelector('#brand-home'),'click',()=>navigate({name:'home'}));
  on(scrollHint,'click',()=>{if(route.name==='home'&&homePlayback?.destination==='projects')navigate({name:'projects'});});
  const soundToggle=document.querySelector('#sound-toggle');
  function renderSoundToggle(){
    const muted=player.isMuted();
    soundToggle.setAttribute('aria-pressed',String(muted));
    soundToggle.setAttribute('aria-label',muted?'开启声音':'静音');
    soundToggle.title=muted?'开启音效与音乐':'静音音效与音乐';
  }
  renderSoundToggle();
  on(soundToggle,'click',()=>{player.setMuted(!player.isMuted());renderSoundToggle();});
  on(ui.getElement(),'click',e=>{if(e.target.closest('.portfolio-contacts a, .portfolio-collaborate'))player.sound('navigate');});
  const magnetic=[...document.querySelectorAll('#site-header button')].map(el=>({el,x:0,y:0,tx:0,ty:0}));
  const allowMagnet=matchMedia('(hover:hover) and (pointer:fine)').matches&&!matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(allowMagnet)for(const item of magnetic){
    on(item.el,'pointermove',e=>{const r=item.el.getBoundingClientRect();item.tx=(e.clientX-r.left-r.width/2)*.09;item.ty=(e.clientY-r.top-r.height/2)*.14;});
    on(item.el,'pointerleave',()=>{item.tx=item.ty=0;});
    on(item.el,'blur',()=>{item.tx=item.ty=0;});
  }
  function render(focus=false){
    const state=gallery.getState(),panel=panels.has(route.name),index=route.id?indexFor():state.selectedIndex;
    document.body.dataset.view=route.name==='projects'?'gallery':route.name;
    document.body.dataset.route=route.name;
    stage.inert=panel;
    stage.setAttribute('aria-hidden',String(panel));
    stage.style.pointerEvents=panel?'none':'';
    const active=['project','record'].includes(route.name)?'projects':route.name;
    for(const [name,button] of Object.entries(nav)){
      if(name===active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
    ui.render({route:{...route},projectIndex:index,galleryMode:state.mode});
    renderedKey=routeKey(route);lastMode=state.mode;
    if(focus){
      const key=renderedKey;
      let attempts=0;
      const focusVisible=()=>{
        if(renderedKey!==key)return;
        const target=panel?ui.getElement().querySelector('[data-portfolio-title]'):stage;
        if(!target)return;
        if(getComputedStyle(target).visibility==='visible')target.focus({preventScroll:true});
        else if(attempts++<60)requestAnimationFrame(focusVisible);
      };
      requestAnimationFrame(focusVisible);
    }
    document.title='FAFA RECORDS';
  }
  function update(dt){
    let state=gallery.getState();
    const wantsGallery=route.name==='projects';
    // About/contact cover the current composition. Details keep the chosen record ready underneath.
    const preserveStage=['about','contact'].includes(route.name);
    if(!preserveStage){
      if(wantsGallery&&state.mode==='machine')gallery.open();
      else if(!wantsGallery&&state.mode==='gallery')gallery.close();
    }
    state=gallery.getState();
    const blocked=panels.has(route.name)||document.hidden;
    gallery.setSuspended(route.name!=='projects'||document.hidden);
    player.setBrowsing(blocked||state.mode!=='machine');
    controls.enabled=!blocked&&state.mode==='machine'&&player.canOrbit();
    if(state.mode==='machine'){
      if(route.name==='home'&&needsHomeReset){
        gallery.setIndex(records.findIndex(record=>record.original));
        gallery.resetAppearance();
        product.record.getObjectByName('Printed record label').material=homeMaterial;
        product.record.rotation.z=0;resetView();needsHomeReset=false;appliedRecord='';
      }else if(['record','project'].includes(route.name)&&appliedRecord!==route.id){
        gallery.setIndex(indexFor());
        appliedRecord=route.id;
      }
    }
    if(lastMode!==state.mode||renderedKey!==routeKey(route))render();
    if(lastIndex!==state.selectedIndex){lastIndex=state.selectedIndex;ui.setGalleryIndex(lastIndex);}
    ui.setGalleryPreview(route.name==='projects'&&!document.hidden?gallery.getPreview():null);
    if(allowMagnet)for(const item of magnetic){
      const t=1-Math.exp(-16*Math.min(dt,.1));item.x+=(item.tx-item.x)*t;item.y+=(item.ty-item.y)*t;
      const translate=`${item.x.toFixed(2)}px ${item.y.toFixed(2)}px`;
      if(item.applied!==translate){item.el.style.translate=translate;item.applied=translate;}
    }
  }
  on(window,'popstate',()=>navigate(fromLocation(),{fromHistory:true}));
  on(window,'hashchange',()=>navigate(fromLocation(),{fromHistory:true}));
  // Capture before OrbitControls: a playing home record uses the wheel to enter the collection.
  on(window,'wheel',e=>{
    if(route.name!=='home'||homePlayback?.destination!=='projects'||document.hidden||e.ctrlKey||e.metaKey)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(e.deltaY<=0||Math.abs(e.deltaX)>Math.abs(e.deltaY)){scrollDistance=0;return;}
    const now=performance.now();
    if(now-lastScrollAt>180)scrollDistance=0;
    lastScrollAt=now;
    scrollDistance+=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
    if(scrollDistance>=40)navigate({name:'projects'});
  },{capture:true,passive:false});
  on(window,'keydown',e=>{
    if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||e.target.closest('input,textarea,select,video'))return;
    if(e.key==='Tab'&&!e.shiftKey&&e.target===stage&&route.name==='projects'&&ui.focusGalleryPreview()){
      e.preventDefault();
    }else if(e.key==='Tab'&&e.shiftKey&&route.name==='projects'&&e.target.closest('.portfolio-gallery-preview')){
      e.preventDefault();stage.focus({preventScroll:true});
    }else if(e.key==='Escape'&&route.name!=='home'){
      e.preventDefault();back();
    }else if(route.name==='project'&&['ArrowLeft','ArrowRight'].includes(e.key)){
      e.preventDefault();step(e.key==='ArrowRight'?1:-1);
    }else if(route.name==='record'&&e.key==='Enter'&&e.target===stage){
      e.preventDefault();openRecord();
    }else if(route.name==='home'&&e.key==='Enter'&&e.target===stage){
      e.preventDefault();startHomePlayback('projects');
    }else if(route.name==='home'&&e.key==='PageDown'&&e.target===stage&&homePlayback?.destination==='projects'){
      e.preventDefault();navigate({name:'projects'});
    }
  });
  on(document,'visibilitychange',()=>{if(document.hidden){
    if(homePlayback){resetHomePlayback();player.setPlaying(false);}
    player.setBrowsing(true);
  }});
  let initial;
  try{initial=fromLocation();}catch{initial={name:'home'};}
  navigate(initial,{replace:true});
  return {navigate,back,update,startHomePlayback,homeMotorChanged,activateRecord,
    select({id}){navigate({name:'record',id});},
    getState:()=>({route:{...route},panel:panels.has(route.name),projectIndex:route.id?indexFor():gallery.getState().selectedIndex}),
    dispose(){listeners.forEach(off=>off());ui.dispose();}
  };
}
