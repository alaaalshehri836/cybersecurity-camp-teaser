// ── ACT 3 · BEYOND THE CODE (31 → 47) — the visual climax
import * as THREE from 'three';
import { T, E, C } from '../config.js';
import { glyphField, fogVolume, streams, panelMaterial, LAYER, SH, HEAD, PREMUL } from '../fx/fx.js';
import { makePanel, makeRingTexture, sampleKeyShape, MONO } from '../textures.js';
import { makeRig, applyRig } from '../cam.js';
import { clamp, smooth, decayEnv, mulberry32, lerp } from '../util.js';

export function createAct3(env) {
  const { atlas, noise, fogTex, q } = env;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030207);
  scene.fog = new THREE.FogExp2(0x070410, 0.03);
  const r = mulberry32(303);

  // ── layered walls of screens (inner ring + deep outer ring), emerging from darkness
  const kinds = ['hex', 'binary', 'key', 'math', 'wave', 'hash', 'scramble', 'hex', 'binary', 'wave'];
  const srcPanels = kinds.map((k, i) => makePanel(k, 40 + i));
  const walls = [];
  const addRing = (radius, rows, cols, w, h, y0, dy, emergeFrom, emergeSpan, dim) => {
    for (let ro = 0; ro < rows; ro++) for (let co = 0; co < cols; co++) {
      if (r() < 0.14) continue;
      const a = (co + (ro % 2) * 0.5) / cols * Math.PI * 2 + (r() - 0.5) * 0.05;
      const p = srcPanels[Math.floor(r() * srcPanels.length)];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w * (0.85 + r() * 0.3), h), panelMaterial(p.texture, noise, { gain: dim ? 0.7 : 1.15, fogDensity: 0.04 }));
      const y = y0 + ro * dy + (r() - 0.5) * 0.4;
      m.userData = { a, y, radius, em: emergeFrom + r() * emergeSpan, alert: r() < 0.2, flick: r(), dim };
      m.material.uniforms.uEmerge.value = 0;
      scene.add(m); walls.push(m);
    }
  };
  addRing(9.5, 3, 20, 2.4, 1.5, -2.1, 2.1, T.S3 + 0.1, 4.5, false);
  addRing(16, 4, 26, 3.6, 2.2, -4.2, 2.8, T.S3 + 1.5, 7, true);

  // ── central cipher lock: concentric rotating rings + gimbals
  const lock = new THREE.Group(); scene.add(lock);
  const ringMat = (tex, k = 1.15) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: true, color: new THREE.Color(k, k, k), side: THREE.DoubleSide });
  const rings = [
    new THREE.Mesh(new THREE.CircleGeometry(3.3, 160), ringMat(makeRingTexture({ inner: 0.84, outer: 0.99, chars: '0123456789ABCDEF'.repeat(4), seed: 11, ticks: 180 }), 1.2)),
    new THREE.Mesh(new THREE.CircleGeometry(2.6, 160), ringMat(makeRingTexture({ inner: 0.74, outer: 0.98, seed: 12 }))),
    new THREE.Mesh(new THREE.CircleGeometry(1.9, 128), ringMat(makeRingTexture({ inner: 0.64, outer: 0.97, chars: ['63', '7C', '77', '7B', 'F2', '6B', '6F', 'C5', '30', '01', '67', '2B', 'FE', 'D7', 'AB', '76', 'CA', '82', 'C9', '7D', 'FA', '59', '47', 'F0', 'AD', 'D4', 'A2', 'AF'], font: MONO, color: '#EDEDED', seed: 13, scale: 0.62 }))),
    new THREE.Mesh(new THREE.CircleGeometry(1.2, 96), ringMat(makeRingTexture({ inner: 0.3, outer: 0.96, chars: '01'.repeat(16), font: MONO, seed: 14, ticks: 48 }))),
  ];
  rings.forEach((m, i) => { m.position.z = i * 0.04; m.userData.dir = i % 2 ? -1 : 1; m.userData.sp = [0.05, 0.11, 0.18, 0.3][i]; lock.add(m); });
  const gimbals = [3.8, 4.3, 4.9].map((rad, i) => {
    const g = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.008 + i * 0.003, 6, 220), new THREE.MeshBasicMaterial({ color: new THREE.Color(i === 1 ? C.red : C.lpurple).multiplyScalar(i === 1 ? 1.2 : 1.5), transparent: true, blending: THREE.AdditiveBlending }));
    g.userData.ax = new THREE.Vector3(i === 0 ? 1 : 0.3, i === 1 ? 1 : 0.2, i === 2 ? 0.6 : 0).normalize(); lock.add(g); return g;
  });
  const lockMats = [...rings.map((m) => m.material), ...gimbals.map((g) => g.material)];

  // ── the encryption key: forms from scattered particles, then dissolves into particles
  const KN = Math.round(5200 * q);
  const pts = sampleKeyShape(KN, r);
  const kPos = new Float32Array(KN * 3), kTar = new Float32Array(KN * 3), kSd = new Float32Array(KN * 2);
  for (let i = 0; i < KN; i++) {
    const [x, y] = pts[i % pts.length];
    kTar.set([x * 5.2, y * 5.2, (r() - 0.5) * 0.12], i * 3);
    const th = r() * Math.PI * 2, ph = Math.acos(r() * 2 - 1), rad = 6 + r() * 8;
    kPos.set([Math.sin(ph) * Math.cos(th) * rad, Math.cos(ph) * rad * 0.6, Math.sin(ph) * Math.sin(th) * rad], i * 3);
    kSd.set([r(), r() < 0.06 ? 1 : 0], i * 2);
  }
  const kGeo = new THREE.BufferGeometry();
  kGeo.setAttribute('position', new THREE.BufferAttribute(kPos, 3)); kGeo.setAttribute('aTar', new THREE.BufferAttribute(kTar, 3)); kGeo.setAttribute('aSd', new THREE.BufferAttribute(kSd, 2));
  const keyMat = new THREE.ShaderMaterial({
    ...PREMUL,
    uniforms: { uDepth: SH.uDepth, uRes: SH.uRes, uNear: SH.uNear, uFar: SH.uFar, uScale: SH.uScale, uFocus: SH.uFocus, uAperture: SH.uAperture, uForm: { value: 0 }, uBurst: { value: 0 }, uTime: { value: 0 }, uC: { value: new THREE.Color(0xa380ff) }, uW: { value: new THREE.Color(0xededed) }, uR: { value: new THREE.Color(C.red) } },
    vertexShader: /* glsl */`
      attribute vec3 aTar; attribute vec2 aSd;
      uniform float uForm, uBurst, uTime, uScale, uFocus, uAperture; uniform vec3 uC, uW, uR;
      varying float vA, vZ, vB; varying vec3 vCol;
      void main(){
        float f = smoothstep(aSd.x * 0.45, aSd.x * 0.45 + 0.55, uForm);
        vec3 p = mix(position, aTar, f);
        p += sin(vec3(2.1, 1.7, 2.9) * uTime + aSd.x * 30.0) * 0.015;
        // dissolve: particles blow outward & toward camera with a swirl
        float b = smoothstep(aSd.x * 0.5, aSd.x * 0.5 + 0.5, uBurst);
        vec3 dir = normalize(aTar + vec3(sin(aSd.x * 91.0), cos(aSd.x * 57.0), 1.6 + aSd.x));
        p += dir * b * (1.5 + aSd.x * 7.0) + vec3(sin(p.y * 2.0 + uTime), cos(p.x * 2.0 + uTime), 0.0) * b * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); float z = max(-mv.z, 0.01); vZ = z;
        float coc = clamp(abs(z - uFocus) / z * uAperture, 0.0, 1.0); vB = coc;
        gl_PointSize = clamp((0.035 + aSd.x * 0.03) * (1.0 + coc * 3.0) * uScale / z, 1.0, 48.0);
        vA = (0.25 + 0.75 * f) * smoothstep(0.0, 0.15, uForm) * (1.0 - b * b) / (1.0 + coc * 2.5) * 0.5;
        vCol = aSd.y > 0.5 ? uR * 1.5 : mix(uC, uW, step(0.75, aSd.x)) * (1.0 + 1.2 * f * (1.0 - uBurst) * step(0.98, fract(aSd.x * 13.0 + uTime * 0.7)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: HEAD + /* glsl */`
      varying float vA, vZ, vB; varying vec3 vCol;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float disc = mix(1.0 - smoothstep(0.1, 1.0, d), 1.0 - smoothstep(0.7, 1.0, d), vB);
        float occ = clamp((sceneZ() - vZ) * 3.0, 0.0, 1.0);
        gl_FragColor = vec4(vCol * disc * vA * occ, 0.0);
      }`,
  });
  const keyPts = new THREE.Points(kGeo, keyMat); keyPts.layers.set(LAYER.LIGHT); keyPts.frustumCulled = false; keyPts.position.set(0, 0.1, 2.2);
  scene.add(keyPts);

  // ── symbols travelling between the visual layers (radial migration + orbit)
  const migr = glyphField(atlas, {
    count: Math.round(2600 * q), seed: 33, boxMin: [-18, -6, -18], boxSize: [36, 12, 36], flick: 0.35, red: 0.06, turq: 0.04, gain: 1.6,
    spawn: (i, rr) => {
      const a = rr() * Math.PI * 2, rad = 2.5 + rr() * 13, y = (rr() - 0.5) * 10;
      const out = rr() < 0.5 ? 1 : -1, sp = 0.6 + rr() * 2.2;
      return { p: [Math.cos(a) * rad, y, Math.sin(a) * rad], v: [Math.cos(a) * sp * out - Math.sin(a) * 0.4, (rr() - 0.5) * 0.2, Math.sin(a) * sp * out + Math.cos(a) * 0.4], size: 0.07 + rr() * 0.15, life: [3 + rr() * 4, rr() * 8] };
    },
  });
  const close = glyphField(atlas, {
    count: Math.round(160 * q), seed: 34, boxMin: [-9, -4, -9], boxSize: [18, 8, 18], flick: 0.15, red: 0.1, gain: 1.3,
    spawn: (i, rr) => ({ p: [-9 + rr() * 18, -4 + rr() * 8, -9 + rr() * 18], v: [(rr() - 0.5) * 1.2, (rr() - 0.5) * 0.4, (rr() - 0.5) * 1.2], size: 0.25 + rr() * 0.3, life: [3 + rr() * 3, rr() * 6] }),
  });
  scene.add(migr, close);

  // ── data streams: vertical columns around the lock + horizontal floor streams
  const vert = streams({ count: Math.round(340 * q), span: 22, speed: [3, 12], len: [0.6, 3.5], thick: 0.014, red: 0.08, gain: 2.2, place: (i, rr) => { const a = rr() * Math.PI * 2, rad = 5 + rr() * 9; return [Math.cos(a) * rad, Math.sin(a) * rad]; } });
  vert.rotation.x = -Math.PI / 2; // local +z → world +y
  const flow = streams({ count: Math.round(260 * q), span: 60, speed: [8, 22], len: [1, 5], thick: 0.012, red: 0.05, gain: 2.0, place: (i, rr) => [(rr() - 0.5) * 36, -3.9 + rr() * 0.6] });
  scene.add(vert, flow);

  // ── floor grid of light (receding layer)
  const gridMat = new THREE.ShaderMaterial({
    ...PREMUL,
    uniforms: { uDepth: SH.uDepth, uRes: SH.uRes, uNear: SH.uNear, uFar: SH.uFar, uPulse: { value: 0 }, uOp: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vW; varying float vZ; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: HEAD + `uniform float uPulse, uOp, uTime; varying vec3 vW; varying float vZ;
      void main(){ vec2 g = abs(fract(vW.xz * 0.5) - 0.5) / fwidth(vW.xz * 0.5); float l = 1.0 - min(min(g.x, g.y), 1.0);
        float rad = length(vW.xz); float wave = smoothstep(1.5, 0.0, abs(rad - mod(uTime * 9.0, 40.0))) * uPulse;
        float fade = exp(-vZ * 0.07); float occ = clamp((sceneZ() - vZ) * 2.0, 0.0, 1.0);
        vec3 c = vec3(0.16, 0.08, 0.5) * l * (0.35 + wave * 3.0) * fade * uOp * occ; gl_FragColor = vec4(c, 0.0); }`,
    extensions: { derivatives: true },
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), gridMat); grid.rotation.x = -Math.PI / 2; grid.position.y = -4.2; grid.layers.set(LAYER.LIGHT); scene.add(grid);

  // ── fog: thicker and visibly lit as the light intensifies
  const fog = fogVolume(fogTex, noise, { count: Math.round(44 * q), boxMin: [-20, -4.5, -20], boxSize: [40, 9, 40], size: [6, 12], alpha: [0.08, 0.2], wind: [0.18, 0.03, -0.12], spin: 0.06, color: 0x4f29b7, ambient: 0.15, soft: 2.5, seed: 31 });
  scene.add(fog);
  const red = new THREE.Color(C.red), purp = new THREE.Color(0x7b5cf0), lp = new THREE.Color(C.lpurple);

  // ── camera choreography
  const rig = makeRig({ x: 0, y: 0.8, z: 9, tx: 0, ty: 0.2, tz: 0, fov: 50, hand: 0.006, aperture: 0.55, focus: 8, motion: 0.8 });
  const S = { orbit: 0.35, rad: 9.2, form: 0, burst: 0, spin: 1, light: 0.4, fogOp: 0.4, lockIn: 0, focus: 8, shake: 0 };
  function build(tl) {
    // A — wide reveal: orbit as panels emerge out of the dark
    tl.set(rig, { y: 0.9, ty: 0.15, fov: 50, aperture: 0.5, hand: 0.006, roll: 0, motion: 0.8 }, T.S3);
    tl.set(S, { orbit: 0.45, rad: 9.0, focus: 8.6 }, T.S3);
    tl.to(S, { orbit: -0.35, rad: 7.4, duration: T.cut3a - T.S3, ease: 'sine.inOut' }, T.S3);
    tl.to(rig, { y: 0.2, duration: T.cut3a - T.S3, ease: 'sine.inOut' }, T.S3);
    tl.fromTo(S, { lockIn: 0 }, { lockIn: 1, duration: 2.4, ease: 'power3.out', immediateRender: false }, T.S3);
    tl.to(S, { light: 0.7, fogOp: 0.7, duration: 6, ease: 'sine.inOut' }, T.S3);
    // B — tracking between the layers of screens
    tl.set(rig, { x: -7.6, y: 0.9, z: 5.4, tx: -2.0, ty: 0.3, tz: -1.5, fov: 42, roll: 0.06, aperture: 0.9 }, T.cut3a);
    tl.to(rig, { x: -3.4, y: 0.15, z: 3.0, tx: 0.6, ty: 0, tz: 0, roll: -0.03, duration: T.cut3b - T.cut3a, ease: 'sine.inOut' }, T.cut3a);
    tl.set(S, { focus: 3.5 }, T.cut3a);
    tl.to(S, { focus: 4.2, duration: 3.5, ease: 'sine.inOut' }, T.cut3a + 0.5);
    // C — the key forms, holds, dissolves into particles that pass the lens
    tl.set(rig, { x: 0.5, y: 0.35, z: 8.0, tx: 0, ty: 0.1, tz: 2.2, fov: 40, roll: 0, aperture: 0.7 }, T.cut3b);
    tl.to(rig, { x: 0.1, y: 0.15, z: 5.6, duration: T.cut3c - T.cut3b, ease: 'sine.inOut' }, T.cut3b);
    tl.set(S, { focus: 5.6 }, T.cut3b);
    tl.to(S, { focus: 3.4, duration: T.cut3c - T.cut3b, ease: 'sine.inOut' }, T.cut3b);
    tl.fromTo(S, { form: 0 }, { form: 1, duration: 1.3, ease: 'power2.out', immediateRender: false }, E.keyForm);
    tl.fromTo(S, { burst: 0 }, { burst: 1, duration: 1.4, ease: 'power2.in', immediateRender: false }, E.keyDissolve);
    tl.to(S, { light: 1.0, fogOp: 1.0, duration: 4, ease: 'sine.in' }, T.cut3b);
    // D — accelerating push into the lock, micro-cuts on the hits
    tl.set(rig, { x: 0, y: 0.25, z: 11.5, tx: 0, ty: 0, tz: 0, fov: 44, roll: 0, aperture: 0.5, motion: 1.1 }, T.cut3c);
    tl.set(S, { focus: 11 }, T.cut3c);
    tl.to(rig, { z: 1.4, duration: T.S4 - T.cut3c, ease: 'power3.in' }, T.cut3c);
    tl.to(S, { spin: 7, light: 1.6, shake: 0.006, duration: T.S4 - T.cut3c, ease: 'power2.in' }, T.cut3c);
    const offs = [[1.4, 0.6, 0.12], [-1.8, -0.4, -0.1], [0.9, -0.7, 0.2], [-0.6, 0.9, -0.16], [0, 0, 0]];
    E.microCuts.forEach((tc, i) => { tl.set(rig, { x: offs[i][0], y: offs[i][1], roll: offs[i][2], fov: 44 + i * 3 }, tc); });
  }

  let frame = 0;
  const tmp = new THREE.Vector3();
  function update(t, camera, aspect) {
    frame++;
    const redK = clamp(decayEnv(t, E.red));
    let beat = 0; for (let i = E.pulses.length - 1; i >= 0; i--) { if (E.pulses[i] <= t) { beat = Math.exp(-(t - E.pulses[i]) / 0.12); break; } }
    // panels: emerge out of darkness (travel in from further away), flicker, red alerts
    for (const p of srcPanels) if ((frame + p.kind.length) % 2 === 0) p.draw(t);
    for (const m of walls) {
      const d = m.userData, k = smooth(d.em, d.em + 1.3, t);
      const rad = d.radius + (1 - k) * 4;
      m.position.set(Math.cos(d.a) * rad, d.y, Math.sin(d.a) * rad); m.lookAt(0, d.y * 0.6, 0);
      const fl = d.flick > 0.8 && Math.sin(t * 23 + d.a * 40) > 0.85 ? 0.35 : 1;
      m.material.uniforms.uEmerge.value = k * fl * (0.75 + S.light * 0.25 + beat * 0.15);
      m.material.uniforms.uRed.value = d.alert ? redK : redK * 0.25;
      m.visible = k > 0.001;
    }
    // lock
    const lt = t - T.S3;
    lock.scale.setScalar(0.55 + 0.45 * S.lockIn); lock.rotation.z = (1 - S.lockIn) * 0.8;
    rings.forEach((m, i) => { m.rotation.z += 0; m.rotation.z = m.userData.dir * lt * m.userData.sp * S.spin + (beat * 0.02 * m.userData.dir); });
    gimbals.forEach((g, i) => { g.quaternion.setFromAxisAngle(g.userData.ax, lt * (0.15 + i * 0.07) * S.spin + i); });
    lockMats.forEach((m, i) => { m.opacity = clamp(S.lockIn * 1.2 - i * 0.05) * (0.85 + beat * 0.3); });
    gimbals[1].material.color.copy(red).multiplyScalar(0.6 + redK * 3);
    // key
    keyPts.visible = t > E.keyForm - 0.1 && t < E.keyDissolve + 1.6;
    keyMat.uniforms.uForm.value = S.form; keyMat.uniforms.uBurst.value = S.burst; keyMat.uniforms.uTime.value = t;
    keyPts.rotation.y = Math.sin(t * 0.6) * 0.12;
    keyPts.rotation.z = aspect < 1 ? -Math.PI / 2 : 0;   // portrait: the key stands upright, bow at the top
    // symbols, streams, grid
    migr.userData.u.uTime.value = lt; close.userData.u.uTime.value = lt;
    migr.userData.u.uOpacity.value = smooth(T.S3, T.S3 + 1.2, t) * (0.7 + S.light * 0.3);
    close.userData.u.uOpacity.value = smooth(T.S3 + 0.5, T.S3 + 2, t);
    vert.userData.u.uTime.value = t; flow.userData.u.uTime.value = t;
    vert.userData.u.uSpeedMul.value = flow.userData.u.uSpeedMul.value = 1 + (S.spin - 1) * 0.35;
    vert.userData.u.uOpacity.value = flow.userData.u.uOpacity.value = smooth(T.S3, T.S3 + 2.5, t) * (0.8 + beat * 0.5);
    gridMat.uniforms.uTime.value = t; gridMat.uniforms.uPulse.value = 0.3 + beat; gridMat.uniforms.uOp.value = smooth(T.S3, T.S3 + 3, t) * S.light;
    // fog lit by the lock (purple), the walls (light purple) and the red warning pulses
    const fu = fog.userData.u; fu.uTime.value = t; fu.uOpacity.value = S.fogOp;
    fog.userData.setLight(0, tmp.set(0, 0, 0), purp, 1.2 * S.light + beat * 0.5, 6);
    fog.userData.setLight(1, tmp.set(0, 4, -8), lp, 0.6 * S.light, 9);
    fog.userData.setLight(2, tmp.set(0, 0.5, 3), red, redK * 3.2, 6);
    fog.userData.setLight(3, tmp.set(-8, -3, 6), purp, 0.5 * S.light, 7);
    // camera
    if (t < T.cut3a) { rig.x = Math.sin(S.orbit) * S.rad; rig.z = Math.cos(S.orbit) * S.rad; rig.tx = 0; rig.tz = 0; }
    rig.shake = S.shake;
    const P = t < T.cut3a ? { k: 1.7, dolly: 1, minD: 2 } : t < T.cut3b ? { k: 1.3, dolly: 1.25, minD: 1 } : t < T.cut3c ? { k: 1.35, dolly: 1.15, minD: 1 } : { k: 1.3, dolly: 1.3, minD: 1.4 };
    applyRig(camera, rig, t, aspect, P);
    SH.uFocus.value = t >= T.cut3c ? Math.max(1.5, camera.position.length() - 0.2) : S.focus;
    SH.uAperture.value = rig.aperture;
  }
  return { scene, rig, update, build, start: T.S3, end: T.S4, motion: () => rig.motion, bloom: 0.8, threshold: 0.32, cuts: [T.S3, T.cut3a, T.cut3b, T.cut3c, ...E.microCuts] };
}
