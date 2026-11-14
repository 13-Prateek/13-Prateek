/**
 * DEV ONLY: close-up screenshots (2x) of fighters for pose checks.
 *   node src/dev/zoom.mjs <scene> <frames> <x> <y> <w> <h> [name]   (x/y/w/h in CSS px of a 1280x720 view)
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [scene, frames, x, y, w, h, name] = process.argv.slice(2);
const PORT = 4182;
mkdirSync('playtest-shots', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes('Local')) r(); }); setTimeout(r, 8000); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.error(String(e)));
  await page.goto(`http://localhost:${PORT}/src/dev/vfx.html?manual=1&hud=0`);
  await page.waitForFunction(() => !!window.__vfx, null, { timeout: 30000 });
  await page.evaluate(([s, n]) => { window.__vfx.play(s); window.__vfx.step(n); }, [scene, Number(frames)]);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const out = `playtest-shots/zoom-${name ?? scene + '-' + frames}.png`;
  await page.screenshot({ path: out, clip: { x: +x, y: +y, width: +w, height: +h } });
  console.log(out);
} finally { await browser.close(); server.kill(); process.exit(0); }
