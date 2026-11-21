// ── ACT 1 · THE TRANSMISSION (0 → 17) + SCENE 02 / SHOT A (17 → 20.4)
// A dark room. A monitor. A message arrives. Then its characters leave the screen.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { T, E, C } from '../config.js';
import { glyphField, fogVolume, dust, beam, LAYER, SH } from '../fx/fx.js';
import { makeRig, applyRig } from '../cam.js';
import { decayEnv, clamp, smooth, mulberry32 } from '../util.js';

export function createAct1(env) {
  const { atlas, noise, fogTex, screen, q } = env;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030206);
  scene.fog = new THREE.FogExp2(0x07040d, 0.075);

  const std = (c, r = 0.8, m = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...extra });
  const wallTex = noise.clone(); wallTex.repeat.set(3, 2); wallTex.needsUpdate = true;
  const mWall = std(0x17131d, 0.92, 0, { roughnessMap: wallTex, bumpMap: wallTex, bumpScale: 0.6 });
  const mFloor = std(0x0d0b11, 0.38, 0.1, { roughnessMap: wallTex });
  const mDesk = std(0x15111a, 0.3, 0.15);
  const mBlack = std(0x0a090d, 0.42, 0.3);
  const mFab = std(0x121016, 0.95);

  // ── architecture
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), mFloor); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), mWall); back.position.set(0, 2.5, -1.45); scene.add(back);
  // left wall with a window opening (built from 4 slabs)
  const wl = new THREE.Group(); wl.position.x = -3.2; wl.rotation.y = Math.PI / 2; scene.add(wl);
  const slab = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mWall); m.position.set(x, y, 0); wl.add(m); };
  slab(5.5, 5, -3.85 + 1.75, 2.5); slab(4.1, 5, 2.05 + 2.05, 2.5); slab(1.2, 1.6, 0.55 - 0.0, 0.8); slab(1.2, 1.9, 0.55, 4.05);
  // window: emissive cold-purple sky behind venetian blinds
  const win = new THREE.Group(); win.position.set(-3.22, 2.35, -0.55); win.rotation.y = Math.PI / 2; scene.add(win);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6b52d8).multiplyScalar(1.6), fog: false }));
  sky.position.z = -0.05; win.add(sky);
  for (let i = 0; i < 13; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.04), mBlack); s.position.set(0, -0.72 + i * 0.12, 0); s.rotation.x = 0.6; win.add(s);
  }
  // shelf + silhouettes on the back wall (depth layering)
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.3), mDesk); shelf.position.set(-1.7, 2.05, -1.3); scene.add(shelf);
  const r = mulberry32(5);
  for (let i = 0; i < 9; i++) { const h = 0.18 + r() * 0.16; const b = new THREE.Mesh(new THREE.BoxGeometry(0.05 + r() * 0.04, h, 0.22), std(0x1b1722, 0.85)); b.position.set(-2.4 + i * 0.075, 2.07 + h / 2, -1.3); b.rotation.z = i === 7 ? 0.25 : 0; scene.add(b); }

  // ── desk
  const desk = new THREE.Group(); scene.add(desk);
  const top = new THREE.Mesh(new RoundedBoxGeometry(2.5, 0.05, 1.05, 3, 0.01), mDesk); top.position.set(0, 0.75, 0); desk.add(top);
  for (const [x, z] of [[-1.18, -0.45], [1.18, -0.45], [-1.18, 0.45], [1.18, 0.45]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.74, 0.05), mBlack); l.position.set(x, 0.37, z); desk.add(l); }

  // ── monitor
  const SW = 1.24, SHH = 0.735, SC = new THREE.Vector3(0, 1.27, -0.22);
  const mon = new THREE.Group(); scene.add(mon);
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.32, 0.82, 0.05, 4, 0.018), mBlack); body.position.set(0, SC.y, SC.z - 0.03); mon.add(body);
  const screenMat = new THREE.MeshBasicMaterial({ map: screen.texture, color: new THREE.Color(1.5, 1.5, 1.5), toneMapped: false });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(SW, SHH), screenMat); scr.position.copy(SC).setZ(SC.z + 0.0); mon.add(scr);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.42, 0.04), mBlack); neck.position.set(0, 0.97, -0.3); mon.add(neck);
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.018, 0.26, 2, 0.006), mBlack); base.position.set(0, 0.785, -0.26); mon.add(base);
  // keyboard + keys
  const kb = new THREE.Mesh(new RoundedBoxGeometry(0.92, 0.022, 0.3, 2, 0.006), mBlack); kb.position.set(0, 0.787, 0.27); scene.add(kb);
  const keyGeo = new THREE.BoxGeometry(0.052, 0.012, 0.05), keys = new THREE.InstancedMesh(keyGeo, std(0x18161d, 0.55, 0.1), 14 * 5);
  const mtx = new THREE.Matrix4(); let ki = 0;
  for (let y = 0; y < 5; y++) for (let x = 0; x < 14; x++) { mtx.makeTranslation(-0.405 + x * 0.0625 + (y % 2) * 0.01, 0.803, 0.15 + y * 0.06); keys.setMatrixAt(ki++, mtx); }
  scene.add(keys);
  const mouse = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.03, 0.11, 3, 0.014), mBlack); mouse.position.set(0.66, 0.79, 0.3); scene.add(mouse);
  // desk objects
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.044, 0.11, 32), std(0x1d1a22, 0.35)); mug.position.set(-0.82, 0.83, 0.05); scene.add(mug);
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.003, 0.4), std(0x3a3644, 0.9)); p.position.set(-0.55 + i * 0.01, 0.777 + i * 0.003, 0.2); p.rotation.y = 0.18 + i * 0.07; scene.add(p); }
  // device with red LED (warning)
  const dev = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.04, 0.13, 2, 0.008), mBlack); dev.position.set(0.82, 0.795, -0.18); scene.add(dev);
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C.red) });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), ledMat); led.position.set(0.77, 0.81, -0.113); scene.add(led);
  // cable
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.1, 1.1, -0.33), new THREE.Vector3(0.2, 0.8, -0.45), new THREE.Vector3(0.35, 0.76, -0.5), new THREE.Vector3(0.5, 0.2, -0.6), new THREE.Vector3(0.7, 0.0, -0.4)]), 40, 0.008, 6), mBlack); scene.add(cable);
  // server rack with blinking LEDs (right, back)
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.1, 0.6), std(0x0c0b10, 0.5, 0.4)); rack.position.set(2.45, 1.05, -0.95); scene.add(rack);
  const ledGeo = new THREE.PlaneGeometry(0.012, 0.012), rackLeds = new THREE.InstancedMesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), 60);
  for (let i = 0; i < 60; i++) { mtx.makeTranslation(2.22 + (i % 6) * 0.03, 0.4 + Math.floor(i / 6) * 0.16, -0.649); rackLeds.setMatrixAt(i, mtx); rackLeds.setColorAt(i, new THREE.Color(0)); }
  scene.add(rackLeds);
  // foreground chair (out of focus layer)
  const chair = new THREE.Group(); chair.position.set(1.25, -0.08, 1.45); chair.rotation.y = -0.75; scene.add(chair);
  const cb = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.62, 0.08, 4, 0.04), mFab); cb.position.set(0, 1.0, 0.22); cb.rotation.x = -0.12; chair.add(cb);
  const cs = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.08, 0.5, 4, 0.03), mFab); cs.position.set(0, 0.52, 0); chair.add(cs);
  const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 12), mBlack); cp.position.set(0, 0.26, 0); chair.add(cp);

  // ── lights
  const hemi = new THREE.HemisphereLight(0x2a1a55, 0x050308, 0.0); scene.add(hemi);
  const key = new THREE.SpotLight(0x6b4ce6, 0, 9, 0.42, 0.75, 1.4);
  key.position.set(-3.15, 2.45, -0.5); key.target.position.set(-0.5, 0.4, 0.55); scene.add(key, key.target);
  const rim = new THREE.SpotLight(0xa380ff, 0, 8, 0.5, 0.8, 1.5); rim.position.set(2.2, 2.9, -1.3); rim.target.position.set(0, 1.0, 0); scene.add(rim, rim.target);
  const scrLight = new THREE.RectAreaLight(0xb9a6ff, 0, SW, SHH); scrLight.position.copy(SC).setZ(SC.z + 0.01); scrLight.lookAt(SC.x, SC.y, 5); scene.add(scrLight);
  const redL = new THREE.PointLight(C.red, 0, 2.6, 1.6); redL.position.set(0.77, 0.86, -0.05); scene.add(redL);
  const fill = new THREE.PointLight(0x4f29b7, 0, 7, 1.5); fill.position.set(1.5, 2.2, 3.2); scene.add(fill);

  // ── atmosphere
  const beamDir = new THREE.Vector3(-0.5, 0.25, 0.75).sub(new THREE.Vector3(-3.15, 2.45, -0.55)).normalize();
  const shaft = beam({ length: 4.6, rTop: 0.55, rBottom: 1.7, color: 0x7454ee, intensity: 0, stripes: 6.5, noise });
  shaft.position.set(-3.15, 2.45, -0.55); shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), beamDir); scene.add(shaft);
  const fog = fogVolume(fogTex, noise, { count: Math.round(34 * q), boxMin: [-4, -0.2, -1.6], boxSize: [8.5, 2.8, 8.5], size: [1.6, 3.4], alpha: [0.1, 0.26], lowBias: 2.2, wind: [0.05, 0.0, 0.015], color: 0x4f29b7, ambient: 0.12, soft: 0.7, seed: 4 });
  scene.add(fog);
  const motes = dust({ count: Math.round(900 * q), boxMin: [-3.2, 0.2, -1.4], boxSize: [5.5, 2.8, 5.5], apex: [-3.9, 2.95, -1.2], dir: beamDir.toArray(), angle: 0.33, coneColor: 0x8d70ff, base: 0.035 });
  scene.add(motes);
  // small encrypted characters hovering around the monitor (scene 1, 11s+)
  const around = glyphField(atlas, {
    count: Math.round(160 * q), seed: 31, boxMin: [-1.3, 0.85, -0.6], boxSize: [2.6, 1.0, 1.4], drift: [0, 0.03, 0.02], flick: 0.75, red: 0.12, gain: 1.4,
    spawn: (i, r) => { let x, y, z; do { x = -1.3 + r() * 2.6; y = 0.85 + r() * 1.0; z = -0.6 + r() * 1.4; } while (Math.abs(x) < 0.68 && Math.abs(y - 1.27) < 0.42 && z < 0.1); return { p: [x, y, z], v: [(r() - 0.5) * 0.04, (r() - 0.3) * 0.03, (r() - 0.5) * 0.03], size: 0.018 + r() * 0.022, life: [2 + r() * 3, r() * 6] }; },
  });
  around.userData.u.uOpacity.value = 0; scene.add(around);
  // SHOT A: characters peel off the screen and float into the room
  const peel = glyphField(atlas, {
    count: Math.round(1400 * q), seed: 44, mode: 1, flick: 0.25, red: 0.07, gain: 1.8, drift: [0, 0.015, 0.03],
    spawn: (i, r) => {
      const x = (r() - 0.5) * SW * 0.96, y = SC.y + (r() - 0.5) * SHH * 0.94;
      const d = Math.sqrt(x * x + (y - SC.y) ** 2);
      const delay = T.S2 - 0.05 + d * 2.4 + r() * 1.6;
      return { p: [x, y, SC.z + 0.006], v: [x * (0.18 + r() * 0.3) + (r() - 0.5) * 0.08, (y - SC.y) * (0.15 + r() * 0.25) + (r() - 0.4) * 0.06, 0.12 + r() * 0.5], size: 0.016 + r() * 0.03, life: [4.5 + r() * 3, delay] };
    },
  });
  scene.add(peel);

  // ── rig + timeline
  const rig = makeRig({ x: 1.55, y: 1.62, z: 6.4, tx: 0.05, ty: 1.22, tz: -0.2, fov: 38, hand: 0.006, focus: 5.5, aperture: 0.35, motion: 0.5 });
  const L = { hemi: 0, key: 0, rim: 0, screen: 0, beam: 0, fog: 0.0, dust: 0, around: 0, peel: 0, focusMix: 0 };
  const focusA = new THREE.Vector3(-1.2, 1.4, 0.6), focusB = SC.clone(), fpt = new THREE.Vector3();

  function build(tl) {
    // slow reveal from black – purple light barely touches the room
    tl.to(L, { hemi: 0.08, key: 6, rim: 5, beam: 0.2, fog: 1, dust: 1, duration: 5.6, ease: 'sine.inOut' }, T.reveal);
    tl.to(L, { screen: 1.4, duration: 3.5, ease: 'sine.inOut' }, T.reveal + 0.6);
    // the dolly-in
    tl.to(rig, { x: 0.32, y: 1.36, z: 2.05, tx: 0, ty: 1.25, tz: -0.22, fov: 34, duration: T.push, ease: 'sine.inOut' }, 0);
    // motivated rack focus: chair (foreground) → screen when the message arrives
    tl.to(L, { focusMix: 1, duration: 0.9, ease: 'power2.inOut' }, T.ping);
    tl.to(L, { screen: 4.2, duration: 0.25, ease: 'power2.out' }, T.ping);
    tl.to(L, { around: 1, duration: 3.5, ease: 'sine.in' }, T.symbols + 0.4);
    // commit into the screen
    tl.to(rig, { x: 0.06, y: 1.29, z: 0.95, fov: 30, aperture: 0.6, duration: T.S2 - T.push, ease: 'power2.in' }, T.push);
    // SHOT A – closer to the encrypted message; characters separate from the screen
    tl.set(rig, { hand: 0.004 }, T.S2);
    tl.to(rig, { x: -0.03, y: 1.28, z: 0.38, tx: 0, ty: 1.27, fov: 32, duration: T.shotB - 0.35 - T.S2, ease: 'power2.out' }, T.S2);
    tl.to(L, { peel: 1, duration: 2.6, ease: 'sine.inOut' }, T.S2);
    tl.to(rig, { aperture: 1.3, duration: 1.2, ease: 'sine.inOut' }, T.S2 + 0.4);
    tl.to(rig, { z: 0.12, fov: 40, duration: 0.35, ease: 'power3.in' }, T.shotB - 0.35);
    tl.to(L, { screen: 2.6, duration: 2, ease: 'sine.inOut' }, T.S2 + 0.5);
  }

  const red = new THREE.Color(C.red), lav = new THREE.Color(0xb9a6ff), tmp = new THREE.Color(), tmp2 = new THREE.Vector3();
  const ledCols = [new THREE.Color(0x4f29b7).multiplyScalar(2), new THREE.Color(0xa380ff).multiplyScalar(2), new THREE.Color(0x57e3d8).multiplyScalar(1.2), new THREE.Color(0)];

  function update(t, camera, aspect) {
    screen.draw(t, smooth(T.S2, T.S2 + 2.8, t));
    const redK = clamp(decayEnv(t, E.red.filter((e) => e.t < 12 || (e.t >= T.S2 && e.t < 20.4))));
    const warnHold = t > T.warn ? 0.25 + 0.2 * Math.sin(t * 3.2 * Math.PI) : 0;
    // lights
    hemi.intensity = L.hemi; key.intensity = L.key; rim.intensity = L.rim; fill.intensity = L.hemi * 3;
    tmp.copy(lav).lerp(red, clamp(redK * 1.2 + (t > T.warn && t < T.S2 ? 0.25 : 0)));
    scrLight.color.copy(tmp); scrLight.intensity = L.screen * (1 + redK * 0.8) * (0.96 + 0.04 * Math.sin(t * 47));
    redL.intensity = redK * 1.1 + (t > T.warn ? Math.max(0, warnHold) * 0.25 : 0);
    ledMat.color.copy(red).multiplyScalar(t > T.warn ? 1 + redK * 3 + (Math.sin(t * 10) > 0 ? 1 : 0) : 0.4 + 0.6 * (Math.sin(t * 2) > 0.7 ? 1 : 0));
    // rack LEDs (slow random blink)
    if (Math.floor(t * 8) !== update.lf) {
      update.lf = Math.floor(t * 8); const rr = mulberry32(update.lf);
      for (let i = 0; i < 60; i++) rackLeds.setColorAt(i, rr() < 0.55 ? ledCols[rr() < 0.08 ? 2 : rr() < 0.6 ? 0 : 1].clone().multiplyScalar(L.hemi * 3) : ledCols[3]);
      rackLeds.instanceColor.needsUpdate = true;
    }
    shaft.userData.u.uIntensity.value = L.beam; shaft.userData.u.uTime.value = t;
    // fog reacts to the window, the screen and the red warning light
    const fu = fog.userData.u; fu.uTime.value = t; fu.uOpacity.value = L.fog;
    fog.userData.setLight(0, tmp2.set(-2.4, 2.0, -0.1), new THREE.Color(0x6b4ce6), 2.2 * L.beam / 0.2, 1.6);
    fog.userData.setLight(1, tmp2.set(0, 1.27, 0.3), tmp, 0.3 * L.screen, 1.0);
    fog.userData.setLight(2, tmp2.set(0.77, 0.9, -0.05), red, redK * 2.5, 0.9);
    const mu = motes.userData.u; mu.uTime.value = t; mu.uOpacity.value = L.dust;
    mu.uPLPos.value.set(0, 1.27, 0.25); mu.uPLCol.value.copy(tmp).multiplyScalar(0.12 * L.screen);
    around.userData.u.uTime.value = t; around.userData.u.uOpacity.value = L.around * (1 - L.peel * 0.6);
    peel.userData.u.uTime.value = t; peel.userData.u.uOpacity.value = t > T.S2 - 0.1 ? 1 : 0;
    // focus
    // portrait: closer on the desk & monitor, easing back to the true push-in as we enter the screen
    const pin = smooth(T.push, T.S2 - 0.4, t);
    applyRig(camera, rig, t, aspect, { k: 1.42, dolly: THREE.MathUtils.lerp(0.66, 1, pin), minD: THREE.MathUtils.lerp(1.95, 0.9, pin) });
    fpt.copy(focusA).lerp(focusB, L.focusMix);
    let fd = camera.position.distanceTo(fpt);
    if (t > T.S2 + 0.9) fd = THREE.MathUtils.lerp(fd, 0.32, smooth(T.S2 + 0.9, T.S2 + 2.2, t)); // rack to the characters flying at the lens
    SH.uFocus.value = fd; SH.uAperture.value = rig.aperture;
  }
  return { scene, rig, update, build, start: 0, end: T.shotB, motion: () => rig.motion, bloom: 0.75 };
}
