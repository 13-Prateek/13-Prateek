/**
 * Gamepad playtest in the REAL game (audio/UI session). Injects a fake navigator.getGamepads
 * before the page loads, then plays with it.
 *   npm run build && node scripts/scenario-ui-gamepad.mjs
 * Checks: the controller toast, a decoy non-standard pad is ignored, a stale mouse cursor
 * doesn't steal aim, left stick moves, RT kicks, A dashes, B phase-dashes, Start pauses
 * (pause screen names the controller), and a non-standard-only pad shows the warning.
 * Screenshots: playtest-shots/pad-*.png
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

/** Runs in the page before any game code. `which`: 'xbox' (decoy vJoy + Xbox) or 'odd' (non-standard only). */
function installFakePads(which) {
  const mk = (index, id, mapping) => ({
    index, id, mapping, connected: true, timestamp: performance.now(), axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  });
  const pads = which === 'odd'
    ? [mk(0, 'USB Gamepad (Vendor: 0079 Product: 0006)', '')]
    : [mk(0, 'vJoy Device (Vendor: 1234 Product: bead)', ''), mk(1, 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', 'standard')];
  const real = pads[pads.length - 1];
  window.__pad = {
    button(i, on) { real.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 }; real.timestamp = performance.now(); },
    axes(a) { real.axes = a.slice(); real.timestamp = performance.now(); },
  };
  Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: () => pads.map((p) => ({ ...p, buttons: p.buttons.map((b) => ({ ...b })), axes: p.axes.slice() })) });
}

const errors = [];
const fails = [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const me = (page) => page.evaluate(() => {
  const s = window.__game.state(), f = s.fighters[0], inp = s.prevInput[0];
  return { phase: s.phase, x: f.pos.x, y: f.pos.y, dashTimer: f.dashTimer, winded: f.winded ?? 0, phase2: f.phaseDashTimer ?? 0, aura: f.aura, inp, paused: window.__game.isPaused() };
});
const until = (page, fn, arg, ms = 2000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 16 }).then(() => true, () => false);

try {
  /* ---------------- Standard pad (with a decoy vJoy listed first) ---------------- */
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(installFakePads, 'xbox');
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForFunction(() => window.__game?.state().tick > 0);
  // The owner clicks the page to focus it: this parks the mouse cursor on the left of the arena.
  await page.mouse.click(120, 400);

  const toast = await until(page, () => document.querySelector('.ss-toast .title')?.textContent?.includes('Xbox Wireless Controller'), null, 4000);
  await page.waitForTimeout(400); // let the toast fade in
  await page.screenshot({ path: 'playtest-shots/pad-01-connected-toast.png' });
  if (!toast) fails.push('no "Controller connected: Xbox Wireless Controller" toast (decoy vJoy picked?)');
  if (await page.$('.ss-toast .warning')) fails.push('standard pad should not show the non-standard warning');

  await page.waitForFunction(() => window.__game.state().phase === 'playing', null, { timeout: 8000 });

  // Left stick right → P1 flies right.
  const x0 = (await me(page)).x;
  await page.evaluate(() => window.__pad.axes([1, 0, 0, 0]));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__pad.axes([0, 0, 0, 0]));
  const x1 = (await me(page)).x;
  if (!(x1 > x0 + 40)) fails.push(`left stick did not move P1 right (${x0.toFixed(0)} → ${x1.toFixed(0)})`);

  // RT = kick; right stick centred → aim must be auto (0,0), not the parked mouse cursor.
  await page.evaluate(() => window.__pad.button(7, true));
  const kicked = await until(page, () => window.__game.state().prevInput[0].kick === true);
  const aim = (await me(page)).inp;
  await page.evaluate(() => window.__pad.button(7, false));
  if (!kicked) fails.push('RT did not send kick');
  if (aim.aimX !== 0 || aim.aimY !== 0) fails.push(`stale mouse cursor stole pad aim: aim=(${aim.aimX}, ${aim.aimY})`);

  // Right stick up → aim up.
  await page.evaluate(() => window.__pad.axes([0, 0, 0, -1]));
  const aimed = await until(page, () => window.__game.state().prevInput[0].aimY < -0.9);
  await page.evaluate(() => window.__pad.axes([0, 0, 0, 0]));
  if (!aimed) fails.push('right stick did not aim');

  // A = dash.
  await page.waitForTimeout(900); // dash cooldown from any earlier dash
  await page.evaluate(() => window.__pad.button(0, true));
  const dashed = await until(page, () => { const f = window.__game.state().fighters[0]; return f.dashTimer > 0 || (f.winded ?? 0) > 0; });
  await page.evaluate(() => window.__pad.button(0, false));
  if (!dashed) fails.push('A did not dash');

  // B = Phase Dash (with no aura the HUD flashes the meter red; with aura the fighter phases).
  await page.waitForTimeout(900);
  await page.evaluate(() => window.__pad.button(1, true));
  const phased = await until(page, () => window.__game.state().prevInput[0].phaseDash === true
    && (((window.__game.state().fighters[0].phaseDashTimer ?? 0) > 0) || !!document.querySelector('.ss-panel.p1 .ss-aurarow.noaura')));
  await page.evaluate(() => window.__pad.button(1, false));
  if (!phased) fails.push('B did not send Phase Dash (no phase and no no-aura flash)');
  await page.screenshot({ path: 'playtest-shots/pad-02-after-phase.png' });

  // Start = pause; the pause screen names the controller.
  await page.evaluate(() => window.__pad.button(9, true));
  const paused = await until(page, () => window.__game.isPaused());
  await page.evaluate(() => window.__pad.button(9, false));
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'playtest-shots/pad-03-pause.png' });
  const line = await page.$eval('.ss-padline', (e) => e.textContent).catch(() => '');
  if (!paused) fails.push('Start did not pause');
  if (!line.includes('Controller: Xbox Wireless Controller')) fails.push(`pause screen controller line wrong: "${line}"`);
  await page.evaluate(() => window.__pad.button(9, true));
  const resumed = await until(page, () => !window.__game.isPaused());
  await page.evaluate(() => window.__pad.button(9, false));
  if (!resumed) fails.push('Start did not resume');
  await page.close();

  /* ---------------- Non-standard pad only: warning ---------------- */
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  p2.on('pageerror', (e) => errors.push(String(e)));
  await p2.addInitScript(installFakePads, 'odd');
  await p2.goto(`http://localhost:${PORT}/`);
  await p2.waitForFunction(() => window.__game?.state().tick > 0);
  const warned = await until(p2, () => document.querySelector('.ss-toast .warning')?.textContent?.includes("isn't in standard mode"), null, 4000);
  await p2.waitForTimeout(300);
  await p2.screenshot({ path: 'playtest-shots/pad-04-nonstandard-warning.png' });
  if (!warned) fails.push('non-standard pad did not show the warning toast');
  await p2.close();

  /* ---------------- No pad: pause screen hint ---------------- */
  const p3 = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await p3.goto(`http://localhost:${PORT}/`);
  await p3.waitForFunction(() => window.__game?.state().tick > 0);
  await p3.keyboard.press('Escape');
  await p3.waitForTimeout(250);
  const none = await p3.$eval('.ss-padline', (e) => e.textContent).catch(() => '');
  if (!none.includes('Press any controller button to connect')) fails.push(`no-pad hint missing: "${none}"`);
  await p3.close();
} finally {
  await browser.close();
  server.kill();
}
const all = [...errors.map((e) => `console: ${e}`), ...fails];
if (all.length) { console.error('GAMEPAD SCENARIO FAIL:\n' + all.join('\n')); process.exit(1); }
console.log('GAMEPAD SCENARIO OK — screenshots in playtest-shots/pad-*.png');
process.exit(0);
