import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { lightStudio, contactShadow } from './studio.js';
import { createMaterials } from './materials.js';
import { createTurntable } from './model.js';
import { createPlayer } from './interactions.js';
import { createRecordGallery } from './gallery.js';
import { portfolioContent } from './portfolio-content.js';
import { createPortfolioRecords } from './portfolio-records.js';
import { createPortfolio } from './portfolio.js';

const stage=document.querySelector('#stage');
async function init(){
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(stage.clientWidth,stage.clientHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);
  const scene=new THREE.Scene();
  scene.background=new THREE.Color('#ffffff');
  const camera=new THREE.PerspectiveCamera(33,stage.clientWidth/stage.clientHeight,.2,100);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.075;
  controls.minDistance=2.1;controls.maxDistance=25;
  controls.maxPolarAngle=Math.PI*.515;
  controls.minPolarAngle=.13;controls.enablePan=false;
  controls.rotateSpeed=.65;controls.zoomSpeed=.7;
  controls.target.set(0,1.95,0);
  // Begin fetching the wood texture before generating studio reflections.
  const materialsReady=createMaterials();
  lightStudio(scene,renderer);
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const mats=await materialsReady;
  Object.values(mats).forEach(m=>{for(const key of ['map','normalMap','roughnessMap','bumpMap']){if(m[key])m[key].anisotropy=renderer.capabilities.getMaxAnisotropy();}});
  const product=createTurntable(mats);scene.add(product.group);
  const shadow=contactShadow(renderer,product.group);scene.add(shadow);
  let gallery,portfolio;
  const recordMedia=createPortfolioRecords({projects:portfolioContent.records,baseMaterial:mats.label});
  await recordMedia.ready;
  const player=createPlayer({renderer,camera,controls,product,
    onRecordClick:()=>portfolio?.activateRecord(),
    onMotorToggle:playing=>portfolio?.homeMotorChanged(playing)});
  gallery=createRecordGallery({scene,renderer,camera,controls,product,player,shadow,entries:recordMedia.entries,onSelect:value=>portfolio?.select(value),onExit:()=>portfolio?.back()});
  product.group.userData={title:'Vertical Vinyl Turntable',description:'Reconstructed from a single front reference. Rear structures are inferred. Display units are relative, not manufacturing dimensions.'};
  function resetView(){
    const aspect=stage.clientWidth/stage.clientHeight;
    const distance=aspect<.75?Math.max(10,8.6/aspect):aspect<1.2?10.5:9.6;
    const damping=controls.enableDamping;
    controls.enableDamping=false;controls.update();
    camera.position.set(0,2.7,distance);
    controls.target.set(0,1.99,0);
    controls.update();
    controls.enableDamping=damping;
  }
  function resize(){
    const pixelRatio=Math.min(devicePixelRatio,2);
    if(renderer.getPixelRatio()!==pixelRatio)renderer.setPixelRatio(pixelRatio);
    renderer.setSize(stage.clientWidth,stage.clientHeight);
    camera.aspect=stage.clientWidth/stage.clientHeight;
    camera.updateProjectionMatrix();
    gallery.resize();
    if(gallery.getState().mode==='machine')resetView();
  }
  new ResizeObserver(resize).observe(stage);
  resize();
  portfolio=createPortfolio({content:portfolioContent,gallery,player,product,homeMaterial:mats.label,controls,stage,resetView});
  stage.addEventListener('keydown',e=>{if(gallery.getState().mode!=='machine'||portfolio.getState().panel)return;if(e.key==='Home'){resetView();e.preventDefault();}if(e.key==='+'||e.key==='='){camera.position.lerp(controls.target,.1);e.preventDefault();}if(e.key==='-'){camera.position.sub(controls.target).multiplyScalar(1.1).add(controls.target);e.preventDefault();}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){const offset=camera.position.clone().sub(controls.target);offset.applyAxisAngle(new THREE.Vector3(0,1,0),e.key==='ArrowLeft'?.1:-.1);camera.position.copy(controls.target).add(offset);e.preventDefault();}});
  let firstFrame = true;
  let previousTime=performance.now();
  function frame(time){
    const dt=(time-previousTime)/1000;previousTime=time;
    portfolio.update(dt);player.update(dt);
    const galleryMode=gallery.getState().mode;
    // Finish route transitions, but do not animate a collection hidden by a page.
    if(!portfolio.getState().panel||galleryMode==='opening'||galleryMode==='closing')gallery.update(dt);
    const state=portfolio.getState();
    recordMedia.update({visible:!state.panel&&!document.hidden&&['projects','record'].includes(state.route.name),index:state.projectIndex});
    if(gallery.getState().mode==='machine'&&!state.panel)controls.update();
    if(!document.hidden&&!state.panel)renderer.render(scene,camera);
    if (firstFrame) {
      firstFrame = false;
      Promise.all([...document.querySelectorAll('#site-header img, #site-intro img')].map(image => image.decode().catch(() => {})))
        .then(() => requestAnimationFrame(() => document.dispatchEvent(new Event('portfolio-ready'))));
    }
    frameId=requestAnimationFrame(frame);
  }
  let frameId=requestAnimationFrame(frame);
  document.addEventListener('visibilitychange',()=>{
    cancelAnimationFrame(frameId);
    if(!document.hidden){previousTime=performance.now();frameId=requestAnimationFrame(frame);}
  });
  window.viewer={renderer,scene,camera,controls,product,mats,player,gallery,portfolio,recordMedia};
  stage.removeAttribute('aria-busy');
}
init().catch(error=>{
  console.error('3D model could not initialize:',error);
  stage.removeAttribute('aria-busy');
  const fallback=document.createElement('p');fallback.className='viewer-fallback';fallback.textContent='3D 画面暂时无法加载，请刷新页面，或使用支持 WebGL 的浏览器。';stage.replaceChildren(fallback);
  document.dispatchEvent(new Event('portfolio-error'));
});
