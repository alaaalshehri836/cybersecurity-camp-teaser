// Bundles the whole experience into ONE self-contained HTML file (works from file:// and any static host)
import { build } from 'esbuild';
import fs from 'node:fs';
const b64 = (p) => fs.readFileSync(p).toString('base64');
const F = 'node_modules/@fontsource';
const face = (fam, file, w) => `@font-face{font-family:"${fam}";font-weight:${w};font-style:normal;font-display:block;src:url(data:font/woff2;base64,${b64(file)}) format("woff2");}`;
const fonts = [
  face('TMono', `${F}/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2`, 400),
  face('TMono', `${F}/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2`, 500),
  face('TArabic', `${F}/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-300-normal.woff2`, 300),
  face('TArabic', `${F}/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2`, 500),
  face('TArabic', `${F}/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-300-normal.woff2`, 300),
].join('\n');
const res = await build({ entryPoints: ['src/main.js'], bundle: true, minify: !process.argv.includes('--dev'), format: 'iife', target: ['es2020'], write: false, legalComments: 'none' });
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = fs.readFileSync('src/index.template.html', 'utf8').replace('/*__FONTS__*/', () => fonts).replace('/*__JS__*/', () => js);
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/index.html', html);
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
