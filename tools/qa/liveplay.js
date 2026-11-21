// Real-time live playthrough with a real device profile (or desktop). usage: node liveplay.js URL "iPhone 14"|desktop outPrefix
const { chromium, devices } = require('playwright');
const [URL, DEV, OUT] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const mob = DEV !== 'desktop'; const ctx = await b.newContext(mob ? { ...devices[DEV] } : { viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage(); const errs = [], fails = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); p.on('requestfailed', (r) => fails.push(r.url()));
  await p.goto(URL); await p.waitForSelector('body.ready', { timeout: 180000 });
  const ui = await p.evaluate(() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }; return { start: r('#start'), mute: r('#mute'), vw: [innerWidth, innerHeight] }; });
  await p.screenshot({ path: `${OUT}_intro.png` });
  if (mob) await p.tap('#start'); else await p.click('#start');
  await p.waitForTimeout(1200); const cls = await p.evaluate(() => document.body.className);
  if (mob) { await p.tap('#stage'); await p.waitForTimeout(400); }
  const ctrl = await p.evaluate(() => { const b = document.querySelector('#mute').getBoundingClientRect(); return { opacity: +getComputedStyle(document.querySelector('#ctrl')).opacity, mute: [Math.round(b.left), Math.round(b.top), b.width, b.height], inside: b.right <= innerWidth && b.bottom <= innerHeight && b.left >= 0 && b.top >= 0 }; });
  await p.screenshot({ path: `${OUT}_playing.png` });
  await p.waitForSelector('body.ended', { timeout: 120000 }); await p.waitForSelector('body.show-replay', { timeout: 15000 });
  const rp = await p.evaluate(() => { const b = document.querySelector('#replay').getBoundingClientRect(); return { box: [Math.round(b.width), Math.round(b.height)], inside: b.right <= innerWidth && b.bottom <= innerHeight }; });
  console.log(`${DEV.padEnd(18)} viewport ${ui.vw} | start ${ui.start.slice(2)} | after tap: ${cls.includes('playing') ? 'playing' : cls} | controls ${ctrl.mute.slice(2)}px on-screen=${ctrl.inside} | cut→replay ${rp.box} on-screen=${rp.inside} | errors: ${errs.join('|') || 'none'} | failed requests: ${fails.length}`);
  await b.close();
})();
