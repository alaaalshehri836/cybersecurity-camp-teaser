const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [w, h] of [[1366, 768], [1440, 900], [1536, 864], [1920, 1200], [2560, 1440]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('file://' + require('path').resolve(__dirname, '../../dist/index.html') + '?still=41'); await p.waitForFunction(() => window.__teaser, null, { timeout: 180000 });
    const m = await p.evaluate(() => { const c = document.querySelector('#stage'), r = c.getBoundingClientRect(); return { box: [r.width, r.height], buf: [c.width, c.height], scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] }; });
    await p.screenshot({ path: `desk_${w}x${h}.png` });
    console.log(`${w}x${h}`, JSON.stringify(m), m.box[0] === w && m.box[1] === h && m.scroll[0] === w ? 'OK' : 'PROBLEM', errs.join('|') || ''); await p.close();
  }
  await b.close();
})();
