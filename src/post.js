// ── Post-production: world → (motion blur + depth of field) → lit fog + light layer → bloom → film grade
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { SH, LAYER } from './fx/fx.js';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  constructor(renderer, quality) {
    this.r = renderer; this.q = quality;
    const ext = renderer.extensions;
    const halfOK = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    const hf = { type: halfOK ? THREE.HalfFloatType : THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { ...hf });
    this.sceneRT.depthTexture = new THREE.DepthTexture(1, 1);
    this.sceneRT.depthTexture.type = THREE.UnsignedIntType;
    this.lightRT = new THREE.WebGLRenderTarget(1, 1, { ...hf, depthBuffer: false });
    this.fogRT = new THREE.WebGLRenderTarget(1, 1, { ...hf, depthBuffer: false });
    this.compRT = new THREE.WebGLRenderTarget(1, 1, { ...hf, depthBuffer: false });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.55, 0.22);
    this.prevVP = new THREE.Matrix4(); this.hasPrev = false;

    const taps = quality < 1 ? 12 : 20;
    this.comp = new THREE.ShaderMaterial({
      defines: { TAPS: taps, TAPSM1: (taps - 1).toFixed(1) },
      uniforms: {
        tScene: { value: this.sceneRT.texture }, tDepth: { value: this.sceneRT.depthTexture },
        tLight: { value: this.lightRT.texture }, tFog: { value: this.fogRT.texture },
        uRes: { value: new THREE.Vector2() }, uNear: SH.uNear, uFar: SH.uFar, uFocus: SH.uFocus, uAperture: SH.uAperture,
        uMaxCoc: { value: 0.012 }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
        uPrevVP: { value: new THREE.Matrix4() }, uMotion: { value: 0.6 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tScene, tDepth, tLight, tFog; uniform vec2 uRes;
        uniform float uNear, uFar, uFocus, uAperture, uMaxCoc, uMotion;
        uniform mat4 uInvProj, uCamWorld, uPrevVP;
        varying vec2 vUv;
        float linD(float d){ return (uNear*uFar)/(uFar - d*(uFar-uNear)); }
        float cocAt(float z){ return clamp(abs(z - uFocus) / max(z, 0.05) * uAperture, 0.0, 1.0); }
        void main(){
          float d = texture2D(tDepth, vUv).x; float z = linD(d);
          // camera motion vector by reprojection (controlled, clamped)
          vec4 clip = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          vec4 view = uInvProj * clip; view /= view.w;
          vec4 prev = uPrevVP * (uCamWorld * view);
          vec2 puv = prev.xy / prev.w * 0.5 + 0.5;
          vec2 mv = (vUv - puv) * uMotion;
          float ml = length(mv); if (ml > 0.035) mv *= 0.035 / ml;
          float coc = cocAt(z) * uMaxCoc;
          vec2 asp = vec2(uRes.y / uRes.x, 1.0);
          vec3 acc = texture2D(tScene, vUv).rgb; float ws = 1.0;
          bool sharp = coc * uRes.y < 0.8 && length(mv * uRes) < 0.8;
          for (int i = 0; i < TAPS; i++) {
            if (sharp) break;
            float fi = float(i);
            float rr = sqrt((fi + 0.5) / float(TAPS)); float a = fi * 2.39996;
            vec2 o = vec2(cos(a), sin(a)) * rr * coc * asp + mv * (fi / TAPSM1 - 0.5);
            vec2 su = vUv + o;
            float sz = linD(texture2D(tDepth, su).x);
            // nearer-in-focus samples must not bleed onto blurred background
            float sc = cocAt(sz) * uMaxCoc;
            float w = sz < z - 0.05 ? smoothstep(0.0, 1.0, sc / max(rr * coc, 1e-4)) : 1.0;
            w = max(w, step(coc, 1e-5));
            acc += texture2D(tScene, su).rgb * w; ws += w;
          }
          vec3 c = acc / ws;
          vec4 F = texture2D(tFog, vUv);
          c = c * (1.0 - F.a) + F.rgb;
          c += texture2D(tLight, vUv).rgb;
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });

    this.final = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.compRT.texture }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 },
        uExposure: { value: 0 }, uGrain: { value: 0.06 }, uVig: { value: 1 }, uCA: { value: 0.3 }, uGlitch: { value: 0 },
        uRed: { value: 0 }, uFlash: { value: 0 }, uBars: { value: 0 }, uBlack: { value: 0 }, uLift: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tColor; uniform vec2 uRes; uniform float uTime, uExposure, uGrain, uVig, uCA, uGlitch, uRed, uFlash, uBars, uBlack, uLift;
        varying vec2 vUv;
        float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        vec3 neutral(vec3 color){
          const float sc = 0.76; const float des = 0.15;
          float x = min(color.r, min(color.g, color.b));
          float off = x < 0.08 ? x - 6.25 * x * x : 0.04; color -= off;
          float peak = max(color.r, max(color.g, color.b));
          if (peak < sc) return color;
          const float d = 1.0 - sc; float np = 1.0 - d * d / (peak + d - sc);
          color *= np / peak; float g = 1.0 - 1.0 / (des * (peak - np) + 1.0);
          return mix(color, vec3(np), g);
        }
        vec3 srgb(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec2 uv = vUv;
          float g = uGlitch;
          float tf = floor(uTime * 24.0);
          if (g > 0.002) {
            float rows = mix(14.0, 64.0, h21(vec2(tf, 1.7)));
            float seg = floor(uv.y * rows);
            float rr = h21(vec2(seg, tf));
            if (rr < g * 0.42) uv.x += (h21(vec2(seg, tf + 3.1)) - 0.5) * 0.11 * g;
            if (h21(vec2(tf, 9.0)) < g * 0.25) uv.y += (h21(vec2(tf, 5.0)) - 0.5) * 0.02 * g;
          }
          vec2 dir = uv - 0.5;
          float ca = (uCA + g * 2.5) * 0.0022 * (0.25 + length(dir) * 2.2);
          vec3 c;
          c.r = texture2D(tColor, uv - dir * ca * 1.0 - vec2(g * 0.004, 0.0)).r;
          c.g = texture2D(tColor, uv).g;
          c.b = texture2D(tColor, uv + dir * ca * 1.2 + vec2(g * 0.004, 0.0)).b;
          c *= uExposure;
          // dramatic red light leak from frame edges + red reflection tint
          float e = smoothstep(0.15, 0.85, length(dir * vec2(1.3, 1.0)));
          c = mix(c, c * vec3(1.35, 0.6, 0.66), clamp(uRed, 0.0, 1.0) * 0.16);
          c += vec3(0.62, 0.05, 0.09) * uRed * (0.03 + 0.97 * e * e) * 0.22;
          c += vec3(0.55, 0.42, 1.0) * uFlash * 0.85;
          c = neutral(c);
          // grade: push shadows into deep purple, keep blacks deep
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(c, c * vec3(0.93, 0.88, 1.1) + vec3(0.006, 0.002, 0.016) * uLift, 1.0 - smoothstep(0.0, 0.35, l));
          c = srgb(c);
          c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
          // vignette
          float v = 1.0 - smoothstep(0.35, 1.05, length(dir * vec2(1.1, 1.0)) * 1.25);
          c *= mix(1.0, v, 0.75 * uVig);
          // signal interference lines during glitch
          if (g > 0.05) c += (h21(vec2(floor(vUv.y * uRes.y * 0.5), tf)) - 0.5) * 0.08 * g;
          // film grain (luma-weighted, 24 fps)
          float gr = h21(gl_FragCoord.xy + vec2(tf * 37.71, tf * 11.13)) + h21(gl_FragCoord.yx * 1.37 + vec2(tf * 5.3, 91.7)) - 1.0;
          c += gr * uGrain * (0.45 + 0.55 * (1.0 - l)) * smoothstep(0.0, 0.25, uExposure + 0.03);
          float bar = step(vUv.y, uBars) + step(1.0 - uBars, vUv.y);
          c *= (1.0 - bar) * (1.0 - uBlack);
          gl_FragColor = vec4(c, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.comp);
    this.U = this.final.uniforms;
    this.C = this.comp.uniforms;
  }

  setSize(w, h, dpr) {
    const W = Math.max(1, Math.floor(w * dpr)), H = Math.max(1, Math.floor(h * dpr));
    this.W = W; this.H = H;
    this.sceneRT.setSize(W, H); this.lightRT.setSize(W, H); this.compRT.setSize(W, H);
    this.fogRT.setSize(Math.ceil(W / 2), Math.ceil(H / 2));
    this.bloom.setSize(Math.ceil(W / 2), Math.ceil(H / 2));
    SH.uRes.value.set(W, H); SH.uResHalf.value.set(Math.ceil(W / 2), Math.ceil(H / 2));
    this.C.uRes.value.set(W, H); this.U.uRes.value.set(W, H);
    SH.uDepth.value = this.sceneRT.depthTexture;
  }

  cut() { this.hasPrev = false; }

  render(scene, camera, black = false) {
    const r = this.r;
    if (black) { r.setRenderTarget(null); r.setClearColor(0x000000, 1); r.clear(); return; }
    SH.uNear.value = camera.near; SH.uFar.value = camera.far;
    SH.uScale.value = this.H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    camera.updateMatrixWorld();
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (!this.hasPrev) { this.prevVP.copy(vp); this.hasPrev = true; }

    // 1 · solid world
    r.setRenderTarget(this.sceneRT); camera.layers.set(LAYER.WORLD); r.setClearColor(scene.background || new THREE.Color(0), 1); r.clear();
    const bg = scene.background; r.render(scene, camera);
    scene.background = null;
    // 2 · light layer (glyphs / dust / beams / streams)
    r.setRenderTarget(this.lightRT); r.setClearColor(0x000000, 0); r.clear(); camera.layers.set(LAYER.LIGHT); r.render(scene, camera);
    // 3 · lit volumetric fog (half res)
    r.setRenderTarget(this.fogRT); r.clear(); camera.layers.set(LAYER.FOG); r.render(scene, camera);
    scene.background = bg; camera.layers.set(LAYER.WORLD);
    // 4 · DOF + motion blur + composite
    this.C.uInvProj.value.copy(camera.projectionMatrixInverse); this.C.uCamWorld.value.copy(camera.matrixWorld); this.C.uPrevVP.value.copy(this.prevVP);
    this.quad.material = this.comp; r.setRenderTarget(this.compRT); this.quad.render(r);
    this.prevVP.copy(vp);
    // 5 · bloom
    this.bloom.render(r, null, this.compRT, 0, false);
    // 6 · film grade to screen
    this.quad.material = this.final; r.setRenderTarget(null); this.quad.render(r);
  }
}
