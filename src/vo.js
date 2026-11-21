// ── On-screen Arabic lines: cinematic typography, time-driven by the master clock.
// There is no spoken voice: the experience is soundtrack-only (no speech synthesis, no recorded VO).
import { VO } from './config.js';
import { smooth } from './util.js';

export class VoiceOver {
  constructor(root) {
    this.root = root; this.lines = [];
    for (const v of VO) {
      const el = document.createElement('div'); el.className = 'vo-line'; el.dir = 'rtl'; el.lang = 'ar';
      const emphStart = v.emph ? v.text.indexOf(v.emph) : -1;
      let pos = 0;
      const spans = v.text.split(' ').map((w) => {
        const s = document.createElement('span'); s.className = 'w'; s.textContent = w;
        if (emphStart >= 0 && pos >= emphStart) s.classList.add('emph');
        pos += w.length + 1; el.appendChild(s); el.appendChild(document.createTextNode(' ')); return s;
      });
      root.appendChild(el);
      this.lines.push({ v, el, spans });
    }
  }
  reset() { for (const l of this.lines) l.el.style.opacity = 0; }
  cut() { for (const l of this.lines) l.el.style.opacity = 0; }
  update(t) {
    const any = VO.some((v) => t > v.start && t < v.end); this.root.style.setProperty('--sub', any ? 1 : 0);
    for (const { v, el, spans } of this.lines) {
      const on = t > v.start - 0.1 && t < v.end + 0.1;
      if (!on) { if (el.style.opacity !== '0') el.style.opacity = 0; continue; }
      const out = 1 - smooth(v.end - 0.7, v.end, t);
      el.style.opacity = out;
      el.style.filter = out < 1 ? `blur(${((1 - out) * 7).toFixed(2)}px)` : 'none';
      el.style.transform = `translate3d(0, ${(-(1 - out) * 6).toFixed(2)}px, 0) scale(${(1 + (t - v.start) * 0.006).toFixed(4)})`;
      spans.forEach((s, i) => {
        const k = smooth(0, 1, (t - v.start - i * 0.2) / 0.75);
        s.style.opacity = k.toFixed(3);
        s.style.filter = k < 1 ? `blur(${((1 - k) * 10).toFixed(2)}px)` : 'none';
        s.style.transform = `translate3d(0, ${((1 - k) * 10).toFixed(2)}px, 0)`;
      });
    }
  }
}
