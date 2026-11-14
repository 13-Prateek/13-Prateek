---
name: playtest-verify
description: How to prove a Skystriker change works in a real headless browser - build, smoke test, scripted Playwright scenarios, screenshots and frame-time checks. Use before claiming any gameplay, visual or audio-trigger change is done.
---

# Playtest verification

Chromium + Playwright are preinstalled (`require('playwright')` works; never run `playwright install`).

## Baseline
```bash
cd skystriker && npm run build && npm run smoke
```
Then open `playtest-shots/*.png` with the Read tool and **describe what you see**. If it looks wrong, it is wrong.

## Scripted scenarios
`window.__game` exposes `state()`, `setPaused(bool)` and `stop()` (see `src/main.ts`). Write focused scripts in `skystriker/scripts/` (e.g. `scripts/scenario-kick.mjs`) that:
1. Start `vite preview` (spawn `node node_modules/vite/bin/vite.js preview --port <p> --strictPort`, and kill it plus `process.exit` at the end).
2. Drive keys with `page.keyboard.down/up` and timed waits, or read state with `page.evaluate`.
3. Assert outcomes from state (hp changed, ball.owner set, phase transitions).
4. Take screenshots at key moments (mid-kick, hit, KO). Use deviceScaleFactor 1 for your own checks.

Launch Chromium with `['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']` so WebGL works headless.

## Frame-time check (render work)
In the page, measure `requestAnimationFrame` deltas for 5 s during busy action and report p50/p95. Headless swiftshader is slower than a real GPU, so watch for **spikes** (GC hitches) rather than the absolute FPS.

## Report
In your handoff, list which scenarios you ran, their results, and what the screenshots showed.
