// ── DIRECTOR: master clock, master timeline, render loop, minimal player UI
import * as THREE from 'three';
import { gsap } from 'gsap';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { T, E } from './config.js';
import { clamp, smooth, decayEnv } from './util.js';
import { makeGlyphAtlas, makeFogTexture, makeNoiseTexture, makeMonitorScreen, MONO, ARAB } from './textures.js';
import { Post } from './post.js';
import { createAct1 } from './acts/act1.js';
import { createAct2 } from './acts/act2.js';
import { createAct3 } from './acts/act3.js';
import { createAct4 } from './acts/act4.js';
import { AudioEngine } from './audio.js';
import { VoiceOver } from './vo.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || Math.min(screen.width, screen.height) < 760;
const Q = params.has('q') ? +params.get('q') : isMobile ? 0.55 : 1;

async function boot() {
  const status = $('#status');
  try { await Promise.all([`500 40px ${MONO}`, `400 40px ${MONO}`, `500 40px ${ARAB}`, `300 40px ${ARAB}`].map((f) => document.fonts.load(f, 'Aب'))); } catch {}

  const canvas = $('#stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = true;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  RectAreaLightUniformsLib.init();
  const post = new Post(renderer, Q);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 220);

  const atlas = makeGlyphAtlas();
  const noise = makeNoiseTexture(9, 256, 28);
  const fogTex = makeFogTexture(3, 256);
  const screenUI = makeMonitorScreen(atlas);
  const env = { atlas, noise, fogTex, screen: screenUI, q: Q, renderer };
  const acts = [createAct1(env), createAct2(env), createAct3(env), createAct4(env)];

  // ── MASTER TIMELINE (GSAP, seeked by the audio clock every frame)
  const tl = gsap.timeline({ paused: true });
  const P = { exposure: 0, bars: 0, grain: 0.07, ca: 0.35, lift: 1, vig: 1 };
  tl.to(P, { exposure: 1, duration: 5.2, ease: 'power2.in' }, T.reveal);
  tl.to(P, { bars: 1, duration: 3.5, ease: 'sine.inOut' }, 0.4);
  tl.to(P, { grain: 0.085, ca: 0.6, duration: 2, ease: 'sine.in' }, T.S3);
  tl.set(P, { exposure: 0, grain: 0.05, ca: 0.25 }, T.S4);          // sudden stop
  tl.to(P, { exposure: 1, duration: 3.6, ease: 'sine.inOut' }, T.fogIn);
  tl.to(P, { grain: 0.075, duration: 6, ease: 'sine.in' }, T.fogIn);
  acts.forEach((a) => a.build(tl));
  tl.set({}, {}, T.END + 0.01);

  const audio = new AudioEngine();
  const vo = new VoiceOver($('#subs'));
  let playing = false, startedAt = 0, ended = false, lastAct = -1, lastT = -1, fallbackClock = false;
  const still = params.has('still') ? +params.get('still') : null;

  let dynScale = 1;
  function size() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, isMobile ? 1.25 : 1.5, 2600 / Math.max(w, h)) * dynScale;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    post.setSize(w, h, dpr);
  }
  addEventListener('resize', size); size();

  const cutsAll = acts.flatMap((a) => a.cuts || []);
  function frame(t) {
    const aspect = innerWidth / innerHeight;
    if (t >= T.END) { post.render(null, null, true); return; }
    tl.time(Math.max(0, t), true);
    let ai = acts.findIndex((a) => t >= a.start && t < a.end); if (ai < 0) ai = 0;
    const act = acts[ai];
    act.update(t, camera, aspect);
    if (ai !== lastAct || cutsAll.some((c) => lastT < c && t >= c) || Math.abs(t - lastT) > 0.25) post.cut();
    lastAct = ai; lastT = t;
    const U = post.U;
    U.uTime.value = t;
    U.uExposure.value = t < T.S4 + 0.0001 && t >= T.S4 ? 0 : P.exposure;
    const glitch = clamp(decayEnv(t, E.glitch)) * (t < T.S4 ? 1 : 0);
    U.uGlitch.value = glitch * 0.85;
    U.uRed.value = clamp(decayEnv(t, E.red)) * (t < T.S4 ? 1 : 0);
    U.uFlash.value = clamp(decayEnv(t, E.flash)) * (t < T.S4 ? 1 : 0);
    const barT = aspect > 1.45 ? Math.max(0, (1 - aspect / 2.2) / 2) : 0;
    U.uBars.value = barT * P.bars; U.uGrain.value = P.grain; U.uCA.value = P.ca;
    post.bloom.strength = act.bloom; post.bloom.radius = 0.6; post.bloom.threshold = act.threshold ?? 0.2;
    post.C.uMotion.value = act.motion();
    post.C.uMaxCoc.value = 0.011;
    // Scene 4 begins in total darkness: render black while exposure is 0
    if (t >= T.S4 && t < T.fogIn) { post.render(null, null, true); return; }
    post.render(act.scene, camera);
  }

  // pre-warm every act (compile shaders, upload textures) behind the intro screen
  status.textContent = 'PREPARING';
  for (const a of acts) { const t = a.start + 0.5; frame(t); renderer.compile(a.scene, camera); }
  frame(0);
  status.textContent = '';
  $('#start').disabled = false; document.body.classList.add('ready');

  function clock() {
    if (still != null) return still;
    if (!fallbackClock && audio.ctx) return audio.now() + startedAt;
    return (performance.now() - fallbackStart) / 1000 + startedAt;
  }
  let fallbackStart = 0;
  async function start() {
    if (playing) return;
    try { audio.unlock(); } catch (e) { console.warn(e); }
    document.body.classList.add('playing'); document.body.classList.remove('ended');
    ended = false; vo.reset();
    startedAt = params.has('t') ? +params.get('t') : 0;
    try { await audio.init(); audio.resetClock(); if (startedAt === 0) audio.start(); else fallbackClock = true; } catch (e) { console.warn('audio unavailable', e); fallbackClock = true; }
    if (startedAt > 0 && audio.ctx) { fallbackClock = true; }
    fallbackStart = performance.now();
    playing = true; tl.time(0); lastAct = -1; lastT = -1;
    requestAnimationFrame(loop);
    showCtrl();
  }
  // adaptive resolution: keep motion smooth on weaker GPUs
  let perfN = 0, perfT = performance.now(), perfLast = performance.now();
  function adapt() {
    const now = performance.now(); perfN++;
    if (now - perfT > 1200) {
      const fps = perfN * 1000 / (now - perfT); perfN = 0; perfT = now;
      if (fps < 42 && dynScale > 0.55) { dynScale = Math.max(0.55, dynScale * 0.82); size(); }
      else if (fps > 58 && dynScale < 1) { dynScale = Math.min(1, dynScale * 1.08); size(); }
    }
  }
  function loop() {
    if (!playing) return;
    if (still == null && !params.has('fixed')) adapt();
    const t = clock();
    frame(t);
    vo.update(t);
    if (t >= T.END) {
      // HARD CUT: picture already black on this frame; sound gated at the same instant on the audio clock
      vo.cut(); playing = false; ended = true; audio.stop && setTimeout(() => audio.stop(), 200);
      document.body.classList.add('ended'); document.body.classList.remove('playing');
      setTimeout(() => { if (ended) document.body.classList.add('show-replay'); }, 2800);
      return;
    }
    requestAnimationFrame(loop);
  }
  $('#start').addEventListener('click', start);
  $('#replay').addEventListener('click', () => { document.body.classList.remove('show-replay'); fallbackClock = false; start(); });
  const muteBtn = $('#mute');
  muteBtn.addEventListener('click', () => { const m = !audio.muted; audio.setMuted(m); muteBtn.classList.toggle('off', m); });
  $('#fs').addEventListener('click', toggleFs);
  if (!(document.fullscreenEnabled || document.webkitFullscreenEnabled)) $('#fs').hidden = true;   // e.g. iPhone Safari
  function toggleFs() {
    const d = document, el = d.documentElement;
    if (!(d.fullscreenElement || d.webkitFullscreenElement)) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); else (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') toggleFs();
    if (e.key === 'm' || e.key === 'M') muteBtn.click();
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (!playing) (ended ? $('#replay') : $('#start')).click(); }
  });
  // controls stay out of the way: they fade after 2 s of stillness
  let hideT; function showCtrl() { document.body.classList.add('ctrl-on'); clearTimeout(hideT); hideT = setTimeout(() => document.body.classList.remove('ctrl-on'), 2200); }
  addEventListener('pointermove', showCtrl); addEventListener('touchstart', showCtrl, { passive: true });

  // test hooks
  window.__teaser = { AudioEngine, frame: (t) => { frame(t); vo.update(t); }, T, acts, start };
  if (still != null) { document.body.classList.add('playing'); frame(still); vo.update(still, { muted: true, recorded: true }); }
}
boot();
