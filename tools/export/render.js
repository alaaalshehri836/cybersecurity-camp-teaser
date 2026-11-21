// Offline, frame-exact renderer for the teaser (no screen recording).
// Each frame is produced by the site's own engine at t = n / FPS and read straight from the WebGL canvas.
// usage: node render.js <framesDir> <startFrame> <endFrame> [fps=30] [width=1920] [height=1080]
//        node render.js --audio <out.wav> [seconds=60]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = 'file://' + path.resolve(__dirname, '../../dist/index.html');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function open(W, H) {
  const b = await chromium.launch({ args: ARGS });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  await p.goto(SITE + '?still=0');
  await p.waitForFunction(() => window.__teaser, null, { timeout: 300000 });
  return { b, p };
}

(async () => {
  if (process.argv[2] === '--audio') {
    const out = process.argv[3], secs = +(process.argv[4] || 60);
    const { b, p } = await open(640, 360);
    const b64 = await p.evaluate(async (secs) => {
      const SR = 48000, ctx = new OfflineAudioContext(2, Math.ceil(SR * (secs + 0.5)), SR);
      const e = new window.__teaser.AudioEngine(); await e.init(ctx); const t0 = e.start(true);
      const buf = await ctx.startRendering();
      const off = Math.round(t0 * SR), n = Math.round(secs * SR);           // picture t=0 ⇔ audio t0
      const L = buf.getChannelData(0).subarray(off, off + n), R = buf.getChannelData(1).subarray(off, off + n);
      const ab = new ArrayBuffer(44 + n * 8), dv = new DataView(ab);
      const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); dv.setUint32(4, 36 + n * 8, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 3, true); dv.setUint16(22, 2, true);
      dv.setUint32(24, SR, true); dv.setUint32(28, SR * 8, true); dv.setUint16(32, 8, true); dv.setUint16(34, 32, true); w(36, 'data'); dv.setUint32(40, n * 8, true);
      for (let i = 0; i < n; i++) { dv.setFloat32(44 + i * 8, L[i] || 0, true); dv.setFloat32(48 + i * 8, R[i] || 0, true); }
      let s = ''; const u8 = new Uint8Array(ab); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    }, secs);
    fs.writeFileSync(out, Buffer.from(b64, 'base64')); console.log('audio written', out); await b.close(); return;
  }
  const [dir, a, z] = [process.argv[2], +process.argv[3], +process.argv[4]];
  const FPS = +(process.argv[5] || 30), W = +(process.argv[6] || 1920), H = +(process.argv[7] || 1080);
  fs.mkdirSync(dir, { recursive: true });
  const { b, p } = await open(W, H);
  await p.evaluate(({ a, FPS }) => { window.__teaser.frame(Math.max(0, (a - 1) / FPS)); }, { a, FPS });   // prime motion-blur history
  const t0 = Date.now();
  for (let n = a; n < z; n++) {
    const file = path.join(dir, `f${String(n).padStart(5, '0')}.png`);
    if (fs.existsSync(file)) { await p.evaluate(({ n, FPS }) => window.__teaser.frame(n / FPS), { n, FPS }); continue; }
    const data = await p.evaluate(({ n, FPS }) => { window.__teaser.frame(n / FPS); return document.querySelector('#stage').toDataURL('image/png'); }, { n, FPS });
    fs.writeFileSync(file + '.tmp', Buffer.from(data.split(',')[1], 'base64')); fs.renameSync(file + '.tmp', file);
    if ((n - a) % 30 === 0) console.log(`[${a}-${z}] frame ${n}  ${((Date.now() - t0) / (n - a + 1) / 1000).toFixed(2)} s/frame`);
  }
  console.log(`[${a}-${z}] done`); await b.close();
})();
