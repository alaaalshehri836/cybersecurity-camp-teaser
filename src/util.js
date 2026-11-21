// ── Shared math / RNG / envelope helpers ────────────────────────────────
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeIn3 = (t) => t * t * t;
export const easeOut3 = (t) => 1 - Math.pow(1 - t, 3);

// Sum of exponential decays triggered at event times (used for flashes / glitch)
export function decayEnv(t, events, decay = 0.25) {
  let v = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const dt = t - e.t;
    if (dt < 0 || dt > decay * 8) continue;
    v += e.v * Math.exp(-dt / (e.d || decay));
  }
  return v;
}

// Cheap smooth 1D noise for handheld camera (sum of incommensurate sines)
export function hand(t, seed = 0) {
  return (
    Math.sin(t * 0.73 + seed * 1.7) * 0.5 +
    Math.sin(t * 1.31 + seed * 3.1) * 0.3 +
    Math.sin(t * 2.17 + seed * 5.3) * 0.2
  );
}

// 2D value noise + fbm (texture generation)
export function makeNoise2D(seed = 1) {
  const r = mulberry32(seed);
  const N = 256, perm = new Uint8Array(N * 2), vals = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; vals[i] = r(); }
  for (let i = N - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const h = (x, y) => vals[perm[(perm[x & 255] + y) & 511]];
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export function fbm(noise, x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
