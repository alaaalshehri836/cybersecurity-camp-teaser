// ── Procedural cinematic score + sound design (Web Audio API) ─────────────
// Everything is scheduled against the AudioContext clock, which is also the master clock of the picture.
// Bus A carries 0–47 s and is cut dead at the Scene-4 stop; bus B carries Scene 4 and is cut at the final frame.
import { T, E, MSG1 } from './config.js';
import { mulberry32 } from './util.js';

export class AudioEngine {
  constructor() { this.ctx = null; this.muted = false; }

  // Must run synchronously inside the user's tap (iOS Safari / Android Chrome autoplay rules)
  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}   // iOS: play even with the silent switch on
    if (!this.ctx) this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx; ctx.resume && ctx.resume();
    const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
    if (!this._vis) { this._vis = true; document.addEventListener('visibilitychange', () => { if (!document.hidden && this.ctx && this.ctx.state !== 'running' && this.out) this.ctx.resume(); }); }
  }
  async init(ctxIn) {
    if (this.white) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = this.ctx || ctxIn || new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx, sr = ctx.sampleRate;
    const mk = (secs, fn, ch = 2) => { const b = ctx.createBuffer(ch, Math.floor(sr * secs), sr); for (let c = 0; c < ch; c++) fn(b.getChannelData(c), c); return b; };
    const r = mulberry32(99);
    this.white = mk(4, (d) => { for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1; });
    this.brown = mk(6, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (r() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    this.ir = mk(4.2, (d, c) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.pow(1 - t / 4.2, 2.2) * Math.exp(-t * 0.9) * (t < 0.012 ? t / 0.012 : 1); } });
    this.irShort = mk(1.4, (d) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t * 4.5); } });
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); }
    this.curve = curve;
  }

  setMuted(m) {
    this.muted = m;
    if (this.out) { const t = this.ctx.currentTime; this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(m ? 0 : 1, t, 0.05); }
  }

  _bus(at0) {
    const ctx = this.ctx;
    const inp = ctx.createGain(); const rev = ctx.createConvolver(); rev.buffer = this.ir;
    const revG = ctx.createGain(); revG.gain.value = 0.55;
    const dly = ctx.createDelay(2); dly.delayTime.value = 0.375; const fb = ctx.createGain(); fb.gain.value = 0.38; const dlp = ctx.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2600;
    dly.connect(dlp); dlp.connect(fb); fb.connect(dly);
    const dlyIn = ctx.createGain(); dlyIn.connect(dly); dlp.connect(rev); dlp.connect(inp);
    rev.connect(revG); revG.connect(inp);
    inp.connect(this.master);
    return { in: inp, rev, dly: dlyIn };
  }

  start(offline = false) {
    const ctx = this.ctx; if (!offline) ctx.resume();
    if (this.out) { try { this.out.disconnect(); } catch {} }
    clearInterval(this.timer);
    const t0 = ctx.currentTime + 0.18; this.t0 = t0;
    this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : 1; this.out.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.2;
    comp.connect(this.out);
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(comp);
    // bus A (scenes 1-3) + bus B (scene 4) with hard gates
    this.gA = ctx.createGain(); this.gB = ctx.createGain();
    const mA = this.master; this.master = this.gA; this.A = this._bus(); this.master = this.gB; this.B = this._bus(); this.master = mA;
    this.gA.connect(mA); this.gB.connect(mA);
    this.gA.gain.setValueAtTime(1, t0); this.gA.gain.setValueAtTime(0, t0 + T.S4);           // Scene 3 → sudden silence
    this.gB.gain.setValueAtTime(1, t0); this.gB.gain.setValueAtTime(0, t0 + T.END);          // final frame → total silence
    mA.gain.setValueAtTime(0.9, t0); mA.gain.setValueAtTime(0, t0 + T.END);
    this.queue = this._score().sort((a, b) => a.t - b.t); this.qi = 0;
    const pump = () => {
      const now = ctx.currentTime - t0;
      while (this.qi < this.queue.length && this.queue[this.qi].t < now + 0.35) { const ev = this.queue[this.qi++]; if (ev.t >= now - 0.05) ev.fn(t0 + Math.max(ev.t, now)); }
      if (this.qi >= this.queue.length) clearInterval(this.timer);
    };
    if (offline) { for (const ev of this.queue) ev.fn(t0 + ev.t); return t0; }
    pump(); this.timer = setInterval(pump, 30);
    return t0;
  }
  stop() { clearInterval(this.timer); if (this.out) { try { this.out.disconnect(); } catch {} this.out = null; } }

  // picture clock, interpolated from the audio output timestamp (smooth & latency-aware)
  now() {
    const ctx = this.ctx; if (!ctx || this.t0 == null) return 0;
    let t = ctx.currentTime;
    if (ctx.getOutputTimestamp) { const ts = ctx.getOutputTimestamp(); if (ts.contextTime > 0 && ts.performanceTime > 0) t = ts.contextTime + (performance.now() - ts.performanceTime) / 1000; }
    const v = t - this.t0;
    if (this._last != null && v < this._last) return this._last;
    this._last = v; return v;
  }
  resetClock() { this._last = null; }

  // ── primitives ───────────────────────────────────────────────────────
  g(v = 0) { const n = this.ctx.createGain(); n.gain.value = v; return n; }
  osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; }
  filt(type, f, Q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; }
  noise(buf = this.white) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s; }
  route(node, bus, dry = 1, wet = 0, pan = 0, dly = 0) {
    let n = node;
    if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
    if (dry) { const g = this.g(dry); n.connect(g); g.connect(bus.in); }
    if (wet) { const g = this.g(wet); n.connect(g); g.connect(bus.rev); }
    if (dly) { const g = this.g(dly); n.connect(g); g.connect(bus.dly); }
  }
  env(param, at, a, peak, d, sustain = 0, hold = 0) {
    param.setValueAtTime(0.0001, at); param.linearRampToValueAtTime(peak, at + a);
    param.setTargetAtTime(sustain, at + a + hold, d / 4);
  }

  // ── sound design library ───────────────────────────────────────────
  pad(bus, at, dur, freqs, gain, lp0, lp1, wet = 0.5, type = 'sawtooth') {
    const ctx = this.ctx, out = this.g(0), f = this.filt('lowpass', lp0, 0.9);
    f.frequency.setValueAtTime(lp0, at); f.frequency.linearRampToValueAtTime(lp1, at + dur);
    const lfo = this.osc('sine', 0.08), lg = this.g(lp0 * 0.25); lfo.connect(lg); lg.connect(f.frequency); lfo.start(at); lfo.stop(at + dur + 0.1);
    freqs.forEach((fr, i) => { for (const det of [-6, 5]) { const o = this.osc(type, fr); o.detune.value = det + i * 2; const og = this.g(1 / (freqs.length * 2)); o.connect(og); og.connect(f); o.start(at); o.stop(at + dur + 0.05); } });
    f.connect(out); out.gain.setValueAtTime(0.0001, at); out.gain.linearRampToValueAtTime(gain, at + Math.min(4, dur * 0.4)); out.gain.setValueAtTime(gain, at + dur - 0.15); out.gain.linearRampToValueAtTime(0.0001, at + dur);
    this.route(out, bus, 1, wet);
    return { out, f };
  }
  bed(bus, at, dur, buf, lp, gain, fadeIn = 3, wet = 0.2) {
    const s = this.noise(buf), f = this.filt('lowpass', lp), g = this.g(0);
    s.connect(f); f.connect(g); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(gain, at + fadeIn); g.gain.setValueAtTime(gain, at + dur - 0.1); g.gain.linearRampToValueAtTime(0.0001, at + dur);
    s.start(at, Math.random() * 3); s.stop(at + dur + 0.05);
    this.route(g, bus, 1, wet); return g;
  }
  blip(bus, at, f, dur = 0.05, gain = 0.03, wet = 0.3, pan = 0, dly = 0, type = 'sine') {
    const o = this.osc(type, f), g = this.g(0);
    o.connect(g); this.env(g.gain, at, 0.002, gain, dur); o.start(at); o.stop(at + dur * 3 + 0.05);
    this.route(g, bus, 1, wet, pan, dly);
  }
  ping(bus, at) {
    // two-tone notification bell (FM), with a soft low "pop"
    [[1318.5, 0], [1975.5, 0.11]].forEach(([f, dt]) => {
      const c = this.osc('sine', f), m = this.osc('sine', f * 3.5), mg = this.g(f * 1.2), g = this.g(0);
      m.connect(mg); mg.connect(c.frequency); mg.gain.setValueAtTime(f * 1.2, at + dt); mg.gain.exponentialRampToValueAtTime(1, at + dt + 0.6);
      c.connect(g); this.env(g.gain, at + dt, 0.003, 0.085, 1.6);
      c.start(at + dt); m.start(at + dt); c.stop(at + dt + 2.2); m.stop(at + dt + 2.2);
      this.route(g, bus, 1, 0.55, dt ? 0.15 : -0.1, 0.25);
    });
    const p = this.osc('sine', 180), pg = this.g(0); p.frequency.exponentialRampToValueAtTime(70, at + 0.12); p.connect(pg); this.env(pg.gain, at, 0.002, 0.18, 0.18); p.start(at); p.stop(at + 0.4); this.route(pg, bus, 1, 0.2);
  }
  key(bus, at, soft = 1) {
    const r = Math.random;
    const s = this.noise(), bp = this.filt('bandpass', 2600 + r() * 2400, 1.4), g = this.g(0);
    s.connect(bp); bp.connect(g); this.env(g.gain, at, 0.0008, 0.09 * soft, 0.03); s.start(at, r() * 3); s.stop(at + 0.08);
    const o = this.osc('triangle', 150 + r() * 60), og = this.g(0); o.connect(og); this.env(og.gain, at, 0.001, 0.05 * soft, 0.02); o.start(at); o.stop(at + 0.06);
    this.route(g, bus, 1, 0.12, (r() - 0.5) * 0.3); this.route(og, bus, 1, 0.05);
  }
  click(bus, at, f, pan, gain = 0.035) {
    const s = this.noise(), hp = this.filt('bandpass', f, 6), g = this.g(0);
    s.connect(hp); hp.connect(g); this.env(g.gain, at, 0.0005, gain, 0.012); s.start(at, Math.random() * 3); s.stop(at + 0.04);
    this.route(g, bus, 1, 0.15, pan);
  }
  staticBurst(bus, at, dur, gain = 0.2) {
    const s = this.noise(), bp = this.filt('bandpass', 1800, 0.6), g = this.g(0), r = mulberry32(Math.floor(at * 1000));
    s.connect(bp); bp.connect(g);
    g.gain.setValueAtTime(0, at);
    for (let x = 0; x < dur; x += 0.018) { g.gain.setValueAtTime(r() < 0.65 ? gain * (0.4 + r() * 0.6) : 0, at + x); bp.frequency.setValueAtTime(600 + r() * 5000, at + x); }
    g.gain.setValueAtTime(0, at + dur);
    s.start(at); s.stop(at + dur + 0.05); this.route(g, bus, 1, 0.25);
  }
  impact(bus, at, size = 1) {
    const o = this.osc('sine', 120), g = this.g(0);
    o.frequency.setValueAtTime(110, at); o.frequency.exponentialRampToValueAtTime(30, at + 1.4 * size);
    o.connect(g); this.env(g.gain, at, 0.004, 0.75 * size, 1.6 * size); o.start(at); o.stop(at + 3.5 * size);
    const s = this.noise(this.brown), lp = this.filt('lowpass', 900), sg = this.g(0);
    lp.frequency.setValueAtTime(1800, at); lp.frequency.exponentialRampToValueAtTime(120, at + 0.8);
    s.connect(lp); lp.connect(sg); this.env(sg.gain, at, 0.002, 0.5 * size, 0.9 * size); s.start(at); s.stop(at + 2.5 * size);
    const ws = this.ctx.createWaveShaper(); ws.curve = this.curve; g.connect(ws);
    this.route(ws, bus, 0.8, 0.7); this.route(sg, bus, 0.7, 0.9);
  }
  braam(bus, at, root, dur = 3.6, gain = 0.32) {
    const f = this.filt('lowpass', 200, 2.5), g = this.g(0), ws = this.ctx.createWaveShaper(); ws.curve = this.curve;
    f.frequency.setValueAtTime(180, at); f.frequency.linearRampToValueAtTime(1500, at + 0.35); f.frequency.exponentialRampToValueAtTime(260, at + dur);
    [root, root * 1.5, root * 2, root * 2.007, root * 0.5].forEach((fr, i) => { const o = this.osc(i === 4 ? 'sine' : 'sawtooth', fr); o.detune.value = (i - 2) * 4; const og = this.g(i === 4 ? 0.9 : 0.3); o.connect(og); og.connect(f); o.start(at); o.stop(at + dur + 0.1); });
    f.connect(ws); ws.connect(g); this.env(g.gain, at, 0.03, gain, dur * 0.9, 0, 0.4);
    this.route(g, bus, 1, 0.6);
  }
  riser(bus, at, dur, gain = 0.18, f0 = 300, f1 = 7000) {
    const s = this.noise(), bp = this.filt('bandpass', f0, 1.8), g = this.g(0);
    bp.frequency.setValueAtTime(f0, at); bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
    s.connect(bp); bp.connect(g); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + dur); g.gain.setValueAtTime(0, at + dur + 0.01);
    s.start(at); s.stop(at + dur + 0.05);
    const o = this.osc('sawtooth', 110), lp = this.filt('lowpass', 600), og = this.g(0);
    o.frequency.setValueAtTime(110, at); o.frequency.exponentialRampToValueAtTime(440, at + dur);
    o.connect(lp); lp.connect(og); og.gain.setValueAtTime(0.0001, at); og.gain.exponentialRampToValueAtTime(gain * 0.35, at + dur); og.gain.setValueAtTime(0, at + dur + 0.01);
    o.start(at); o.stop(at + dur + 0.05);
    this.route(g, bus, 1, 0.4); this.route(og, bus, 1, 0.3);
  }
  whoosh(bus, at, dur = 0.9, gain = 0.22) {
    const s = this.noise(), bp = this.filt('bandpass', 4000, 1.2), g = this.g(0);
    bp.frequency.setValueAtTime(5500, at); bp.frequency.exponentialRampToValueAtTime(250, at + dur);
    s.connect(bp); bp.connect(g); this.env(g.gain, at, dur * 0.25, gain, dur * 0.7);
    s.start(at, 1); s.stop(at + dur * 2);
    let n = g; if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.setValueAtTime(-0.8, at); p.pan.linearRampToValueAtTime(0.8, at + dur); g.connect(p); n = p; }
    this.route(n, bus, 1, 0.5);
  }
  stutter(bus, at, dur) {
    const r = mulberry32(Math.floor(at * 977));
    for (let x = 0, k = 0; x < dur; k++) {
      const step = Math.max(0.022, 0.07 * (1 - x / dur));
      if (r() < 0.8) {
        const o = this.osc('square', 200 + r() * 1800), g = this.g(0), bp = this.filt('bandpass', 1200 + r() * 3000, 2);
        o.connect(bp); bp.connect(g); g.gain.setValueAtTime(0.05, at + x); g.gain.setValueAtTime(0, at + x + step * 0.6);
        o.start(at + x); o.stop(at + x + step); this.route(g, bus, 1, 0.1, (r() - 0.5) * 0.8);
      }
      x += step;
    }
  }
  kick(bus, at, gain = 0.5) {
    const o = this.osc('sine', 90), g = this.g(0);
    o.frequency.setValueAtTime(95, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.16);
    o.connect(g); this.env(g.gain, at, 0.002, gain, 0.4); o.start(at); o.stop(at + 0.7);
    this.route(g, bus, 1, 0.08);
  }
  hat(bus, at, gain = 0.03) {
    const s = this.noise(), hp = this.filt('highpass', 7500), g = this.g(0);
    s.connect(hp); hp.connect(g); this.env(g.gain, at, 0.0007, gain, 0.035); s.start(at, Math.random() * 3); s.stop(at + 0.08);
    this.route(g, bus, 1, 0.05, (Math.random() - 0.5) * 0.4);
  }
  pluck(bus, at, f, gain = 0.03) {
    const o = this.osc('square', f), lp = this.filt('lowpass', 2400, 3), g = this.g(0);
    lp.frequency.setValueAtTime(3200, at); lp.frequency.exponentialRampToValueAtTime(400, at + 0.15);
    o.connect(lp); lp.connect(g); this.env(g.gain, at, 0.002, gain, 0.1); o.start(at); o.stop(at + 0.3);
    this.route(g, bus, 1, 0.2, 0, 0.35);
  }
  bass(bus, at, f, gain = 0.1) {
    const o = this.osc('sawtooth', f), o2 = this.osc('square', f * 0.5), lp = this.filt('lowpass', 900, 4), g = this.g(0);
    lp.frequency.setValueAtTime(1100, at); lp.frequency.exponentialRampToValueAtTime(120, at + 0.22);
    o.connect(lp); o2.connect(lp); lp.connect(g); this.env(g.gain, at, 0.004, gain, 0.25);
    o.start(at); o2.start(at); o.stop(at + 0.45); o2.stop(at + 0.45);
    this.route(g, bus, 1, 0.08);
  }
  heart(bus, at, gain = 0.55) {
    [[0, 1], [0.27, 0.62]].forEach(([dt, k]) => {
      const o = this.osc('sine', 62), lp = this.filt('lowpass', 120), g = this.g(0);
      o.frequency.setValueAtTime(64, at + dt); o.frequency.exponentialRampToValueAtTime(38, at + dt + 0.18);
      o.connect(lp); lp.connect(g); this.env(g.gain, at + dt, 0.006, gain * k, 0.28); o.start(at + dt); o.stop(at + dt + 0.6);
      this.route(g, bus, 1, 0.15);
    });
  }
  tone(bus, at, dur, f0, f1, gain, vib = 4, wet = 0.6, lateRise = null) {
    const o = this.osc('sine', f0), v = this.osc('sine', vib), vg = this.g(f0 * 0.003), g = this.g(0);
    v.connect(vg); vg.connect(o.frequency);
    o.frequency.setValueAtTime(f0, at);
    if (lateRise) { o.frequency.setValueAtTime(f0, at + lateRise[0]); o.frequency.exponentialRampToValueAtTime(f1, at + dur); } else o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    o.connect(g); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(gain[0], at + dur * 0.5); g.gain.linearRampToValueAtTime(gain[1], at + dur);
    o.start(at); v.start(at); o.stop(at + dur + 0.05); v.stop(at + dur + 0.05);
    this.route(g, bus, 1, wet);
  }
  // ── THE SCORE ──────────────────────────────────────────────────────
  _score() {
    const A = this.A, B = this.B, q = [];
    const at = (t, fn) => q.push({ t, fn });

    // SCENE 01 ─ THE TRANSMISSION
    at(0.0, (w) => this.bed(A, w, T.S4, this.brown, 260, 0.05, 4, 0.1));             // room tone
    at(0.3, (w) => this.pad(A, w, T.S2 + 0.05 - 0.3, [55, 82.4], 0.12, 140, 520, 0.4)); // low drone
    at(1.2, (w) => this.pad(A, w, T.S2 - 1.2, [27.5], 0.18, 90, 110, 0.1, 'sine'));    // sub-bass bed
    at(T.reveal, (w) => { const o = this.osc('sine', 100), g = this.g(0); o.connect(g); g.gain.setValueAtTime(0, w); g.gain.linearRampToValueAtTime(0.008, w + 4); g.gain.setValueAtTime(0.008, w + T.S2 - T.reveal - 0.1); g.gain.linearRampToValueAtTime(0, w + T.S2 - T.reveal); o.start(w); o.stop(w + T.S2); this.route(g, A, 1, 0); }); // electrical hum
    E.sync.forEach((t, i) => at(t, (w) => this.blip(A, w, 2093, 0.06, 0.012 + i * 0.002, 0.6, -0.3 + i * 0.15, 0.3)));
    at(T.ping, (w) => this.ping(A, w));
    for (let i = 0; i < MSG1.length; i++) at(T.typeStart + i * T.typeStep, (w) => this.key(A, w, MSG1[i] === ' ' ? 0.5 : 1));
    at(T.warn, (w) => { this.impact(A, w, 0.7); this.staticBurst(A, w, 0.75, 0.22); });
    [0, 0.6, 1.2].forEach((dt, i) => at(T.warn + dt, (w) => { for (const f of [233, 247]) this.blip(A, w, f, 0.22, 0.06 - i * 0.012, 0.35, 0, 0.1, 'triangle'); }));
    for (let i = 0; i < 22; i++) at(T.warn + 0.02 + i * 0.033, (w) => this.click(A, w, 2000 + Math.random() * 4000, (Math.random() - 0.5), 0.025));   // decoding chatter
    at(12.0, (w) => this.pad(A, w, T.S2 - 12.0, [58.27, 116.5], 0.05, 200, 700, 0.5));  // tension (minor 2nd against the drone)
    E.symbolBursts.forEach((b, i) => at(b.t, (w) => { this.blip(A, w, 1200 + ((i * 739) % 2600), 0.03, 0.018 + Math.min(0.02, b.n / 2000), 0.2, ((i * 37) % 10) / 5 - 1, 0.1, i % 3 ? 'sine' : 'square'); if (i % 4 === 0) this.click(A, w + 0.01, 3500, 0, 0.02); }));
    at(13.6, (w) => this.staticBurst(A, w, 0.25, 0.07));
    at(15.1, (w) => this.staticBurst(A, w, 0.2, 0.08));
    at(14.4, (w) => this.riser(A, w, T.S2 - 14.4, 0.17));
    // SCENE 02 ─ THE CIPHER
    at(T.S2, (w) => { this.impact(A, w, 1); this.whoosh(A, w, 1.1, 0.2); });
    for (let i = 0; i < 30; i++) at(T.S2 + 0.05 + i * 0.05 + (i % 3) * 0.013, (w) => this.click(A, w, 1800 + ((i * 911) % 5000), ((i * 7) % 10) / 5 - 1, 0.028)); // characters peeling off
    at(T.S2, (w) => this.pad(A, w, T.S3 - T.S2 + 0.02, [73.42, 110, 174.6], 0.17, 300, 1500, 0.55));
    at(T.shotB, (w) => { this.whoosh(A, w - 0.25, 0.8, 0.18); this.impact(A, w, 0.45); });
    [T.shotC, T.shotC2, T.shotC3, T.shotD].forEach((t, i) => at(t, (w) => { this.whoosh(A, w - 0.12, 0.45, 0.1); this.blip(A, w, [1568, 1760, 1975, 2349][i], 0.05, 0.03, 0.4, 0, 0.3); }));
    at(T.shotD, (w) => this.whoosh(A, w, 3.0, 0.12));
    at(T.exit2 - 0.4, (w) => this.riser(A, w, T.S3 - T.exit2 + 0.4, 0.2, 400, 9000));
    // pulses, ticks, code
    E.pulses.forEach((t, i) => at(t, (w) => { const k = t < T.S3 ? 0.5 + (t - T.S2) / 14 * 0.15 : 0.62; this.kick(A, w, k); this.bass(A, w, [73.42, 73.42, 87.31, 65.41][Math.floor(i / 4) % 4], t < T.S3 ? 0.1 : 0.13); }));
    E.ticks.forEach((t) => at(t, (w) => this.hat(A, w, t < T.S3 ? 0.03 : 0.034)));
    E.code.forEach((c) => at(c.t, (w) => c.kind ? this.click(A, w, c.f, c.p, 0.03) : this.blip(A, w, c.f, 0.025, 0.012, 0.15, c.p, 0.05, 'square')));
    E.arp.forEach((a) => at(a.t, (w) => this.pluck(A, w, a.f, a.t < T.S3 ? 0.022 : 0.028)));
    E.stutters.forEach((s) => at(s.t, (w) => this.stutter(A, w, s.d)));
    // SCENE 03 ─ BEYOND THE CODE
    E.braams.forEach((b, i) => at(b.t, (w) => { this.braam(A, w, b.f, 4.2, 0.26 + i * 0.03); this.impact(A, w, 0.8 + i * 0.1); }));
    at(T.S3, (w) => this.pad(A, w, T.S4 - T.S3 + 0.02, [146.8, 220, 293.7], 0.06, 400, 2600, 0.6));
    at(E.keyForm, (w) => { this.riser(A, w, 1.2, 0.08, 1200, 6000); });
    at(E.keyForm + 1.25, (w) => { for (const f of [587.3, 880, 1174.7]) this.blip(A, w, f, 0.6, 0.03, 0.7, 0, 0.2); });         // the key "locks"
    at(E.keyDissolve, (w) => { this.whoosh(A, w, 1.4, 0.16); this.staticBurst(A, w, 0.5, 0.08); });
    at(41.0, (w) => this.riser(A, w, T.S4 - 41.0, 0.16, 200, 5000));
    at(43.2, (w) => this.riser(A, w, T.S4 - 43.2, 0.14, 800, 11000));
    at(41.0, (w) => this.tone(A, w, T.S4 - 41.0, 440, 1760, [0.015, 0.05], 6, 0.4));                                            // shepard-like climb
    E.microCuts.forEach((t, i) => at(t, (w) => { this.impact(A, w, 0.45 + i * 0.12); this.staticBurst(A, w, 0.08, 0.1); }));
    // SCENE 04 ─ THE UNKNOWN  (47.0: everything above is cut dead by gate A; 47.0 → 48.4 is pure silence)
    at(T.fogIn, (w) => this.bed(B, w, T.END - T.fogIn + 0.5, this.brown, 70, 0.32, 3.6, 0.2));            // sub rumble
    at(T.fogIn + 0.6, (w) => this.bed(B, w, T.END - T.fogIn, this.white, 380, 0.012, 5, 0.6));           // air / fog movement
    at(T.emerge, (w) => this.pad(B, w, T.END - T.emerge + 0.5, [36.7, 51.9], 0.14, 120, 260, 0.3, 'sine'));
    at(T.emerge + 0.5, (w) => this.tone(B, w, T.END - T.emerge, 1174.7, 1244.5, [0.012, 0.03], 5, 0.7, [7.0]));
    at(55.0, (w) => this.tone(B, w, T.END - 55.0, 1244.5, 1318.5, [0.008, 0.035], 3.3, 0.7, [2.6]));
    E.heart.forEach((t, i) => at(t, (w) => this.heart(B, w, 0.35 + i * 0.03)));
    at(53.4, (w) => this.bed(B, w, 3.2, this.white, 800, 0.016, 1.6, 0.6));                              // breath-like swell
    at(57.25, (w) => this.bed(B, w, 1.6, this.white, 1200, 0.02, 0.7, 0.7));                             // the brief "more visible" moment
    at(57.4, (w) => this.riser(B, w, T.END - 57.4, 0.11, 2000, 12000));                                   // reverse-swell, cut at its peak
    return q;
  }
}
