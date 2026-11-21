// Live-site check with REAL device profiles (visible viewport, DPR, touch, UA).  usage: node device.js URL "iPhone 14" outPrefix t1,t2,...
const { chromium, devices } = require('playwright');
const [URL, DEV, OUT, TIMES] = [process.argv[2], process.argv[3], process.argv[4], (process.argv[5] || '').split(',').filter(Boolean).map(Number)];
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const d = devices[DEV]; const ctx = await b.newContext({ ...d }); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL + (TIMES.length ? '?still=0' : ''), { waitUntil: 'load' });
  await p.waitForFunction(() => window.__teaser || document.body.classList.contains('ready'), null, { timeout: 180000 });
  const m = await p.evaluate(() => { const c = document.querySelector('#stage'); const r = c.getBoundingClientRect();
    return { inner: [innerWidth, innerHeight], screen: [screen.width, screen.height], dpr: devicePixelRatio, cssCanvas: [r.width, r.height], buffer: [c.width, c.height],
      bufferAspect: +(c.width / c.height).toFixed(3), cssAspect: +(r.width / r.height).toFixed(3), scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      vv: window.visualViewport ? [visualViewport.width, visualViewport.height] : null }; });
  console.log(DEV, JSON.stringify(m), d.viewport);
  if (!TIMES.length) await p.screenshot({ path: `${OUT}_intro.png` });
  for (const t of TIMES) { await p.evaluate((t) => { window.__teaser.frame(t - 1 / 30); window.__teaser.frame(t); }, t); await p.screenshot({ path: `${OUT}_${String(t.toFixed(2)).padStart(6, '0')}.png` }); }
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
