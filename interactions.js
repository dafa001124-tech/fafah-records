import * as THREE from 'three';
import { createTurntableAudio } from './audio.js';

const clamp=THREE.MathUtils.clamp;
const damp=(from,to,rate,dt)=>THREE.MathUtils.damp(from,to,rate,dt);
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));

export function createPlayer({renderer,camera,controls,product,onRecordClick,onMotorToggle}){
  const canvas=renderer.domElement;
  const audio=createTurntableAudio();
  const raycaster=new THREE.Raycaster();
  const pointer=new THREE.Vector2();
  const armPlane=new THREE.Plane(new THREE.Vector3(0,0,1),-.435);
  const touches=new Map();
  const state={motor:false,speed:0,armAngle:0,lift:1,contact:0,volume:.35};
  let cueUp=true,gesture=null,pinch=null,hadMultiple=false,wasContact=false,browsing=false;
  const hasRecordAction=typeof onRecordClick==='function';
  const listeners=[];
  const on=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options));};
  const bounds=()=>canvas.getBoundingClientRect();
  const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
  const wakeAudio=()=>Promise.resolve(audio.unlock()).catch(()=>{});

  function setRay(x,y){
    const rect=bounds();pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    camera.updateMatrixWorld();product.group.updateMatrixWorld(true);raycaster.setFromCamera(pointer,camera);
  }
  function screen(point){
    const rect=bounds(),p=point.clone().project(camera);
    return new THREE.Vector2(rect.left+(p.x+1)*rect.width/2,rect.top+(1-p.y)*rect.height/2);
  }
  function distanceToSegment(p,a,b){
    const line=b.clone().sub(a),t=clamp(p.clone().sub(a).dot(line)/Math.max(line.lengthSq(),.0001),0,1);
    return p.distanceTo(a.addScaledVector(line,t));
  }
  function pick(x,y,touch=false){
    setRay(x,y);
    // A small screen-space allowance makes slender physical parts usable on a phone.
    // Only the front of the cabinet gets that allowance; rear parts remain occluded.
    if(camera.position.z>.6){
      const p=new THREE.Vector2(x,y);
      const knob=screen(product.volumeKnob.localToWorld(new THREE.Vector3(0,0,.06)));
      if(p.distanceTo(knob)<(touch?22:15))return 'volume';
      const motor=screen(product.motorPulley.localToWorld(new THREE.Vector3(0,0,.06)));
      if(p.distanceTo(motor)<(touch?24:18))return 'motor';
      const a=screen(product.tonearm.localToWorld(new THREE.Vector3(0,.18,0)));
      const b=screen(product.tonearm.localToWorld(new THREE.Vector3(-.01,2.16,0)));
      if(distanceToSegment(p,a,b)<(touch?15:8))return 'tonearm';
    }
    const hit=raycaster.intersectObject(product.group,true)[0];
    if(!hit)return null;
    let node=hit.object;
    while(node&&node!==product.group){if(node.userData.interaction)return node.userData.interaction;node=node.parent;}
    return null;
  }
  function pointerAngle(x,y){
    setRay(x,y);
    const point=raycaster.ray.intersectPlane(armPlane,new THREE.Vector3());
    return point?Math.atan2(point.y-.84,point.x+1.09):null;
  }
  function stylusRadius(){
    product.tonearm.updateMatrixWorld(true);
    // Gallery transitions move the whole machine; groove contact is local to it.
    const p=product.group.worldToLocal(product.stylus.getWorldPosition(new THREE.Vector3()));
    return Math.hypot(p.x,p.y-2.49);
  }
  function overGroove(){const r=stylusRadius();return r>=.56&&r<=1.48;}
  function setPlaying(playing,{sound=false}={}){
    const changed=state.motor!==Boolean(playing);
    state.motor=Boolean(playing);
    if(changed&&sound)audio.effect(state.motor?'switchOn':'switchOff');
    if(state.motor){
      // Clicking a parked record cues the outer playing area as a useful one-step start.
      if(!overGroove())state.armAngle=0;
      cueUp=false;
    }
    if(state.motor)wakeAudio();
  }
  function toggleMotor(){
    setPlaying(!state.motor,{sound:true});
    onMotorToggle?.(state.motor);
  }
  function updateCursor(kind){canvas.style.cursor=['record','motor'].includes(kind)?'pointer':'grab';}
  function startGesture(e,kind){
    gesture={id:e.pointerId,kind,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false,
      volume:state.volume,armAngle:state.armAngle,angle:pointerAngle(e.clientX,e.clientY),cueUp};
    if(kind==='tonearm'){cueUp=true;audio.effect('lift');}
    if(kind!=='orbit'&&(kind!=='record'||!hasRecordAction))wakeAudio();
    controls.enabled=false;canvas.style.cursor=kind==='volume'?'ns-resize':'grabbing';
    canvas.setPointerCapture(e.pointerId);
  }
  function orbitBy(dx,dy){
    const offset=camera.position.clone().sub(controls.target),spherical=new THREE.Spherical().setFromVector3(offset);
    const height=bounds().height;
    spherical.theta-=dx/height*Math.PI*2*controls.rotateSpeed;
    spherical.phi=clamp(spherical.phi-dy/height*Math.PI*2*controls.rotateSpeed,controls.minPolarAngle,controls.maxPolarAngle);
    spherical.makeSafe();camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    controls.update();
  }
  function moveGesture(e){
    if(!gesture||gesture.id!==e.pointerId)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(Math.hypot(dx,dy)>5)gesture.moved=true;
    // A record is both a click target and the largest surface for rotating the machine.
    if(gesture.kind==='record'&&gesture.moved)gesture.kind='orbit';
    if(gesture.kind==='volume')setVolume(gesture.volume+(dx-dy)/180);
    if(gesture.kind==='tonearm'){
      const angle=pointerAngle(e.clientX,e.clientY);
      if(angle!==null&&gesture.angle!==null)state.armAngle=clamp(gesture.armAngle+wrapAngle(angle-gesture.angle),-.34,.28);
    }
    if(gesture.kind==='orbit')orbitBy(e.clientX-gesture.lastX,e.clientY-gesture.lastY);
    gesture.lastX=e.clientX;gesture.lastY=e.clientY;
  }
  function setVolume(value){
    const previous=state.volume;
    state.volume=clamp(value,0,1);audio.update({volume:state.volume});
    if(Math.round(previous*20)!==Math.round(state.volume*20))audio.effect('dial');
  }
  function endGesture(cancelled=false){
    if(!gesture)return;
    const g=gesture;gesture=null;
    if(g.kind==='tonearm'){
      if(cancelled){state.armAngle=g.armAngle;cueUp=g.cueUp;}
      else {
        cueUp=g.moved?!overGroove():!g.cueUp;
        if(!cueUp&&overGroove())state.motor=true;
      }
    }
    if(canvas.hasPointerCapture(g.id))canvas.releasePointerCapture(g.id);
    controls.enabled=!browsing&&touches.size===0;
    if(!browsing)updateCursor(null);
    // Finish this pointer sequence before handing ownership to the gallery.
    if(g.kind==='record'&&!cancelled&&!g.moved){
      if(hasRecordAction)onRecordClick();else toggleMotor();
    }
    if(g.kind==='motor'&&!cancelled&&!g.moved)toggleMotor();
  }
  function startPinch(){
    endGesture(true);hadMultiple=true;controls.enabled=false;
    const [a,b]=[...touches.values()];
    if(a&&b)pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),radius:camera.position.distanceTo(controls.target)};
  }
  function movePinch(){
    const [a,b]=[...touches.values()];
    if(!a||!b||!pinch)return;
    const distance=Math.max(10,Math.hypot(a.x-b.x,a.y-b.y));
    const radius=clamp(pinch.radius*pinch.distance/distance,controls.minDistance,controls.maxDistance);
    camera.position.sub(controls.target).setLength(radius).add(controls.target);controls.update();
  }
  on(canvas,'pointerdown',e=>{
    if(browsing)return;
    canvas.parentElement.focus({preventScroll:true});
    if(e.pointerType==='touch'){
      stop(e);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      canvas.setPointerCapture(e.pointerId);
      if(touches.size>=2){startPinch();return;}
      hadMultiple=false;startGesture(e,pick(e.clientX,e.clientY,true)||'orbit');return;
    }
    if(e.button!==0||gesture)return;
    const kind=pick(e.clientX,e.clientY);
    if(kind){stop(e);startGesture(e,kind);}
  },{capture:true,passive:false});
  on(canvas,'pointermove',e=>{
    if(browsing)return;
    if(e.pointerType==='touch'){
      if(!touches.has(e.pointerId))return;
      stop(e);touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(touches.size>=2)movePinch();else if(!hadMultiple)moveGesture(e);return;
    }
    if(gesture?.id===e.pointerId){stop(e);moveGesture(e);}
    else if(e.buttons===0)updateCursor(pick(e.clientX,e.clientY));
  },{capture:true,passive:false});
  function finishPointer(e,cancelled){
    if(browsing)return;
    if(e.pointerType==='touch'){
      if(!touches.has(e.pointerId))return;
      stop(e);touches.delete(e.pointerId);
      if(gesture?.id===e.pointerId)endGesture(cancelled||hadMultiple);
      if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
      if(touches.size===0){
        pinch=null;hadMultiple=false;controls.enabled=!browsing;
        if(!browsing)updateCursor(null);
      }
      return;
    }
    if(gesture?.id===e.pointerId){stop(e);endGesture(cancelled);}
  }
  on(canvas,'pointerup',e=>finishPointer(e,false),{capture:true,passive:false});
  on(canvas,'pointercancel',e=>finishPointer(e,true),{capture:true,passive:false});
  on(canvas,'lostpointercapture',e=>{
    if(browsing)return;
    if(gesture?.id===e.pointerId)endGesture(true);
  });
  on(window,'blur',()=>{
    if(browsing)return;
    endGesture(true);touches.clear();pinch=null;controls.enabled=true;
  });
  on(canvas,'contextmenu',e=>e.preventDefault());
  on(canvas,'wheel',e=>{if(!browsing&&gesture)stop(e);},{capture:true,passive:false});
  // Invisible keyboard access keeps the presentation clean while preserving operation.
  on(canvas.parentElement,'keydown',e=>{
    if(browsing)return;
    if(e.code==='Space'){e.preventDefault();if(!e.repeat)toggleMotor();}
    if(e.key==='ArrowUp'||e.key==='ArrowDown'){
      e.preventDefault();setVolume(state.volume+(e.key==='ArrowUp'?.05:-.05));wakeAudio();
    }
  });
  function setBrowsing(next){
    next=Boolean(next);
    if(browsing===next)return;
    browsing=next;
    if(browsing){
      // Browsing only locks the physical controls. Keep the transport running
      // so the same audio source continues through gallery and page changes.
      endGesture(true);
      for(const id of touches.keys())if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
      touches.clear();pinch=null;hadMultiple=false;
      controls.enabled=false;
    }else{
      controls.enabled=true;updateCursor(null);
    }
  }
  function update(dt){
    if(document.hidden)return;
    dt=Math.min(dt,.05);
    state.speed=damp(state.speed,state.motor?1:0,state.motor?1.45:1.7,dt);
    if(!state.motor&&state.speed<.001)state.speed=0;
    product.record.rotation.z=(product.record.rotation.z-state.speed*3.4906585*dt)%(Math.PI*2);
    product.motorPulley.rotation.z=(product.motorPulley.rotation.z-state.speed*3.4906585*(1.52/.215)*dt)%(Math.PI*2);
    product.motorPulley.position.z=damp(product.motorPulley.position.z,gesture?.kind==='motor'?.316:.330,30,dt);
    product.tonearm.rotation.z=damp(product.tonearm.rotation.z,state.armAngle,gesture?.kind==='tonearm'?24:5,dt);
    const shouldLift=cueUp||gesture?.kind==='tonearm'||!overGroove()||(!state.motor&&state.speed<.18);
    state.lift=damp(state.lift,shouldLift?1:0,shouldLift?12:5,dt);
    product.tonearm.rotation.x=state.lift*.035;
    product.volumeKnob.rotation.z=damp(product.volumeKnob.rotation.z,(.5-state.volume)*Math.PI*1.5,18,dt);
    // The stylus only conducts once it has actually reached the record surface.
    state.contact=overGroove()?1-THREE.MathUtils.smoothstep(state.lift,.03,.28):0;
    if(shouldLift)state.contact=0;
    const touching=state.contact>.6&&state.speed>.12;
    if(touching&&!wasContact)audio.needle();
    wasContact=touching;
    audio.update({speed:state.speed,contact:state.contact,volume:state.volume});
  }
  update(0);
  return {
    update,
    setBrowsing,
    setPlaying,
    sound:audio.effect,
    prepareSound:audio.activate,
    setMuted:audio.setMuted,
    isMuted:()=>audio.getState().muted,
    canOrbit:()=>!browsing&&!gesture&&touches.size===0,
    getState:()=>({...state,cueUp,browsing,dragging:gesture?.kind??null,stylusRadius:stylusRadius(),audio:audio.getState()}),
    dispose(){endGesture(true);listeners.forEach(off=>off());audio.dispose();controls.enabled=true;},
  };
}
