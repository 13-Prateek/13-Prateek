// Integration check (needs the REAL sim merged, e.g. on the lead branch): real sim + render + HUD/audio/input.
// P1 is driven by
// real keyboard + mouse events toward the ball and kicks it at P2. Run after `npm run build`:
//   node scripts/scenario-ui-integ.mjs   → playtest-shots/integ-*.png, exits 1 only on console errors.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 4193;
mkdirSync('playtest-shots', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const log = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__game?.state().tick > 0, null, { timeout: 15000 });
  await page.mouse.click(5, 5); // user gesture → audio unlock
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'playtest-shots/integ-01-countdown.png' });
  await page.waitForFunction(() => window.__game.state().phase === 'playing', null, { timeout: 8000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'playtest-shots/integ-02-fight.png' });

  const S = 0.8; // 1280x720 → world scale
  const held = new Set();
  const setKey = async (k, on) => { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } };
  let shotHit = false, shotKo = false, lastHp = [100, 100], kicks = 0, lastKick = 0, shotCallout = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 100000) {
    const st = await page.evaluate(() => { const s = window.__game.state(); return { phase: s.phase, p: s.fighters[0].pos, q: s.fighters[1].pos, b: s.ball.pos, hp: s.fighters.map((f) => f.hp), wins: s.wins, round: s.round }; });
    if (st.phase === 'matchOver') break;
    if (st.hp[1] < lastHp[1] && !shotHit) {
      await page.waitForTimeout(60);
      await page.screenshot({ path: 'playtest-shots/integ-03-hit.png' });
      shotHit = true;
      log.push(`hit seen: hp ${JSON.stringify(st.hp)}`);
    }
    if (st.phase === 'roundOver' && !shotKo) {
      await page.waitForTimeout(250);
      await page.screenshot({ path: 'playtest-shots/integ-04-ko.png' });
      shotKo = true;
      log.push(`round over: wins ${st.wins}`);
    }
    lastHp = st.hp;
    if (!shotCallout && (await page.$('.ss-callout'))) {
      await page.screenshot({ path: 'playtest-shots/integ-03b-callout.png' });
      shotCallout = true;
      log.push('callout: ' + (await page.$eval('.ss-callout', (e) => e.textContent)));
    }
    // Aim from the ball toward P2; stand behind the ball.
    const dx = st.q.x - st.b.x, dy = st.q.y - st.b.y, dl = Math.hypot(dx, dy) || 1;
    const tx = st.b.x - (dx / dl) * 55, ty = st.b.y - (dy / dl) * 55;
    const mx = tx - st.p.x, my = ty - st.p.y;
    await setKey('KeyD', mx > 15); await setKey('KeyA', mx < -15);
    await setKey('KeyS', my > 15); await setKey('KeyW', my < -15);
    await page.mouse.move(st.q.x * S, st.q.y * S);
    const bx = st.b.x - st.p.x, by = st.b.y - st.p.y;
    const near = Math.hypot(bx, by) < 100;
    const inFront = (bx * dx + by * dy) / dl > 10; // ball is between P1 and P2
    if (near && inFront && st.phase === 'playing' && Date.now() - lastKick > 350) {
      // Aim at P2 *through the ball*: cursor on P2.
      await page.keyboard.down('KeyJ'); await page.waitForTimeout(kicks % 3 === 2 ? 700 : 50); await page.keyboard.up('KeyJ');
      kicks++; lastKick = Date.now();
    }
    await page.waitForTimeout(30);
  }
  for (const k of [...held]) await page.keyboard.up(k);
  const fin = await page.evaluate(() => { const s = window.__game.state(); return { phase: s.phase, wins: s.wins, hp: s.fighters.map((f) => f.hp) }; });
  log.push(`final: ${JSON.stringify(fin)} kicks=${kicks}`);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'playtest-shots/integ-05-end.png' });
  const hud = await page.evaluate(() => ({ result: !!document.querySelector('.ss-result.on'), who: document.querySelector('.ss-result .who')?.textContent, stats: null }));
  log.push(`hud: ${JSON.stringify(hud)}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(log.join('\n'));
if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
process.exit(0);
