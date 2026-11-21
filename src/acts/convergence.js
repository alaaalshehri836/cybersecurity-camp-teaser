// ── THE CONVERGENCE — Scene 04's entity.
// Every encrypted fragment seen so far drifts out of the dark, converges on one point and assembles into a vast,
// layered, fractured architecture: physical dark plates (lit, shadowed, reflective) around an interior where
// encrypted symbols keep moving, with faint purple light travelling along hidden data pathways.
import * as THREE from 'three';
import { C } from '../config.js';
import { LAYER, SH, HEAD, PREMUL } from '../fx/fx.js';
import { mulberry32, smooth, clamp } from '../util.js';

const RAD = new THREE.Vector3(3.5, 4.2, 2.5);       // overall extent (cropped by the frame – scale stays unknowable)
const AS = 51.0;                                     // assembly begins (fragments start arriving)

function n3(x, y, z) {
  return (Math.sin(x * 1.7 + Math.sin(y * 2.3 + z * 0.7)) + Math.sin(y * 1.9 + Math.sin(z * 2.9 + x * 1.1)) + Math.sin(z * 2.1 + Math.sin(x * 3.1 + y * 0.5))) / 3;
}
// irregular, asymmetric envelope (same family of shape as before, now made of parts)
function envelope(d) {
  let k = 1 + 0.16 * n3(d.x * 1.6, d.y * 1.6, d.z * 1.6) + 0.05 * n3(d.x * 4.5 + 3, d.y * 4.5, d.z * 4.5);
  k += 0.35 * Math.exp(-((d.x - 0.7) ** 2 * 4 + (d.y - 0.35) ** 2 * 5 + (d.z + 0.1) ** 2 * 4));
  k += 0.25 * Math.exp(-((d.x + 0.8) ** 2 * 6 + (d.y + 0.1) ** 2 * 6 + (d.z - 0.2) ** 2 * 5));
  k -= 0.14 * Math.exp(-((d.x + 0.2) ** 2 * 10 + (d.y - 0.6) ** 2 * 10 + (d.z - 0.8) ** 2 * 4));
  k += 0.4 * Math.exp(-((d.x - 0.15) ** 2 * 9 + (d.y - 0.95) ** 2 * 3 + d.z ** 2 * 9));    // a tall, off-centre tier
  k += 0.06 * Math.sign(Math.sin(d.y * 7.0 + d.x * 2.0));                                 // stepped, architectural layering
  k *= 1 + 0.25 * Math.max(0, -d.y);                                                      // heavier towards the ground
  return k;
}

export function createConvergence(env) {
  const { atlas, q } = env;
  const r = mulberry32(2026);
  const group = new THREE.Group();
  const U = { uRim: { value: 0 }, uRimCol: { value: new THREE.Color(C.red).multiplyScalar(1.1) }, uBackV: { value: new THREE.Vector3(0, 0, -1) } };

  // physical material + crimson rim (only the edges facing the backlight catch it)
  const withRim = (m) => {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uRimCol; uniform vec3 uBackV;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { vec3 Vv = normalize(vViewPosition); float fr = pow(1.0 - abs(dot(normal, Vv)), 4.0);
            float bk = clamp(dot(normal, uBackV) * 0.5 + 0.5, 0.0, 1.0);
            totalEmissiveRadiance += uRimCol * fr * bk * bk * uRim; }`);
    };
    return m;
  };
  const plateMat = withRim(new THREE.MeshStandardMaterial({ color: 0x0b0911, roughness: 0.42, metalness: 0.45 }));
  const litMat = withRim(new THREE.MeshStandardMaterial({ color: 0x0b0911, roughness: 0.45, metalness: 0.4, emissive: new THREE.Color(C.lpurple), emissiveIntensity: 0 }));

  // ── build fragments: three nested fractured shells + radial fins + connecting beams
  const parts = []; // {pos, quat, scl, start, startQ, delay, lit, geo, shift}
  const up = new THREE.Vector3(0, 0, 1), tmpQ = new THREE.Quaternion(), axis = new THREE.Vector3();
  const surf = (dir, shell) => { const k = envelope(dir) * shell; return new THREE.Vector3(dir.x * RAD.x * k, dir.y * RAD.y * k, dir.z * RAD.z * k); };
  const nrm = (dir) => new THREE.Vector3(dir.x / RAD.x, dir.y / RAD.y, dir.z / RAD.z).normalize();
  const fib = (i, n) => { const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996 + r() * 0.3; return new THREE.Vector3(Math.cos(th) * rr, y, Math.sin(th) * rr).normalize(); };
  const shells = [
    { n: Math.round(1100 * q), shell: 1.0, w: [0.5, 1.35], h: [0.35, 0.95], th: [0.05, 0.11], gap: 0.3, delay: [52.8, 3.4], fin: 0.14 },
    { n: Math.round(700 * q), shell: 0.8, w: [0.35, 0.9], h: [0.25, 0.65], th: [0.03, 0.07], gap: 0.05, delay: [51.9, 2.8], fin: 0.08 },
    { n: Math.round(380 * q), shell: 0.58, w: [0.2, 0.5], h: [0.15, 0.4], th: [0.03, 0.06], gap: -1, delay: [AS, 2.2], fin: 0.05 },
  ];
  const centers = [];
  shells.forEach((S, si) => {
    for (let i = 0; i < S.n; i++) {
      const dir = fib(i, S.n);
      dir.x += (r() - 0.5) * 0.04; dir.normalize();
      if (S.gap > -1 && n3(dir.x * 2.3 + si, dir.y * 2.3, dir.z * 2.3) > S.gap + 0.12) continue;   // windows into the interior
      const N = nrm(dir), pos = surf(dir, S.shell + (r() - 0.5) * 0.06);
      const q0 = new THREE.Quaternion().setFromUnitVectors(up, N);
      q0.multiply(tmpQ.setFromAxisAngle(up, r() * Math.PI));
      q0.multiply(tmpQ.setFromAxisAngle(axis.set(r() - 0.5, r() - 0.5, 0).normalize(), (r() - 0.5) * 0.5)); // fractured, layered tilt
      const fin = r() < S.fin;
      if (fin) q0.multiply(tmpQ.setFromAxisAngle(axis.set(1, 0, 0), Math.PI / 2));                         // blades standing out of the surface
      const scl = new THREE.Vector3(S.w[0] + r() * (S.w[1] - S.w[0]), S.h[0] + r() * (S.h[1] - S.h[0]), S.th[0] + r() * (S.th[1] - S.th[0]));
      if (fin) { scl.y *= 1.6; pos.addScaledVector(N, scl.y * 0.3); }
      const start = pos.clone().addScaledVector(N, 3 + r() * 6).add(new THREE.Vector3((r() - 0.5) * 3, (r() - 0.5) * 3, (r() - 0.5) * 3));
      parts.push({ pos, quat: q0, scl, start, startQ: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)), delay: S.delay[0] + r() * S.delay[1], lit: si > 0 && r() < 0.09, shift: si === 0 && r() < 0.06 ? r() : 0, N });
      if (si < 2) centers.push(surf(dir, S.shell * 0.93));
    }
  });
  // beams connecting the core to the outer shell (the "architecture")
  for (let i = 0; i < Math.round(170 * q); i++) {
    const dir = fib(Math.floor(r() * 997), 997);
    const a = surf(dir, 0.5), b = surf(dir.clone().add(new THREE.Vector3((r() - 0.5) * 0.3, (r() - 0.5) * 0.3, (r() - 0.5) * 0.3)).normalize(), 0.97);
    const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    const q0 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const t = 0.025 + r() * 0.04;
    parts.push({ pos: mid, quat: q0, scl: new THREE.Vector3(t, len, t), start: mid.clone().multiplyScalar(2.8), startQ: q0.clone(), delay: 52.4 + r() * 3, lit: r() < 0.15, shift: 0, N: dir });
  }

  const box = new THREE.BoxGeometry(1, 1, 1);
  const plain = parts.filter((p) => !p.lit), lit = parts.filter((p) => p.lit);
  const meshA = new THREE.InstancedMesh(box, plateMat, plain.length), meshB = new THREE.InstancedMesh(box, litMat, lit.length);
  for (const m of [meshA, meshB]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(m); }

  // interior light – purple light moving through the structure
  const core = new THREE.PointLight(0x7b5cf0, 0, 7, 1.4); group.add(core);
  const core2 = new THREE.PointLight(C.lpurple, 0, 5, 1.6); group.add(core2);

  // ── data pathways beneath the surface: edges between neighbouring fragments, pulses of light travel along them
  const segs = [], segT = [], segS = [];
  for (let i = 0; i < centers.length; i++) {
    const a = centers[i]; let best = [];
    for (let j = 0; j < centers.length; j++) { if (j === i) continue; const d = a.distanceToSquared(centers[j]); if (d < 1.4) { best.push([d, j]); } }
    best.sort((x, y) => x[0] - y[0]); best = best.slice(0, 2);
    for (const [, j] of best) { if (j < i) continue; const b = centers[j], s = r(); segs.push(a.x, a.y, a.z, b.x, b.y, b.z); segT.push(0, 1); segS.push(s, s); }
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3)); pg.setAttribute('aT', new THREE.Float32BufferAttribute(segT, 1)); pg.setAttribute('aS', new THREE.Float32BufferAttribute(segS, 1));
  const pathMat = new THREE.ShaderMaterial({
    ...PREMUL,
    uniforms: { uDepth: SH.uDepth, uRes: SH.uRes, uNear: SH.uNear, uFar: SH.uFar, uTime: { value: 0 }, uOp: { value: 0 }, uC: { value: new THREE.Color(0x6a46e8) }, uL: { value: new THREE.Color(C.lpurple) }, uR: { value: new THREE.Color(C.red) } },
    vertexShader: `attribute float aT, aS; varying float vT, vS, vZ; void main(){ vT = aT; vS = aS; vec4 mv = modelViewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: HEAD + `uniform float uTime, uOp; uniform vec3 uC, uL, uR; varying float vT, vS, vZ;
      void main(){
        float ph = fract(vS * 13.7 + uTime * (0.25 + vS * 0.5));
        float pulse = exp(-abs(vT - ph) * 18.0) * step(0.45, fract(vS * 31.0));
        vec3 col = mix(uC, uL, pulse); if (vS > 0.985) col = uR;
        float occ = clamp((sceneZ() - vZ) * 3.0, 0.0, 1.0);
        gl_FragColor = vec4(col * (0.12 + pulse * 2.8) * uOp * occ, 0.0);
      }`,
  });
  const paths = new THREE.LineSegments(pg, pathMat); paths.layers.set(LAYER.LIGHT); paths.frustumCulled = false; group.add(paths);

  // ── the converging fragments: symbols, binary, hex, data particles → gather → keep moving inside
  const GN = Math.round(3400 * q);
  const gp = new Float32Array(GN * 3), gt = new Float32Array(GN * 3), gd = new Float32Array(GN * 4), gs = new Float32Array(GN);
  for (let i = 0; i < GN; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(r() * 2 - 1), R = 5 + Math.pow(r(), 0.7) * 13;
    gp.set([Math.sin(ph) * Math.cos(th) * R * 1.3, Math.cos(ph) * R * 0.55, Math.sin(ph) * Math.sin(th) * R + 4], i * 3); // scattered through the dark, toward camera too
    const d = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), k = Math.pow(r(), 0.5) * 0.85;
    const tgt = surf(d, k * 0.9);
    gt.set([tgt.x, tgt.y, tgt.z], i * 3);
    const cr = r(), grp = [0, 0, 16, 32, 48][Math.floor(r() * 5)];
    gd.set([r() < 0.35 ? Math.floor(r() * 2) : grp + Math.floor(r() * 16), 0.05 + r() * 0.1, r(), cr < 0.05 ? 3 : cr < 0.4 ? 1 : 0], i * 4);
    gs[i] = 49.4 + r() * 4.2 + (R - 5) / 13 * 1.2;                      // gather start time
  }
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.BufferAttribute(gp, 3)); gg.setAttribute('aTgt', new THREE.BufferAttribute(gt, 3)); gg.setAttribute('aData', new THREE.BufferAttribute(gd, 4)); gg.setAttribute('aStart', new THREE.BufferAttribute(gs, 1));
  const glyphMat = new THREE.ShaderMaterial({
    ...PREMUL,
    uniforms: { uDepth: SH.uDepth, uRes: SH.uRes, uNear: SH.uNear, uFar: SH.uFar, uScale: SH.uScale, uFocus: SH.uFocus, uAperture: SH.uAperture,
      uAtlas: { value: atlas.sharp }, uAtlasBlur: { value: atlas.blur }, uTime: { value: 0 }, uOp: { value: 1 }, uGain: { value: 1.5 }, uSpread: { value: new THREE.Vector3(1, 1, 1) },
      uC0: { value: new THREE.Color(C.lpurple) }, uC1: { value: new THREE.Color(C.white) }, uC3: { value: new THREE.Color(C.red) } },
    vertexShader: /* glsl */`
      attribute vec3 aTgt; attribute vec4 aData; attribute float aStart;
      uniform float uTime, uScale, uFocus, uAperture, uOp, uGain; uniform vec3 uC0, uC1, uC3, uSpread;
      varying float vG, vA, vB, vZ; varying vec3 vCol;
      vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
      void main(){
        float t = uTime, sd = aData.z;
        float appear = smoothstep(48.5 + sd * 2.2, 49.8 + sd * 2.2, t);
        float g = smoothstep(aStart, aStart + 3.4, t);
        // after arriving, keep circulating inside the structure (a whole system moving beneath the surface)
        vec3 inner = rotY(aTgt, t * (0.06 + sd * 0.12) * (sd > 0.5 ? 1.0 : -1.0)) + vec3(0.0, sin(t * 0.7 + sd * 30.0) * 0.12, 0.0);
        vec3 drift = position * uSpread + vec3(sin(t * 0.3 + sd * 20.0), cos(t * 0.23 + sd * 11.0) * 0.5, 0.0) * 0.4;
        vec3 side = normalize(cross(inner - drift + vec3(0.001), vec3(0.0, 1.0, 0.0)));
        vec3 p = mix(drift, inner, g) + side * sin(g * 3.14159) * (1.5 + sd * 2.0);   // curved, spiralling approach
        vec4 mv = modelViewMatrix * vec4(p, 1.0); float z = max(-mv.z, 0.01); vZ = z;
        float coc = clamp(abs(z - uFocus) / z * uAperture, 0.0, 1.0); vB = coc;
        gl_PointSize = clamp(aData.y * mix(1.0, 0.65, g) * (1.0 + coc * 0.9) * uScale / z, 0.0, 120.0);
        float flick = step(0.08, fract(sin(floor(t * 11.0) + sd * 91.0) * 43758.5));
        vA = appear * mix(1.0, 0.75, g) * uOp * flick * smoothstep(0.2, 0.8, z) * (1.0 - coc * 0.6) * uGain;
        float rate = sd > 0.6 ? (sd - 0.6) * 12.0 : 0.0; float grp = floor(aData.x / 16.0) * 16.0;
        vG = aData.x < 2.0 ? mod(aData.x + floor(t * rate), 2.0) : grp + mod(aData.x - grp + floor(t * rate), 16.0);
        int ci = int(aData.w + 0.5); vCol = ci == 3 ? uC3 : ci == 1 ? uC1 : uC0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: HEAD + /* glsl */`
      uniform sampler2D uAtlas, uAtlasBlur; varying float vG, vA, vB, vZ; varying vec3 vCol;
      void main(){
        if (vA < 0.002) discard;
        float occ = clamp((sceneZ() - vZ) * 3.0, 0.0, 1.0);          // hidden by the plates → seen only through the gaps
        vec2 pc = gl_PointCoord; float cx = mod(vG, 8.0), cy = floor(vG / 8.0);
        vec2 uv = vec2((cx + pc.x) / 8.0, 1.0 - (cy + pc.y) / 8.0);
        float a = mix(texture2D(uAtlas, uv).a, texture2D(uAtlasBlur, uv).a * 1.5, vB);
        gl_FragColor = vec4(vCol * a * vA * occ, 0.0);
      }`,
  });
  const glyphs = new THREE.Points(gg, glyphMat); glyphs.layers.set(LAYER.LIGHT); glyphs.frustumCulled = false; group.add(glyphs);

  // ── per-frame
  const dummy = new THREE.Object3D(), qq = new THREE.Quaternion(), bv = new THREE.Vector3(), camInv = new THREE.Matrix4();
  function placeAll(m, list, t) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i], k = smooth(p.delay, p.delay + 1.9, t), e = 1 - Math.pow(1 - k, 3);
      dummy.position.lerpVectors(p.start, p.pos, e);
      if (p.shift && k >= 1) dummy.position.addScaledVector(p.N, Math.sin(t * 0.8 + p.shift * 40) * 0.05);  // slow re-keying of outer plates
      qq.slerpQuaternions(p.startQ, p.quat, e); dummy.quaternion.copy(qq);
      dummy.scale.copy(p.scl).multiplyScalar(k <= 0 ? 0.0001 : 0.15 + 0.85 * e);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }
  function update(t, s, camera, backWorld) {
    const { rim, reveal, hb, fog } = s;
    placeAll(meshA, plain, t); placeAll(meshB, lit, t);
    const built = smooth(AS, 56.5, t);
    U.uRim.value = rim * (1 + hb * 0.12) + reveal * 1.3;
    bv.copy(backWorld).sub(group.position).normalize().transformDirection(camera.matrixWorldInverse); U.uBackV.value.copy(bv);
    litMat.emissiveIntensity = built * (0.06 + 0.05 * Math.sin(t * 2.3)) + hb * 0.05 + reveal * 0.12;
    // purple light travelling through the interior
    core.position.set(Math.sin(t * 0.45) * 1.2, Math.cos(t * 0.31) * 1.0, Math.sin(t * 0.27) * 0.8);
    core.intensity = built * (5 + hb * 4) + reveal * 10;
    core2.position.set(Math.cos(t * 0.6) * 1.6, Math.sin(t * 0.5) * 1.3, Math.cos(t * 0.37) * 0.9);
    core2.intensity = built * 1.4 + reveal * 3;
    pathMat.uniforms.uTime.value = t; pathMat.uniforms.uOp.value = smooth(54.6, 57.0, t) * (0.7 + hb * 0.5) + reveal * 0.8;
    glyphMat.uniforms.uTime.value = t; glyphMat.uniforms.uOp.value = 0.85 + reveal * 0.4;
    group.rotation.y = 0.12 + Math.sin(t * 0.17) * 0.05;
  }
  const setPortrait = (p) => glyphMat.uniforms.uSpread.value.set(p ? 0.5 : 1, p ? 1.7 : 1, 1);
  return { group, update, setPortrait };
}
