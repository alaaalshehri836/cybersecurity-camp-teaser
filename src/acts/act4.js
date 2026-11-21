// ── ACT 4 · THE UNKNOWN (47 → 59) — stillness, fog, THE CONVERGENCE, HARD CUT
import * as THREE from 'three';
import { T, E, C } from '../config.js';
import { fogVolume, dust, LAYER, SH } from '../fx/fx.js';
import { makeRig, applyRig } from '../cam.js';
import { clamp, smooth, mulberry32 } from '../util.js';
import { createConvergence } from './convergence.js';

function n3(x, y, z) { // smooth pseudo-noise from incommensurate sines (deterministic)
  return (Math.sin(x * 1.7 + Math.sin(y * 2.3 + z * 0.7)) + Math.sin(y * 1.9 + Math.sin(z * 2.9 + x * 1.1)) + Math.sin(z * 2.1 + Math.sin(x * 3.1 + y * 0.5))) / 3;
}

export function createAct4(env) {
  const { noise, fogTex, q } = env;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020104);
  scene.fog = new THREE.FogExp2(0x0b0617, 0.07);

  // ── THE CONVERGENCE: every fragment seen so far gathers into one encrypted architecture
  const conv = createConvergence(env);
  conv.group.position.set(-2.1, 3.3, -11.4);
  scene.add(conv.group);

  // backlight halo (occluded by the form → only its edges read)
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); return t; })();
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, color: new THREE.Color(C.red), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), haloMat); halo.position.set(0.6, 4.2, -15.5); halo.scale.setScalar(1.45); scene.add(halo);

  // ground catching a grazing red sheen
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x06050a, roughness: 0.9, metalness: 0.0 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const back = new THREE.SpotLight(C.red, 0, 30, 0.6, 0.9, 1.2); back.position.set(1.0, 4.6, -17.5); back.target.position.set(0, 0.2, 2); scene.add(back, back.target);
  back.castShadow = true; back.shadow.mapSize.set(q < 1 ? 512 : 1024, q < 1 ? 512 : 1024); back.shadow.bias = -0.0004; back.shadow.normalBias = 0.02; back.shadow.radius = 4; back.shadow.camera.near = 2; back.shadow.camera.far = 30;
  const top = new THREE.PointLight(0x4f29b7, 0, 16, 1.3); top.position.set(0, 7, -2); scene.add(top);

  // ── thick fog filling the space from several depths, drifting in different directions
  const mk = (o) => { const f = fogVolume(fogTex, noise, { color: 0x4f29b7, ambient: 0.08, scatter: 1.1, contrast: 1, ...o }); scene.add(f); return f; };
  const fogFront = mk({ count: Math.round(26 * q), boxMin: [-9, -0.5, 0.5], boxSize: [18, 4.5, 6.5], size: [3.5, 7], alpha: [0.26, 0.5], wind: [0.07, 0.004, -0.01], seed: 41, soft: 1 });
  const fogMid = mk({ count: Math.round(30 * q), boxMin: [-11, -0.5, -7.5], boxSize: [22, 6, 8], size: [4, 8], alpha: [0.2, 0.4], wind: [-0.09, 0.006, 0.02], seed: 42, soft: 1.5 });
  const fogBack = mk({ count: Math.round(26 * q), boxMin: [-14, -0.5, -19], boxSize: [28, 9, 9], size: [5, 9], alpha: [0.18, 0.34], wind: [0.06, 0.01, 0.0], seed: 43, soft: 2 });
  const fogLow = mk({ count: Math.round(30 * q), boxMin: [-10, -0.6, -12], boxSize: [20, 1.4, 18], size: [2.5, 4.5], alpha: [0.2, 0.4], wind: [0.05, 0.0, 0.05], seed: 44, soft: 0.6 });
  const fogs = [fogFront, fogMid, fogBack, fogLow];
  const motes = dust({ count: Math.round(260 * q), boxMin: [-5, 0, -9], boxSize: [10, 5, 12], apex: [0.5, 4.2, -16.5], dir: [0, -0.15, 1], angle: 0.5, coneColor: C.red, base: 0.0 }); motes.userData.u.uConeCol.value.multiplyScalar(0.35);
  scene.add(motes);

  const rig = makeRig({ x: 0.3, y: 1.0, z: 9.6, tx: 0, ty: 2.3, tz: -6, fov: 34, hand: 0.003, aperture: 0.45, focus: 15, motion: 0.4 });
  const S = { rim: 0, fill: 0, halo: 0, back: 0, fogFront: 1, fog: 0, rise: 0, reveal: 0 };
  function build(tl) {
    tl.set(rig, { x: 0.3, y: 1.0, z: 9.6, tx: 0, ty: 2.3, tz: -6, fov: 34 }, T.S4);
    tl.to(rig, { x: -0.08, y: 1.2, z: 5.6, ty: 2.9, duration: 58.4 - T.fogIn, ease: 'sine.inOut' }, T.fogIn);
    tl.to(rig, { z: 5.15, duration: T.END - 58.4, ease: 'power2.in' }, 58.4);            // the final, slight lean-in
    tl.to(S, { fog: 1, duration: 3.5, ease: 'sine.inOut' }, T.fogIn);
    tl.to(conv.group.position, { z: -10.2, duration: 58.6 - T.emerge, ease: 'sine.out' }, T.emerge);
    tl.to(S, { rim: 0.85, halo: 0.2, back: 1, duration: 56.8 - T.emerge, ease: 'sine.in' }, T.emerge);
    tl.to(S, { fogFront: 0.6, duration: 57.6 - 51, ease: 'sine.inOut' }, 51);
    // a brief moment – slightly more visible – then it recedes
    tl.to(S, { reveal: 1, duration: 0.7, ease: 'sine.inOut' }, 57.25);
    tl.to(S, { reveal: 0.25, duration: 0.8, ease: 'sine.inOut' }, 58.0);
  }
  const red = new THREE.Color(C.red), purp = new THREE.Color(0x4f29b7), tmp = new THREE.Vector3();
  function update(t, camera, aspect) {
    let hb = 0; for (const h of E.heart) { const d = t - h; if (d >= 0 && d < 0.6) hb = Math.max(hb, Math.exp(-d / 0.12) + (d > 0.28 ? Math.exp(-(d - 0.28) / 0.12) * 0.6 : 0)); }
    const rv = S.reveal;
    haloMat.opacity = S.halo * 0.62 * (1 + hb * 0.1) + rv * 0.12;
    back.intensity = S.back * 11 * (1 + rv * 0.6);
    top.intensity = S.fog * 6;
    const blY = aspect < 1 ? 6.6 : 3.8; const bl = tmp.set(0.5, blY, -13);
    fogs.forEach((f, i) => {
      const u = f.userData.u; u.uTime.value = t + i * 40; u.uOpacity.value = S.fog * (i === 0 ? S.fogFront : 1) * (1 - rv * (i === 0 ? 0.35 : 0.15));
      f.userData.setLight(0, bl, red, (S.back * 0.5 + rv * 0.3) * (1 + hb * 0.12), 5);
      f.userData.setLight(1, tmp.set(0, 6, -2), purp, 0.55 * S.fog, 9); bl.set(0.5, blY, -13);
    });
    const mu = motes.userData.u; mu.uTime.value = t; mu.uOpacity.value = S.fog * 0.7;
    // portrait: structure centred, crimson backlight rises behind its upper contour
    const pt = aspect < 1;
    conv.group.position.x = pt ? -0.3 : -2.1;
    conv.setPortrait(pt);
    halo.position.set(pt ? 1.6 : 0.6, pt ? 8.2 : 4.2, -15.5);
    back.position.set(pt ? 1.2 : 1.0, pt ? 8.0 : 4.6, -17.5);
    applyRig(camera, rig, t, aspect, { k: 1.38, dolly: 0.95, minD: 2, ty: 1.7 });
    camera.updateMatrixWorld();
    conv.update(t, { rim: S.rim, reveal: rv, hb, fog: S.fog }, camera, back.position);
    SH.uFocus.value = camera.position.distanceTo(conv.group.position) - 2.6; SH.uAperture.value = rig.aperture;
  }
  return { scene, rig, update, build, start: T.S4, end: T.END, motion: () => rig.motion, bloom: 0.6 };
}
