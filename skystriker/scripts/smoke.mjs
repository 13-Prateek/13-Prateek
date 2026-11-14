/**
 * Automated playtest smoke check. Every session runs this before handing in work.
 *   npm run build && npm run smoke
 * - Serves dist/ with `vite preview`, opens it in headless Chromium,
 * - holds some keys, checks the sim advances and there are no console errors,
 * - saves screenshots to playtest-shots/ (look at them!).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs').catch(() => ({}))); }
if (!chromium) { console.error('playwright not found'); process.exit(2); }

import { freePort } from './free-port.mjs';

// A free port per run (or SMOKE_PORT), so parallel sessions' smoke runs never collide.
const PORT = await freePort();
mkdirSync('playtest-shots', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
// Wait until the preview server actually answers (fixed sleeps were flaky).
{
  const deadline = Date.now() + 20000;
  for (;;) {
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not up yet */ }
    if (Date.now() > deadline) { console.error(`SMOKE FAIL: preview server not answering on port ${PORT}`); server.kill(); process.exit(1); }
    await new Promise((r) => setTimeout(r, 200));
  }
}

const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__game?.state().tick > 0, null, { timeout: 15000 });
  await page.screenshot({ path: 'playtest-shots/01-start.png' });
  await page.waitForTimeout(3200); // countdown
  await page.keyboard.down('KeyD'); await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.press('KeyJ');
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyD');
  await page.screenshot({ path: 'playtest-shots/02-playing.png' });
  const s = await page.evaluate(() => {
    const st = window.__game.state();
    return { tick: st.tick, phase: st.phase, p1: st.fighters[0].pos, hp: st.fighters.map((f) => f.hp) };
  });
  console.log('state:', JSON.stringify(s));
  if (s.tick < 200) errors.push(`sim too slow: tick=${s.tick}`);
  if (s.phase === 'countdown') errors.push('still in countdown after 4s');
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) { console.error('SMOKE FAIL:\n' + errors.join('\n')); process.exit(1); }
console.log('SMOKE OK — screenshots in playtest-shots/');
process.exit(0);
