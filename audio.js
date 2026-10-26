import {createSoundEffects} from './sound-effects.js';

// User-supplied BGM, loaded only after the viewer's first playback gesture.
const musicURL = new URL('./assets/bgm-34749bdc226f.mp3', import.meta.url).href;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

function random(seed = 0x16b1a5) {
  return () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
}

function makeSurfaceNoise(context) {
  const sampleRate = 22050, count = sampleRate * 8, rand = random(49179);
  const buffer = context.createBuffer(1, count, sampleRate), data = buffer.getChannelData(0);
  let smooth = 0;
  for (let i = 0; i < count; i++) {
    smooth = smooth * .72 + (rand() * 2 - 1) * .28;
    data[i] = smooth * .035;
  }
  for (let tick = 0; tick < 33; tick++) {
    const start = Math.floor(rand() * (count - 120)), amplitude = .04 + rand() * .07;
    for (let i = 0; i < 90; i++) data[start + i] += (rand() * 2 - 1) * amplitude * Math.exp(-i / 11);
  }
  return buffer;
}

export function createTurntableAudio() {
  let context, music, surface, musicGain, surfaceGain, master, lowpass;
  let unlocked = false, disposed = false, ready = false, wasRunning = false;
  let loading = null;
  let effects, muted = false, effectEpoch = 0;
  try { muted = localStorage.getItem('fafah-sound-muted') === 'true'; } catch {}
  const loadController = new AbortController();
  const state = {speed:0, contact:0, volume:.35};
  const applied = {};
  const gainForVolume = () => Math.pow(state.volume, 1.25) * .80;

  function apply() {
    if (!context || disposed) return;
    const now = context.currentTime;
    const volume = muted || document.hidden ? 0 : gainForVolume();
    if (Math.abs(volume - (applied.volume ?? -1)) > .0002) {
      master.gain.setTargetAtTime(volume, now, .025); applied.volume = volume;
    }
    if (!ready) return;
    const speedGain = clamp((state.speed - .12) / .23);
    const contact = state.contact * speedGain;
    function target(parameter, value, key, timeConstant) {
      if (Math.abs(value - applied[key]) < .0002) return;
      // Keep an animation-frame update from filling the audio automation queue
      // once the physical controls have settled.
      parameter.setTargetAtTime(value, now, timeConstant); applied[key] = value;
    }
    target(music.playbackRate, state.speed, 'rate', .055);
    target(surface.playbackRate, Math.max(.02, state.speed), 'noiseRate', .055);
    target(musicGain.gain, contact, 'contact', contact > .01 ? .055 : .075);
    target(surfaceGain.gain, contact * .065, 'noise', .06);
    target(lowpass.frequency, 900 + state.speed * 3800, 'cutoff', .08);
  }

  async function loadMusic() {
    const response = await fetch(musicURL, {signal: loadController.signal});
    if (!response.ok) throw new Error(`BGM could not load (${response.status})`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    if (disposed) return;
    music = context.createBufferSource(); music.buffer = buffer; music.loop = true;
    music.playbackRate.value = 0; music.connect(lowpass);
    surface = context.createBufferSource(); surface.buffer = makeSurfaceNoise(context); surface.loop = true;
    surface.connect(surfaceGain); surfaceGain.connect(master); surface.playbackRate.value = .02;
    music.start(); surface.start(); ready = true;
  }

  async function ensureContext() {
    if (disposed) return false;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      if (!context) {
        // Create and resume synchronously inside the caller's user gesture.
        context = new AudioContextClass({latencyHint:'interactive'});
        const resume = context.resume();
        master = context.createGain(); master.gain.value = 0;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -14; compressor.knee.value = 12;
        compressor.ratio.value = 2; compressor.attack.value = .01; compressor.release.value = .2;
        master.connect(compressor); compressor.connect(context.destination);
        musicGain = context.createGain(); musicGain.gain.value = 0;
        surfaceGain = context.createGain(); surfaceGain.gain.value = 0;
        lowpass = context.createBiquadFilter(); lowpass.type = 'lowpass';
        lowpass.frequency.value = 4200; lowpass.Q.value = .4;
        lowpass.connect(musicGain); musicGain.connect(master);
        effects = createSoundEffects(context, master);
        await resume;
      } else if (context.state !== 'running') await context.resume();
      if (disposed) return false;
      unlocked = context.state === 'running';
      apply();
      return unlocked;
    } catch (error) {
      if (!disposed) console.warn('Turntable audio is unavailable:', error.message);
      return false;
    }
  }

  async function unlock() {
    if (!await ensureContext()) return false;
    try {
      if (!ready) {
        loading ||= loadMusic().finally(() => { loading = null; });
        await loading;
      }
      apply(); return !disposed;
    } catch (error) {
      if (!disposed) console.warn('Turntable music is unavailable:', error.message);
      return false;
    }
  }

  async function effect(name, {wake = true} = {}) {
    if (disposed || muted || document.hidden) return;
    const requested = performance.now(), epoch = effectEpoch;
    if (context?.state !== 'running' && (!wake || !await ensureContext())) return;
    // Never replay queued UI sounds after a blocked resume, mute or tab switch.
    if (disposed || muted || document.hidden || epoch !== effectEpoch || performance.now() - requested > 180) return;
    apply(); effects?.play(name);
  }

  function setMuted(value) {
    muted = Boolean(value); effectEpoch++;
    if (muted) effects?.stop();
    try { localStorage.setItem('fafah-sound-muted', String(muted)); } catch {}
    apply();
    if (!muted) effect('dial');
  }

  function update(next = {}) {
    for (const key of ['speed','contact','volume']) {
      if (next[key] !== undefined) state[key] = clamp(next[key]);
    }
    apply();
  }

  function needle() {
    effect('needle', {wake:false});
  }

  function onVisibilityChange() {
    if (!context || disposed) return;
    if (document.hidden) {
      effectEpoch++; effects?.stop();
      wasRunning = context.state === 'running';
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(0, context.currentTime);
      applied.volume = 0;
      context.suspend().catch(() => {});
    } else if (wasRunning && unlocked && state.contact > .02 && state.speed > .12) {
      // Resume an already playing record softly; a previously silent turntable
      // stays suspended until the next physical interaction.
      context.resume().then(apply).catch(() => {});
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  function getState() {
    return {...state, muted, unlocked, ready, contextState:context?.state || 'not-created',
      playing:!!(ready && unlocked && !muted && state.volume > .001 && context.state === 'running' && !document.hidden && state.contact > .02 && state.speed > .12),
      loopSeconds:music?.buffer?.duration || 0, track:'bgm.mp3'};
  }
  function dispose() {
    disposed = true;
    effectEpoch++; effects?.stop();
    loadController.abort();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    for (const source of [music,surface]) {try {source?.stop();source?.disconnect();} catch {}}
    context?.close().catch(() => {});
  }
  return {unlock, activate:ensureContext, update, needle, effect, setMuted, getState, dispose};
}
