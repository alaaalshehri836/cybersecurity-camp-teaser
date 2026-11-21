// ── Procedural textures: glyph atlas, monitor UI, cryptographic panels, fog ──
import * as THREE from 'three';
import { mulberry32, makeNoise2D, fbm, clamp, easeOut3, smooth } from './util.js';
import { T, E, MSG1, MSG2, CSS } from './config.js';
import { sha256 } from './sha256.js';

export const MONO = '"TMono", "DejaVu Sans Mono", "Menlo", "Consolas", monospace';
export const ARAB = '"TArabic", "Geeza Pro", "Segoe UI", sans-serif';

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ── Glyph atlas: 8×8 cells, technical vocabulary only
// 0-15 hex digits (incl. binary 0/1) · 16-31 bitwise / protocol operators · 32-47 bytes (AES S-box & brand values)
// 48-55 cryptographic mathematics · 56-63 data-structure tokens
export const GLYPH = { HEX: 0, OPS: 16, BYTES: 32, MATH: 48, SYM: 56 };
const HEXS = '0123456789ABCDEF';
const OPS = ['0x', '0b', '<<', '>>', '&&', '||', '^=', '!=', '==', '|', '&', '^', '~', '%', '::', '=>'];
const BYTES = ['63', '7C', '77', '7B', 'F2', '6B', '6F', 'C5', '4F', '29', 'B7', 'C6', '28', '36', 'FF', '00'];
const MATHS = ['⊕', '≡', 'mod', '∑', '√', 'π', 'e', 'φ'];
const SYMS = ['{', '}', '#', '$', '[ ]', '0x0', 'SHA', 'RSA'];

export function makeGlyphAtlas() {
  const S = 1024, cell = 128, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < 64; i++) {
    const cx = (i % 8) * cell, cy = Math.floor(i / 8) * cell;
    const tok = i < 16 ? HEXS[i] : i < 32 ? OPS[i - 16] : i < 48 ? BYTES[i - 32] : i < 56 ? MATHS[i - 48] : SYMS[i - 56];
    const fs = tok.length === 1 ? 92 : tok.length === 2 ? 64 : 44;   // multi-character tokens fit the same cell
    g.font = `${i >= 48 && i < 56 ? 400 : 500} ${fs}px ${MONO}`; g.fillText(tok, cx + 64, cy + 70);
  }
  // blurred twin (for depth-of-field on glyph particles) – downscale/upscale blur works everywhere
  const small = canvas(S / 8, S / 8), sg = small.getContext('2d');
  sg.imageSmoothingQuality = 'high'; sg.drawImage(c, 0, 0, S / 8, S / 8);
  const b = canvas(S, S), bg = b.getContext('2d');
  bg.imageSmoothingQuality = 'high'; bg.drawImage(small, 0, 0, S, S); bg.globalAlpha = 0.5; bg.drawImage(small, 3, 3, S, S);
  const sharp = canvasTex(c, false), blur = canvasTex(b, false);
  const tints = {};
  for (const [k2, col] of Object.entries({ p: CSS.lpurple, w: CSS.white, r: CSS.red, d: '#6d4fd6' })) {
    const tc = canvas(S, S), tg = tc.getContext('2d');
    tg.drawImage(c, 0, 0); tg.globalCompositeOperation = 'source-in'; tg.fillStyle = col; tg.fillRect(0, 0, S, S);
    tints[k2] = tc;
  }
  const atlas = { canvas: c, sharp, blur, cell, tints };
  makePanel.atlas = atlas;
  return atlas;
}

// ── Soft fog puff (alpha only, tiling-friendly noise inside a radial falloff)
export function makeFogTexture(seed = 3, size = 256) {
  const c = canvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size);
  const n = makeNoise2D(seed);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size - 0.5, v = y / size - 0.5, r = Math.sqrt(u * u + v * v) * 2;
    const f = fbm(n, x / 48, y / 48, 5);
    const a = clamp(Math.pow(clamp(1 - r), 1.6) * (0.35 + f * 1.1)) * 255;
    const i = (y * size + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = a;
  }
  g.putImageData(img, 0, 0);
  const t = canvasTex(c, false); return t;
}
// tileable fbm noise (for fog density scrolling, wall roughness)
export function makeNoiseTexture(seed = 9, size = 256, scale = 32) {
  const c = canvas(size, size), g = c.getContext('2d'), img = g.createImageData(size, size);
  const n = makeNoise2D(seed);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // 4-way blend for seamless tiling
    const fx = x / size, fy = y / size;
    const a = fbm(n, x / scale, y / scale), b = fbm(n, (x + size) / scale, y / scale);
    const cc = fbm(n, x / scale, (y + size) / scale), d = fbm(n, (x + size) / scale, (y + size) / scale);
    const v = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
    const i = (y * size + x) * 4; const k = clamp(v) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = canvasTex(c, false); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ── shared overlays for screens
function scanlines(w, h) {
  const c = canvas(w, h), g = c.getContext('2d');
  for (let y = 0; y < h; y += 3) { g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y, w, 1); }
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);
  return c;
}
function glitchSlices(g, c, amt, rnd) {
  const n = Math.floor(2 + amt * 10);
  for (let i = 0; i < n; i++) {
    const y = rnd() * c.height, h = 4 + rnd() * 40 * amt, dx = (rnd() - 0.5) * 120 * amt;
    g.drawImage(c, 0, y, c.width, h, dx, y, c.width, h);
  }
}

// ────────────────────────────────────────────────────────────────────────
// Monitor UI for Scene 01 (and shot A of Scene 02). Fully time-driven.
// ────────────────────────────────────────────────────────────────────────
export function makeMonitorScreen(atlas) {
  const W = 1280, H = 758, c = canvas(W, H), g = c.getContext('2d');
  const tex = canvasTex(c); tex.anisotropy = 8;
  const sl = scanlines(W, H);
  const rnd = mulberry32(11);
  // symbol grid: each cell is activated by one of the shared symbol bursts (picture ⇄ sound sync)
  const COLS = 40, ROWS = 24, cw = W / COLS, ch = H / ROWS;
  const cells = [];
  for (let i = 0; i < COLS * ROWS; i++) cells.push({ i, act: Infinity, g: Math.floor(rnd() * 64), rate: 0.5 + rnd() * 6, col: rnd(), gl: rnd() });
  const order = cells.slice().sort(() => rnd() - 0.5);
  // ring-around-the-card first ("around the screen"), then everywhere
  order.sort((a, b) => {
    const da = Math.abs((a.i % COLS) - COLS / 2) / COLS + Math.abs(Math.floor(a.i / COLS) - ROWS / 2) / ROWS;
    const db = Math.abs((b.i % COLS) - COLS / 2) / COLS + Math.abs(Math.floor(b.i / COLS) - ROWS / 2) / ROWS;
    return (db + rnd() * 0.5) - (da + rnd() * 0.5);
  });
  let k = 0;
  for (const b of E.symbolBursts) for (let j = 0; j < b.n && k < order.length; j++) order[k++].act = b.t;
  const scr = '▓▒░<>/\\|#*+=0123456789ABCDEF';
  const glyphCanvas = atlas.canvas;

  const tints = atlas.tints;
  const glyph = (tint, gi, x, y, s, a) => { g.globalAlpha = a; g.drawImage(tints[tint], (gi % 8) * 128, Math.floor(gi / 8) * 128, 128, 128, x, y, s, s); };

  const clock = (t) => { const s = 86321 + Math.floor(t); const hh = String(Math.floor(s / 3600) % 24).padStart(2, '0'); const mm = String(Math.floor(s / 60) % 60).padStart(2, '0'); const ss = String(s % 60).padStart(2, '0'); return `${hh}:${mm}:${ss}`; };

  function draw(t, peel = 0) {
    const fr = Math.floor(t * 30);
    const r2 = mulberry32(fr * 7 + 1);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // panel base
    const bgG = g.createRadialGradient(W * 0.5, H * 0.45, 40, W * 0.5, H * 0.5, W * 0.75);
    const warnK = t > T.warn ? Math.exp(-(t - T.warn) * 2.5) : 0;
    bgG.addColorStop(0, `rgb(${18 + warnK * 60},${10 + warnK * 4},${34 + warnK * 6})`); bgG.addColorStop(1, '#040208');
    g.fillStyle = bgG; g.fillRect(0, 0, W, H);

    // faint background lattice
    g.globalAlpha = 0.06; g.strokeStyle = CSS.lpurple; g.lineWidth = 1;
    for (let x = 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y < H; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.globalAlpha = 1;

    // ── idle terminal
    g.font = `400 21px ${MONO}`; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillStyle = 'rgba(163,128,255,0.62)';
    g.fillText(`NODE//07   ·   CH 0x4F29B7   ·   ${t < T.ping ? 'LISTENING' : t < T.warn ? 'RECEIVING' : 'SIGNAL ANOMALY'}`, 46, 34);
    g.textAlign = 'right'; g.fillText(clock(t), W - 46, 34); g.textAlign = 'left';
    g.fillStyle = 'rgba(163,128,255,0.18)'; g.fillRect(46, 68, W - 92, 1);
    const logs = ['> handshake ........ ok', '> carrier 2.4117 GHz  locked', '> buffer  0 / 4096', '> awaiting packet_'];
    g.fillStyle = 'rgba(237,237,237,0.32)';
    for (let i = 0; i < logs.length; i++) g.fillText(logs[i], 46, 92 + i * 30);
    // waveform (signal) bottom
    g.strokeStyle = t > T.warn ? 'rgba(198,40,54,0.75)' : 'rgba(163,128,255,0.55)'; g.lineWidth = 2; g.beginPath();
    const amp = t < T.ping ? 6 : t < T.warn ? 16 : 30;
    for (let x = 0; x <= 360; x += 3) {
      const y = H - 70 + Math.sin(x * 0.07 + t * 6) * amp * 0.5 * Math.sin(x * 0.013 + t) + (t > T.warn ? (r2() - 0.5) * amp * 0.6 : 0);
      x ? g.lineTo(46 + x, y) : g.moveTo(46 + x, y);
    }
    g.stroke();
    g.fillStyle = 'rgba(237,237,237,0.28)'; g.font = `400 17px ${MONO}`;
    g.fillText('RX', 46, H - 118);
    g.textAlign = 'right'; g.fillText(t > T.warn ? 'SRC  ███.███.██.███' : 'SRC  —', W - 46, H - 118);
    g.fillText(t > T.warn ? 'KEY  NOT FOUND' : 'KEY  —', W - 46, H - 92); g.textAlign = 'left';
    if (t < T.ping && Math.floor(t * 2.2) % 2 === 0) { g.fillStyle = 'rgba(237,237,237,0.7)'; g.fillRect(46 + 19 * 12.6, 92 + 3 * 30 + 2, 12, 22); }

    // ── encrypted symbols flooding the screen
    if (t > T.symbols - 0.05) {
      for (let i = 0; i < cells.length; i++) {
        const cl = cells[i]; if (t < cl.act) continue;
        const age = t - cl.act;
        // characters briefly glitch, disappear, reappear
        const flick = Math.sin(t * cl.rate * 3 + cl.i) > 0.92 ? 0 : 1;
        if (!flick && cl.gl > 0.6) continue;
        const gi = (cl.g + Math.floor(t * cl.rate)) % 64;
        const x = (cl.i % COLS) * cw, y = Math.floor(cl.i / COLS) * ch;
        const a = Math.min(1, age * 6) * (age < 0.08 ? 1.6 : 1) * (1 - peel * clamp(cl.col * 2 - 0.2));
        if (a <= 0.01) continue;
        const tint = cl.col < 0.06 ? 'r' : cl.col < 0.3 ? 'w' : cl.col < 0.7 ? 'p' : 'd';
        glyph(tint, gi, x + 3, y + 1, ch - 2, a * (tint === 'w' ? 0.75 : 0.85));
      }
      g.globalAlpha = 1;
    }

    // ── notification card
    if (t > T.ping) {
      const k = easeOut3(clamp((t - T.ping) / 0.35));
      const cwid = 820, chei = 260, cx = W / 2 - cwid / 2, cy = H / 2 - chei / 2 + (1 - k) * 24;
      const flood = clamp((t - 13.0) / 3.2) * 0.55 + peel;
      const warn = t > T.warn;
      const blink = warn ? (Math.floor((t - T.warn) * 3.2) % 2 === 0) : false;
      g.globalAlpha = k * (1 - flood) ;
      g.fillStyle = warn ? 'rgba(26,6,14,0.93)' : 'rgba(16,10,34,0.93)';
      g.fillRect(cx, cy, cwid, chei);
      g.shadowColor = warn ? CSS.red : CSS.lpurple; g.shadowBlur = 24;
      g.strokeStyle = warn ? CSS.red : CSS.lpurple; g.lineWidth = 2; g.strokeRect(cx, cy, cwid, chei);
      g.shadowBlur = 0;
      // corner ticks
      g.fillStyle = warn ? CSS.red : CSS.lpurple;
      for (const [px, py] of [[cx, cy], [cx + cwid - 22, cy], [cx, cy + chei - 4], [cx + cwid - 22, cy + chei - 4]]) g.fillRect(px, py, 22, 4);
      g.font = `500 18px ${MONO}`; g.textBaseline = 'top';
      g.fillStyle = warn ? (blink ? CSS.red : 'rgba(198,40,54,0.55)') : 'rgba(163,128,255,0.85)';
      g.fillText(warn ? 'ALERT  ·  PRIORITY 0' : 'NEW MESSAGE  ·  1', cx + 36, cy + 30);
      g.textAlign = 'right'; g.fillText(clock(t), cx + cwid - 36, cy + 30); g.textAlign = 'left';
      if (!warn) {
        // envelope icon + typed line
        g.strokeStyle = CSS.white; g.lineWidth = 3; g.strokeRect(cx + 40, cy + 112, 70, 48);
        g.beginPath(); g.moveTo(cx + 40, cy + 112); g.lineTo(cx + 75, cy + 140); g.lineTo(cx + 110, cy + 112); g.stroke();
        const n = clamp(Math.floor((t - T.typeStart) / T.typeStep) + 1, 0, MSG1.length);
        g.font = `500 54px ${MONO}`; g.fillStyle = CSS.white; g.textBaseline = 'middle';
        const txt = MSG1.slice(0, n);
        g.fillText(txt, cx + 140, cy + 136);
        if (Math.floor(t * 3) % 2 === 0 || n < MSG1.length) { const w = g.measureText(txt).width; g.fillRect(cx + 146 + w, cy + 112, 26, 50); }
      } else {
        // warning triangle
        g.save(); g.translate(cx + 76, cy + 140);
        g.strokeStyle = blink ? CSS.red : 'rgba(198,40,54,0.5)'; g.lineWidth = 4;
        g.beginPath(); g.moveTo(0, -32); g.lineTo(34, 28); g.lineTo(-34, 28); g.closePath(); g.stroke();
        g.fillStyle = g.strokeStyle; g.fillRect(-2.5, -12, 5, 22); g.fillRect(-2.5, 15, 5, 5); g.restore();
        // decoding reveal of MSG2
        const prog = clamp((t - T.warn) / 0.75);
        let s = '';
        for (let i = 0; i < MSG2.length; i++) {
          const ch2 = MSG2[i];
          if (ch2 === ' ') { s += ' '; continue; }
          s += i / MSG2.length < prog ? ch2 : scr[Math.floor(r2() * scr.length)];
        }
        g.font = `500 41px ${MONO}`; g.fillStyle = CSS.white; g.textBaseline = 'middle';
        g.fillText(s, cx + 140, cy + 128);
        g.font = `400 18px ${MONO}`; g.fillStyle = 'rgba(237,237,237,0.45)';
        g.fillText('CIPHER: UNKNOWN    ORIGIN: UNRESOLVED    INTEGRITY: ??', cx + 140, cy + 184);
      }
      g.globalAlpha = 1; g.textBaseline = 'top';
    }

    // scanlines, rolling band, glitch
    g.globalAlpha = 1; g.drawImage(sl, 0, 0);
    const band = ((t * 0.12) % 1.4 - 0.2) * H;
    const bgr = g.createLinearGradient(0, band - 60, 0, band + 60);
    bgr.addColorStop(0, 'rgba(163,128,255,0)'); bgr.addColorStop(0.5, 'rgba(163,128,255,0.05)'); bgr.addColorStop(1, 'rgba(163,128,255,0)');
    g.fillStyle = bgr; g.fillRect(0, band - 60, W, 120);
    const gl = (t > T.warn && t < T.warn + 0.3 ? 0.7 : 0) + (t > 15.6 ? clamp((t - 15.6) / 1.4) * 0.5 : 0) + (r2() < 0.015 && t > T.symbols ? 0.4 : 0);
    if (gl > 0.02) glitchSlices(g, c, gl, r2);
    tex.needsUpdate = true;
  }
  return { canvas: c, texture: tex, draw, W, H };
}

// ────────────────────────────────────────────────────────────────────────
// Cryptographic panels (dark glass screens with glowing content)
// ────────────────────────────────────────────────────────────────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
makePanel._h = {};
export function makePanel(kind, seed = 1, W = 512, H = 320) {
  const c = canvas(W, H), g = c.getContext('2d'), tex = canvasTex(c);
  const rnd = mulberry32(seed * 131 + 7);
  const lines = []; for (let i = 0; i < 64; i++) lines.push(rnd());
  const hdr = { binary: 'BITSTREAM', hex: 'MEMORY  0x4F29B7', key: 'KEY MATERIAL', math: 'c ≡ mᵉ (mod n)', wave: 'CARRIER', hash: 'SHA-256', scramble: 'AES-256-GCM', wheel: 'SUBSTITUTION' }[kind] || '';
  const accent = rnd() < 0.18 ? CSS.red : CSS.lpurple;
  function frame(t, headerOnly = false) {
    g.globalAlpha = 1;
    if (!headerOnly) {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0b0718'); bg.addColorStop(1, '#05030b');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
    }
    g.strokeStyle = 'rgba(163,128,255,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, W - 2, H - 2);
    g.font = `500 15px ${MONO}`; g.fillStyle = accent === CSS.red ? 'rgba(198,40,54,0.9)' : 'rgba(163,128,255,0.8)';
    g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(hdr, 16, 12);
    g.textAlign = 'right'; g.fillText(((seed * 977 + Math.floor(t * 7)) % 65536).toString(16).toUpperCase().padStart(4, '0'), W - 16, 12); g.textAlign = 'left';
    g.fillStyle = 'rgba(163,128,255,0.2)'; g.fillRect(16, 36, W - 32, 1);
  }
  function draw(t) {
    frame(t);
    const r2 = mulberry32(Math.floor(t * 12) + seed);
    if (kind === 'binary') {
      g.font = `500 20px ${MONO}`;
      for (let row = 0; row < 11; row++) {
        const y = 48 + row * 24, off = Math.floor(t * (3 + lines[row] * 6));
        let s = ''; for (let i = 0; i < 32; i++) s += ((i * 7 + row * 13 + off) * 2654435761 >>> 7) & 1 ? '1' : '0';
        const hot = Math.floor(lines[row + 9] * 4 + t * 2) % 4;
        for (let q = 0; q < 4; q++) {
          g.fillStyle = q === hot ? CSS.white : 'rgba(163,128,255,0.62)';
          g.fillText(s.slice(q * 8, q * 8 + 8), 16 + q * 122, y);
        }
      }
    } else if (kind === 'hex') {
      g.font = `400 18px ${MONO}`;
      const scroll = (t * 26) % 22;
      for (let row = -1; row < 13; row++) {
        const y = 46 + row * 22 - scroll, adr = (Math.floor(t * 26 / 22) + row) * 16;
        g.fillStyle = 'rgba(163,128,255,0.5)'; g.fillText('0x' + (adr & 0xffff).toString(16).toUpperCase().padStart(4, '0'), 16, y);
        for (let i = 0; i < 12; i++) {
          const v = ((adr + i) * 2246822519 >>> 11) & 255;
          const hot = ((adr + i) % 37) === Math.floor(t * 3) % 37;
          g.fillStyle = hot ? CSS.red : (v > 200 ? CSS.white : 'rgba(237,237,237,0.55)');
          g.fillText(v.toString(16).toUpperCase().padStart(2, '0'), 104 + i * 32, y);
        }
      }
      g.fillStyle = '#0a0617'; g.fillRect(0, 0, W, 40); frame(t, true);
    } else if (kind === 'key') {
      g.font = `400 17px ${MONO}`; g.fillStyle = 'rgba(237,237,237,0.85)';
      g.fillText('-----BEGIN ENCRYPTED KEY-----', 16, 48);
      const shown = Math.floor(t * 40);
      for (let row = 0; row < 8; row++) {
        let s = ''; for (let i = 0; i < 40; i++) s += B64[((row * 41 + i) * 2654435761 >>> 9) % 64];
        const reveal = Math.max(0, Math.min(40, shown - row * 14));
        g.fillStyle = 'rgba(163,128,255,0.78)'; g.fillText(s.slice(0, reveal), 16, 74 + row * 22);
      }
      // randomart fingerprint
      const gx = W - 132, gy = 70, cs = 7;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const v = ((x * 31 + y * 17 + seed) * 2654435761 >>> 13) & 7;
        if (v > 4) { g.fillStyle = v === 7 && (x + y + Math.floor(t * 4)) % 9 === 0 ? CSS.red : 'rgba(163,128,255,0.75)'; g.fillRect(gx + x * cs, gy + y * cs, cs - 1, cs - 1); }
      }
      g.fillStyle = 'rgba(237,237,237,0.5)'; g.fillText('-----END ENCRYPTED KEY-----', 16, H - 34);
    } else if (kind === 'math') {
      g.fillStyle = CSS.white; g.font = `400 26px ${MONO}`;
      const eq = ['c ≡ mᵉ  mod n', 'm ≡ cᵈ  mod n', 'n = p · q', 'φ(n) = (p−1)(q−1)', 'e · d ≡ 1  mod φ(n)'];
      const k = Math.floor(t * 0.9) % eq.length;
      for (let i = 0; i < 5; i++) { g.globalAlpha = i === k ? 1 : 0.35; g.fillText(eq[i], 18, 52 + i * 44); }
      g.globalAlpha = 1;
      // long prime digits crawling
      g.font = `400 13px ${MONO}`; g.fillStyle = 'rgba(163,128,255,0.6)';
      let digits = ''; for (let i = 0; i < 200; i++) digits += ((i * 7919 + Math.floor(t * 9)) * 2654435761 >>> 17) % 10;
      for (let r = 0; r < 14; r++) g.fillText(digits.slice(r * 12, r * 12 + 12), W - 128, 48 + r * 18);
    } else if (kind === 'wave') {
      for (let k2 = 0; k2 < 3; k2++) {
        g.strokeStyle = k2 === 0 ? CSS.white : k2 === 1 ? 'rgba(163,128,255,0.8)' : 'rgba(87,227,216,0.5)'; g.lineWidth = k2 ? 1.5 : 2.2; g.beginPath();
        for (let x = 0; x <= W - 32; x += 4) {
          const y = H * 0.55 + Math.sin(x * (0.02 + k2 * 0.013) + t * (3 + k2)) * 40 * Math.sin(x * 0.004 + t * 0.7 + k2) + (r2() - 0.5) * 6;
          x ? g.lineTo(16 + x, y) : g.moveTo(16, y);
        }
        g.stroke();
      }
      for (let i = 0; i < 40; i++) { const h = (Math.sin(i * 0.7 + t * 5) * 0.5 + 0.5) * 50 * lines[i]; g.fillStyle = 'rgba(163,128,255,0.55)'; g.fillRect(16 + i * 12, H - 18 - h, 8, h); }
      // network packet headers
      g.font = `400 13px ${MONO}`;
      for (let i = 0; i < 3; i++) {
        const n = Math.floor(t * 6) + i + seed * 13, seq = ((n * 1460) >>> 0).toString(16).toUpperCase().padStart(8, '0');
        g.fillStyle = i === 0 ? 'rgba(237,237,237,0.8)' : 'rgba(163,128,255,0.5)';
        g.fillText(`PKT ${String(n % 10000).padStart(4, '0')}  TLS1.3  10.0.4.${7 + (n % 9)}:443 → ███.██.██.${n % 250}  LEN 1460  SEQ 0x${seq}`, 16, 46 + i * 17);
      }
    } else if (kind === 'hash') {
      g.font = `400 16px ${MONO}`;
      const msgs = ['INCOMING MESSAGE', 'KEY EXCHANGE', 'SESSION 0x4F29B7', 'HANDSHAKE', 'PAYLOAD', 'NONCE'];
      const k = Math.floor(t * 1.2);
      for (let i = 0; i < 5; i++) {
        const m = msgs[(i + k) % msgs.length] + ' #' + ((seed * 31 + i + k) % 997);
        const h = (makePanel._h[m] ||= sha256(m));
        const y = 46 + i * 54;
        g.fillStyle = 'rgba(163,128,255,0.7)'; g.fillText(m, 16, y);
        g.fillStyle = i === 0 ? CSS.white : 'rgba(237,237,237,0.6)'; g.fillText(h.slice(0, 32), 16, y + 18);
        g.fillStyle = 'rgba(237,237,237,0.32)'; g.fillText(h.slice(32), 16, y + 34);
      }
    } else if (kind === 'scramble') {
      const plain = 'THE MESSAGE IS HIDDEN';
      const k = clamp((t % 6) / 4);
      g.font = `500 30px ${MONO}`;
      let s = '';
      for (let i = 0; i < plain.length; i++) {
        const ch = plain[i];
        if (ch === ' ') { s += ' '; continue; }
        s += i / plain.length < k ? String.fromCharCode(65 + ((ch.charCodeAt(0) - 65 + 7 + i) % 26)) : ch;
      }
      g.fillStyle = 'rgba(237,237,237,0.4)'; g.fillText(plain, 18, 70);
      g.fillStyle = CSS.white; g.fillText(s, 18, 120);
      g.font = `400 15px ${MONO}`; g.fillStyle = 'rgba(163,128,255,0.7)';
      g.fillText('SHIFT +7  ·  ROUND ' + (1 + Math.floor(t * 3) % 16), 18, 172);
      // AES state matrix (4×4 bytes) evolving round by round
      const rd = Math.floor(t * 3) % 14;
      g.font = `500 18px ${MONO}`;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const v = ((x * 4 + y + 1) * 2654435761 + rd * 40503) >>> 24;
        g.fillStyle = (x + y + rd) % 7 === 0 ? CSS.red : 'rgba(237,237,237,0.8)';
        g.fillText(v.toString(16).toUpperCase().padStart(2, '0'), W - 160 + x * 36, 196 + y * 24);
      }
      g.fillStyle = 'rgba(163,128,255,0.6)'; g.font = `400 13px ${MONO}`; g.fillText('STATE · R' + String(rd + 1).padStart(2, '0'), W - 160, 176);
    }
    // scanlines + glass sheen
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    const sh = g.createLinearGradient(0, 0, W, H); sh.addColorStop(0, 'rgba(163,128,255,0.06)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(79,41,183,0.05)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H);
    tex.needsUpdate = true;
  }
  return { canvas: c, texture: tex, draw, kind };
}

// Circular cipher ring (Alberti-style) texture – letters around a ring
export function makeRingTexture({ size = 1024, inner = 0.62, outer = 0.98, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', font = MONO, color = CSS.lpurple, ticks = 96, seed = 1, scale = 1 } = {}) {
  const c = canvas(size, size), g = c.getContext('2d'), R = size / 2;
  g.translate(R, R);
  g.strokeStyle = color; g.fillStyle = color;
  g.lineWidth = 3; g.globalAlpha = 0.9;
  g.beginPath(); g.arc(0, 0, R * outer - 2, 0, 7); g.stroke();
  g.beginPath(); g.arc(0, 0, R * inner + 2, 0, 7); g.stroke();
  for (let i = 0; i < ticks; i++) {
    const a = i / ticks * Math.PI * 2, l = i % 4 === 0 ? 0.05 : 0.025;
    g.save(); g.rotate(a); g.globalAlpha = 0.6; g.fillRect(-1, -R * outer + 4, 2, R * l); g.restore();
  }
  g.globalAlpha = 1; g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = chars.length, fs = Math.min(R * (outer - inner) * 0.42, (2 * Math.PI * R * (inner + outer) / 2) / n * 0.7) * scale;
  g.font = `500 ${fs}px ${font}`;
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    g.save(); g.rotate(i / n * Math.PI * 2); g.translate(0, -R * (inner + outer) / 2);
    g.fillStyle = rnd() < 0.08 ? CSS.red : (rnd() < 0.3 ? CSS.white : color);
    g.fillText(chars[i], 0, 0); g.restore();
  }
  const t = canvasTex(c); return t;
}

// Key silhouette sampled into points (for the "encryption key" that forms then dissolves)
export function sampleKeyShape(count, rnd) {
  const W = 512, H = 200, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff';
  // bow: ring with a lattice cut-out
  g.beginPath(); g.arc(100, 100, 82, 0, 7); g.arc(100, 100, 46, 0, 7, true); g.fill('evenodd');
  g.fillRect(96, 30, 8, 140); g.fillRect(30, 96, 140, 8);
  // shaft
  g.fillRect(176, 88, 300, 24);
  // bits (a code-like comb)
  const bits = [1, 3, 2, 1, 3, 1, 2, 3, 1, 2];
  for (let i = 0; i < bits.length; i++) g.fillRect(250 + i * 23, 112, 14, 16 * bits[i]);
  g.fillRect(470, 80, 14, 40);
  const d = g.getImageData(0, 0, W, H).data, pts = [];
  let guard = 0;
  while (pts.length < count && guard++ < count * 60) {
    const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H);
    if (d[(y * W + x) * 4 + 3] > 128) pts.push([(x - W / 2) / W, -(y - H / 2) / W]);
  }
  return pts; // normalized: width 1.0
}
