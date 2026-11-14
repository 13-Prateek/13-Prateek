/**
 * Lead integration playtest: real sim + renderer + HUD + sparring bot, in headless Chromium.
 *   npm run build && node scripts/scenario-integration.mjs
 * Plays ~20 s against the bot; checks the free dash leaves you Winded (not invulnerable),
 * Q Phase-Dashes only with half a bar of aura, pause (Esc) freezes the sim, and restart() resets.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { freePort } from './free-port.mjs';

const PORT = await freePort();
mkdirSync('playtest-shots', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
for (const end = Date.now() + 20000; ;) {
  try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {}
  if (Date.now() > end) throw new Error('preview server did not start');
  await new Promise((r) => setTimeout(r, 200));
}

const errors = [];
const fails = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const st = (page) => page.evaluate(() => {
  const s = window.__game.state();
  return { tick: s.tick, phase: s.phase, round: s.round, hp: s.fighters.map((f) => f.hp), aura: s.fighters.map((f) => f.aura), ball: s.ball.mode, owner: s.ball.owner };
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__game?.state().tick > 0);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'playtest-shots/int-01-countdown.png' });
  await page.waitForFunction(() => window.__game.state().phase === 'playing', null, { timeout: 8000 });

  // Fight: drift around and kick toward the right side with the mouse.
  await page.mouse.move(1100, 360);
  const moves = ['KeyD', 'KeyW', 'KeyS', 'KeyA'];
  for (let i = 0; i < 16; i++) {
    const k = moves[i % moves.length];
    await page.keyboard.down(k);
    await page.mouse.down(); await page.waitForTimeout(i % 3 === 0 ? 450 : 60); await page.mouse.up();
    await page.waitForTimeout(400);
    await page.keyboard.up(k);
    if (i === 6) await page.screenshot({ path: 'playtest-shots/int-02-fight.png' });
  }
  await page.screenshot({ path: 'playtest-shots/int-03-fight-later.png' });
  const mid = await st(page);
  console.log('after fighting:', JSON.stringify(mid));
  // The bot kicks every ~3 s; a hit is not guaranteed in a short headless run, so check it engaged.
  if (mid.aura[1] === 0) fails.push('the sparring bot never kicked the ball');

  // Pressure pass, through the real keys: watch P1 for ~1 s after a key press.
  const watchAfter = async (key) => {
    await page.evaluate(() => {
      window.__watch = { phase: 0, winded: 0, aura0: window.__game.state().fighters[0].aura };
      const loop = () => {
        const f = window.__game.state().fighters[0];
        window.__watch.phase = Math.max(window.__watch.phase, f.phaseDashTimer ?? 0);
        window.__watch.winded = Math.max(window.__watch.winded, f.winded ?? 0);
        if (!window.__watch.stop) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.keyboard.down('KeyW');
    await page.keyboard.press(key);
    await page.waitForTimeout(1000);
    await page.keyboard.up('KeyW');
    return page.evaluate(() => { window.__watch.stop = true; return { ...window.__watch, aura1: window.__game.state().fighters[0].aura }; });
  };
  await page.waitForTimeout(1300); // let any dash cooldown run out
  const dash = await watchAfter('Space');
  console.log('free dash:', JSON.stringify(dash));
  if (dash.phase > 0) fails.push('free dash made P1 invulnerable (phaseDashTimer > 0)');
  if (dash.winded <= 0) fails.push('free dash did not leave P1 Winded');
  await page.waitForTimeout(1300);
  const phase = await watchAfter('KeyQ');
  console.log('phase dash (Q):', JSON.stringify(phase));
  if (phase.aura0 >= 50) {
    if (phase.phase <= 0) fails.push('Q with enough aura did not Phase Dash');
    if (phase.aura0 - phase.aura1 < 49) fails.push('Phase Dash did not spend half a bar');
  } else if (phase.phase > 0) fails.push('Q Phase-Dashed without enough aura');
  await page.screenshot({ path: 'playtest-shots/int-03b-after-phase.png' });

  // Pause freezes the sim.
  await page.keyboard.press('Escape');
  const p0 = (await st(page)).tick;
  await page.waitForTimeout(800);
  const p1 = (await st(page)).tick;
  await page.screenshot({ path: 'playtest-shots/int-04-paused.png' });
  if (p1 !== p0) fails.push(`pause did not freeze the sim (${p0} → ${p1})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if ((await st(page)).tick <= p1) fails.push('unpause did not resume the sim');

  // Restart (what Enter does on the result screen) starts a fresh match.
  await page.evaluate(() => window.__game.restart());
  await page.waitForTimeout(300);
  const r = await st(page);
  console.log('after restart:', JSON.stringify(r));
  if (r.phase !== 'countdown' || r.round !== 1 || r.hp.some((h) => h !== 100)) fails.push('restart did not reset the match');
  await page.screenshot({ path: 'playtest-shots/int-05-restarted.png' });
} finally {
  await browser.close();
  server.kill();
}
if (errors.length || fails.length) { console.error('SCENARIO FAIL:\n' + [...fails, ...errors].join('\n')); process.exit(1); }
console.log('SCENARIO OK');
process.exit(0);
