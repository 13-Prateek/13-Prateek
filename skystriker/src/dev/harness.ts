/**
 * DEV ONLY: VFX lab. Open /src/dev/vfx.html with `npm run dev`.
 * Plays scripted scenes through the real renderer using a fake sim.
 * URL: ?scene=<id> · ?manual=1 (only advances via __vfx.step) · ?lowfx=1 · ?hud=0
 */
import { SIM_DT } from '../shared/constants';
import type { MatchState } from '../shared/types';
import { createRenderer } from '../render';
import { FakeSim } from './fakeSim';
import { SCENES, type Scene } from './scenes';

const params = new URLSearchParams(location.search);
const host = document.getElementById('app')!;
const panel = document.getElementById('panel')!;

const renderer = await createRenderer(host);
window.addEventListener('resize', () => renderer.resize(window.innerWidth, window.innerHeight));

const sim = new FakeSim();
let prev: MatchState = structuredClone(sim.state);
let scene: Scene = SCENES.find((s) => s.id === params.get('scene')) ?? SCENES[1];
let mem: Record<string, number> = {};
/** Event types seen since the scene started (for automation). */
let seen: string[] = [];
let t = 0;
let acc = 0;
let paused = false;
let slow = false;
let loop = true;
let showcase = params.get('scene') === 'all';
let manual = params.get('manual') === '1';
if (params.get('hud') === '0') panel.classList.add('hidden');

function play(s: Scene): void {
  scene = s;
  sim.reset();
  s.setup(sim);
  prev = structuredClone(sim.state);
  mem = {};
  seen = [];
  t = 0;
  acc = 0;
  drawPanel();
}

function tick(): void {
  prev = structuredClone(sim.state);
  scene.script(sim, t, mem);
  const events = sim.step();
  t++;
  if (events.length) {
    renderer.onEvents(events, sim.state);
    for (const e of events) { seen.push(e.type); if (e.type === 'kick' && e.perfect) seen.push('perfect'); }
  }
  if (t >= scene.ticks) {
    if (showcase) play(SCENES[(SCENES.indexOf(scene) + 1) % SCENES.length]);
    else if (loop) play(scene);
  }
}

/** Advance real time `dt` seconds (sim ticks at 60 Hz) and draw. */
function advance(dt: number): void {
  if (!paused) {
    acc += dt * (slow ? 0.25 : 1);
    while (acc >= SIM_DT) { acc -= SIM_DT; tick(); }
  }
  renderer.render(prev, sim.state, paused ? 1 : acc / SIM_DT, dt * (slow ? 0.25 : 1));
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!manual) advance(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function drawPanel(): void {
  panel.innerHTML = '';
  const h = document.createElement('h1');
  h.textContent = 'SKYSTRIKER VFX LAB';
  panel.appendChild(h);
  SCENES.forEach((s, i) => {
    const b = document.createElement('button');
    b.textContent = `${i < 9 ? i + 1 : i === 9 ? 0 : '-'} ${s.label}`;
    if (s === scene && !showcase) b.className = 'on';
    b.onclick = () => { showcase = false; play(s); };
    panel.appendChild(b);
  });
  const mk = (label: string, on: boolean, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (on) b.className = 'on';
    b.onclick = () => { fn(); drawPanel(); };
    panel.appendChild(b);
  };
  mk('A Showcase all', showcase, () => { showcase = !showcase; if (showcase) play(SCENES[0]); });
  mk('S Slow-mo ×0.25', slow, () => { slow = !slow; });
  mk('L Loop', loop, () => { loop = !loop; });
  mk('Space Pause', paused, () => { paused = !paused; });
  const look = document.createElement('div');
  look.id = 'look';
  look.textContent = `▶ ${scene.label}: ${scene.look}`;
  panel.appendChild(look);
  const keys = document.createElement('div');
  keys.id = 'keys';
  keys.textContent = 'Keys: 1-9, 0, - pick a scene · R replay · A showcase · S slow-mo · Space pause · H hide panel · add ?lowfx=1 to the URL to turn off glow';
  panel.appendChild(keys);
}

window.addEventListener('keydown', (e) => {
  const order = '1234567890-';
  const i = order.indexOf(e.key);
  if (i >= 0 && i < SCENES.length) { showcase = false; play(SCENES[i]); return; }
  if (e.key === 'r' || e.key === 'R') play(scene);
  else if (e.key === 'a' || e.key === 'A') { showcase = !showcase; if (showcase) play(SCENES[0]); }
  else if (e.key === 's' || e.key === 'S') { slow = !slow; drawPanel(); }
  else if (e.key === 'l' || e.key === 'L') { loop = !loop; drawPanel(); }
  else if (e.key === 'h' || e.key === 'H') panel.classList.toggle('hidden');
  else if (e.key === ' ') { paused = !paused; drawPanel(); e.preventDefault(); }
});

play(scene);

/** Automation hooks (Playwright scenarios in src/dev/shots.mjs). */
(window as unknown as { __vfx: unknown }).__vfx = {
  scenes: SCENES.map((s) => s.id),
  play(id: string) { const s = SCENES.find((x) => x.id === id); if (!s) throw new Error('no scene ' + id); showcase = false; play(s); },
  /** Advance n frames of 1/60 s (works in manual mode). */
  step(n = 1) { for (let i = 0; i < n; i++) advance(SIM_DT); },
  setManual(m: boolean) { manual = m; last = performance.now(); },
  setShowcase(on: boolean) { showcase = on; if (on) play(SCENES[0]); },
  /** Step until an event of `type` has been seen (max `limit` frames); returns frames stepped. */
  stepUntil(type: string, limit = 600) {
    let n = 0;
    while (!seen.includes(type) && n < limit) { advance(SIM_DT); n++; }
    return n;
  },
  seen: () => seen.slice(),
  sceneTick: () => t,
  state: () => sim.state,
  particles: () => renderer.debug.particles(),
  tweens: () => renderer.debug.tweens(),
  lowFx: renderer.debug.lowFx,
};
