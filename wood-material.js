import * as THREE from 'three';

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width; result.height = height;
  return result;
}

function map(source) {
  const result = new THREE.CanvasTexture(source);
  result.wrapS = result.wrapT = THREE.RepeatWrapping;
  result.anisotropy = 16;
  return result;
}

// A sliding box filter separates wood colour variation from pore relief.
// Broad dark heartwood is colour, not a large dent in the surface.
function blur(source, width, height, radius) {
  const horizontal = new Float32Array(source.length);
  const result = new Float32Array(source.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    const row = y * width;
    for (let k = -radius; k <= radius; k++) sum += source[row + Math.min(width - 1, Math.max(0, k))];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / span;
      sum += source[row + Math.min(width - 1, x + radius + 1)] - source[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += horizontal[Math.min(height - 1, Math.max(0, k)) * width + x];
    for (let y = 0; y < height; y++) {
      result[y * width + x] = sum / span;
      sum += horizontal[Math.min(height - 1, y + radius + 1) * width + x] - horizontal[Math.max(0, y - radius) * width + x];
    }
  }
  return result;
}

function surfaceMaps(photo) {
  const width = 2048, height = Math.round(width * photo.height / photo.width);
  const source = canvas(width, height), context = source.getContext('2d', { willReadFrequently: true });
  context.drawImage(photo, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const luminance = new Float32Array(width * height);
  for (let i = 0; i < luminance.length; i++) {
    const p = i * 4;
    luminance[i] = (pixels[p] * 0.2126 + pixels[p + 1] * 0.7152 + pixels[p + 2] * 0.0722) / 255;
  }
  const broad = blur(luminance, width, height, 11);
  const close = blur(luminance, width, height, 2);
  const heights = new Float32Array(luminance.length);
  const normal = canvas(width, height), rough = canvas(width, height);
  const nc = normal.getContext('2d'), rc = rough.getContext('2d');
  const ni = nc.createImageData(width, height), ri = rc.createImageData(width, height);
  for (let i = 0; i < heights.length; i++) {
    const pore = luminance[i] - broad[i];
    heights[i] = (luminance[i] - close[i]) * 0.75 + pore * 0.25;
    // Dark pore bottoms scatter light more than the compressed, oiled fibres.
    const r = THREE.MathUtils.clamp(107 - pore * 145 + (0.28 - broad[i]) * 15, 91, 132);
    ri.data[i * 4] = ri.data[i * 4 + 1] = ri.data[i * 4 + 2] = r;
    ri.data[i * 4 + 3] = 255;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const dx = (heights[y * width + Math.min(width - 1, x + 1)] - heights[y * width + Math.max(0, x - 1)]) * 2.7;
      const dy = (heights[Math.min(height - 1, y + 1) * width + x] - heights[Math.max(0, y - 1) * width + x]) * 2.7;
      const inverse = 1 / Math.sqrt(1 + dx * dx + dy * dy);
      ni.data[p] = (0.5 - dx * inverse * 0.5) * 255;
      ni.data[p + 1] = (0.5 + dy * inverse * 0.5) * 255;
      ni.data[p + 2] = (0.5 + inverse * 0.5) * 255;
      ni.data[p + 3] = 255;
    }
  }
  nc.putImageData(ni, 0, 0); rc.putImageData(ri, 0, 0);
  return { normalMap: map(normal), roughnessMap: map(rough) };
}

export async function createWoodMaterials() {
  // Photograph spans 4.46 × 1.487 display units. Geometry uses a physical,
  // continuous box projection so the front does not squash the complete image.
  const albedo = await new THREE.TextureLoader().loadAsync(new URL('./assets/walnut-v2.webp', import.meta.url).href);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  albedo.anisotropy = 16;
  const maps = surfaceMaps(albedo.image);
  const wood = new THREE.MeshPhysicalMaterial({
    map: albedo,
    ...maps,
    color: 0xf2e9df,
    metalness: 0,
    roughness: 1,
    normalScale: new THREE.Vector2(0.40, 0.40),
    clearcoat: 0.16,
    clearcoatRoughness: 0.36,
    ior: 1.48,
  });
  wood.name = 'American walnut · correlated pores and satin oil finish';
  const woodEdge = wood.clone();
  woodEdge.name = 'Walnut plinth · continuous veneer';
  woodEdge.color.set(0xe2d5c8);
  return { wood, woodEdge };
}
