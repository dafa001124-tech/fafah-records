// Glass Surface SVG optics adapted from React Bits by David Haz.
// https://github.com/DavidHDev/react-bits/tree/main/src/content/Components/GlassSurface
// MIT + Commons Clause: see vendor/react-bits-LICENSE.md.
const NS = 'http://www.w3.org/2000/svg';
let nextId = 0;
function node(tag, attributes = {}) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

export function createGlassSurface(button) {
  const id = `fafah-surface-${++nextId}`;
  const svg = node('svg', {width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false'});
  svg.classList.add('liquid-glass-filter-defs');
  const defs = node('defs');
  const filter = node('filter', {id, x: '0%', y: '0%', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB'});
  const map = node('feImage', {x: 0, y: 0, width: '100%', height: '100%', preserveAspectRatio: 'none', result: 'map'});
  filter.append(map);
  ['red', 'green', 'blue'].forEach((channel, index) => {
    const matrix = Array(20).fill(0);
    matrix[index * 6] = 1;
    matrix[18] = 1;
    filter.append(
      node('feDisplacementMap', {in: 'SourceGraphic', in2: 'map', scale: -70 + index * 3, xChannelSelector: 'R', yChannelSelector: 'G', result: `disp-${channel}`}),
      node('feColorMatrix', {in: `disp-${channel}`, type: 'matrix', values: matrix.join(' '), result: channel}),
    );
  });
  filter.append(node('feBlend', {in: 'red', in2: 'green', mode: 'screen', result: 'rg'}), node('feBlend', {in: 'rg', in2: 'blue', mode: 'screen'}));
  defs.append(filter); svg.append(defs); document.body.append(svg);
  const surface = document.createElement('span');
  surface.className = 'glass-surface-optics';
  surface.setAttribute('aria-hidden', 'true');
  button.prepend(surface);
  button.classList.add('glass-surface-button');
  // SVG backdrop filters are currently a Chromium feature; retain the reference's frosted fallback.
  const excluded = /Firefox/.test(navigator.userAgent) || (/Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent));
  if (!excluded && CSS.supports('backdrop-filter', `url(#${id})`)) {
    button.classList.add('glass-surface-svg');
    button.style.backdropFilter = `url(#${id}) saturate(1)`;
  }
  let size = '', disposed = false;
  const update = () => {
    if (disposed) return;
    const w = button.offsetWidth, h = button.offsetHeight;
    if (!w || !h || size === `${w}x${h}`) return;
    size = `${w}x${h}`;
    const edge = Math.min(w, h) * .035;
    const content = `<svg xmlns="${NS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>
        <linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>
        <filter id="soft" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="11"/></filter>
      </defs>
      <rect width="${w}" height="${h}" fill="black"/>
      <rect width="${w}" height="${h}" rx="16" fill="url(#r)"/>
      <rect width="${w}" height="${h}" rx="16" fill="url(#b)" style="mix-blend-mode:difference"/>
      <rect x="${edge}" y="${edge}" width="${w - edge * 2}" height="${h - edge * 2}" rx="16" fill="hsl(0 0% 50% / .93)" filter="url(#soft)"/>
    </svg>`;
    map.setAttribute('href', `data:image/svg+xml,${encodeURIComponent(content)}`);
  };
  const observer = new ResizeObserver(update);
  observer.observe(button); update();
  return {dispose() {
    if (disposed) return;
    disposed = true; observer.disconnect(); surface.remove(); svg.remove();
    button.classList.remove('glass-surface-button', 'glass-surface-svg');
    button.style.removeProperty('backdrop-filter');
  }};
}
