// ── Master cue sheet: the single source of truth for picture AND sound ──
import { mulberry32, lerp } from './util.js';

export const C = {
  purple: 0x4f29b7, white: 0xededed, black: 0x262626,
  turq: 0x57e3d8, lpurple: 0xa380ff, orange: 0xf4a664, red: 0xc62836,
};
export const CSS = {
  purple: '#4F29B7', white: '#EDEDED', black: '#262626',
  turq: '#57E3D8', lpurple: '#A380FF', orange: '#F4A664', red: '#C62836',
};

export const T = {
  S1: 0.0,          // THE TRANSMISSION
  reveal: 2.4,      // environment begins to emerge from black
  ping: 6.8,        // notification
  typeStart: 6.95, typeStep: 0.072,
  warn: 9.6,        // ENCRYPTED TRANSMISSION DETECTED
  symbols: 11.0,    // encrypted symbols begin flooding the screen
  push: 14.6,       // camera commits into the screen
  S2: 17.0,         // THE CIPHER – shot A (characters peel off the screen, still in the room)
  shotB: 20.4,      // dark space of floating cryptographic symbols
  shotC: 23.8,      // macro close-ups (binary/hex · cipher wheel · key & mathematics)
  shotC2: 25.1, shotC3: 26.4,
  shotD: 27.7,      // rapid stream of encrypted characters, camera chases it
  cut2a: 20.4, cut2b: 23.8, exit2: 29.9,
  S3: 31.0,         // BEYOND THE CODE
  cut3a: 35.4, cut3b: 39.6, cut3c: 43.0,
  S4: 47.0,         // THE UNKNOWN (sudden stop)
  fogIn: 48.4,
  emerge: 50.0,
  END: 59.0,        // HARD CUT – picture and sound at the same instant
};

export const MSG1 = 'INCOMING MESSAGE…';
export const MSG2 = 'ENCRYPTED TRANSMISSION DETECTED';

export const VO = [
  { id: 1, text: 'كل يوم توصلك رسائل…', start: 11.6, end: 15.7 },
  { id: 2, text: 'لكن هل فكرت يومًا…', start: 20.7, end: 23.7 },
  { id: 3, text: 'كيف تُخفى معانيها؟', start: 24.3, end: 28.6 },
  { id: 4, text: 'خلف كل رمز، معنى…', start: 31.5, end: 35.1 },
  { id: 5, text: 'وخلف كل شفرة، طريقة…', start: 35.8, end: 39.3 },
  { id: 6, text: 'وخلف كل رسالة… عالم كامل.', start: 40.0, end: 45.6, emph: 'عالم كامل.' },
];

// Deterministic event lists shared by the audio score and the visuals
function build() {
  const r = mulberry32(0x4f29b7);
  const E = {};

  // Scene 1: soft "sync" blips before the message arrives
  E.sync = []; for (let t = 0.9; t < 6.4; t += 1.6) E.sync.push(t);

  // Scene 1: bursts of encrypted symbols hitting the screen (each = a data blip)
  E.symbolBursts = [];
  for (let t = T.symbols; t < 16.9;) {
    const k = (t - T.symbols) / (16.9 - T.symbols);
    E.symbolBursts.push({ t, n: Math.round(lerp(6, 46, k * k)) });
    t += lerp(0.34, 0.06, Math.sqrt(k)) * (0.7 + r() * 0.6);
  }

  // Scene 2/3 rhythmic pulses (accelerating heartbeat of the data)
  E.pulses = [];
  for (let t = 17.35; t < 30.9;) { E.pulses.push(t); t += lerp(0.72, 0.48, (t - 17) / 14); }
  for (let t = 31.0; t < 46.9;) { E.pulses.push(t); t += lerp(0.5, 0.25, Math.pow((t - 31) / 16, 1.3)); }

  // hats / ticks (subdivisions)
  E.ticks = [];
  for (let i = 0; i < E.pulses.length - 1; i++) {
    const a = E.pulses[i], b = E.pulses[i + 1];
    const sub = a < 21 ? 0 : a < 26 ? 2 : a < 35.4 ? 4 : 4;
    for (let s = 1; s < sub; s++) E.ticks.push(a + (b - a) * s / sub);
  }

  // code / digital clicks (density grows)
  E.code = [];
  for (let t = 17.2; t < 46.9;) {
    const k = (t - 17) / 30;
    E.code.push({ t, f: 900 + r() * 3600, p: r() * 2 - 1, kind: r() < 0.55 ? 0 : 1 });
    t += lerp(0.22, 0.035, k) * (0.4 + r() * 1.2);
  }

  // data arpeggio (musical pulse) – D minor pentatonic up high
  E.arp = [];
  const notes = [587.33, 698.46, 880, 1046.5, 1174.66, 880, 698.46, 1318.5];
  let ai = 0;
  for (let t = 24.0; t < 46.9;) {
    E.arp.push({ t, f: notes[ai++ % notes.length] * (t > 39.6 && ai % 4 === 0 ? 2 : 1) });
    t += t < 31 ? 0.18 : t < 43 ? 0.125 : 0.0625;
  }

  // braams (scene 3 hits)
  E.braams = [
    { t: T.S3, f: 73.42 }, { t: T.cut3a, f: 58.27 }, { t: T.cut3b, f: 87.31 }, { t: T.cut3c, f: 73.42 },
  ];
  E.microCuts = [44.6, 45.3, 45.9, 46.4, 46.75];
  E.keyForm = 39.6; E.keyDissolve = 42.2;

  // Red flashes: warning signals & dramatic hits
  E.red = [
    { t: T.warn, v: 1.0, d: 0.35 }, { t: T.warn + 0.6, v: 0.55, d: 0.3 }, { t: T.warn + 1.2, v: 0.45, d: 0.3 },
    { t: T.S2, v: 0.5, d: 0.4 }, { t: T.shotC3, v: 0.3, d: 0.25 },
    { t: T.S3, v: 0.85, d: 0.5 }, { t: T.cut3a, v: 0.6, d: 0.45 }, { t: T.cut3b, v: 0.75, d: 0.45 }, { t: T.cut3c, v: 0.9, d: 0.5 },
    ...E.microCuts.map((t, i) => ({ t, v: 0.45 + i * 0.14, d: 0.22 })),
  ];

  // Glitch hits (controlled, never constant)
  E.glitch = [
    { t: T.warn, v: 0.6, d: 0.12 },
    { t: 16.45, v: 0.25, d: 0.08 }, { t: 16.62, v: 0.4, d: 0.08 }, { t: 16.78, v: 0.6, d: 0.08 }, { t: 16.9, v: 0.9, d: 0.1 },
    { t: T.S2, v: 1.0, d: 0.22 },
    { t: T.shotB, v: 0.55, d: 0.12 }, { t: T.shotC, v: 0.4, d: 0.1 }, { t: T.shotC2, v: 0.25, d: 0.08 }, { t: T.shotC3, v: 0.25, d: 0.08 }, { t: T.shotD, v: 0.45, d: 0.1 },
    { t: 30.3, v: 0.4, d: 0.1 }, { t: 30.6, v: 0.6, d: 0.1 }, { t: 30.85, v: 0.9, d: 0.12 },
    { t: T.S3, v: 0.8, d: 0.2 }, { t: T.cut3a, v: 0.5, d: 0.14 }, { t: T.cut3b, v: 0.5, d: 0.14 }, { t: T.cut3c, v: 0.6, d: 0.14 },
    ...E.microCuts.map((t) => ({ t, v: 0.8, d: 0.09 })),
  ];

  // Purple/white exposure flashes on scene transitions
  E.flash = [{ t: T.S2, v: 0.35, d: 0.25 }, { t: T.shotB, v: 0.6, d: 0.25 }, { t: T.S3, v: 0.9, d: 0.35 }, { t: 46.75, v: 0.6, d: 0.2 }];

  // Scene 4 heartbeat (slowly accelerating)
  E.heart = [];
  for (let t = 51.0; t < 58.9;) { E.heart.push(t); t += lerp(1.25, 0.78, (t - 51) / 8); }

  // stutter gates for glitch audio
  E.stutters = [{ t: 16.3, d: 0.7 }, { t: T.shotB - 0.14, d: 0.14 }, { t: T.shotD - 0.1, d: 0.1 }, { t: 30.25, d: 0.75 }, { t: 45.0, d: 0.2 }, { t: 46.1, d: 0.3 }];
  return E;
}
export const E = build();
