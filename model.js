import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** A reference-driven, component-separated vertical record player. Front is +Z. */
export function createTurntable(mats) {
  const group = new THREE.Group();
  group.name = 'Vertical vinyl player';
  const hardware = new THREE.Group();
  hardware.name = 'Tonearm and pickup assembly';
  group.add(hardware);
  const v = (p) => new THREE.Vector3(...p);

  function mesh(name, geo, mat, pos, parent = group) {
    const obj = new THREE.Mesh(geo, mat);
    obj.name = name;
    if (pos) obj.position.set(...pos);
    obj.castShadow = true;
    obj.receiveShadow = true;
    parent.add(obj);
    return obj;
  }
  function box(name, size, pos, mat, radius = 0.012, parent = group) {
    const geometry = new RoundedBoxGeometry(...size, 5, radius);
    if (mat === mats.wood || mat === mats.woodEdge) {
      // The photographic veneer spans 4.46 × 1.487 model units (3:1).
      // Crop it at physical scale instead of squashing a full square onto each face.
      const position = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
      const texWidth = 4.46, texHeight = texWidth / 3;
      const topV = 0.26 + size[1] / texHeight;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const nx = normal.getX(i), ny = normal.getY(i), nz = normal.getZ(i);
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        let u = (x + pos[0] + texWidth / 2) / texWidth;
        let vv = 0.26 + (y + pos[1] - 0.205) / texHeight;
        if (ay >= ax && ay >= az) {
          vv = ny > 0 ? topV + (size[2] / 2 - z) / texHeight : 0.26 - (size[2] / 2 - z) / texHeight;
        } else if (ax > az) {
          u = nx > 0 ? 1 + (size[2] / 2 - z) / texWidth : -(size[2] / 2 - z) / texWidth;
        } else if (nz < 0) {
          u = 1 + (size[2] + size[0] / 2 - x) / texWidth;
        }
        uv.setXY(i, u, vv);
      }
      uv.needsUpdate = true;
    }
    return mesh(name, geometry, mat, pos, parent);
  }
  function beveledCylinder(radius, depth, rTop = radius, radialSegments = 64) {
    const b = Math.min(radius * 0.065, rTop * 0.065, depth * 0.15);
    const half = depth * 0.5;
    const profile = [
      [0, -half], [radius - b, -half],
      [radius - b * 0.30, -half + b * 0.14], [radius - b * 0.06, -half + b * 0.55],
      [radius, -half + b], [rTop, half - b],
      [rTop - b * 0.06, half - b * 0.55], [rTop - b * 0.30, half - b * 0.14],
      [rTop - b, half], [0, half],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(profile, radialSegments);
  }
  function cyl(name, radius, depth, pos, mat, parent = group, rTop = radius) {
    const obj = mesh(name, beveledCylinder(radius, depth, rTop, 96), mat, pos, parent);
    obj.rotation.x = Math.PI / 2;
    return obj;
  }
  function ring(name, radius, tube, pos, mat, parent = group) {
    return mesh(name, new THREE.TorusGeometry(radius, tube, 10, 128), mat, pos, parent);
  }
  function turnedFace(name, radius, depth, pos, parent = group) {
    // One continuous turned profile: rounded shoulder and a very shallow
    // conical face. No stacked flat disks or separate raised center button.
    const profile = [
      [0, 0], [0.88, 0], [0.96, 0.035], [0.994, 0.12],
      [1, 0.25], [0.998, 0.40], [0.987, 0.53], [0.962, 0.63],
      [0.925, 0.69], [0.84, 0.73], [0.64, 0.80],
      [0.40, 0.88], [0.15, 0.96], [0.035, 0.995], [0, 1],
    ].map(([r, z]) => new THREE.Vector2(r * radius, z * depth));
    const geometry = new THREE.LatheGeometry(profile, 192);
    const vertices = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < vertices.count; i++) {
      // Radial face maps now follow true planar coordinates, so the turned
      // finish is concentric rather than stretched along a lathe's U seam.
      uv.setXY(i, 0.5 + vertices.getX(i) / (radius * 2), 0.5 - vertices.getZ(i) / (radius * 2));
    }
    uv.needsUpdate = true;
    const obj = mesh(name, geometry, mats.turnedMetal || mats.brushedMetal, pos, parent);
    obj.rotation.x = Math.PI / 2;
    for (const depthFraction of [0.28, 0.43]) {
      const seam = ring(`${name} fine rim channel`, radius * 0.996, Math.min(0.0007, radius * 0.004),
        [pos[0], pos[1], pos[2] + depth * depthFraction], mats.blackMetal, parent);
      seam.castShadow = false;
      seam.receiveShadow = false;
    }
    return obj;
  }
  function rod(name, start, end, radius, mat, parent = group, endRadius = radius) {
    const a = v(start), b = v(end), d = b.clone().sub(a);
    const obj = mesh(name, beveledCylinder(radius, d.length(), endRadius, radius > 0.02 ? 64 : 32), mat,
      a.clone().add(b).multiplyScalar(0.5).toArray(), parent);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return obj;
  }
  function ball(name, radius, pos, mat, parent = group) {
    return mesh(name, new THREE.SphereGeometry(radius, 20, 12), mat, pos, parent);
  }
  function screw(name, pos, radius = 0.015, parent = group, mat = mats.silver) {
    // A genuine recessed drive opening, with a chamfered metal wall and dark
    // bottom, reads as a fastener instead of a painted line on a flat disk.
    const shape = new THREE.Shape();
    shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
    const w = radius * 0.11, a = radius * 0.59;
    const opening = new THREE.Path();
    const drive = [[-a,-w],[-w,-w],[-w,-a],[w,-a],[w,-w],[a,-w],[a,w],[w,w],[w,a],[-w,a],[-w,w],[-a,w]];
    opening.moveTo(...drive[0]);
    drive.slice(1).forEach(p => opening.lineTo(...p));
    opening.closePath();
    shape.holes.push(opening);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.004, bevelEnabled: true, bevelSize: radius * 0.055,
      bevelThickness: 0.0007, bevelSegments: 3, curveSegments: 32, steps: 1,
    });
    const screwFace = mesh(name, geometry, mat, [pos[0], pos[1], pos[2] - 0.002], parent);
    screwFace.rotation.z = Math.PI / 5;
    cyl(`${name} recessed drive floor`, radius * 0.76, 0.002, [pos[0], pos[1], pos[2] - 0.0017], mats.darkPlastic, parent);
  }
  function path(name, points, radius, mat, parent = group, smooth = true) {
    const curve = smooth ? new THREE.CatmullRomCurve3(points.map(v)) : new THREE.LineCurve3(v(points[0]), v(points[1]));
    return mesh(name, new THREE.TubeGeometry(curve, smooth ? points.length * 12 : 1, radius, 8, false), mat, null, parent);
  }

  // A solid cabinet, radiused veneer edges, a separate lower lip and rear panel.
  box('Walnut cabinet', [4.46, 0.69, 0.84], [0, 0.55, -0.20], mats.wood, 0.028);
  box('Walnut lower plinth', [4.29, 0.052, 0.85], [0, 0.194, -0.20], mats.woodEdge, 0.018);
  box('Rear inset panel', [3.99, 0.50, 0.022], [0, 0.55, -0.632], mats.darkPlastic, 0.018);
  for (const side of [-1, 1]) {
    const x = side * 1.77;
    box(`${side < 0 ? 'Left' : 'Right'} speaker frame`, [0.97, 0.70, 0.077], [x, 0.555, 0.244], mats.darkPlastic, 0.015);
    box(`${side < 0 ? 'Left' : 'Right'} woven grille`, [0.948, 0.677, 0.018], [x, 0.557, 0.287], mats.cloth, 0.010);
    // Driver volumes live behind the removable grilles.
    cyl('Speaker driver basket', 0.232, 0.08, [x, 0.56, 0.173], mats.blackMetal);
    cyl('Speaker cone', 0.193, 0.028, [x, 0.56, 0.217], mats.rubber);
    ring('Speaker surround', 0.198, 0.018, [x, 0.56, 0.231], mats.rubber);
    // Front and rear isolation feet.
    for (const z of [-0.46, 0.08]) {
      const footProfile = [[0,-0.095],[0.158,-0.095],[0.175,-0.092],[0.18,-0.082],
        [0.18,-0.066],[0.172,-0.042],[0.139,0.030],[0.118,0.066],
        [0.115,0.081],[0.108,0.095],[0,0.095]].map(p=>new THREE.Vector2(...p));
      mesh('Radiused tapered isolation foot', new THREE.LatheGeometry(footProfile,96), mats.rubber,
        [side * 1.99, 0.101, z]);
      box('Foot mounting plate', [0.28, 0.023, 0.28], [side * 1.99, 0.207, z], mats.blackMetal, 0.02);
      const trim = ring('Foot bottom seam', 0.169, 0.005, [side * 1.99, 0.019, z], mats.blackMetal);
      trim.rotation.x = Math.PI / 2;
    }
  }

  // Rear mounting upright and spindle: inferred depth, clear mechanical support.
  box('Rear bearing support', [0.31, 1.65, 0.15], [0, 1.66, -0.19], mats.blackMetal, 0.035);
  box('Support base saddle', [0.53, 0.06, 0.48], [0, 0.918, -0.19], mats.blackMetal, 0.025);
  cyl('Spindle bearing housing', 0.21, 0.24, [0, 2.49, -0.08], mats.blackMetal);
  cyl('Rear bearing cap', 0.157, 0.015, [0, 2.49, -0.215], mats.brushedMetal);
  cyl('Axle', 0.043, 0.32, [0, 2.49, 0.13], mats.silver);
  cyl('Rear record support platter', 0.51, 0.029, [0, 2.49, 0.235], mats.blackMetal);
  ring('Platter rubber cushion', 0.46, 0.012, [0, 2.49, 0.255], mats.rubber);

  const record = new THREE.Group();
  record.name = 'Rotating record and center clamp';
  record.userData.interaction = 'record';
  record.position.set(0, 2.49, 0);
  group.add(record);
  cyl('Vinyl record body', 1.52, 0.026, [0, 0, 0.285], mats.vinylEdge, record);
  mesh('Vinyl playing surface', new THREE.CircleGeometry(1.514, 256), mats.vinyl, [0, 0, 0.300], record);
  const rearSurface = mesh('Vinyl reverse playing surface', new THREE.CircleGeometry(1.514, 256), mats.vinyl, [0, 0, 0.271], record);
  rearSurface.rotation.y = Math.PI;
  ring('Record edge bead', 1.515, 0.006, [0, 0, 0.291], mats.vinylEdge, record);
  // All groove and separator detail is texture based. Sub-pixel toroidal
  // geometry produces disconnected specular pixels at normal viewing sizes.
  mesh('Printed record label', new THREE.CircleGeometry(0.514, 128), mats.label, [0, 0, 0.304], record);
  cyl('Record clamp rear seat', 0.168, 0.009, [0, 0, 0.310], mats.blackMetal, record);
  turnedFace('Record clamp spun conical face', 0.166, 0.063, [0, 0, 0.315], record);

  // Motor drive wheel and its visible belt, preserving the reference V shape.
  cyl('Motor pulley back plate', 0.239, 0.061, [0, 0.55, 0.271], mats.blackMetal);
  cyl('Motor pulley belt channel', 0.215, 0.050, [0, 0.55, 0.319], mats.rubber);
  const pulleyStart = group.children.length;
  turnedFace('Motor pulley spun conical face', 0.210, 0.072, [0, 0.55, 0.330]);
  const pulleyParts = group.children.slice(pulleyStart);
  const beltZ = 0.310;
  path('Left drive belt', [[-1.15, 1.495, beltZ], [-0.154, 0.401, beltZ]], 0.0085, mats.rubber, group, false);
  path('Right drive belt', [[1.15, 1.495, beltZ], [0.154, 0.401, beltZ]], 0.0085, mats.rubber, group, false);
  const wrap = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI * (1.24 + (0.52 * i / 40));
    wrap.push([Math.cos(a) * 0.216, 0.55 + Math.sin(a) * 0.216, beltZ]);
  }
  path('Belt lower wrap', wrap, 0.0085, mats.rubber);
  cyl('Volume control rear seat', 0.163, 0.014, [0.87, 0.55, 0.248], mats.blackMetal);
  const volumeStart = group.children.length;
  turnedFace('Volume control spun dial', 0.160, 0.068, [0.87, 0.55, 0.256]);
  box('Volume engraved marker', [0.0025, 0.018, 0.001], [0.87, 0.684, 0.306], mats.blackMetal, 0.0006);
  const volumeParts = group.children.slice(volumeStart);

  // Tonearm bearing and lower counterweight assembly.
  box('Tonearm mounting bracket', [0.35, 0.57, 0.13], [-1.09, 0.50, 0.294], mats.blackMetal, 0.042, hardware);
  box('Gimbal cradle left', [0.052, 0.34, 0.15], [-1.239, 0.62, 0.386], mats.blackMetal, 0.020, hardware);
  box('Gimbal cradle right', [0.052, 0.34, 0.15], [-0.940, 0.62, 0.386], mats.blackMetal, 0.020, hardware);
  rod('Tonearm pivot axle', [-1.27, 0.69, 0.425], [-0.915, 0.69, 0.425], 0.038, mats.brushedMetal, hardware);
  rod('Tonearm lower pivot tube', [-1.09, 0.38, 0.435], [-1.09, 0.89, 0.435], 0.079, mats.blackMetal, hardware);
  rod('Pivot collar', [-1.09, 0.75, 0.435], [-1.09, 0.88, 0.435], 0.083, mats.brushedMetal, hardware);
  rod('Counterweight', [-1.09, 0.24, 0.435], [-1.09, 0.38, 0.435], 0.167, mats.blackMetal, hardware);
  rod('Counterweight edge collar', [-1.09, 0.252, 0.435], [-1.09, 0.276, 0.435], 0.170, mats.brushedMetal, hardware);
  rod('Bottom adjustment screw', [-1.09, 0.135, 0.435], [-1.09, 0.235, 0.435], 0.047, mats.brushedMetal, hardware);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2;
    rod('Adjustment screw fluting', [-1.09 + Math.cos(a) * 0.047, 0.142, 0.435 + Math.sin(a) * 0.047],
      [-1.09 + Math.cos(a) * 0.047, 0.219, 0.435 + Math.sin(a) * 0.047], 0.002, mats.blackMetal, hardware);
  }
  screw('Pivot face screw', [-1.09, 0.60, 0.518], 0.026, hardware);
  ring('Pivot screw washer', 0.030, 0.006, [-1.09, 0.60, 0.516], mats.silver, hardware);

  // Main straight arm, narrow highlight strip, and the lift/rest mechanism.
  const shaftStart = hardware.children.length;
  rod('Tonearm brushed shaft', [-1.09, 0.89, 0.435], [-1.09, 2.55, 0.435], 0.046, mats.brushedMetal, hardware);
  rod('Tonearm lower collar', [-1.09, 0.88, 0.435], [-1.09, 0.94, 0.435], 0.057, mats.blackMetal, hardware);
  rod('Tonearm headshell socket', [-1.09, 2.52, 0.435], [-1.09, 2.64, 0.435], 0.054, mats.blackMetal, hardware);
  const armParts = hardware.children.slice(shaftStart);
  rod('Cue lever axle', [-1.31, 0.974, 0.377], [-1.17, 0.974, 0.377], 0.044, mats.blackMetal, hardware);
  cyl('Cue lever pivot cap', 0.043, 0.028, [-1.246, 1.006, 0.423], mats.brushedMetal, hardware);
  screw('Cue lever screw', [-1.246, 1.006, 0.441], 0.018, hardware);
  rod('Cue lever', [-1.25, 1.01, 0.408], [-1.45, 1.26, 0.408], 0.013, mats.silver, hardware);
  rod('Cue lever rubber tip', [-1.408, 1.209, 0.408], [-1.453, 1.267, 0.408], 0.018, mats.blackMetal, hardware);
  path('Tonearm curved rest', [[-1.30, 1.02, 0.40], [-1.22, 1.065, 0.40], [-1.08, 1.08, 0.40], [-0.95, 1.04, 0.40]], 0.022, mats.blackMetal, hardware);

  // Cast headshell with slotted upper face, screws, a side finger-lift and stylus.
  const headshellStart = hardware.children.length;
  const shellShape = new THREE.Shape();
  shellShape.moveTo(-0.101, 0.23);
  shellShape.lineTo(0.106, 0.195);
  shellShape.lineTo(0.090, -0.195);
  shellShape.lineTo(0.018, -0.30);
  shellShape.lineTo(-0.013, -0.30);
  shellShape.lineTo(-0.103, -0.20);
  shellShape.closePath();
  const head = mesh('Cast aluminum headshell', new THREE.ExtrudeGeometry(shellShape, {
    depth: 0.037, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.006, bevelThickness: 0.005, steps: 1
  }), mats.brushedMetal, [-1.09, 2.79, 0.424], hardware);
  for (const [x, length, yy] of [[-1.153, 0.175, 2.75], [-1.095, 0.225, 2.78], [-1.038, 0.130, 2.74]]) {
    box('Headshell ventilation slot', [0.016, length, 0.003], [x, yy, 0.469], mats.blackMetal, 0.007, hardware);
    box('Slot inner wall glint', [0.002, length - 0.016, 0.001], [x - 0.006, yy, 0.472], mats.silver, 0.0005, hardware);
  }
  screw('Headshell left mounting screw', [-1.147, 2.965, 0.471], 0.019, hardware);
  screw('Headshell right mounting screw', [-1.038, 2.912, 0.471], 0.018, hardware);
  path('Headshell finger lift', [[-1.19, 2.98, 0.448], [-1.30, 3.075, 0.448], [-1.42, 3.115, 0.448]], 0.009, mats.brushedMetal, hardware);
  path('Headshell side brace', [[-1.195, 2.69, 0.442], [-1.229, 2.72, 0.442], [-1.226, 2.80, 0.442]], 0.008, mats.silver, hardware);
  box('Pickup cartridge', [0.12, 0.16, 0.073], [-1.09, 2.92, 0.366], mats.darkPlastic, 0.010, hardware);
  box('Cartridge green terminal', [0.032, 0.035, 0.022], [-1.004, 2.982, 0.410], mats.led, 0.004, hardware);
  rod('Stylus cantilever', [-1.115, 2.99, 0.339], [-1.123, 3.018, 0.306], 0.003, mats.silver, hardware);
  const stylus = ball('Stylus diamond tip', 0.004, [-1.123, 3.018, 0.303], mats.silver, hardware);
  path('Pickup wire loop', [[-1.15, 2.88, 0.365], [-1.16, 2.78, 0.361], [-1.10, 2.70, 0.39]], 0.004, mats.red, hardware);
  armParts.push(...hardware.children.slice(headshellStart));

  // Rear service details, only visible when the user rotates the product.
  for (const x of [-1.90, 1.90]) {
    for (const y of [0.35, 0.76]) {
      const s = cyl('Rear panel screw', 0.019, 0.006, [x, y, -0.650], mats.blackMetal);
    }
  }
  for (let i = 0; i < 14; i++) {
    box('Rear cooling slot', [0.018, 0.16, 0.004], [-0.77 + i * 0.048, 0.58, -0.649], mats.rubber, 0.008);
  }
  for (const [x, mat] of [[0.48, mats.red], [0.64, mats.silver]]) {
    cyl('Rear RCA socket collar', 0.034, 0.024, [x, 0.48, -0.659], mat);
    cyl('Rear RCA contact', 0.018, 0.026, [x, 0.48, -0.670], mats.gold);
    cyl('Rear RCA socket center', 0.009, 0.002, [x, 0.48, -0.685], mats.rubber);
  }
  cyl('Power input ring', 0.035, 0.014, [1.10, 0.48, -0.654], mats.blackMetal);
  cyl('Power input hole', 0.022, 0.016, [1.10, 0.48, -0.664], mats.rubber);
  box('Rear power switch', [0.093, 0.13, 0.017], [1.36, 0.50, -0.653], mats.blackMetal, 0.012);

  // Move complete assemblies to mechanical pivots without changing the
  // reference pose. Fixed brackets, the cue lever and dial seats stay put.
  function rig(name, position, parts, interaction) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(...position);
    if (interaction) pivot.userData.interaction = interaction;
    group.add(pivot);
    group.updateMatrixWorld(true);
    parts.forEach(part => pivot.attach(part));
    return pivot;
  }
  const tonearm = rig('Pivoting tonearm and pickup', [-1.09, 0.84, 0.435], armParts, 'tonearm');
  const volumeKnob = rig('Rotating volume dial', [0.87, 0.55, 0.256], volumeParts, 'volume');
  const motorPulley = rig('Rotating motor pulley', [0, 0.55, 0.330], pulleyParts, 'motor');

  return {
    group,
    record,
    tonearm,
    stylus,
    volumeKnob,
    motorPulley,
    hotspots: {
      vinyl: new THREE.Vector3(0.90, 2.90, 0.31),
      wood: new THREE.Vector3(0.38, 0.73, 0.24),
      tonearm: new THREE.Vector3(-1.09, 2.25, 0.44),
      fabric: new THREE.Vector3(1.77, 0.56, 0.30),
    },
  };
}
