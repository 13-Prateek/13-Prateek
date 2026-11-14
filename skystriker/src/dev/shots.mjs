/**
 * DEV ONLY: VFX screenshot + frame-time scenario for the render module.
 *   cd skystriker && node src/dev/shots.mjs            (bloom on)
 *   node src/dev/shots.mjs --lowfx                       (bloom off)
 * Starts the Vite dev server, opens the VFX lab (src/dev/vfx.html) in headless
 * Chromium, steps scripted scenes frame by frame, saves playtest-shots/vfx-*.png,
 * then measures requestAnimationFrame deltas for 5 s of busy action.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const lowfx = process.argv.includes('--lowfx');
const PORT = 4181;
mkdirSync('playtest-shots', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve) => {
  server.stdout.on('data', (d) => { if (String(d).includes('Local')) resolve(); });
  setTimeout(resolve, 8000);
});

const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/src/dev/vfx.html?manual=1&hud=0${lowfx ? '&lowfx=1' : ''}`);
  await page.waitForFunction(() => !!window.__vfx, null, { timeout: 30000 });
  const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shot = async (name) => { await frames(); await page.screenshot({ path: `playtest-shots/vfx-${name}${lowfx ? '-lowfx' : ''}.png` }); console.log('shot', name); };
  const play = (id) => page.evaluate((i) => window.__vfx.play(i), id);
  const step = (n) => page.evaluate((k) => window.__vfx.step(k), n);
  const until = async (type, extra = 0) => {
    const n = await page.evaluate((t) => window.__vfx.stepUntil(t), type);
    if (!(await page.evaluate((t) => window.__vfx.seen().includes(t), type))) errors.push(`event ${type} never happened`);
    if (extra) await step(extra);
    return n;
  };

  await play('kick'); await step(60); await shot('01-kick-charge');
  await until('kick', 3); await shot('02-kick-impact');
  await step(14); await shot('03-kick-trail');
  await play('hit'); await until('hit', 2); await shot('04-hit');
  await until('wallSplat', 4); await shot('05-wall-splat');
  await play('perfect'); await until('perfect', 3); await shot('06-perfect');
  await play('clash'); await until('clash', 4); await shot('07-clash');
  await play('ko'); await until('ko', 3); await shot('08-ko-flash');
  await step(40); await shot('09-ko-slowmo');
  await play('trail'); await step(32); await shot('10-trail-fire');
  await step(125); await shot('11-trail-frost');
  await play('dash'); await step(50); await shot('12-dash');
  await play('trap'); await step(60); await shot('13-trap');
  await step(80); await shot('14-infuse');
  await play('sudden'); await step(260); await shot('15-sudden-death');
  await play('idle'); await step(90); await shot('16-idle');

  // frame-time check: real-time showcase of the busiest scenes
  const stats = await page.evaluate(async () => {
    const v = window.__vfx;
    v.setManual(false);
    v.jsTime();
    const out = [];
    for (const id of ['hit', 'trail', 'ko']) {
      v.play(id);
      const d = [];
      let maxP = 0;
      await new Promise((resolve) => {
        let last = performance.now();
        const t0 = last;
        const f = (now) => {
          d.push(now - last); last = now;
          maxP = Math.max(maxP, v.particles());
          if (now - t0 < 5000 / 3) requestAnimationFrame(f); else resolve();
        };
        requestAnimationFrame(f);
      });
      out.push({ id, d, maxP });
    }
    const all = out.flatMap((o) => o.d).sort((a, b) => a - b);
    const q = (p) => all[Math.min(all.length - 1, Math.floor(all.length * p))];
    const js = v.jsTime();
    return { js, frames: all.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: all[all.length - 1], maxParticles: Math.max(...out.map((o) => o.maxP)) };
  });
  console.log(`frame-time (${lowfx ? 'lowfx' : 'bloom'}): frames=${stats.frames} p50=${stats.p50.toFixed(1)}ms p95=${stats.p95.toFixed(1)}ms p99=${stats.p99.toFixed(1)}ms max=${stats.max.toFixed(1)}ms peakParticles=${stats.maxParticles}`);
  console.log(`js per frame (sim+render update): p50=${stats.js.p50.toFixed(2)}ms p95=${stats.js.p95.toFixed(2)}ms max=${stats.js.max.toFixed(2)}ms over ${stats.js.n} frames`);
} catch (e) {
  errors.push(String(e));
} finally {
  await browser.close();
  server.kill();
}
if (errors.length) { console.error('VFX SCENARIO FAIL:\n' + errors.join('\n')); code = 1; }
else console.log('VFX SCENARIO OK');
process.exit(code);
