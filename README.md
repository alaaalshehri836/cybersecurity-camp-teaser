# Cybersecurity Camp — Cinematic Teaser

> **“There is a message not meant for everyone.”** · **«هناك رسالة لا يجب أن يقرأها الجميع.»**

A 59-second cinematic teaser that is **rendered live in the browser** rather than played from a video file. Every shot is a real-time WebGL composition: Three.js with a custom post-production pipeline (depth of field, camera motion blur, lit volumetric fog, bloom, film grain and colour grade), choreographed by a single GSAP master timeline. Picture and sound share one master clock, the Web Audio API clock. The soundtrack is fully procedural, and the teaser contains no human voice.

## The four scenes
| Time | Scene | |
|---|---|---|
| 0 – 17 s | **01 · The Transmission** | A dark room, volumetric light through blinds. A message arrives: `INCOMING MESSAGE…` → `ENCRYPTED TRANSMISSION DETECTED` |
| 17 – 31 s | **02 · The Cipher** | Characters peel off the screen into a deep field of symbols, close-ups of hex, a Caesar wheel, RSA maths and key material, then a data stream |
| 31 – 47 s | **03 · Beyond the Code** | Layers of screens, an AES S-box lock, a key that forms and dissolves into particles, an accelerating edit |
| 47 – 59 s | **04 · The Unknown** | Sudden silence. Every fragment converges into one vast encrypted architecture in crimson-backlit fog, then a **hard cut**: picture and sound stop at the same instant |

All timings live in [`src/config.js`](src/config.js). Picture and sound both read from that file.

## Run locally
```bash
npm install
npm run build        # → dist/index.html (a single self-contained file: engine, libraries and fonts inlined)
npm run preview      # serves dist/ on http://localhost:8080
```
`dist/index.html` also works when opened straight from disk.
Controls: **Start Experience** · `M` mute · `F` fullscreen · `Space` start/replay.

## Deploy (Vercel)
Settings are in [`vercel.json`](vercel.json): no framework, `npm install` → `npm run build` → serve `dist/`. Every push to `main` deploys automatically.

## Mobile
On portrait screens each shot is recomposed: per-shot framing, the key stands upright, and the Scene 04 structure is centred with its backlight behind the upper contour. Touch controls, iOS/Android audio unlock (including with the iOS silent switch on), and mobile-only GPU settings are included. The desktop rendering path is untouched; [`tools/qa`](tools/qa) checks desktop frames for byte-identical output.

## Video export
[`tools/export/render.js`](tools/export/render.js) renders frame-exact video frames from the engine at any fps and resolution, and renders the soundtrack offline at 48 kHz. No screen recording is involved. Output goes to `exports/`, which is git-ignored.

## Structure
```
src/
  main.js            director: master clock, master timeline, render loop, player UI
  config.js          cue sheet, palette, event lists (shared by picture and sound)
  acts/act1-4.js     the four scenes · convergence.js = the Scene 04 structure
  fx/fx.js           glyph fields, lit fog, dust, light beams, data streams, glass panels
  post.js            depth of field + motion blur, fog/light compositing, bloom, film grade
  audio.js           procedural score and sound design (Web Audio API)
  textures.js        procedural screens, cryptographic panels, glyph atlas · sha256.js
  index.template.html
build.mjs            bundles everything into dist/index.html
tools/export         offline frame and audio renderer
tools/qa             desktop and mobile verification scripts
```

Palette (Tuwaiq identity): `#4F29B7` `#262626` `#EDEDED`, secondaries `#57E3D8` `#A380FF` `#F4A664`, plus a cybersecurity accent `#C62836`.
