// usage: node shootm.js OUTDIR t1,t2,... W H [mobile=1]
const { chromium } = require('playwright');
const OUT = process.argv[2], TIMES = process.argv[3].split(',').map(Number), W = +process.argv[4], H = +process.argv[5], MOB = process.argv[6] !== '0';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: MOB, hasTouch: MOB,
    userAgent: MOB ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' : undefined });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/index.html') + '?still=0');
  await p.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  await p.waitForFunction(() => window.__teaser, null, { timeout: 180000 });
  for (const t of TIMES) { await p.evaluate((t) => { window.__teaser.frame(t - 1 / 30); window.__teaser.frame(t); }, t); await p.screenshot({ path: `${OUT}/m${W}_${String(t.toFixed(2)).padStart(6, '0')}.png` }); }
  const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
  console.log(JSON.stringify(ov), errs.join(' | ') || 'no errors'); await b.close();
})();
