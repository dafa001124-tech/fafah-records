import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

export function lightStudio(scene,renderer){
  // Reflection cards live only in the environment, never in the visible white stage.
  const studio=new THREE.Scene();
  studio.background=new THREE.Color(.075,.082,.09);
  const cards=[];
  function card(position,size,radiance,color=0xffffff){
    const material=new THREE.MeshBasicMaterial({color:new THREE.Color(color).multiplyScalar(radiance),side:THREE.DoubleSide,toneMapped:false});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(...size),material);
    mesh.position.set(...position);mesh.lookAt(0,0,0);studio.add(mesh);cards.push(mesh);
  }
  card([-3.8,2.8,5],[2.5,6.2],7.8,0xfff7ec);
  card([4.8,1.3,3],[1.3,4.7],4.1,0xeaf2ff);
  card([.2,6.5,1.5],[5,2.5],3.2);
  card([1.4,2.2,-4.5],[2.4,4.2],4.6);
  const pmrem=new THREE.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(studio,.035,.1,30);
  scene.environment=environment.texture;
  scene.environmentIntensity=.82;
  scene.environmentRotation.y=.20;
  cards.forEach(o=>{o.geometry.dispose();o.material.dispose();});pmrem.dispose();

  RectAreaLightUniformsLib.init();
  function softbox(position,width,height,intensity,color){
    const light=new THREE.RectAreaLight(color,intensity,width,height);
    light.position.set(...position);light.lookAt(0,1.8,0);scene.add(light);return light;
  }
  softbox([-4,5,5],3.7,5.4,2.5,0xfff7ed);
  softbox([4.5,2.9,4],1.8,4.0,1.4,0xeaf1ff);
  softbox([.5,5,-3.5],3,3.5,3.2,0xffffff);
  const key=new THREE.DirectionalLight(0xfff9ee,.85);
  key.position.set(-3,7,5);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);
  Object.assign(key.shadow.camera,{left:-4,right:4,top:5,bottom:-3,near:.1,far:20});
  key.shadow.bias=-.0002;key.shadow.normalBias=.012;key.shadow.radius=5;
  scene.add(key,new THREE.HemisphereLight(0xffffff,0x70685e,.2));
  return {environment,key};
}

export function contactShadow(renderer,product){
  const size=1024,extent=3.2;
  const first=new THREE.WebGLRenderTarget(size,size,{depthBuffer:true});
  const second=new THREE.WebGLRenderTarget(size,size,{depthBuffer:false});
  const shadowScene=new THREE.Scene();
  const clone=product.clone(true);shadowScene.add(clone);
  shadowScene.overrideMaterial=new THREE.ShaderMaterial({
    side:THREE.DoubleSide,
    vertexShader:'varying float h; void main(){vec4 p=modelMatrix*vec4(position,1.);h=max(p.y,0.);gl_Position=projectionMatrix*viewMatrix*p;}',
    fragmentShader:'varying float h; void main(){float a=exp(-h*12.)*.58;gl_FragColor=vec4(0.,0.,0.,a);}'
  });
  const camera=new THREE.OrthographicCamera(-extent,extent,extent,-extent,.1,8);
  camera.position.set(0,-3,0);camera.up.set(0,0,-1);camera.lookAt(0,0,0);
  const priorColor=renderer.getClearColor(new THREE.Color()),priorAlpha=renderer.getClearAlpha();
  const priorTarget=renderer.getRenderTarget();
  renderer.setClearColor(0x000000,0);renderer.setRenderTarget(first);renderer.clear();renderer.render(shadowScene,camera);
  const blurScene=new THREE.Scene(),blurCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);
  const blurMaterial=new THREE.ShaderMaterial({
    uniforms:{map:{value:first.texture},step:{value:new THREE.Vector2(5.5/size,0)}},
    depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:'uniform sampler2D map;uniform vec2 step;varying vec2 vUv;void main(){vec4 s=texture2D(map,vUv)*.227027;s+=(texture2D(map,vUv+step*1.384615)+texture2D(map,vUv-step*1.384615))*.316216;s+=(texture2D(map,vUv+step*3.230769)+texture2D(map,vUv-step*3.230769))*.070270;gl_FragColor=s;}'
  });
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),blurMaterial);blurScene.add(quad);
  renderer.setRenderTarget(second);renderer.clear();renderer.render(blurScene,blurCamera);
  blurMaterial.uniforms.map.value=second.texture;blurMaterial.uniforms.step.value.set(0,5.5/size);
  renderer.setRenderTarget(first);renderer.clear();renderer.render(blurScene,blurCamera);
  renderer.setRenderTarget(priorTarget);renderer.setClearColor(priorColor,priorAlpha);
  shadowScene.overrideMaterial.dispose();second.dispose();quad.geometry.dispose();blurMaterial.dispose();
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(extent*2,extent*2),new THREE.MeshBasicMaterial({map:first.texture,transparent:true,depthWrite:false,toneMapped:false}));
  plane.rotation.x=-Math.PI/2;plane.position.y=-.003;
  plane.name='Soft studio contact shadow';return plane;
}
