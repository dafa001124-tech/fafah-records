import * as THREE from 'three';

// Full-disc artwork is separate from the eventual project video/poster.
// Each texture is shared by the physical record and its gallery clones.
function mediaURL(value, kind) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const raw = value.trim();
  if (/^data:/i.test(raw)) return new RegExp(`^data:${kind}/`, 'i').test(raw) ? raw : '';
  try {
    const url = new URL(raw, document.baseURI);
    return ['http:', 'https:', 'file:', 'blob:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function blankLabel(canvas, id) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(canvas.width / 1024, canvas.height / 1024);
  ctx.fillStyle = '#eeeeeb';
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.strokeStyle = '#deded9';
  ctx.lineWidth = 1.5;
  for (const radius of [476, 458]) {
    ctx.beginPath(); ctx.arc(512, 512, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#262626';
  ctx.textAlign = 'center';
  ctx.font = 'bold 61px Arial, sans-serif';
  ctx.fillText('fafah', 512, 247);
  ctx.font = 'normal 222px Arial, sans-serif';
  ctx.fillText(id, 512, 765);
  ctx.restore();
}

function cover(ctx, source, fullFace = false) {
  const width = source.videoWidth || source.naturalWidth;
  const height = source.videoHeight || source.naturalHeight;
  if (!width || !height) return false;
  const edge = Math.min(width, height);
  // Two draft exports include two transparent rows below the square artwork.
  const cropY = fullFace && height - width >= 0 && height - width <= 2 ? 0 : (height - edge) / 2;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(source, (width - edge) / 2, cropY, edge, edge, 0, 0, ctx.canvas.width, ctx.canvas.height);
  return true;
}

export function createPortfolioRecords({ projects, baseMaterial }) {
  let visible = false, index = 0, disposed = false;
  const imagesReady = [];
  let sharedLabelMask;
  const slots = projects.map((project, i) => {
    // Reuse the actual home label and black vinyl instead of generating a placeholder.
    if (project.original) return {project, material:baseMaterial, fullFace:false, original:true, video:null, videoURL:''};
    const artwork = mediaURL(project.recordArtwork, 'image');
    const fullFace = Boolean(artwork);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = fullFace && !matchMedia('(pointer: coarse)').matches ? 2048 : 1024;
    blankLabel(canvas, project.id || String(i + 1).padStart(2, '0'));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = baseMaterial.map?.anisotropy || 8;
    texture.name = `Portfolio ${fullFace ? 'disc artwork' : 'sleeve'} ${project.id}`;
    // Match the source artwork's sRGB colours without lighting or ACES compression.
    // The separate record body, edge and spindle lip retain their lit 3D materials.
    const material = fullFace
      ? new THREE.MeshBasicMaterial({color: 0xffffff, toneMapped: false})
      : baseMaterial.clone();
    material.name = `Portfolio ${fullFace ? 'printed disc' : 'sleeve'} ${project.id}`;
    material.map = texture;
    if (project.blackVinyl) {
      // Keep the original-size centre artwork and its projecting white title strip.
      // The transparent exterior reveals the exact homepage PVC material beneath.
      if (!sharedLabelMask) {
        const mask = document.createElement('canvas');
        mask.width = mask.height = 2048;
        const ctx = mask.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 2048, 2048);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(1024, 1024, 2048 * .171875, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(2048 * .3175, 2048 * .4775, 2048 * .365, 2048 * .045);
        sharedLabelMask = new THREE.CanvasTexture(mask);
      }
      material.alphaMap = sharedLabelMask;
      material.alphaTest = .01;
    }
    const slot = { project, canvas, texture, material, fullFace, image: null, posterReady: false,
      video: null, videoURL: mediaURL(project.previewVideo, 'video'), videoFailed: false,
      playing: false, playPending: false, blocked: false, time: 0, frame: -1 };
    const poster = artwork || mediaURL(project.poster, 'image');
    if (poster) {
      const image = new Image(); image.crossOrigin = 'anonymous'; slot.image = image;
      let finishImage;
      imagesReady.push(new Promise(resolve => { finishImage = resolve; }));
      image.onload = () => {
        if (disposed) { finishImage(); return; }
        slot.posterReady = true;
        if (!slot.playing && cover(canvas.getContext('2d'), image, fullFace)) texture.needsUpdate = true;
        finishImage();
      };
      image.onerror = () => { slot.posterReady = false; finishImage(); };
      image.src = poster;
    }
    return slot;
  });

  function fallback(slot) {
    const ctx = slot.canvas.getContext('2d');
    if (!slot.posterReady || !cover(ctx, slot.image, slot.fullFace)) {
      blankLabel(slot.canvas, slot.project.id);
    }
    slot.texture.needsUpdate = true;
  }
  function release(slot) {
    const video = slot.video;
    if (!video) return;
    slot.time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    video.onloadedmetadata = video.onerror = null;
    video.pause(); video.removeAttribute('src'); video.load(); video.remove();
    slot.video = null; slot.playing = slot.playPending = false; slot.frame = -1;
    fallback(slot);
  }
  function ensure(slot) {
    if (slot.video || !slot.videoURL || slot.videoFailed) return;
    const video = document.createElement('video');
    video.muted = true; video.defaultMuted = true; video.loop = true;
    video.playsInline = true; video.preload = 'metadata'; video.crossOrigin = 'anonymous';
    video.setAttribute('playsinline', ''); video.setAttribute('muted', '');
    video.onloadedmetadata = () => {
      if (slot.time && Number.isFinite(video.duration)) {
        video.currentTime = slot.time % video.duration;
      }
    };
    video.onerror = () => { slot.videoFailed = true; release(slot); };
    video.src = slot.videoURL; slot.video = video;
  }
  function draw(slot) {
    const video = slot.video;
    if (!video || video.readyState < 2 || Math.abs(video.currentTime - slot.frame) < 1 / 30) return;
    try {
      if (cover(slot.canvas.getContext('2d'), video)) {
        slot.frame = video.currentTime; slot.texture.needsUpdate = true;
      }
    } catch { slot.videoFailed = true; release(slot); }
  }
  function sync() {
    slots.forEach((slot, i) => {
      const distance = Math.min(Math.abs(i - index), slots.length - Math.abs(i - index));
      const active = visible && !document.hidden && distance <= 1;
      if (!active) { release(slot); return; }
      ensure(slot);
      const video = slot.video;
      if (!video) return;
      if (!slot.playing && !slot.playPending && !slot.blocked) {
        slot.playPending = true;
        Promise.resolve(video.play()).then(() => {
          if (slot.video !== video || disposed) return;
          slot.playPending = false; slot.playing = true;
        }).catch(() => {
          if (slot.video !== video || disposed) return;
          slot.playPending = false; slot.blocked = true; fallback(slot);
        });
      }
      draw(slot);
    });
  }
  const hasVideo = slots.some(slot => slot.videoURL);
  const visibility = () => { if (hasVideo) sync(); };
  const unlock = () => { slots.forEach(slot => { slot.blocked = false; }); sync(); };
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('pointerdown', unlock, { passive: true });
  document.addEventListener('keydown', unlock);
  return {
    entries: slots.map(slot => ({ id: slot.project.id, material: slot.material, fullFace: slot.fullFace, blackVinyl: Boolean(slot.project.blackVinyl) })),
    ready: Promise.all(imagesReady),
    update(state) {
      visible = Boolean(state.visible);
      index = Math.max(0, Math.min(slots.length - 1, state.index || 0));
      if (!disposed && hasVideo) sync();
    },
    dispose() {
      disposed = true;
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      slots.forEach(slot => {
        if (slot.original) return; // The scene owns the original label and its texture.
        release(slot);
        if (slot.image) { slot.image.onload = slot.image.onerror = null; slot.image.src = ''; }
        slot.texture.dispose(); slot.material.dispose();
      });
      sharedLabelMask?.dispose();
    },
  };
}
