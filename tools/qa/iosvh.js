// Reproduces the iOS/in-app-browser "100vh taller than the visible viewport" condition and measures the result.
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [label, url] of [['LIVE (before fix)', 'https://cybersecurity-camp-teaser.vercel.app/?still=13'], ['FIXED build', 'file://' + require('path').resolve(__dirname, '../../dist/index.html') + '?still=13']]) {
    const ctx = await b.newContext({ ...devices['iPhone 14'] }); const p = await ctx.newPage();
    await p.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '#stage{height:844px}'; document.head.appendChild(s); }); });
    await p.goto(url); await p.waitForFunction(() => window.__teaser, null, { timeout: 180000 });
    await p.evaluate(() => { dispatchEvent(new Event('resize')); window.__teaser.frame(13); });
    const m = await p.evaluate(() => { const c = document.querySelector('#stage'), r = c.getBoundingClientRect(); return { visible: [innerWidth, innerHeight], canvasBox: [r.width, r.height], bufferAspect: +(c.width / c.height).toFixed(3), boxAspect: +(r.width / r.height).toFixed(3), offscreenPx: Math.max(0, r.bottom - innerHeight) }; });
    console.log(label.padEnd(18), JSON.stringify(m), m.bufferAspect === m.boxAspect && !m.offscreenPx ? '→ OK' : '→ DISTORTED / CROPPED');
    await p.screenshot({ path: `iosvh_${label.startsWith('LIVE') ? 'before' : 'after'}.png` }); await ctx.close();
  }
  await b.close();
})();
