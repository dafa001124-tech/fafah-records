import * as THREE from 'three';
import { createWoodMaterials } from './wood-material.js';
import { createSurfaceMaterials } from './surface-materials.js';

// These are ordinary PBR textures, rather than renderer-specific shader patches:
// the same model can therefore be exported as a self-contained GLB.
function canvas(size) {
  const element = document.createElement('canvas');
  element.width = element.height = size;
  return element;
}

function noise(x, y, seed = 1) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1013904223);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

const smooth = t => t * t * (3 - 2 * t);
function valueNoise(x, y, seed = 1) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
  const a = noise(ix, iy, seed), b = noise(ix + 1, iy, seed);
  const c = noise(ix, iy + 1, seed), d = noise(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function texture(source, color = false, repeat = 1) {
  const tex = new THREE.CanvasTexture(source);
  tex.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  return tex;
}

function normalFromHeight(height, size, strength) {
  const output = canvas(size), context = output.getContext('2d');
  const pixels = context.createImageData(size, size), data = pixels.data;
  for (let y = 0; y < size; y++) {
    const prev = ((y + size - 1) % size) * size, next = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const i = y * size + x, offset = i * 4;
      const dx = (height[y * size + (x + 1) % size] - height[y * size + (x + size - 1) % size]) * strength;
      const dy = (height[next + x] - height[prev + x]) * strength;
      const norm = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      data[offset] = (-dx * norm * 0.5 + 0.5) * 255;
      data[offset + 1] = (dy * norm * 0.5 + 0.5) * 255;
      data[offset + 2] = (norm * 0.5 + 0.5) * 255;
      data[offset + 3] = 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return output;
}

function clothMaps() {
  const size = 1024, color = canvas(size), rough = canvas(size);
  const cc = color.getContext('2d'), rc = rough.getContext('2d');
  const colors = cc.createImageData(size, size), roughness = rc.createImageData(size, size);
  const heights = new Float32Array(size * size), period = 16;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = Math.floor(y / period), column = Math.floor(x / period);
      const warp = Math.pow(Math.max(0, Math.cos((x % period / period - 0.5) * Math.PI)), 2);
      const weft = Math.pow(Math.max(0, Math.cos((y % period / period - 0.5) * Math.PI)), 2);
      const parity = (row + column) % 2;
      const top = parity ? warp : weft, bottom = parity ? weft : warp;
      const crossed = top * 0.72 + bottom * (1 - top) * 0.32;
      const fiber = noise(x, y, 17), threadTone = noise(column, row, 71) - 0.5;
      const c = 11 + crossed * 23 + fiber * 4 + threadTone * 7;
      const i = (y * size + x) * 4;
      colors.data[i] = c * 0.96; colors.data[i + 1] = c * 0.98; colors.data[i + 2] = c;
      colors.data[i + 3] = 255;
      heights[y * size + x] = crossed * 0.65 + fiber * 0.035;
      roughness.data[i] = roughness.data[i + 1] = roughness.data[i + 2] = 220 + fiber * 20;
      roughness.data[i + 3] = 255;
    }
  }
  cc.putImageData(colors, 0, 0); rc.putImageData(roughness, 0, 0);
  return { map: texture(color, true, 1.5), normalMap: texture(normalFromHeight(heights, size, 1.1), false, 1.5), roughnessMap: texture(rough, false, 1.5) };
}

function labelMap(options = {}) {
  const palette = {
    top:'#25672c', bottom:'#c43a18', band:'#ede8c9', line:'#1d2922',
    logo:'#252721', rings:'#de6544', mark:'#e16643', strip:'#efce69',
    ink:'#292d24', topInk:'#292d24', bottomInk:'#292d24',
    title:'THE SOUND OF SLOW', number:'TWO', side:'SIDE B', ...options,
  };
  const size = 1024, source = canvas(size), ctx = source.getContext('2d');
  ctx.fillStyle = palette.top; ctx.fillRect(0, 0, size, 500);
  ctx.fillStyle = palette.bottom; ctx.fillRect(0, 500, size, 524);
  ctx.fillStyle = palette.band; ctx.fillRect(0, 470, size, 69);
  ctx.strokeStyle = palette.line; ctx.lineWidth = 1.4;
  for (const r of [478, 461, 329]) {
    ctx.beginPath(); ctx.arc(512, 512, r, 0, Math.PI * 2); ctx.stroke();
  }
  // A clean reconstructed vintage label; source-image microprint is not legible.
  ctx.fillStyle = palette.logo; ctx.fillRect(351, 97, 322, 137);
  ctx.lineWidth = 5; ctx.strokeStyle = palette.rings;
  for (const r of [43, 29, 15]) {
    ctx.beginPath(); ctx.arc(610, 164, r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = palette.mark; ctx.font = 'bold 81px Georgia, serif'; ctx.textAlign = 'left';
  ctx.fillText('V', 375, 195);
  ctx.fillStyle = palette.strip; ctx.fillRect(351, 234, 322, 37);
  ctx.fillStyle = palette.ink; ctx.textAlign = 'center'; ctx.font = 'bold 25px Arial, sans-serif';
  ctx.fillText('ANALOG RECORDS', 512, 262);
  ctx.fillStyle = palette.topInk;
  ctx.font = '23px Georgia, serif'; ctx.fillText(palette.title, 512, 325);
  ctx.fillStyle = palette.ink;
  ctx.font = 'bold 31px Arial, sans-serif'; ctx.fillText('STEREO', 180, 516); ctx.fillText(palette.number, 852, 516);
  ctx.fillStyle = palette.bottomInk;
  ctx.font = '15px Arial, sans-serif'; ctx.fillText('33⅓ RPM', 821, 572); ctx.fillText('HI-FIDELITY', 209, 572);
  ctx.font = 'bold 20px Arial, sans-serif'; ctx.fillText(palette.side, 512, 651);
  ctx.font = '15px Arial, sans-serif';
  const tracks = ['1. A WARMER KIND OF LIGHT', '2. BETWEEN THE GROOVES', '3. THE ROOM IS LISTENING', '4. AFTER HOURS', '5. KEEP THE RECORD TURNING'];
  tracks.forEach((line, i) => ctx.fillText(line, 512, 691 + i * 28));
  ctx.font = '12px Arial, sans-serif'; ctx.fillText('LONG PLAYING · MICROGROOVE', 512, 878);
  const pixels = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < size * size; i++) {
    const n = (noise(i % size, Math.floor(i / size), 84) - 0.5) * 5;
    pixels.data[i * 4] += n; pixels.data[i * 4 + 1] += n; pixels.data[i * 4 + 2] += n;
  }
  ctx.putImageData(pixels, 0, 0);
  return texture(source, true);
}

// Colour studies for browsing the prototype, not claims about real projects.
// Preserve the original material identity so the initial turntable is unchanged.
export function createRecordLabels(baseMaterial) {
  const variants = [
    {id:'cobalt', name:'Printed paper label · cobalt and cream study', palette:{
      top:'#376aab', bottom:'#e9e2cf', band:'#f4efdf', line:'#202d41',
      logo:'#181b23', rings:'#e7e5d9', mark:'#e7e5d9', strip:'#d5dce3',
      ink:'#151a22', topInk:'#eee9dc', bottomInk:'#171d27',
      title:'BETWEEN THE GROOVES', number:'ONE', side:'SIDE A',
    }},
    {id:'ochre', name:'Printed paper label · ochre and burgundy study', palette:{
      top:'#bd8a2f', bottom:'#5e232b', band:'#efe2c7', line:'#442a25',
      logo:'#3b2025', rings:'#f1d6a1', mark:'#f1d6a1', strip:'#efe2c7',
      ink:'#3d2525', topInk:'#31221a', bottomInk:'#f5e8cf',
      title:'A WARMER KIND OF LIGHT', number:'THREE', side:'SIDE C',
    }},
    {id:'sage', name:'Printed paper label · sage and plum study', palette:{
      top:'#7e9681', bottom:'#eee5d2', band:'#e0d8c7', line:'#39433b',
      logo:'#4d3344', rings:'#dce1ce', mark:'#dce1ce', strip:'#dedec7',
      ink:'#342d35', topInk:'#263b30', bottomInk:'#493847',
      title:'THE ROOM IS LISTENING', number:'FOUR', side:'SIDE D',
    }},
    {id:'vermilion', name:'Printed paper label · vermilion and charcoal study', palette:{
      top:'#d74b2e', bottom:'#252426', band:'#eee6cf', line:'#241f21',
      logo:'#222023', rings:'#f3e0c0', mark:'#f3e0c0', strip:'#eee6cf',
      ink:'#262124', topInk:'#2b2121', bottomInk:'#efe5ce',
      title:'KEEP THE RECORD TURNING', number:'FIVE', side:'SIDE E',
    }},
  ];
  return [{id:'original', material:baseMaterial}, ...variants.map(({id,name,palette})=>{
    const material = baseMaterial.clone();
    material.name = name;
    material.map = labelMap(palette);
    material.map.name = `${id} vintage paper label`;
    material.map.anisotropy = baseMaterial.map?.anisotropy || 8;
    return {id, material};
  })];
}

export async function createMaterials() {
  const woodMaterials=await createWoodMaterials();
  await new Promise(resolve=>setTimeout(resolve,0));
  const surfaceMaterials=createSurfaceMaterials();
  const cloth=new THREE.MeshPhysicalMaterial({
    ...clothMaps(),color:0xffffff,roughness:1,metalness:0,
    normalScale:new THREE.Vector2(.85,.85),sheen:.16,sheenRoughness:.96,sheenColor:0x39414b,
  });
  cloth.name='Woven charcoal acoustic fabric';
  const rubber=new THREE.MeshStandardMaterial({color:0x111316,roughness:.76,metalness:0});
  rubber.name='Matte rubber belt and feet';
  const darkPlastic=new THREE.MeshPhysicalMaterial({color:0x202225,roughness:.42,metalness:.06,clearcoat:.16});
  darkPlastic.name='Satin black moulded polymer';
  const label=new THREE.MeshStandardMaterial({map:labelMap(),roughness:.82,metalness:0});
  label.name='Printed paper label · reconstructed artwork';
  return {
    ...woodMaterials,...surfaceMaterials,cloth,rubber,darkPlastic,label,
    gold:new THREE.MeshStandardMaterial({color:0xa79155,metalness:.86,roughness:.28}),
    red:new THREE.MeshStandardMaterial({color:0x972f22,roughness:.46}),
    led:new THREE.MeshStandardMaterial({color:0xcca15c,emissive:0x925014,emissiveIntensity:.45,roughness:.2}),
  };
}
