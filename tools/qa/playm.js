const { chromium } = require('playwright');
const W = +process.argv[2], H = +process.argv[3];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + require('path').resolve(__dirname, '../../dist/index.html') + '');
  await p.waitForSelector('body.ready', { timeout: 180000 });
  const ui = await p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height), getComputedStyle(e).display]; };
    return { start: r('#start'), mute: r('#mute'), fs: r('#fs'), scrollW: document.documentElement.scrollWidth, canvas: [document.querySelector('#stage').width, document.querySelector('#stage').height] }; });
  console.log('UI', JSON.stringify(ui));
  await p.screenshot({ path: `m_intro_${W}.png` });
  await p.tap('#start'); const t0 = Date.now();
  await p.waitForTimeout(1500);
  console.log('audio state after tap:', await p.evaluate(() => window.__teaser && document.body.className));
  await p.tap('#stage').catch(() => {}); await p.waitForTimeout(300);
  const ctrl = await p.evaluate(() => getComputedStyle(document.querySelector('#ctrl')).opacity);
  console.log('controls opacity after tapping the screen:', ctrl);
  await p.waitForTimeout(Math.max(0, 59.8e3 - (Date.now() - t0)));
  await p.waitForSelector('body.ended', { timeout: 30000 });
  await p.waitForSelector('body.show-replay', { timeout: 10000 });
  const rp = await p.evaluate(() => { const b = document.querySelector('#replay').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
  await p.screenshot({ path: `m_end_${W}.png` });
  console.log('ended + replay shown; replay target', rp, '| errors:', errs.join(' | ') || 'none');
  await b.close();
})();
