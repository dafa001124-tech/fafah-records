// Short, locally synthesized mechanical sounds; no media downloads or sample licensing.
const presets = {
  switchOn: {duration:.28, body:135, gain:.34, clicks:[0,.027], motor:1},
  switchOff: {duration:.21, body:105, gain:.28, clicks:[0,.018], motor:-1},
  lift: {duration:.09, body:520, gain:.16, clicks:[0,.018]},
  needle: {duration:.085, body:230, gain:.23, clicks:[0,.012,.035]},
  dial: {duration:.026, body:760, gain:.12, clicks:[0]},
  browse: {duration:.045, body:430, gain:.12, clicks:[0]},
  load: {duration:.32, body:155, gain:.28, clicks:[.018,.115], air:.08},
  navigate: {duration:.10, body:360, gain:.13, clicks:[0], air:.025},
};

export function effectSamples(name, sampleRate = 22050) {
  const preset = presets[name];
  if (!preset) return null;
  const {duration, body, gain, clicks, motor = 0, air = 0} = preset;
  const samples = new Float32Array(Math.ceil(duration * sampleRate));
  let seed = 19377, noise = 0;
  for (let i = 0; i < samples.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    noise = noise * .55 + ((seed >>> 0) / 4294967296 * 2 - 1) * .45;
    const t = i / sampleRate;
    let value = 0;
    for (const start of clicks) {
      const age = t - start;
      if (age < 0) continue;
      const attack = Math.min(1, age / .0015);
      value += attack * (noise * .7 * Math.exp(-age * 160)
        + Math.sin(age * Math.PI * 2 * body) * .48 * Math.exp(-age * 65));
    }
    if (motor) value += Math.sin(2 * Math.PI * ((motor > 0 ? 55 : 90) * t + motor * 65 * t * t))
      * .12 * Math.sin(Math.PI * t / duration) ** 2;
    value += noise * air * Math.sin(Math.PI * t / duration) ** 2;
    samples[i] = value * gain * Math.min(1, (duration - t) / .008);
  }
  return samples;
}

export function createSoundEffects(context, output) {
  const buffers = new Map(), active = new Set(), lastPlayed = new Map();
  function play(name) {
    const now = context.currentTime;
    if (active.size >= 6 || now - (lastPlayed.get(name) ?? -Infinity) < (name === 'dial' ? .055 : .09)) return;
    if (!buffers.has(name)) {
      const samples = effectSamples(name);
      if (!samples) return;
      const buffer = context.createBuffer(1, samples.length, 22050);
      buffer.getChannelData(0).set(samples); buffers.set(name, buffer);
    }
    lastPlayed.set(name, now);
    const source = context.createBufferSource(); source.buffer = buffers.get(name);
    source.connect(output); active.add(source);
    source.onended = () => { source.disconnect(); active.delete(source); };
    source.start();
  }
  function stop() {
    for (const source of active) { try { source.stop(); } catch {} source.disconnect(); }
    active.clear();
  }
  return {play, stop};
}
