// Real-time playthrough of a live URL: start → scenes → hard cut → replay.  usage: node live.js URL W H mobile(0|1) outPrefix
const { chromium } = require('playwright');
const [URL, W, H, MOB, OUT] = [process.argv[2], +process.argv[3], +process.argv[4], process.argv[5] === '1', process.argv[6]];
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: MOB ? 2 : 1, isMobile: MOB, hasTouch: MOB,
    userAgent: MOB ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' : undefined });
  const p = await ctx.newPage(); const errs = [], reqs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('requestfailed', (r) => reqs.push(r.url() + ' ' + r.failure()?.errorText));
  const t0 = Date.now(); await p.goto(URL, { waitUntil: 'load' }); await p.waitForSelector('body.ready', { timeout: 180000 });
  console.log(`loaded+ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (MOB) await p.tap('#start'); else await p.click('#start');
  const s0 = Date.now();
  const st = await p.evaluate(async () => { await new Promise((r) => setTimeout(r, 800)); return document.body.className; });
  console.log('after start:', st);
  for (const sec of [9, 25, 41, 57.5]) { await p.waitForTimeout(Math.max(0, sec * 1000 - (Date.now() - s0))); await p.screenshot({ path: `${OUT}_${sec}.png` }); }
  await p.waitForSelector('body.ended', { timeout: 60000 }); await p.waitForSelector('body.show-replay', { timeout: 10000 });
  console.log('hard cut reached, replay shown | page errors:', errs.join(' | ') || 'none', '| failed requests:', reqs.join(' | ') || 'none');
  await b.close();
})();
