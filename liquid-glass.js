const SVG_NS = 'http://www.w3.org/2000/svg';
const instances = new WeakMap();
let nextId = 0;

function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

// A capsule-shaped lens bends only the thin, curved edge. Its centre stays clear.
function lensMap(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(width, height);
  const radius = height / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.max(radius, Math.min(width - radius, x + .5));
      const dx = x + .5 - cx, dy = y + .5 - radius;
      const length = Math.hypot(dx, dy);
      const inset = radius - length;
      const strength = inset > 0 ? 18 * Math.exp(-inset / 7) * (1 - Math.exp(-inset / 1.8)) : 0;
      const i = (y * width + x) * 4;
      image.data[i] = Math.round(127.5 + (length ? dx / length : 0) * strength / 30 * 255);
      image.data[i + 1] = Math.round(127.5 + (length ? dy / length : 0) * strength / 30 * 255);
      image.data[i + 2] = 128;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Adds a decorative glass surface; navigation, placement and visibility stay with the caller. */
export function createLiquidGlass(button) {
  if (instances.has(button)) return instances.get(button);
  const hadClass = button.classList.contains('liquid-glass-button');
  button.classList.add('liquid-glass-button');
  const surface = document.createElement('span');
  surface.className = 'liquid-glass-surface';
  surface.setAttribute('aria-hidden', 'true');
  const sheen = document.createElement('span');
  sheen.className = 'liquid-glass-sheen';
  sheen.setAttribute('aria-hidden', 'true');
  button.prepend(surface, sheen);

  const id = `fafah-glass-${++nextId}`;
  const svg = svgElement('svg', {width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false'});
  svg.classList.add('liquid-glass-filter-defs');
  const defs = svgElement('defs');
  const filter = svgElement('filter', {id, x: 0, y: 0, width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB'});
  const map = svgElement('feImage', {x: 0, y: 0, width: '100%', height: '100%', preserveAspectRatio: 'none', result: 'lens'});
  const displacement = svgElement('feDisplacementMap', {in: 'SourceGraphic', in2: 'lens', scale: 30, xChannelSelector: 'R', yChannelSelector: 'G'});
  filter.append(map, displacement);
  defs.append(filter);
  svg.append(defs);
  document.body.append(svg);

  let disposed = false, frame = 0, width = 0, height = 0;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const oldOptics = button.style.getPropertyValue('--glass-optics');
  const oldX = button.style.getPropertyValue('--glass-x');
  const oldY = button.style.getPropertyValue('--glass-y');
  const point = {x: 68, y: 0, tx: 68, ty: 0};
  const updateMap = () => {
    if (disposed) return;
    // Layout size ignores the entrance transform applied to an ancestor.
    const w = Math.max(1, Math.round(button.offsetWidth));
    const h = Math.max(1, Math.round(button.offsetHeight));
    if (!w || !h || (w === width && h === height)) return;
    width = w; height = h;
    const data = lensMap(w, h);
    if (data) {
      map.setAttribute('href', data);
      button.style.setProperty('--glass-optics', `url("#${id}") blur(1.6px) saturate(1.18)`);
    }
  };
  const paint = () => {
    frame = 0;
    if (disposed) return;
    point.x += (point.tx - point.x) * .22;
    point.y += (point.ty - point.y) * .22;
    button.style.setProperty('--glass-x', `${point.x.toFixed(2)}%`);
    button.style.setProperty('--glass-y', `${point.y.toFixed(2)}%`);
    if (Math.abs(point.tx - point.x) + Math.abs(point.ty - point.y) > .2) frame = requestAnimationFrame(paint);
  };
  const wake = () => { if (!frame && !disposed) frame = requestAnimationFrame(paint); };
  const move = event => {
    if (motion.matches || !fine.matches || event.pointerType === 'touch') return;
    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    point.tx = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
    point.ty = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100));
    wake();
  };
  const reset = () => {
    point.tx = 68; point.ty = 0;
    if (motion.matches) {
      cancelAnimationFrame(frame); frame = 0;
      point.x = point.tx; point.y = point.ty;
      button.style.removeProperty('--glass-x'); button.style.removeProperty('--glass-y');
    } else wake();
  };
  button.addEventListener('pointermove', move, {passive: true});
  button.addEventListener('pointerleave', reset, {passive: true});
  motion.addEventListener('change', reset);
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateMap) : null;
  observer?.observe(button);
  updateMap();
  const api = {
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      button.removeEventListener('pointermove', move);
      button.removeEventListener('pointerleave', reset);
      motion.removeEventListener('change', reset);
      surface.remove(); sheen.remove(); svg.remove();
      if (!hadClass) button.classList.remove('liquid-glass-button');
      for (const [name, oldValue] of [['--glass-optics',oldOptics],['--glass-x',oldX],['--glass-y',oldY]]) {
        if (oldValue) button.style.setProperty(name, oldValue); else button.style.removeProperty(name);
      }
      instances.delete(button);
    },
  };
  instances.set(button, api);
  return api;
}
