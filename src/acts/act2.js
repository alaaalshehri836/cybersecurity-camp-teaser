// ── ACT 2 · THE CIPHER — shots B, C (three macro vignettes), D (the stream)
import * as THREE from 'three';
import { T, E, C } from '../config.js';
import { glyphField, fogVolume, streams, panelMaterial, LAYER, SH } from '../fx/fx.js';
import { makePanel, makeRingTexture, MONO } from '../textures.js';
import { makeRig, applyRig } from '../cam.js';
import { clamp, smooth, decayEnv, mulberry32 } from '../util.js';

const RX = { B: 0, C1: 200, C2: 400, C3: 600, D: 800 };

export function createAct2(env) {
  const { atlas, noise, fogTex, q } = env;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030207);
  scene.fog = new THREE.FogExp2(0x06030c, 0.05);
  scene.add(new THREE.HemisphereLight(0x3a2380, 0x020103, 0.5));

  // ── SHOT B: dark space of floating cryptographic symbols, strong parallax
  const fieldB = glyphField(atlas, {
    count: Math.round(2600 * q), seed: 12, boxMin: [-10, -6, -34], boxSize: [20, 12, 42], flick: 0.3, red: 0.045, turq: 0.035, gain: 1.7,
    spawn: (i, r) => {
      const toward = r() < 0.55;
      return { p: [-10 + r() * 20, -6 + r() * 12, -34 + r() * 42], v: [(r() - 0.5) * 0.15, (r() - 0.5) * 0.1, toward ? 0.5 + r() * 1.8 : -(0.2 + r() * 0.7)], size: 0.05 + r() * 0.12, life: [3 + r() * 5, r() * 9] };
    },
  });
  const nearB = glyphField(atlas, {
    count: Math.round(70 * q), seed: 13, boxMin: [-3.5, -2, -2], boxSize: [7, 4, 9], flick: 0.1, red: 0.1, gain: 1.4,
    spawn: (i, r) => ({ p: [-3.5 + r() * 7, -2 + r() * 4, -2 + r() * 9], v: [(r() - 0.5) * 0.3, (r() - 0.5) * 0.2, 0.3 + r() * 0.9], size: 0.22 + r() * 0.35, life: [4 + r() * 4, r() * 8] }),
  });
  scene.add(fieldB, nearB);

  // ── SHOT C: macro vignettes (each: emerges, moves, dissolves into darkness)
  const P = (kind, seed, w, h) => { const p = makePanel(kind, seed); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), panelMaterial(p.texture, noise, { fogDensity: 0.06, gain: 1.05 })); m.userData.p = p; return m; };
  const c1a = P('hex', 3, 2.4, 1.5); c1a.position.set(RX.C1, 0, 0); c1a.rotation.y = 0.3;
  const c1b = P('binary', 4, 2.0, 1.25); c1b.position.set(RX.C1 + 1.9, 0.3, -1.9); c1b.rotation.y = -0.1;
  const c1c = P('hash', 5, 1.3, 0.8); c1c.position.set(RX.C1 - 1.6, -0.55, -2.6); c1c.rotation.y = 0.8;
  const c3a = P('math', 6, 2.4, 1.5); c3a.position.set(RX.C3, 0, 0); c3a.rotation.y = -0.45;
  const c3b = P('key', 7, 2.4, 1.5); c3b.position.set(RX.C3 + 1.9, 0.25, -1.7); c3b.rotation.y = -0.15;
  const c3c = P('scramble', 8, 1.8, 1.1); c3c.position.set(RX.C3 - 1.9, -0.4, -2.4); c3c.rotation.y = 0.4;
  const panels = [c1a, c1b, c1c, c3a, c3b, c3c];
  panels.forEach((m) => scene.add(m));

  // cipher wheel (substitution disc): outer Latin ring, inner Arabic ring, rune core
  const wheel = new THREE.Group(); wheel.position.set(RX.C2, 0, 0); wheel.rotation.x = -0.55; scene.add(wheel);
  const ringMat = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: true, color: new THREE.Color(1.3, 1.3, 1.3), side: THREE.DoubleSide });
  const outer = new THREE.Mesh(new THREE.CircleGeometry(1.5, 128), ringMat(makeRingTexture({ inner: 0.66, outer: 0.98, seed: 2 })));
  const inner = new THREE.Mesh(new THREE.CircleGeometry(1.0, 128), ringMat(makeRingTexture({ inner: 0.55, outer: 0.97, chars: 'HIJKLMNOPQRSTUVWXYZABCDEFG', font: MONO, color: '#EDEDED', seed: 3 })));
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.55, 96), ringMat(makeRingTexture({ inner: 0.2, outer: 0.96, chars: '0123456789ABCDEF', font: MONO, color: '#A380FF', ticks: 32, seed: 4 })));
  inner.position.z = 0.03; core.position.z = 0.06;
  const pointer = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(C.red).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending }));
  pointer.position.set(0, 1.1, 0.08);
  wheel.add(outer, inner, core, pointer);
  const wheelMats = [outer.material, inner.material, core.material, pointer.material];

  // dust of glyphs around the vignettes (re-positioned per vignette)
  const fieldC = glyphField(atlas, {
    count: Math.round(500 * q), seed: 17, boxMin: [-5, -3, -6], boxSize: [10, 6, 10], flick: 0.4, red: 0.06, gain: 1.2,
    spawn: (i, r) => ({ p: [-5 + r() * 10, -3 + r() * 6, -6 + r() * 10], v: [(r() - 0.5) * 0.2, (r() - 0.5) * 0.15, (r() - 0.5) * 0.3], size: 0.03 + r() * 0.06, life: [2 + r() * 3, r() * 5] }),
  });
  scene.add(fieldC);

  // ── SHOT D: the river of encrypted characters (travels −x, camera chases)
  const river = glyphField(atlas, {
    count: Math.round(3200 * q), seed: 19, boxMin: [RX.D - 75, -1.0, -1.8], boxSize: [85, 2.0, 3.6], drift: [-17, 0, 0], flick: 0.2, red: 0.05, turq: 0.05, gain: 1.9, cycleFrac: 0.8,
    spawn: (i, r) => { const y = (r() + r() + r() - 1.5) * 0.6, z = (r() + r() - 1) * 1.6; return { p: [RX.D - 75 + r() * 85, y, z], v: [-(r() * 9), 0, 0], size: 0.05 + r() * 0.08, life: [2.5 + r() * 3, r() * 5] }; },
  });
  const trails = streams({ count: Math.round(260 * q), span: 90, speed: [20, 42], len: [1.5, 6], thick: 0.012, red: 0.07, gain: 2.4, place: (i, r) => [(r() - 0.5) * 3.6, (r() + r() - 1) * 1.1] });
  trails.rotation.y = -Math.PI / 2; trails.position.set(RX.D - 35, 0, 0);
  scene.add(river, trails);

  // ── fog (moved to each shot's location; lit by its key lights)
  const fog = fogVolume(fogTex, noise, { count: Math.round(26 * q), boxMin: [-12, -4, -30], boxSize: [24, 8, 36], size: [5, 10], alpha: [0.08, 0.2], wind: [0.25, 0.02, 0.1], color: 0x4f29b7, ambient: 0.22, soft: 2, seed: 8 });
  scene.add(fog);
  const kl = new THREE.PointLight(0x7b5cf0, 0, 14, 1.2); scene.add(kl);
  const klRed = new THREE.PointLight(C.red, 0, 8, 1.4); scene.add(klRed);

  // ── camera choreography
  const rig = makeRig({ x: 0, y: 0, z: 7, tx: 0, ty: 0, tz: -10, fov: 46, hand: 0.004, aperture: 0.9, focus: 4, motion: 0.8 });
  const S = { b: 0, c1: 0, c2: 0, c3: 0, d: 0, focus: 3, dis1: 0, dis2: 0, dis3: 0, em1: 0, em2: 0, em3: 0, turn: 0 };
  function build(tl) {
    // B — glide forward through the symbols (some come toward us, some drift away)
    tl.set(rig, { x: -0.4, y: 0.25, z: 7.5, tx: 0.2, ty: 0, tz: -12, fov: 46, roll: 0.05, aperture: 0.9, hand: 0.004 }, T.shotB);
    tl.to(rig, { x: 0.5, y: -0.1, z: 2.2, tx: 0.4, roll: -0.04, duration: T.shotC - T.shotB, ease: 'sine.inOut' }, T.shotB);
    tl.fromTo(S, { b: 0 }, { b: 1, duration: 0.6, ease: 'power2.out', immediateRender: false }, T.shotB);
    tl.fromTo(S, { focus: 2.6 }, { focus: 6, duration: 2.2, ease: 'sine.inOut', immediateRender: false }, T.shotB + 0.6);
    // C1 — binary & hexadecimal macro: lateral track + rack focus
    tl.set(rig, { x: RX.C1 - 1.15, y: 0.12, z: 1.45, tx: RX.C1 + 0.5, ty: 0, tz: -0.6, fov: 38, roll: 0.02, aperture: 1.4, hand: 0.002 }, T.shotC);
    tl.to(rig, { x: RX.C1 + 0.15, y: 0.02, z: 1.2, tx: RX.C1 + 1.3, duration: T.shotC2 - T.shotC, ease: 'sine.out' }, T.shotC);
    tl.set(S, { focus: 1.45 }, T.shotC);
    tl.to(S, { focus: 3.0, duration: 0.4, ease: 'power2.inOut' }, T.shotC + 0.65);
    tl.fromTo(S, { em1: 0 }, { em1: 1, duration: 0.35, ease: 'power2.out', immediateRender: false }, T.shotC);
    tl.fromTo(S, { dis1: 0 }, { dis1: 1, duration: 0.5, ease: 'power1.in', immediateRender: false }, T.shotC2 - 0.5);
    // C2 — the substitution wheel: low orbit
    tl.set(rig, { x: RX.C2 + 1.0, y: -0.55, z: 1.55, tx: RX.C2, ty: 0.1, tz: 0, fov: 40, roll: -0.06, aperture: 1.2 }, T.shotC2);
    tl.to(rig, { x: RX.C2 - 0.55, y: -0.35, z: 1.75, roll: 0.03, duration: T.shotC3 - T.shotC2, ease: 'sine.inOut' }, T.shotC2);
    tl.set(S, { focus: 1.9 }, T.shotC2);
    tl.fromTo(S, { em2: 0 }, { em2: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, T.shotC2);
    tl.fromTo(S, { dis2: 0 }, { dis2: 1, duration: 0.45, ease: 'power1.in', immediateRender: false }, T.shotC3 - 0.45);
    // C3 — mathematics & key material: push-in, focus pulls back to the key
    tl.set(rig, { x: RX.C3 - 0.7, y: 0.1, z: 2.6, tx: RX.C3 + 0.4, ty: 0.05, tz: -0.4, fov: 38, roll: 0, aperture: 0.85 }, T.shotC3);
    tl.to(rig, { x: RX.C3 + 0.1, z: 1.8, tx: RX.C3 + 1.0, duration: T.shotD - T.shotC3, ease: 'power1.inOut' }, T.shotC3);
    tl.set(S, { focus: 2.5 }, T.shotC3);
    tl.to(S, { focus: 3.6, duration: 0.45, ease: 'power2.inOut' }, T.shotC3 + 0.6);
    tl.fromTo(S, { em3: 0 }, { em3: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, T.shotC3);
    tl.fromTo(S, { dis3: 0 }, { dis3: 1, duration: 0.45, ease: 'power1.in', immediateRender: false }, T.shotD - 0.45);
    // D — the stream crosses frame; we chase it, then turn into it
    tl.set(rig, { x: RX.D, y: 0.35, z: 2.9, tx: RX.D - 3.5, ty: 0, tz: 0, fov: 44, roll: 0.0, aperture: 0.7, hand: 0.003, motion: 1.0 }, T.shotD);
    tl.set(S, { focus: 2.9, turn: 0 }, T.shotD);
    tl.to(rig, { x: RX.D - 34, duration: T.S3 - T.shotD, ease: 'power2.in' }, T.shotD);
    tl.to(S, { turn: 1, duration: T.S3 - T.exit2, ease: 'power2.in' }, T.exit2);
  }

  const red = new THREE.Color(C.red);
  function region(t) { return t < T.shotC ? 'B' : t < T.shotC2 ? 'C1' : t < T.shotC3 ? 'C2' : t < T.shotD ? 'C3' : 'D'; }
  let frame = 0;
  function update(t, camera, aspect) {
    frame++;
    const reg = region(t);
    const ox = RX[reg];
    const lt = t - T.shotB;
    // fields
    fieldB.visible = nearB.visible = reg === 'B';
    fieldB.userData.u.uTime.value = lt; nearB.userData.u.uTime.value = lt;
    fieldB.userData.u.uOpacity.value = S.b; nearB.userData.u.uOpacity.value = S.b;
    fieldC.visible = reg.startsWith('C'); fieldC.position.set(ox, 0, 0); fieldC.userData.u.uTime.value = t;
    const em = reg === 'C1' ? S.em1 * (1 - S.dis1) : reg === 'C2' ? S.em2 * (1 - S.dis2) : S.em3 * (1 - S.dis3);
    fieldC.userData.u.uOpacity.value = em;
    river.visible = trails.visible = reg === 'D';
    river.userData.u.uTime.value = t - T.shotD; trails.userData.u.uTime.value = t;
    const dK = smooth(T.shotD, T.shotD + 0.35, t);
    river.userData.u.uOpacity.value = dK; trails.userData.u.uOpacity.value = dK;
    // panels: emerge / dissolve, redraw only when visible (throttled, staggered)
    const setP = (m, emg, dis, stagger) => {
      m.visible = emg > 0.001 && dis < 0.999;
      if (!m.visible) return;
      const u = m.material.uniforms; u.uEmerge.value = smooth(stagger, 1, emg); u.uDissolve.value = clamp(dis * 1.1 - stagger * 0.3);
      if ((frame + stagger * 10) % 2 < 1) m.userData.p.draw(t);
    };
    const on1 = reg === 'C1', on3 = reg === 'C3';
    setP(c1a, on1 ? S.em1 : 0, S.dis1, 0); setP(c1b, on1 ? S.em1 : 0, S.dis1, 0.25); setP(c1c, on1 ? S.em1 : 0, S.dis1, 0.4);
    setP(c3a, on3 ? S.em3 : 0, S.dis3, 0); setP(c3b, on3 ? S.em3 : 0, S.dis3, 0.25); setP(c3c, on3 ? S.em3 : 0, S.dis3, 0.4);
    c3b.material.uniforms.uRed.value = clamp(decayEnv(t, E.red) * 0.8);
    // wheel: inner ring steps one letter per pulse (locked to the music)
    wheel.visible = reg === 'C2';
    if (wheel.visible) {
      let steps = 0, frac = 0;
      for (const p of E.pulses) { if (p > t) break; if (p >= T.shotC2 - 2) { steps++; frac = clamp((t - p) / 0.12); } }
      const st = steps - 1 + frac * frac * (3 - 2 * frac);
      inner.rotation.z = st * (Math.PI * 2 / 26);
      outer.rotation.z = -(t - T.shotC2) * 0.12;
      core.rotation.z = -st * (Math.PI * 2 / 16) * 0.5;
      const k = S.em2 * (1 - S.dis2);
      wheelMats.forEach((m, i) => { m.opacity = clamp(k * 1.4 - i * 0.12); });
      wheel.scale.setScalar(0.92 + 0.08 * S.em2 + S.dis2 * 0.15);
    }
    // light & fog follow the shot
    fog.position.set(ox, 0, 0); fog.userData.u.uTime.value = t;
    kl.position.set(ox - 3, 3, 1.5); kl.intensity = 30 * (reg === 'D' ? 0.6 : 1);
    klRed.position.set(ox + 2.5, -1, -1.5); klRed.intensity = decayEnv(t, E.red) * 20;
    fog.userData.setLight(0, kl.position, kl.color, 1.6, 6);
    fog.userData.setLight(1, klRed.position, red, decayEnv(t, E.red) * 2.5, 4);
    fog.userData.u.uOpacity.value = reg === 'D' ? 0.6 : 1;
    // camera — turn into the stream at the end of D
    if (reg === 'D') {
      const k = S.turn; rig.tz = THREE.MathUtils.lerp(0, 0, k); rig.tx = rig.x - THREE.MathUtils.lerp(3.5, 8, k); rig.y = THREE.MathUtils.lerp(0.35, 0.02, k); rig.z = THREE.MathUtils.lerp(2.9, 0.4, k); rig.roll = k * 0.18;
      trails.userData.u.uSpeedMul.value = 1 + k * 1.5;
      SH.uFocus.value = THREE.MathUtils.lerp(2.9, 6, k);
    }
    const P = reg === 'B' ? { k: 1.5, dolly: 1 } : reg === 'C2' ? { k: 1.35, dolly: 1.45, minD: 0.6 } : reg.startsWith('C') ? { k: 1.35, dolly: 1.4, minD: 0.6 } : { k: 1.3, dolly: 0.8, minD: 0.5 };
    applyRig(camera, rig, t, aspect, P);
    if (reg !== 'D') SH.uFocus.value = S.focus;
    SH.uAperture.value = rig.aperture;
  }
  return { scene, rig, update, build, start: T.shotB, end: T.S3, motion: () => rig.motion, bloom: 0.85, threshold: 0.26, cuts: [T.shotB, T.shotC, T.shotC2, T.shotC3, T.shotD] };
}
