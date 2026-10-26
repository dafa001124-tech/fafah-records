import * as THREE from 'three';

// Physically based surface maps. No baked lighting: reflections stay attached
// to the studio environment while the user rotates the actual geometry.
function hash(x, y, seed = 0) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1013904223);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function mapSet(size, channels, name) {
  const canvases = channels.map(() => {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    return { c, ctx, pixels: ctx.createImageData(size, size) };
  });
  return {
    data: canvases.map(c => c.pixels.data),
    finish() {
      return Object.fromEntries(canvases.map((c, i) => {
        c.ctx.putImageData(c.pixels, 0, 0);
        const tex = new THREE.CanvasTexture(c.c);
        tex.name = `${name} ${channels[i]}`;
        tex.colorSpace = channels[i] === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 16;
        return [channels[i], tex];
      }));
    },
  };
}

function writeNormal(data, i, nx, ny) {
  const n = 1 / Math.sqrt(1 + nx * nx + ny * ny);
  data[i] = (nx * n * .5 + .5) * 255;
  data[i + 1] = (ny * n * .5 + .5) * 255;
  data[i + 2] = (n * .5 + .5) * 255;
  data[i + 3] = 255;
}

function vinylMaps() {
  const size = 2048;
  const maps = mapSet(size, ['map', 'normalMap', 'roughnessMap', 'anisotropyMap'], 'Pressed PVC');
  const [albedo, normal, roughness, direction] = maps.data;
  // Narrow silent bands between tracks; the long flat areas are densely cut.
  const separators = [.389, .480, .586, .704, .818, .939];
  const trackRoughness = [.23, .285, .275, .295, .278, .285, .26];
  for (let y = 0; y < size; y++) {
    const py = 1 - 2 * y / (size - 1);
    for (let x = 0; x < size; x++) {
      const px = 2 * x / (size - 1) - 1;
      const r = Math.hypot(px, py), inv = 1 / Math.max(r, 1e-5);
      const angle = Math.atan2(py, px), i = 4 * (y * size + x);
      const recorded = r > .350 && r < .971;
      let nearest = 1, band = 0;
      for (let k = 0; k < separators.length; k++) {
        const distance = Math.abs(r - separators[k]);
        if (distance < nearest) nearest = distance;
        if (r > separators[k]) band = k + 1;
      }
      const gap = Math.max(0, 1 - nearest / .0022);
      const groovePhase = r * Math.PI * 2 * 290 + angle;
      const groove = Math.sin(groovePhase + Math.sin(r * 193) * .12);
      // The groove modulation is below a pixel at normal viewing distance;
      // mipmaps average it instead of rendering dotted geometry or ribs.
      const variation = hash(x, y, 92) - .5;
      const grooveSlope = recorded ? groove * .032 * (1 - gap) : .001;
      writeNormal(normal, i, px * inv * grooveSlope, py * inv * grooveSlope);
      const tint = 18.2 + (recorded ? groove * .24 : -.7) - gap * .6;
      albedo[i] = tint * .95; albedo[i + 1] = tint * .98; albedo[i + 2] = tint;
      albedo[i + 3] = 255;
      const micro = .003 * Math.sin(r * 1067) + variation * .002;
      const rough = recorded ? trackRoughness[band] + micro - .092 * gap : .18;
      roughness[i] = roughness[i + 1] = roughness[i + 2] = 255 * rough;
      roughness[i + 3] = 255;
      // Tangent to the circular groove in the face's planar UV basis.
      direction[i] = (-py * inv * .5 + .5) * 255;
      direction[i + 1] = (px * inv * .5 + .5) * 255;
      direction[i + 2] = recorded ? 246 - 100 * gap : 30;
      direction[i + 3] = 255;
    }
  }
  return maps.finish();
}

function brushedMaps() {
  const size = 1024;
  const maps = mapSet(size, ['normalMap', 'roughnessMap'], 'Axial brushing');
  const [normal, roughness] = maps.data;
  const lines = new Float32Array(size);
  for (let x = 0; x < size; x++) lines[x] = hash(x, 0, 53);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = 4 * (y * size + x);
      const fine = hash(x, y, 93) - .5;
      const slope = (lines[(x + 1) % size] - lines[(x + size - 1) % size]) * .017;
      writeNormal(normal, i, slope, fine * .0015);
      const r = .80 + (lines[x] - .5) * .10 + fine * .014;
      roughness[i] = roughness[i + 1] = roughness[i + 2] = r * 255;
      roughness[i + 3] = 255;
    }
  }
  return maps.finish();
}

function turnedMaps() {
  const size = 1024;
  const maps = mapSet(size, ['normalMap', 'roughnessMap', 'anisotropyMap'], 'Concentric turning');
  const [normal, roughness, direction] = maps.data;
  for (let y = 0; y < size; y++) {
    const py = 1 - 2 * y / (size - 1);
    for (let x = 0; x < size; x++) {
      const px = 2 * x / (size - 1) - 1;
      const r = Math.hypot(px, py), inv = 1 / Math.max(r, 1e-5);
      const i = 4 * (y * size + x);
      const circular = Math.sin(r * Math.PI * 2 * 136 + Math.sin(r * 150) * .14);
      const microscopic = hash(x, y, 28) - .5;
      const slope = circular * .013;
      writeNormal(normal, i, px * inv * slope, py * inv * slope);
      const value = .86 + circular * .032 + microscopic * .012;
      roughness[i] = roughness[i + 1] = roughness[i + 2] = value * 255;
      roughness[i + 3] = 255;
      direction[i] = (-py * inv * .5 + .5) * 255;
      direction[i + 1] = (px * inv * .5 + .5) * 255;
      direction[i + 2] = 220;
      direction[i + 3] = 255;
    }
  }
  return maps.finish();
}

export function createSurfaceMaterials() {
  const vinyl = new THREE.MeshPhysicalMaterial({
    ...vinylMaps(), color: 0xffffff, metalness: 0, roughness: 1,
    normalScale: new THREE.Vector2(.75, .75),
    ior: 1.54, specularIntensity: 1, anisotropy: .88,
    clearcoat: .12, clearcoatRoughness: .22,
  });
  vinyl.name = 'Pressed black PVC — microgrooves and tangential reflection';
  const vinylEdge = new THREE.MeshPhysicalMaterial({
    color: 0x101114, metalness: 0, roughness: .2, ior: 1.54,
    clearcoat: .15, clearcoatRoughness: .2,
  });
  vinylEdge.name = 'Smooth molded PVC edge';

  const brushing = brushedMaps();
  const blackMetal = new THREE.MeshPhysicalMaterial({
    ...brushing, color: 0x3a3d42, metalness: .84, roughness: .44,
    normalScale: new THREE.Vector2(.4, .4), anisotropy: .18,
    anisotropyRotation: Math.PI / 2, clearcoat: .06, clearcoatRoughness: .3,
  });
  blackMetal.name = 'Black anodized aluminum — satin microtexture';
  const brushedMetal = new THREE.MeshPhysicalMaterial({
    ...brushing, color: 0x565b61, metalness: .96, roughness: .40,
    normalScale: new THREE.Vector2(.55, .55), anisotropy: .58,
    anisotropyRotation: Math.PI / 2,
  });
  brushedMetal.name = 'Graphite anodized shaft — axial brushing';
  const turnedMetal = new THREE.MeshPhysicalMaterial({
    ...turnedMaps(), color: 0x656970, metalness: .97, roughness: .39,
    normalScale: new THREE.Vector2(.65, .65), anisotropy: .64,
    clearcoat: .025, clearcoatRoughness: .32,
  });
  turnedMetal.name = 'Turned graphite aluminum — concentric machining';
  const silver = new THREE.MeshPhysicalMaterial({
    ...brushing, color: 0xd4d7db, metalness: 1, roughness: .23,
    normalScale: new THREE.Vector2(.24, .24), anisotropy: .15,
  });
  silver.name = 'Machined stainless hardware — soft polished edge';
  return { vinyl, vinylEdge, blackMetal, brushedMetal, turnedMetal, silver };
}
