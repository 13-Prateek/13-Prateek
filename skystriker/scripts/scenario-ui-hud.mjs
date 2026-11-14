/**
 * HUD + audio scenario (audio/UI session). Feeds fake states/events through the
 * real HUD and audio via the dev bench page and screenshots each key moment.
 *   node scripts/scenario-ui-hud.mjs
 * Output: playtest-shots/ui-*.png, playtest-shots/ui-audio-stress.wav
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const PORT = 4191;
mkdirSync('playtest-shots', { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 3000));

const errors = [];
const fails = [];
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/src/ui/dev/index.html?clean=1`);
  await page.waitForFunction(() => !!window.__hudDev, null, { timeout: 20000 });
  await page.evaluate(() => window.__hudDev.audio.unlock());

  const shot = async (scene, waitMs, name) => {
    await page.evaluate((n) => window.__hudDev.scene(n), scene);
    await page.waitForTimeout(waitMs);
    await page.screenshot({ path: `playtest-shots/ui-${name}.png` });
  };
  const text = (sel) => page.$eval(sel, (e) => e.textContent).catch(() => null);
  /** Wait (up to `ms`) for the big announcer text to read `want`; headless frame pacing varies. */
  const waitAnnounce = (want, ms = 6000) => page.waitForFunction(
    (w) => document.querySelector('.ss-announce .main')?.textContent === w, want, { timeout: ms, polling: 16 },
  ).then(() => true, () => false);

  await page.evaluate(() => window.__hudDev.scene('countdown'));
  if (!(await waitAnnounce('3'))) fails.push('countdown did not show 3');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'playtest-shots/ui-01-countdown-3.png' });
  if (!(await waitAnnounce('2'))) fails.push('countdown did not show 2');
  if (!(await waitAnnounce('1'))) fails.push('countdown did not show 1');
  if (!(await waitAnnounce('FIGHT!'))) fails.push('FIGHT! not shown after countdown');
  await page.waitForTimeout(120);
  await page.screenshot({ path: 'playtest-shots/ui-02-fight.png' });

  await shot('damage', 1000, '03-damage-chip-combo');
  const chip = await page.$eval('.ss-panel.p2 .ss-chip', (e) => e.style.transform);
  const fill = await page.$eval('.ss-panel.p2 .ss-fill', (e) => e.style.transform);
  if (chip === fill) fails.push(`no damage chip visible (chip ${chip}, fill ${fill})`);
  if ((await text('.ss-combo.p1 b')) !== '3') fails.push('combo counter did not reach 3');
  await page.waitForTimeout(2200);
  const sx = (t) => Number(/scaleX\(([\d.]+)\)/.exec(t)?.[1] ?? NaN);
  const chipAfter = await page.$eval('.ss-panel.p2 .ss-chip', (e) => e.style.transform);
  if (Math.abs(sx(chipAfter) - sx(fill)) > 0.01) fails.push(`chip did not drain (${chipAfter} vs ${fill})`);

  await shot('callouts', 450, '04-callouts');
  if ((await page.$$('.ss-callout')).length < 3) fails.push('expected 3 callouts on screen');

  await page.evaluate(() => window.__hudDev.scene('ko'));
  if (!(await waitAnnounce('K.O.'))) fails.push('K.O. not shown');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'playtest-shots/ui-05-ko.png' });
  if (!(await waitAnnounce('KAEL EMBER'))) fails.push('round winner not announced');
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'playtest-shots/ui-06-round-won.png' });

  await page.evaluate(() => window.__hudDev.scene('match'));
  const shown = await page.waitForSelector('.ss-result.on', { timeout: 8000 }).then(() => true, () => false);
  if (!shown) fails.push('match result screen not shown');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'playtest-shots/ui-07-match-result.png' });
  if (!(await text('.ss-result .hint'))?.includes('rematch')) fails.push('no rematch prompt');

  await shot('final', 400, '08-final-round');
  await shot('sd', 500, '09-sudden-death');
  await shot('super', 350, '10-super-banner');
  await shot('pause', 300, '11-pause');

  // Resize: HUD must stay inside the letterboxed world.
  await page.setViewportSize({ width: 1000, height: 900 });
  await shot('fight', 300, '12-letterbox-4x3');
  const box = await page.$eval('.ss-frame', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  if (Math.abs(box.w - 1000) > 1 || Math.abs(box.y - (900 - 562.5) / 2) > 1) fails.push(`HUD frame not letterboxed: ${JSON.stringify(box)}`);

  // Audio: live voices were actually played during the scenes.
  const stats = await page.evaluate(() => window.__hudDev.audioStats());
  console.log('live audio stats:', JSON.stringify(stats));
  if (!stats || stats.played < 10) fails.push('audio played too few voices');

  // Audio: every event's sound on its own is audible and doesn't clip.
  const each = await page.evaluate(() => window.__hudDev.renderEach());
  console.log('per-sound peaks:', JSON.stringify(each));
  for (const [k, v] of Object.entries(each)) {
    if (v < 0.03) fails.push(`sound '${k}' is (nearly) silent: peak ${v}`);
    if (v >= 1) fails.push(`sound '${k}' clips: peak ${v}`);
  }

  // Audio: offline stress render — limiter + voice caps must keep it clean.
  const r = await page.evaluate(() => window.__hudDev.renderOffline(6, true));
  writeFileSync('playtest-shots/ui-audio-stress.wav', Buffer.from(r.wav, 'base64'));
  console.log(`offline stress: peak=${r.peak.toFixed(3)} clippedSamples=${r.clipped} rms=${r.rms.toFixed(3)} stats=${JSON.stringify(r.stats)}`);
  if (r.peak >= 1 || r.clipped > 0) fails.push(`audio clipped: peak ${r.peak}`);
  if (r.rms < 0.02) fails.push(`audio suspiciously quiet: rms ${r.rms}`);
  if (r.stats.peakVoices > 28) fails.push('voice cap exceeded');
} finally {
  await browser.close();
  server.kill();
}
const all = [...errors.map((e) => `console: ${e}`), ...fails];
if (all.length) { console.error('UI SCENARIO FAIL:\n' + all.join('\n')); process.exit(1); }
console.log('UI SCENARIO OK — screenshots in playtest-shots/ui-*.png');
process.exit(0);
