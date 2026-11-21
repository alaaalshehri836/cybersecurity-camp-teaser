// ── Cinematic FX building blocks ─────────────────────────────────────────
// Layers: 0 = solid world (gets DOF + motion blur in post)
//         1 = light layer  (glyphs, dust, beams, streams – additive, own DOF, depth-occluded)
//         2 = fog layer    (lit volumetric fog, half-res, soft-intersects geometry)
import * as THREE from 'three';
import { mulberry32 } from '../util.js';

export const LAYER = { WORLD: 0, LIGHT: 1, FOG: 2 };

export const SH = {
  uDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uResHalf: { value: new THREE.Vector2(1, 1) },
  uNear: { value: 0.05 }, uFar: { value: 220 },
  uFocus: { value: 4 }, uAperture: { value: 0.6 }, uScale: { value: 600 },
};

export const HEAD = /* glsl */`
uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar;
float linD(float d){ return (uNear*uFar)/(uFar - d*(uFar-uNear)); }
float sceneZ(){ return linD(texture2D(uDepth, gl_FragCoord.xy/uRes).x); }
`;
export const PREMUL = {
  transparent: true, depthWrite: false, depthTest: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
};
const col = (h) => new THREE.Color(h);

// ────────────────────────────────────────────────────────────────────────
// Glyph field – floating cryptographic symbols with depth parallax & life cycles
// mode 0: drifting in a wrapping box, each glyph fades/scales in & out on its own cycle
// mode 1: emission – glyphs leave their spawn point (e.g. the monitor) after a delay
// ────────────────────────────────────────────────────────────────────────
export function glyphField(atlas, o) {
  const n = o.count, r = mulberry32(o.seed || 1);
  const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3), dat = new Float32Array(n * 4), life = new Float32Array(n * 2);
  const groups = o.groups || [0, 16, 32, 48];
  for (let i = 0; i < n; i++) {
    const s = o.spawn(i, r); // returns {p:[x,y,z], v:[x,y,z], size, life:[period,phase]}
    pos.set(s.p, i * 3); vel.set(s.v, i * 3);
    const g = groups[Math.floor(r() * groups.length)];
    const cr = r(), ci = s.c != null ? s.c : cr < (o.red ?? 0.05) ? 3 : cr < (o.red ?? 0.05) + (o.turq ?? 0.04) ? 2 : cr < 0.45 ? 1 : 0;
    dat.set([g + Math.floor(r() * 16), s.size, r() < (o.cycleFrac ?? 0.5) ? 0.5 + r() * 0.5 : r() * 0.5, ci], i * 4);
    life.set(s.life || [4 + r() * 6, r() * 10], i * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(dat, 4));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 2));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const mat = new THREE.ShaderMaterial({
    ...PREMUL,
    uniforms: {
      ...SH_PICK('uDepth uRes uNear uFar uFocus uAperture uScale'),
      uAtlas: { value: atlas.sharp }, uAtlasBlur: { value: atlas.blur },
      uTime: { value: 0 }, uOpacity: { value: 1 }, uMode: { value: o.mode || 0 }, uFlick: { value: o.flick ?? 0.4 },
      uBoxMin: { value: new THREE.Vector3(...(o.boxMin || [-10, -10, -10])) }, uBoxSize: { value: new THREE.Vector3(...(o.boxSize || [20, 20, 20])) },
      uDrift: { value: new THREE.Vector3(...(o.drift || [0, 0, 0])) },
      uC0: { value: col(o.c0 || 0xa380ff) }, uC1: { value: col(o.c1 || 0xededed) }, uC2: { value: col(o.c2 || 0x57e3d8) }, uC3: { value: col(o.c3 || 0xc62836) },
      uGain: { value: o.gain ?? 1.6 }, uStretch: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aVel; attribute vec4 aData; attribute vec2 aLife;
      uniform float uTime, uScale, uOpacity, uMode, uFlick, uFocus, uAperture, uGain;
      uniform vec3 uBoxMin, uBoxSize, uDrift, uC0, uC1, uC2, uC3;
      varying float vG, vA, vBlur, vZ; varying vec3 vC;
      float h1(float n){ return fract(sin(n)*43758.5453); }
      void main(){
        float t = uTime; vec3 p; float life;
        if (uMode < 0.5) {
          p = position + (aVel + uDrift) * t;
          p = uBoxMin + mod(p - uBoxMin, uBoxSize);
          float ph = fract((t + aLife.y) / aLife.x);
          life = smoothstep(0.0, 0.2, ph) * smoothstep(1.0, 0.7, ph);
          vec3 q = (p - uBoxMin) / uBoxSize;
          life *= smoothstep(0.0, 0.06, q.z) * smoothstep(1.0, 0.94, q.z) * smoothstep(0.0, 0.05, q.x) * smoothstep(1.0, 0.95, q.x);
        } else {
          float lt = max(0.0, t - aLife.y);
          p = position + aVel * lt + sin(vec3(1.3, 1.7, 1.1) * lt + aData.z * 9.0) * 0.05 * lt + uDrift * lt * lt;
          life = smoothstep(0.0, 0.35, lt) * step(aLife.y, t) * (1.0 - smoothstep(aLife.x * 0.55, aLife.x, lt));
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float z = max(-mv.z, 0.01); vZ = z;
        float coc = clamp(abs(z - uFocus) / z * uAperture, 0.0, 1.0);
        vBlur = coc;
        gl_PointSize = clamp(aData.y * (1.0 + coc * 0.9) * uScale / z, 0.0, 190.0);
        float near = smoothstep(0.12, 0.7, z);
        float flick = step(0.07, h1(floor(t * 13.0) + aData.z * 91.0));
        vA = life * uOpacity * near * mix(1.0, flick, uFlick) * (1.0 - coc * 0.6) * uGain;
        float rate = aData.z > 0.5 ? (aData.z - 0.5) * 9.0 : 0.0;
        float grp = floor(aData.x / 16.0) * 16.0;
        vG = grp + mod(aData.x - grp + floor(t * rate), 16.0);
        int ci = int(aData.w + 0.5);
        vC = ci == 0 ? uC0 : ci == 1 ? uC1 : ci == 2 ? uC2 : uC3;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: HEAD + /* glsl */`
      uniform sampler2D uAtlas, uAtlasBlur;
      varying float vG, vA, vBlur, vZ; varying vec3 vC;
      void main(){
        if (vA < 0.002) discard;
        float occ = clamp((sceneZ() - vZ) * 3.0, 0.0, 1.0);
        vec2 pc = gl_PointCoord;
        float cx = mod(vG, 8.0), cy = floor(vG / 8.0);
        vec2 uv = vec2((cx + pc.x) / 8.0, 1.0 - (cy + pc.y) / 8.0);
        float a = mix(texture2D(uAtlas, uv).a, texture2D(uAtlasBlur, uv).a * 1.5, vBlur);
        gl_FragColor = vec4(vC * a * vA * occ, 0.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.layers.set(LAYER.LIGHT); pts.frustumCulled = false; pts.renderOrder = 5;
  pts.userData.u = mat.uniforms;
  return pts;
}
function SH_PICK(keys) { const o = {}; for (const k of keys.split(' ')) o[k] = SH[k]; return o; }

// ────────────────────────────────────────────────────────────────────────
// Lit volumetric fog – drifting, rotating, breathing puffs; scatter light from up to 4 lights,
// soft-intersect solid geometry (so fog wraps around objects instead of sitting on top)
// ────────────────────────────────────────────────────────────────────────
export function fogVolume(tex, noise, o) {
  const n = o.count, r = mulberry32(o.seed || 5);
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.attributes.position = base.attributes.position; geo.attributes.uv = base.attributes.uv;
  const aPos = new Float32Array(n * 3), aPar = new Float32Array(n * 4), aVel = new Float32Array(n * 3);
  const [bx, by, bz] = o.boxMin, [sx, sy, sz] = o.boxSize;
  for (let i = 0; i < n; i++) {
    const s = o.spawn ? o.spawn(i, r) : null;
    aPos.set(s?.p || [bx + r() * sx, by + Math.pow(r(), o.lowBias ?? 1) * sy, bz + r() * sz], i * 3);
    aPar.set([(o.size[0] + r() * (o.size[1] - o.size[0])), (r() - 0.5) * (o.spin ?? 0.08), r(), (o.alpha[0] + r() * (o.alpha[1] - o.alpha[0]))], i * 4);
    const w = o.wind || [0.08, 0, 0.02];
    aVel.set([w[0] * (0.5 + r()), w[1] * (0.5 + r()) + (r() - 0.5) * 0.02, w[2] * (0.5 + r()) + (r() - 0.5) * 0.04], i * 3);
  }
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  geo.setAttribute('aPar', new THREE.InstancedBufferAttribute(aPar, 4));
  geo.setAttribute('aVel', new THREE.InstancedBufferAttribute(aVel, 3));
  geo.instanceCount = n;
  const lights = [0, 1, 2, 3].map(() => ({ pos: new THREE.Vector3(0, -999, 0), col: new THREE.Color(0, 0, 0), range: 1 }));
  const mat = new THREE.ShaderMaterial({
    ...PREMUL,
    uniforms: {
      uDepth: SH.uDepth, uRes: SH.uResHalf, uNear: SH.uNear, uFar: SH.uFar,
      uTex: { value: tex }, uNoise: { value: noise }, uTime: { value: 0 }, uOpacity: { value: 1 },
      uColor: { value: col(o.color || 0x4f29b7) }, uAmbient: { value: new THREE.Color(o.ambient ?? 0.25, o.ambient ?? 0.25, o.ambient ?? 0.25) },
      uBoxMin: { value: new THREE.Vector3(...o.boxMin) }, uBoxSize: { value: new THREE.Vector3(...o.boxSize) },
      uLPos: { value: lights.map((l) => l.pos) }, uLCol: { value: lights.map((l) => l.col) }, uLRange: { value: [1, 1, 1, 1] },
      uScatter: { value: o.scatter ?? 1.0 }, uSoft: { value: o.soft ?? 1.2 }, uDensity: { value: o.density ?? 1 }, uContrast: { value: o.contrast ?? 0 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute vec4 aPar; attribute vec3 aVel;
      uniform float uTime, uOpacity, uScatter; uniform vec3 uBoxMin, uBoxSize, uColor, uAmbient;
      uniform vec3 uLPos[4]; uniform vec3 uLCol[4]; uniform float uLRange[4];
      varying vec2 vUv, vNuv; varying float vA, vZ; varying vec3 vCol;
      void main(){
        vec3 c = aPos + aVel * uTime;
        c = uBoxMin + mod(c - uBoxMin, uBoxSize);
        vec3 q = (c - uBoxMin) / uBoxSize;
        float edge = smoothstep(0.0, 0.15, q.x) * smoothstep(1.0, 0.85, q.x) * smoothstep(0.0, 0.15, q.z) * smoothstep(1.0, 0.85, q.z);
        float ang = aPar.z * 6.283 + uTime * aPar.y;
        float s = aPar.x * (1.0 + 0.18 * sin(uTime * 0.21 + aPar.z * 17.0));   // fog spreads & contracts
        vec2 off = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * position.xy * s;
        vec4 mv = modelViewMatrix * vec4(c, 1.0);
        mv.xy += off;
        vZ = -mv.z;
        vec3 wc = (modelMatrix * vec4(c, 1.0)).xyz;
        vec3 V = normalize(wc - cameraPosition);
        vec3 L = uAmbient;
        for (int i = 0; i < 4; i++) {
          vec3 d = uLPos[i] - wc; float dd = dot(d, d);
          float att = 1.0 / (1.0 + dd / (uLRange[i] * uLRange[i]));
          float fwd = pow(max(dot(V, normalize(d)), 0.0), 6.0) * uScatter;   // forward scattering (backlight glow)
          L += uLCol[i] * att * (0.55 + fwd * 2.5);
        }
        vCol = uColor * L;
        vUv = uv; vNuv = wc.xz * 0.06 + wc.y * 0.04 + aPar.z * 7.0;
        vA = aPar.w * uOpacity * edge;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear, uFar;
      uniform sampler2D uTex, uNoise; uniform float uTime, uSoft, uDensity, uContrast;
      varying vec2 vUv, vNuv; varying float vA, vZ; varying vec3 vCol;
      float linD(float d){ return (uNear*uFar)/(uFar - d*(uFar-uNear)); }
      void main(){
        float puff = texture2D(uTex, vUv).a;
        if (puff < 0.003) discard;
        float n1 = texture2D(uNoise, vUv * 0.8 + vNuv + uTime * vec2(0.011, 0.004)).r;
        float n2 = texture2D(uNoise, vUv * 1.6 - vNuv * 1.3 - uTime * vec2(0.007, 0.013)).r;
        float dens = puff * smoothstep(0.18 + uContrast * 0.32, 0.9 + uContrast * 0.1, n1 * 0.65 + n2 * 0.55) * uDensity * (1.0 + uContrast * 0.6);
        float sz = linD(texture2D(uDepth, gl_FragCoord.xy / uRes).x);
        float soft = clamp((sz - vZ) / uSoft, 0.0, 1.0);
        float near = smoothstep(0.25, 1.8, vZ);
        float a = clamp(dens * vA * soft * near, 0.0, 1.0);
        gl_FragColor = vec4(vCol * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.layers.set(LAYER.FOG); mesh.frustumCulled = false;
  mesh.userData.u = mat.uniforms;
  mesh.userData.setLight = (i, pos, color, intensity, range) => {
    mat.uniforms.uLPos.value[i].copy(pos); mat.uniforms.uLCol.value[i].copy(color).multiplyScalar(intensity); mat.uniforms.uLRange.value[i] = range;
  };
  return mesh;
}

// ────────────────────────────────────────────────────────────────────────
// Dust motes – lit by a light cone + point lights; out-of-focus motes become soft bokeh
// ────────────────────────────────────────────────────────────────────────
export function dust(o) {
  const n = o.count, r = mulberry32(o.seed || 9);
  const pos = new Float32Array(n * 3), sd = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([o.boxMin[0] + r() * o.boxSize[0], o.boxMin[1] + r() * o.boxSize[1], o.boxMin[2] + r() * o.boxSize[2]], i * 3); sd[i] = r(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const mat = new THREE.ShaderMaterial({
    ...PREMUL,
    uniforms: {
      ...SH_PICK('uDepth uRes uNear uFar uFocus uAperture uScale'),
      uTime: { value: 0 }, uOpacity: { value: 1 },
      uBoxMin: { value: new THREE.Vector3(...o.boxMin) }, uBoxSize: { value: new THREE.Vector3(...o.boxSize) },
      uApex: { value: new THREE.Vector3(...(o.apex || [0, 10, 0])) }, uDir: { value: new THREE.Vector3(...(o.dir || [0, -1, 0])).normalize() },
      uCos: { value: Math.cos(o.angle || 0.4) }, uConeCol: { value: col(o.coneColor || 0xa380ff) },
      uPLPos: { value: new THREE.Vector3(0, -99, 0) }, uPLCol: { value: new THREE.Color(0, 0, 0) },
      uBase: { value: o.base ?? 0.06 },
    },
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime, uScale, uFocus, uAperture, uOpacity, uCos, uBase;
      uniform vec3 uBoxMin, uBoxSize, uApex, uDir, uConeCol, uPLPos, uPLCol;
      varying float vA, vZ, vBlur; varying vec3 vC;
      void main(){
        vec3 p = position + vec3(sin(uTime * 0.13 + aSeed * 40.0), sin(uTime * 0.09 + aSeed * 23.0) * 0.6 + uTime * 0.012, cos(uTime * 0.11 + aSeed * 31.0)) * 0.35;
        p = uBoxMin + mod(p - uBoxMin, uBoxSize);
        vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
        vec3 d = normalize(wp - uApex);
        float inCone = smoothstep(uCos, uCos + (1.0 - uCos) * 0.35, dot(d, uDir));
        vec3 dl = uPLPos - wp; float pl = 1.0 / (1.0 + dot(dl, dl) * 1.6);
        vC = uConeCol * inCone * 2.2 + uPLCol * pl + vec3(uBase);
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        float z = max(-mv.z, 0.01); vZ = z;
        float coc = clamp(abs(z - uFocus) / z * uAperture * 1.4, 0.0, 1.0); vBlur = coc;
        float sz = (0.012 + aSeed * 0.014) * (1.0 + coc * 5.0);
        gl_PointSize = clamp(sz * uScale / z, 1.0, 64.0);
        float tw = 0.6 + 0.4 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 50.0);
        vA = uOpacity * tw * smoothstep(0.15, 0.6, z) / (1.0 + coc * 6.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: HEAD + /* glsl */`
      varying float vA, vZ, vBlur; varying vec3 vC;
      void main(){
        vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0;
        float disc = mix(1.0 - smoothstep(0.2, 1.0, d), (1.0 - smoothstep(0.75, 1.0, d)) * (0.55 + 0.45 * smoothstep(0.3, 0.95, d)), vBlur);
        float occ = clamp((sceneZ() - vZ) * 3.0, 0.0, 1.0);
        gl_FragColor = vec4(vC * disc * vA * occ, 0.0);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.layers.set(LAYER.LIGHT); pts.frustumCulled = false;
  pts.userData.u = mat.uniforms;
  return pts;
}

// ────────────────────────────────────────────────────────────────────────
// Volumetric light beam (with optional blind-slat striping) – soft-occluded by geometry
// ────────────────────────────────────────────────────────────────────────
export function beam(o) {
  const len = o.length;
  const geo = new THREE.CylinderGeometry(o.rTop, o.rBottom, len, 48, 24, true);
  geo.translate(0, -len / 2, 0); // apex at origin, extends down -y
  const mat = new THREE.ShaderMaterial({
    ...PREMUL, side: THREE.DoubleSide,
    uniforms: {
      ...SH_PICK('uDepth uRes uNear uFar'),
      uColor: { value: col(o.color || 0x7b5cf0) }, uIntensity: { value: o.intensity ?? 0.5 }, uTime: { value: 0 },
      uStripes: { value: o.stripes ?? 0 }, uNoise: { value: o.noise || null }, uLen: { value: len },
    },
    vertexShader: /* glsl */`
      varying vec3 vN, vV, vL; varying float vZ, vY;
      uniform float uLen;
      void main(){
        vL = position; vY = -position.y / uLen;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vZ = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: HEAD + /* glsl */`
      uniform vec3 uColor; uniform float uIntensity, uTime, uStripes; uniform sampler2D uNoise;
      varying vec3 vN, vV, vL; varying float vZ, vY;
      void main(){
        float rim = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float along = (1.0 - smoothstep(0.0, 1.0, vY)) * smoothstep(0.0, 0.06, vY);
        float st = 1.0;
        if (uStripes > 0.0) { float s = fract(vL.x * uStripes + vL.z * uStripes * 0.15); st = 0.25 + 0.75 * smoothstep(0.15, 0.45, s) * smoothstep(0.95, 0.65, s); }
        float n = texture2D(uNoise, vec2(vL.x * 0.25 + uTime * 0.01, vL.y * 0.12 - uTime * 0.02)).r;
        float occ = clamp((sceneZ() - vZ) / 0.6, 0.0, 1.0);
        float a = rim * along * st * (0.55 + 0.9 * n) * uIntensity * occ;
        gl_FragColor = vec4(uColor * a, 0.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.layers.set(LAYER.LIGHT); m.frustumCulled = false; m.userData.u = mat.uniforms;
  return m;
}

// ────────────────────────────────────────────────────────────────────────
// Data streams – instanced light trails travelling along +z (rotate the mesh for other axes)
// ────────────────────────────────────────────────────────────────────────
export function streams(o) {
  const n = o.count, r = mulberry32(o.seed || 21);
  const base = new THREE.BoxGeometry(1, 1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index; geo.attributes.position = base.attributes.position;
  const off = new Float32Array(n * 3), par = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const p = o.place(i, r);
    off.set([p[0], p[1], r() * o.span], i * 3);
    const cr = r();
    par.set([o.speed[0] + r() * (o.speed[1] - o.speed[0]), o.len[0] + r() * (o.len[1] - o.len[0]), o.thick * (0.5 + r()), cr < (o.red ?? 0.06) ? 3 : cr < 0.12 ? 2 : cr < 0.5 ? 1 : 0], i * 4);
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('aPar', new THREE.InstancedBufferAttribute(par, 4));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    ...PREMUL,
    uniforms: {
      ...SH_PICK('uDepth uRes uNear uFar'),
      uTime: { value: 0 }, uSpan: { value: o.span }, uOpacity: { value: 1 }, uSpeedMul: { value: 1 },
      uC0: { value: col(0x4f29b7) }, uC1: { value: col(0xa380ff) }, uC2: { value: col(0x57e3d8) }, uC3: { value: col(0xc62836) },
      uGain: { value: o.gain ?? 2.0 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aOff; attribute vec4 aPar;
      uniform float uTime, uSpan, uSpeedMul; uniform vec3 uC0, uC1, uC2, uC3;
      varying float vT, vZ; varying vec3 vC;
      void main(){
        vec3 p = position;
        vT = p.z + 0.5;
        p.z *= aPar.y; p.xy *= aPar.z;
        float z = mod(aOff.z + uTime * aPar.x * uSpeedMul, uSpan) - uSpan * 0.5;
        p += vec3(aOff.xy, z);
        int ci = int(aPar.w + 0.5); vC = ci == 0 ? uC0 : ci == 1 ? uC1 : ci == 2 ? uC2 : uC3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vZ = -mv.z;
        float edge = 1.0 - smoothstep(uSpan * 0.38, uSpan * 0.5, abs(z));
        vC *= edge;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: HEAD + /* glsl */`
      uniform float uOpacity, uGain; varying float vT, vZ; varying vec3 vC;
      void main(){
        float head = pow(vT, 3.0);
        float occ = clamp((sceneZ() - vZ) * 2.0, 0.0, 1.0);
        float fog = exp(-vZ * 0.035);
        gl_FragColor = vec4(vC * head * uOpacity * uGain * occ * fog, 0.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.layers.set(LAYER.LIGHT); m.frustumCulled = false; m.userData.u = mat.uniforms;
  return m;
}

// ────────────────────────────────────────────────────────────────────────
// Glass screen panel: emerges from darkness, glows, dissolves into darkness with a burning edge
// ────────────────────────────────────────────────────────────────────────
export function panelMaterial(map, noise, o = {}) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      uMap: { value: map }, uNoise: { value: noise }, uDissolve: { value: 0 }, uEmerge: { value: 1 },
      uGain: { value: o.gain ?? 1.7 }, uRed: { value: 0 }, uFogColor: { value: col(o.fog || 0x07040e) }, uFogDensity: { value: o.fogDensity ?? 0.05 },
      uEdge: { value: col(0xa380ff) }, uTime: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vZ;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap, uNoise; uniform float uDissolve, uEmerge, uGain, uRed, uFogDensity, uTime; uniform vec3 uFogColor, uEdge;
      varying vec2 vUv; varying float vZ;
      void main(){
        float n = texture2D(uNoise, vUv * vec2(1.6, 1.0) * 1.3).r * 0.75 + texture2D(uNoise, vUv * 5.0).r * 0.25;
        float th = uDissolve * 1.15 - 0.08;
        if (n < th) discard;
        float edge = 1.0 - smoothstep(0.0, 0.06, n - th);
        vec3 c = texture2D(uMap, vUv).rgb;
        float lum = dot(c, vec3(0.3, 0.5, 0.2));
        c = c * (0.6 + uGain * smoothstep(0.08, 0.7, lum));
        c = mix(c, c * vec3(1.6, 0.35, 0.45) + vec3(0.12, 0.0, 0.01) * lum, uRed);
        c *= uEmerge;
        c += uEdge * edge * step(0.001, uDissolve) * 3.0;
        float f = 1.0 - exp(-vZ * uFogDensity);
        gl_FragColor = vec4(mix(c, uFogColor, f), 1.0);
      }`,
  });
}
