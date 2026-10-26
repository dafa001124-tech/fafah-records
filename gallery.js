import * as THREE from 'three';
import { createRecordFinish, attachRecordFinish } from './record-finish.js';

const clamp=THREE.MathUtils.clamp;
const modulo=(n,m)=>((n%m)+m)%m;
const radians=THREE.MathUtils.degToRad;
const ease=t=>t*t*(3-2*t);
const fitDistance=a=>a<.75?Math.max(10,8.6/a):a<1.2?10.5:9.6;
const UNIT=.01, BASE_RADIUS=800*UNIT, CENTER_Y=2.49;
// Leave visible air between adjacent discs throughout the rotating collection.
const GALLERY_DISC_FILL=.64;

// Exact mass-one spring integration keeps the drag response independent of FPS.
function spring(value){return {value,target:value,velocity:0};}
function advance(s,dt,stiffness,damping){
  const q=Math.sqrt(damping*damping-4*stiffness);
  const a=(-damping+q)/2,b=(-damping-q)/2;
  const y=s.value-s.target,A=(s.velocity-b*y)/(a-b),B=y-A;
  s.value=s.target+A*Math.exp(a*dt)+B*Math.exp(b*dt);
  s.velocity=a*A*Math.exp(a*dt)+b*B*Math.exp(b*dt);
}
// CSS ease-in-out, used by the small, staggered vertical motion in the reference.
function bobEase(x){
  let t=x;
  for(let i=0;i<5;i++){
    const u=1-t,px=3*u*u*t*.42+3*u*t*t*.58+t*t*t;
    const derivative=3*u*u*.42+6*u*t*(.58-.42)+3*t*t*(1-.58);
    t=clamp(t-(px-x)/derivative,0,1);
  }
  return 3*(1-t)*t*t+t*t*t;
}

export function createRecordGallery({scene,renderer,camera,controls,product,player,shadow,entries,onSelect=()=>{},onExit=()=>{}}){
  const canvas=renderer.domElement,root=new THREE.Group();
  root.name='Floating record collection';root.visible=false;scene.add(root);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const slotCount=entries.length*2,halfSlots=entries.length,SLOT_ANGLE=360/slotCount;
  const HOME_ANGLE=halfSlots*SLOT_ANGLE,RADIUS=BASE_RADIUS*slotCount/10;
  const appearanceNames=['Vinyl playing surface','Vinyl reverse playing surface','Printed record label'];
  const originalAppearance=appearanceNames.map(name=>{
    const mesh=product.record.getObjectByName(name);
    return {mesh,material:mesh.material,visible:mesh.visible};
  });
  const finishMaterial=createRecordFinish();
  const finishGeometry=new THREE.RingGeometry(.022,1.514,256);
  const machineFinish=attachRecordFinish(product.record,finishMaterial,finishGeometry);
  const machineArtwork=originalAppearance.filter(({mesh})=>mesh.name!=='Printed record label').map(({mesh,material})=>{
    const label=new THREE.Mesh(finishGeometry,material);
    label.name='Original-colour centre artwork';label.position.z=.0016;label.visible=false;
    mesh.add(label);return label;
  });
  function resetAppearance(){
    for(const {mesh,material,visible} of originalAppearance){mesh.material=material;mesh.visible=visible;}
    machineFinish.forEach(mesh=>{mesh.visible=false;});
    machineArtwork.forEach(mesh=>{mesh.visible=false;});
  }
  function applyEntryAppearance(index){
    resetAppearance();
    const entry=entries[index];
    machineFinish.forEach(mesh=>{mesh.visible=entry.fullFace&&!entry.blackVinyl;});
    machineArtwork.forEach(mesh=>{mesh.visible=entry.blackVinyl;if(entry.blackVinyl)mesh.material=entry.material;});
    for(const {mesh} of originalAppearance){
      if(mesh.name==='Printed record label'){
        if(entry.fullFace)mesh.visible=false;
        else mesh.material=entry.material;
      }else if(entry.fullFace&&!entry.blackVinyl)mesh.material=entry.material;
    }
  }
  const ownedMaterials=[];
  const edgeProfile=new THREE.TorusGeometry(1.511,.009,12,256);
  const holeProfile=new THREE.TorusGeometry(.025,.004,8,64);
  const labelGeometry=new THREE.RingGeometry(.022,.514,128);
  const surfaceGeometry=new THREE.RingGeometry(.022,1.514,256);
  const bodyGeometry=new THREE.CylinderGeometry(1.52,1.52,.026,256,1,true);
  // Each design appears twice, with uniform spacing around the full ring.
  const records=Array.from({length:slotCount},(_,slotIndex)=>{
    const recordIndex=slotIndex%entries.length,entry=entries[recordIndex];
    const record=product.record.clone(true),remove=[];
    record.name=`Collection record ${entry.id} / ${slotIndex}`;
    record.userData={recordIndex,slotIndex,bob:0,opacity:1};
    record.position.set(0,0,0);record.rotation.set(0,0,0);
    record.traverse(o=>{
      if(o.material?.userData.recordFinish)o.visible=Boolean(entry.fullFace&&!entry.blackVinyl);
      if(o.name==='Original-colour centre artwork'){o.visible=entry.blackVinyl;if(entry.blackVinyl)o.material=entry.material;}
      if(o.name.startsWith('Record clamp'))remove.push(o);
      if(o.name==='Printed record label'){
        if(entry.fullFace)remove.push(o);
        else {o.material=entry.material;o.geometry=labelGeometry;}
      }
      if(o.name==='Vinyl playing surface'||o.name==='Vinyl reverse playing surface'){
        o.geometry=surfaceGeometry;
        if(entry.fullFace&&!entry.blackVinyl)o.material=entry.material;
      }
      if(o.name==='Vinyl record body')o.geometry=bodyGeometry;
      if(o.name==='Record edge bead')o.geometry=edgeProfile;
      if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}
    });
    remove.forEach(o=>o.removeFromParent());
    // Put the actual playing surface on the ring, rather than its mounting axis.
    record.children.forEach(o=>o.position.z-=.3);
    const hole=new THREE.Mesh(holeProfile,record.getObjectByName('Record edge bead').material);
    hole.name='Pressed spindle-hole lip';hole.position.z=-.001;record.add(hole);
    const materials=new Map();
    record.traverse(o=>{
      if(!o.isMesh)return;
      if(!materials.has(o.material)){
        const material=o.material.clone();materials.set(o.material,material);ownedMaterials.push(material);
      }
      o.material=materials.get(o.material);
    });
    record.userData.materials=[...materials.values()];
    root.add(record);return record;
  });
  const touchDevice=matchMedia('(pointer: coarse)').matches;
  const finePointer=matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const angle=spring(HOME_ANGLE),radius=spring(RADIUS),tiltX=spring(0),tiltY=spring(0);
  const tiltQuaternion=new THREE.Quaternion(),axisQuaternion=new THREE.Quaternion();
  let mode='machine',selectedIndex=0,selectedSlot=halfSlots,progress=0,elapsed=0;
  let saved=null,closing=null,drag=null,activeTouch=touchDevice,suspended=false,hasOpened=false;
  let rememberedAngle=null;
  let previewSlot=null,previewSource='',previewHeld=false,previewInside=false,previewPointer=null;
  let previewLeaveAt=0,previewCheckedAt=0,previewTouchReadyAt=0;
  const previewPoint=new THREE.Vector3(),previewNormal=new THREE.Vector3(),previewToCamera=new THREE.Vector3();
  const touches=new Set();let multiple=false;
  const baseGroupPosition=product.group.position.clone(),shadowOpacity=shadow.material.opacity;
  const galleryTarget=new THREE.Vector3(0,CENTER_Y,0);
  const off=[];
  const on=(target,type,fn,options)=>{target.addEventListener(type,fn,options);off.push(()=>target.removeEventListener(type,fn,options));};
  const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
  let cachedMetrics;
  function metrics(){
    if(cachedMetrics)return cachedMetrics;
    const rect=canvas.getBoundingClientRect();
    const perspectivePx=rect.width<810?770:800;
    // Expand the circumference for extra designs without shrinking the central disc on screen.
    const sizeCompensation=(perspectivePx*UNIT+RADIUS)/(perspectivePx*UNIT+BASE_RADIUS);
    return cachedMetrics={rect,perspectivePx,scale:800*(perspectivePx/1200)*GALLERY_DISC_FILL*UNIT/3.04*sizeCompensation,
      fov:THREE.MathUtils.radToDeg(2*Math.atan(rect.height/(2*perspectivePx))),
      camera:new THREE.Vector3(0,CENTER_Y,perspectivePx*UNIT)};
  }
  function opacity(record,value){
    if(Math.abs(record.userData.opacity-value)<.0001)return;
    record.userData.opacity=value;
    for(const material of record.userData.materials){
      if(material.userData.recordFinish){material.uniforms.opacity.value=value;continue;}
      const transparent=value<.999;
      if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
      material.opacity=value;material.depthWrite=!transparent;
    }
  }
  function clearDrag(){
    const ids=[...touches];if(drag)ids.push(drag.id);drag=null;touches.clear();multiple=false;
    ids.forEach(id=>{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);});
  }
  function settleAngle(){
    angle.target=Math.round(angle.target/SLOT_ANGLE)*SLOT_ANGLE;
    tiltX.target=tiltY.target=0;
  }
  function clearPreview(){
    previewSlot=null;previewSource='';previewHeld=false;previewInside=false;previewPointer=null;
    previewLeaveAt=previewCheckedAt=0;
    previewTouchReadyAt=performance.now()+180;
  }
  function setPreviewHeld(value){
    previewHeld=Boolean(value)&&mode==='gallery'&&!suspended&&previewSlot!==null;
    // Preserve the target while crossing from the canvas to the floating control.
    if(!previewHeld&&!previewInside)previewLeaveAt=performance.now()+60;
  }
  function movePreview({x,y}){
    if(mode!=='gallery'||suspended||drag||touches.size||!finePointer.matches)return;
    if(!Number.isFinite(x)||!Number.isFinite(y))return;
    previewSlot=pick(x,y);previewSource='hover';previewInside=true;
    previewPointer={x,y};previewCheckedAt=performance.now();
  }
  function getPreview(){
    if(mode!=='gallery'||suspended||drag||touches.size||multiple)return null;
    const now=performance.now();
    if((touchDevice||activeTouch)&&!previewHeld&&previewSource!=='keyboard'){
      if(now<previewTouchReadyAt||Math.abs(angle.velocity)>40||Math.abs(angle.target-angle.value)>SLOT_ANGLE*.4)return null;
      previewSlot=selectedSlot;previewSource='touch';previewInside=false;previewPointer=null;
    }
    if(previewSlot===null)return null;
    if(previewSource==='hover'&&!previewHeld){
      if(!previewInside&&now>previewLeaveAt){clearPreview();return null;}
      // Recheck a stationary pointer against the gently moving record, at a bounded rate.
      if(previewInside&&previewPointer&&now-previewCheckedAt>80){
        previewCheckedAt=now;
        previewSlot=pick(previewPointer.x,previewPointer.y);
        if(previewSlot===null)return null;
      }
    }
    const record=records[previewSlot],rect=metrics().rect;
    if(!record?.visible||!rect.width||!rect.height)return null;
    previewNormal.set(0,0,1).applyQuaternion(record.quaternion);
    previewToCamera.copy(camera.position).sub(record.position);
    if(previewNormal.dot(previewToCamera)<=0)return null;
    previewPoint.set(0,0,0).applyMatrix4(record.matrixWorld).project(camera);
    if(![previewPoint.x,previewPoint.y,previewPoint.z].every(Number.isFinite)||previewPoint.z< -1||previewPoint.z>1)return null;
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(let i=0;i<16;i++){
      const theta=i*Math.PI/8;
      previewPoint.set(Math.cos(theta)*1.52,Math.sin(theta)*1.52,0).applyMatrix4(record.matrixWorld).project(camera);
      const x=rect.left+(previewPoint.x+1)*rect.width/2,y=rect.top+(1-previewPoint.y)*rect.height/2;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<rect.left||left>rect.right||bottom<rect.top||top>rect.bottom)return null;
    previewPoint.set(0,0,0).applyMatrix4(record.matrixWorld).project(camera);
    const x=rect.left+(previewPoint.x+1)*rect.width/2,centerY=rect.top+(1-previewPoint.y)*rect.height/2;
    previewPoint.set(0,-.94,0).applyMatrix4(record.matrixWorld).project(camera);
    const y=rect.top+(1-previewPoint.y)*rect.height/2,index=record.userData.recordIndex;
    const followsPointer=previewSource==='hover'&&previewPointer;
    return {index,id:entries[index].id,slot:previewSlot,
      x:followsPointer?previewPointer.x+18:x,y:followsPointer?previewPointer.y+12:y,
      centerY,width:right-left,height:bottom-top,
      left,right,top,bottom,source:previewSource};
  }
  function open(){
    if(mode!=='machine')return;
    clearPreview();
    player.setBrowsing(true);controls.enabled=false;
    const damping=controls.enableDamping,position=camera.position.clone(),target=controls.target.clone();
    controls.enableDamping=false;controls.update();
    camera.position.copy(position);controls.target.copy(target);controls.update();controls.enableDamping=damping;
    product.group.updateMatrixWorld(true);
    saved={camera:camera.position.clone(),target:controls.target.clone(),aspect:camera.aspect,fov:camera.fov,
      position:product.record.localToWorld(new THREE.Vector3(0,0,.3)),
      quaternion:product.record.getWorldQuaternion(new THREE.Quaternion()),
      scale:product.record.getWorldScale(new THREE.Vector3())};
    selectedSlot=hasOpened?selectedSlot:selectedIndex+halfSlots;
    angle.target=rememberedAngle??selectedSlot*SLOT_ANGLE;
    angle.value=angle.target+(reducedMotion||hasOpened?0:90);angle.velocity=0;hasOpened=true;
    radius.target=RADIUS;radius.value=RADIUS*(reducedMotion?1:1.8);radius.velocity=0;
    for(const s of [tiltX,tiltY])s.value=s.target=s.velocity=0;
    elapsed=0;progress=0;closing=null;mode='opening';root.visible=true;
    product.record.visible=false;canvas.style.cursor='grab';applyLayout();
  }
  function select(slot,notify=true){
    if(mode!=='gallery')return;
    clearPreview();
    selectedSlot=modulo(slot,records.length);selectedIndex=selectedSlot%entries.length;
    rememberedAngle=angle.value;
    const chosen=records[selectedSlot];
    closing={position:chosen.position.clone(),quaternion:chosen.quaternion.clone(),scale:chosen.scale.clone(),
      camera:camera.position.clone(),target:controls.target.clone(),fov:camera.fov};
    mode='closing';clearDrag();canvas.style.cursor='default';
    applyEntryAppearance(selectedIndex);
    if(notify)onSelect({index:selectedIndex,id:entries[selectedIndex].id});
  }
  function finishClose(){
    root.visible=false;product.group.visible=true;product.group.position.copy(baseGroupPosition);
    product.record.visible=true;shadow.visible=true;shadow.material.opacity=shadowOpacity;
    camera.position.copy(saved.camera);camera.fov=saved.fov;camera.updateProjectionMatrix();
    controls.target.copy(saved.target);camera.lookAt(controls.target);
    const damping=controls.enableDamping;controls.enableDamping=false;controls.update();controls.enableDamping=damping;
    mode='machine';progress=0;player.setBrowsing(false);canvas.style.cursor='grab';
  }
  const layoutPosition=new THREE.Vector3(),layoutQuaternion=new THREE.Quaternion();
  const layoutScale=new THREE.Vector3(),layoutEuler=new THREE.Euler();
  const layoutResult={position:layoutPosition,quaternion:layoutQuaternion,scale:1};
  function layout(slot,scale){
    const theta=radians(angle.value-slot*SLOT_ANGLE);
    const time=Math.max(0,elapsed-1.2-slot*.08),duration=2.8+slot*.08;
    const phase=(time%duration)/duration;
    const bob=reducedMotion?0:.1*bobEase(phase<.5?phase*2:2-phase*2);
    const position=layoutPosition.set(-radius.value*Math.sin(theta),bob,-radius.value*Math.cos(theta));
    position.applyQuaternion(tiltQuaternion).add(galleryTarget);
    layoutQuaternion.copy(axisQuaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,theta)).premultiply(tiltQuaternion);
    records[slot].userData.bob=bob;
    layoutResult.scale=scale;return layoutResult;
  }
  function applyLayout(){
    if(!saved)return;
    const p=ease(progress),m=metrics();
    product.group.position.copy(baseGroupPosition);product.group.position.y-=8*p*p;
    product.group.visible=progress<.999;
    shadow.material.opacity=shadowOpacity*Math.pow(1-p,3);shadow.visible=progress<.999;
    camera.position.lerpVectors(saved.camera,closing?.camera??m.camera,p);
    controls.target.lerpVectors(saved.target,closing?.target??galleryTarget,p);
    camera.fov=THREE.MathUtils.lerp(saved.fov,closing?.fov??m.fov,p);
    camera.updateProjectionMatrix();camera.lookAt(controls.target);camera.updateMatrixWorld();
    tiltQuaternion.setFromEuler(layoutEuler.set(radians(tiltX.value),radians(tiltY.value),0,'XYZ'));
    records.forEach((record,slot)=>{
      const target=layout(slot,m.scale);
      record.visible=true;
      if(slot===selectedSlot&&mode!=='gallery'){
        record.position.lerpVectors(saved.position,closing?.position??target.position,p);
        record.quaternion.copy(saved.quaternion).slerp(closing?.quaternion??target.quaternion,p);
        record.scale.copy(saved.scale).lerp(closing?.scale??layoutScale.setScalar(target.scale),p);
        opacity(record,1);
      }else{
        record.position.copy(target.position);record.quaternion.copy(target.quaternion);record.scale.setScalar(target.scale);
        const alpha=mode==='closing'?ease(clamp((progress-.65)/.35,0,1)):mode==='opening'?1-Math.pow(1-clamp((elapsed-.18)/.6,0,1),3):1;
        opacity(record,alpha);record.visible=alpha>.001;
      }
    });
    root.updateMatrixWorld(true);
  }
  function pick(x,y){
    const rect=canvas.getBoundingClientRect();pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    root.updateMatrixWorld(true);camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
    let nearest=Infinity,selected=null;
    for(const record of records){
      if(!record.visible)continue;
      const center=record.position,normal=new THREE.Vector3(0,0,1).applyQuaternion(record.quaternion);
      if(normal.dot(raycaster.ray.direction)>=0)continue;
      const hit=raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal,center),new THREE.Vector3());
      if(!hit)continue;
      const local=record.worldToLocal(hit.clone()),distance=raycaster.ray.origin.distanceToSquared(hit);
      if(Math.hypot(local.x,local.y)<=1.52&&distance<nearest){nearest=distance;selected=record.userData.slotIndex;}
    }
    return selected;
  }
  on(canvas,'pointerdown',e=>{
    if(mode==='machine'||suspended)return;
    stop(e);canvas.parentElement.focus({preventScroll:true});
    if(mode!=='gallery'||(e.pointerType!=='touch'&&e.button!==0))return;
    player.prepareSound();
    clearPreview();
    touches.add(e.pointerId);canvas.setPointerCapture(e.pointerId);
    if(touches.size>1){multiple=true;drag=null;return;}
    multiple=false;activeTouch=e.pointerType==='touch';
    angle.target=angle.value;angle.velocity=0;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,angle:angle.target,moved:false,slot:pick(e.clientX,e.clientY)};
    canvas.style.cursor='grabbing';
  },{capture:true,passive:false});
  on(canvas,'pointermove',e=>{
    if(mode==='machine'||suspended)return;
    stop(e);if(mode!=='gallery')return;
    if(drag&&drag.id===e.pointerId&&!multiple){
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(Math.hypot(dx,dy)>6)drag.moved=true;
      angle.target=drag.angle-dx*.5;
      return; // Ring tilt is held while dragging, as in the reference.
    }
    if(e.pointerType!=='touch'&&!touches.size){
      const {rect}=metrics(),nx=(e.clientX-rect.left)/rect.width*2-1,ny=(e.clientY-rect.top)/rect.height*2-1;
      tiltX.target=reducedMotion?0:ny*5;tiltY.target=reducedMotion?0:-nx*3;
      const slot=pick(e.clientX,e.clientY);
      canvas.style.cursor=slot===null?'grab':'pointer';
      if(finePointer.matches){
        previewHeld=false;movePreview({x:e.clientX,y:e.clientY});
      }
    }
  },{capture:true,passive:false});
  function endPointer(e,cancelled=false){
    if(mode==='machine'||suspended)return;
    stop(e);touches.delete(e.pointerId);
    const current=drag?.id===e.pointerId?drag:null;drag=null;
    if(current?.moved)settleAngle();
    if(e.pointerType==='touch')previewTouchReadyAt=performance.now()+180;
    if(current&&!cancelled&&!multiple&&!current.moved&&current.slot!==null&&pick(e.clientX,e.clientY)===current.slot)select(current.slot);
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(!touches.size){multiple=false;canvas.style.cursor=mode==='gallery'?'grab':'default';}
    // Resolve to the nearest record without projecting a fling past the user's release.
  }
  on(canvas,'pointerup',e=>endPointer(e),{capture:true,passive:false});
  on(canvas,'pointercancel',e=>endPointer(e,true),{capture:true,passive:false});
  on(canvas,'lostpointercapture',e=>{
    if(drag?.id===e.pointerId){settleAngle();clearDrag();canvas.style.cursor='grab';}
  });
  on(canvas,'pointerleave',()=>{if(mode!=='machine'){
    if(drag)return; // Pointer capture keeps a drag alive outside the canvas.
    tiltX.target=tiltY.target=0;clearDrag();canvas.style.cursor='grab';
    previewInside=false;previewLeaveAt=performance.now()+60;
  }});
  // The reference does not bind the wheel to the ring. Keep it from zooming the machine while browsing.
  on(canvas,'wheel',e=>{if(mode!=='machine')stop(e);},{capture:true,passive:false});
  on(canvas.parentElement,'keydown',e=>{
    if(mode==='machine'||suspended)return;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Escape','Enter',' '].includes(e.key))stop(e);
    if(mode!=='gallery')return;
    if(['ArrowLeft','ArrowRight','Home','Enter',' '].includes(e.key))player.prepareSound();
    if(e.key==='Escape'){onExit();return;}
    if(e.key==='Enter'||e.code==='Space'){select(previewSource==='keyboard'&&previewSlot!==null?previewSlot:modulo(Math.round(angle.value/SLOT_ANGLE),records.length));return;}
    if(e.key==='ArrowLeft'||e.key==='ArrowRight')angle.target=(Math.round(angle.target/SLOT_ANGLE)+(e.key==='ArrowLeft'?-1:1))*SLOT_ANGLE;
    if(e.key==='Home')angle.target+=modulo(HOME_ANGLE-angle.target+180,360)-180;
    if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){
      previewSlot=modulo(Math.round(angle.target/SLOT_ANGLE),records.length);previewSource='keyboard';
      previewHeld=false;previewInside=false;previewPointer=null;
    }
  },{capture:true});
  on(window,'blur',()=>{if(mode!=='machine'){clearDrag();clearPreview();tiltX.target=tiltY.target=0;controls.enabled=false;}});
  function update(dt){
    if(mode==='machine')return;
    dt=clamp(dt,0,.25);elapsed+=dt;controls.enabled=false;
    if(reducedMotion){angle.value=angle.target;radius.value=radius.target;}
    else{
      advance(angle,dt,drag?180:90,drag?28:21);
      advance(radius,dt,activeTouch?24:30,activeTouch?18:20);
      advance(tiltX,dt,50,18);advance(tiltY,dt,50,18);
    }
    if(mode==='opening'){
      progress=Math.min(1,progress+dt/(reducedMotion?.2:1.2));
      if(progress===1)mode='gallery';
    }else if(mode==='closing'){
      progress=Math.max(0,progress-dt/(reducedMotion?.2:1));
      if(progress===0){finishClose();return;}
    }
    if(mode==='gallery'){
      const nextSlot=modulo(Math.round(angle.value/SLOT_ANGLE),records.length);
      if(!suspended&&nextSlot!==selectedSlot)player.sound('browse',{wake:false});
      selectedSlot=nextSlot;
      selectedIndex=selectedSlot%entries.length;
    }
    applyLayout();
  }
  function resize(){
    cachedMetrics=null;
    if(mode==='machine'||!saved)return;
    saved.camera.sub(saved.target).multiplyScalar(fitDistance(camera.aspect)/fitDistance(saved.aspect)).add(saved.target);
    saved.aspect=camera.aspect;
    if(closing){const m=metrics();closing.camera.copy(m.camera);closing.fov=m.fov;}
    applyLayout();
  }
  function setIndex(index){
    if(mode!=='machine')return false;
    const next=modulo(index,entries.length);
    if(next!==selectedIndex){selectedIndex=next;selectedSlot=selectedIndex+halfSlots;rememberedAngle=selectedSlot*SLOT_ANGLE;}
    applyEntryAppearance(selectedIndex);
    return true;
  }
  return {open,close:()=>select(selectedSlot,false),setIndex,resetAppearance,
    setSuspended(value){const next=Boolean(value);if(suspended===next)return;suspended=next;if(suspended){clearDrag();clearPreview();tiltX.target=tiltY.target=0;}},
    getPreview,setPreviewHeld,clearPreview,movePreview,
    beginPreviewDrag({pointerId,pointerType,startX,startY,x,y}){
      if(mode!=='gallery'||suspended||drag||touches.size||
        ![pointerId,startX,startY,x,y].every(Number.isFinite))return false;
      // Transfer the live pointer; subsequent moves and release use the existing canvas handlers.
      try{canvas.setPointerCapture(pointerId);}catch{return false;}
      clearPreview();canvas.parentElement.focus({preventScroll:true});
      activeTouch=pointerType==='touch';touches.add(pointerId);multiple=false;
      angle.target=angle.value;angle.velocity=0;
      drag={id:pointerId,x:startX,y:startY,angle:angle.target,moved:true,slot:null};
      angle.target=drag.angle-(x-startX)*.5;
      canvas.style.cursor='grabbing';return true;
    },
    selectPreview(slot){
      if(mode!=='gallery'||suspended||!Number.isInteger(slot)||slot<0||slot>=records.length)return false;
      select(slot,false);return true;
    },
    update,resize,records,
    getState:()=>({mode,suspended,selectedIndex,selectedSlot,selectedId:entries[selectedIndex].id,count:entries.length,slotCount:records.length,
      angle:angle.value,targetAngle:angle.target,angularVelocity:angle.velocity,radius:radius.value,perspectivePx:metrics().perspectivePx,
      tilt:{x:tiltX.value,y:tiltY.value,targetX:tiltX.target,targetY:tiltY.target},dragging:!!drag,progress}),
    dispose(){clearDrag();clearPreview();off.forEach(fn=>fn());ownedMaterials.forEach(m=>m.dispose());machineFinish.forEach(m=>m.removeFromParent());machineArtwork.forEach(m=>m.removeFromParent());finishMaterial.dispose();finishGeometry.dispose();edgeProfile.dispose();holeProfile.dispose();labelGeometry.dispose();surfaceGeometry.dispose();bodyGeometry.dispose();root.removeFromParent();},
  };
}
