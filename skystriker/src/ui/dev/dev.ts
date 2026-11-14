/**
 * HUD + audio + input test bench (dev only, not part of the production build).
 * Open with `npm run dev` → http://localhost:5173/src/ui/dev/index.html
 * Optional query: ?scene=<name> to start in a scene, ?clean=1 to hide the panel.
 *
 * Feeds FAKE MatchStates and GameEvents into the real HUD and audio, and runs
 * the real keyboard/mouse input with a stand-in fighter so aim can be checked.
 */
import { createAudio, createEngine } from '../../audio';
import { computeFit, createKeyboardInput } from '../../input';
import { FIGHTER_ACCEL, FIGHTER_DRAG, FIGHTER_MAX_SPEED, SIM_DT, WORLD_H, WORLD_W, sec } from '../../shared/constants';
import { HEROES } from '../../shared/heroes';
import type { Element, GameEvent, MatchState, PlayerId } from '../../shared/types';
import { createHud } from '..';
import { hex } from '../model';
import { fakeHit, fakeState, fakeTick } from './fake';

const params = new URLSearchParams(location.search);
const hud = createHud(document.getElementById('ui')!);
const audio = createAudio();
const input = createKeyboardInput(window);
const unlock = () => audio.unlock();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

let s: MatchState = fakeState();
let paused = false;
input.onMenu((a) => {
  if (a === 'pause') { paused = !paused; hud.setPaused(paused); }
  if (a === 'rematch' && s.phase === 'matchOver') scenes.countdown();
});

/* ------------------------------ timeline ------------------------------ */
let clock = 0;
let timeline: Array<{ at: number; fn: () => void }> = [];
const at = (secs: number, fn: () => void) => timeline.push({ at: clock + secs, fn });
const fire = (events: GameEvent[]) => {
  if (!events.length) return;
  hud.onEvents(events, s);
  audio.onEvents(events, s);
};

const P = (id: PlayerId) => s.fighters[id];
const callout = (text: string, player: PlayerId | null, tier: 1 | 2 | 3): GameEvent => ({ type: 'callout', text, player, tier });

function reset() {
  s = fakeState();
  timeline = [];
  paused = false;
  hud.setPaused(false);
}
function playing(secondsLeft = 74) {
  reset();
  s.phase = 'playing';
  s.phaseTimer = sec(secondsLeft);
}

const scenes: Record<string, () => void> = {
  countdown() { reset(); fire([{ type: 'roundStart', round: 1 }]); },
  final() {
    reset(); s.wins = [1, 1]; s.round = 3; s.fighters[0].aura = 140; s.fighters[1].aura = 300;
    fire([{ type: 'roundStart', round: 3 }]);
  },
  fight() { playing(); P(0).aura = 60; P(1).aura = 120; },
  damage() {
    playing(57);
    P(0).hp = 72; P(0).aura = 230; P(0).infused = true;
    P(1).hp = 64; P(1).aura = 100;
    s.wins = [1, 0]; s.round = 2;
    at(0.05, () => fire([...fakeHit(s, 0, 14, 1), callout('BANK SHOT!', 0, 1)]));
    at(0.4, () => fire(fakeHit(s, 0, 11, 2)));
    at(0.75, () => fire([...fakeHit(s, 0, 9, 3), callout('3 HIT COMBO!', 0, 2)]));
  },
  callouts() {
    playing(41);
    P(0).hp = 55; P(1).hp = 47; P(0).aura = 300; P(1).aura = 180;
    fire([callout('DOUBLE BANK!', null, 3)]);
    at(0.15, () => fire([callout('CLOSE CALL!', 1, 1)]));
    at(0.3, () => fire([callout('PERFECT!', 0, 2), { type: 'kick', player: 0, pos: { ...P(0).pos }, dir: { x: 1, y: 0 }, speed: 2000, power: 1, perfect: true, curve: false, element: null }]));
  },
  ko() {
    playing(23);
    P(0).hp = 41; P(1).hp = 12; P(0).aura = 200; P(1).aura = 90;
    at(0.1, () => fire(fakeHit(s, 0, 15, 1)));
    at(1.6, () => { s.wins[0]++; fire([{ type: 'roundEnd', winner: 0 }]); });
  },
  match() {
    playing(31);
    s.wins = [1, 1]; s.round = 3;
    P(0).hp = 9; P(1).hp = 63; P(1).aura = 250;
    at(0.1, () => fire(fakeHit(s, 1, 16, 1)));
    at(1.6, () => { s.wins[1]++; fire([{ type: 'roundEnd', winner: 1 }]); });
    at(1.7, () => { s.phase = 'matchOver'; fire([{ type: 'matchEnd', winner: 1 }]); });
  },
  timeout() {
    playing(4);
    P(0).hp = 58; P(1).hp = 31;
    at(4.05, () => { s.phase = 'roundOver'; s.phaseTimer = sec(2.5); s.wins[0]++; fire([{ type: 'roundEnd', winner: 0 }]); });
  },
  sd() {
    playing(0);
    P(0).hp = 40; P(1).hp = 40;
    s.suddenDeath = true;
    fire([{ type: 'suddenDeath' }]);
  },
  super() {
    playing(50);
    P(0).aura = 300;
    fire([{ type: 'superStart', player: 0, element: 'fire', name: HEROES.kael.superName }]);
    at(0.05, () => { P(0).aura = 0; });
  },
  pause() { playing(62); P(0).hp = 80; P(1).hp = 55; paused = true; hud.setPaused(true); },
  demo() {
    // A whole scripted round: countdown → exchanges → KO → round 2 countdown.
    reset();
    fire([{ type: 'roundStart', round: 1 }]);
    const t0 = 3.2;
    const kick = (p: PlayerId, power: number, extra: Partial<Extract<GameEvent, { type: 'kick' }>> = {}): GameEvent =>
      ({ type: 'kick', player: p, pos: { ...P(p).pos }, dir: { x: p === 0 ? 1 : -1, y: 0 }, speed: 900 + 800 * power, power, perfect: false, curve: false, element: null, ...extra });
    at(t0 + 0.4, () => fire([kick(0, 0.2)]));
    at(t0 + 0.7, () => fire([{ type: 'bounce', pos: { x: 1560, y: 300 }, normal: { x: -1, y: 0 }, speed: 900 }]));
    at(t0 + 1.0, () => fire([...fakeHit(s, 0, 9), callout('BANK SHOT!', 0, 1)]));
    at(t0 + 1.6, () => fire([{ type: 'dash', player: 1, pos: { ...P(1).pos }, dir: { x: -1, y: 0 } }]));
    at(t0 + 1.9, () => fire([{ type: 'kickStart', player: 1, charge: 0 }]));
    at(t0 + 2.9, () => fire([{ type: 'chargeFull', player: 1 }]));
    at(t0 + 3.1, () => fire([kick(1, 1)]));
    at(t0 + 3.35, () => fire([{ type: 'closeCall', player: 0, pos: { ...P(0).pos } }, callout('CLOSE CALL!', 0, 1)]));
    at(t0 + 3.4, () => { P(0).aura = 100; fire([{ type: 'auraBar', player: 0, bars: 1 }]); });
    at(t0 + 4.0, () => { P(0).infused = true; fire([{ type: 'infuse', player: 0, element: 'fire' }]); });
    at(t0 + 4.4, () => { P(0).infused = false; fire([kick(0, 0.8, { perfect: true, element: 'fire' }), callout('PERFECT!', 0, 2)]); });
    at(t0 + 4.7, () => fire(fakeHit(s, 0, 18, 1)));
    at(t0 + 4.95, () => fire([...fakeHit(s, 0, 12, 2), { type: 'wallSplat', target: 1, pos: { x: 1560, y: 450 }, normal: { x: -1, y: 0 }, damage: 5 }]));
    at(t0 + 5.2, () => fire([...fakeHit(s, 0, 10, 3), callout('3 HIT COMBO!', 0, 2)]));
    at(t0 + 6.0, () => fire([{ type: 'clash', pos: { x: 800, y: 450 }, winner: 0 }, callout('CLASH!', null, 2)]));
    at(t0 + 6.6, () => fire([...fakeHit(s, 0, 60, 1)]));
    at(t0 + 8.2, () => { s.wins[0]++; fire([{ type: 'roundEnd', winner: 0 }]); });
  },
};

/* ------------------------------ fake fighter for input ------------------------------ */
const canvas = document.createElement('canvas');
document.getElementById('app')!.appendChild(canvas);
const g = canvas.getContext('2d')!;
let lastAim = { x: 0, y: 0 };
let lastFrameText = '';

function stepPlayer() {
  const f = input.sample(s, 0);
  lastAim = { x: f.aimX, y: f.aimY };
  const me = P(0);
  me.vel.x += f.moveX * FIGHTER_ACCEL * SIM_DT;
  me.vel.y += f.moveY * FIGHTER_ACCEL * SIM_DT;
  const d = Math.exp(-FIGHTER_DRAG * SIM_DT);
  me.vel.x *= d; me.vel.y *= d;
  const sp = Math.hypot(me.vel.x, me.vel.y);
  if (sp > FIGHTER_MAX_SPEED) { me.vel.x *= FIGHTER_MAX_SPEED / sp; me.vel.y *= FIGHTER_MAX_SPEED / sp; }
  me.pos.x = Math.min(s.arena.right, Math.max(s.arena.left, me.pos.x + me.vel.x * SIM_DT));
  me.pos.y = Math.min(s.arena.bottom, Math.max(s.arena.top, me.pos.y + me.vel.y * SIM_DT));
  const on = (['kick', 'trap', 'dash', 'infuse', 'guard', 'super'] as const).filter((k) => f[k]);
  lastFrameText = `move (${f.moveX.toFixed(2)}, ${f.moveY.toFixed(2)})  aim (${f.aimX.toFixed(2)}, ${f.aimY.toFixed(2)})  held: ${on.join(' ') || '-'}  device: ${input.lastDevice()}`;
}

function draw() {
  const w = window.innerWidth, h = window.innerHeight, dpr = window.devicePixelRatio || 1;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const fit = computeFit(w, h);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#05060d';
  g.fillRect(0, 0, w, h);
  g.setTransform(dpr * fit.scale, 0, 0, dpr * fit.scale, dpr * fit.offsetX, dpr * fit.offsetY);
  g.strokeStyle = '#121a33';
  g.lineWidth = 1;
  for (let x = 0; x <= WORLD_W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, WORLD_H); g.stroke(); }
  for (let y = 0; y <= WORLD_H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(WORLD_W, y); g.stroke(); }
  const a = s.arena;
  g.strokeStyle = '#2b3a67';
  g.lineWidth = 3;
  g.strokeRect(a.left, a.top, a.right - a.left, a.bottom - a.top);
  for (const f of s.fighters) {
    g.strokeStyle = hex(HEROES[f.heroId].color);
    g.lineWidth = 5;
    g.shadowColor = g.strokeStyle;
    g.shadowBlur = 16;
    g.beginPath(); g.arc(f.pos.x, f.pos.y, 34, 0, Math.PI * 2); g.stroke();
  }
  g.shadowBlur = 0;
  const me = P(0);
  if (lastAim.x || lastAim.y) {
    g.strokeStyle = '#ffffffaa';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(me.pos.x, me.pos.y); g.lineTo(me.pos.x + lastAim.x * 140, me.pos.y + lastAim.y * 140); g.stroke();
  }
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(800, 450, 18, 0, Math.PI * 2); g.fill();
}

/* ------------------------------ main loop ------------------------------ */
let acc = 0;
let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (!paused) {
    acc += dt;
    while (acc >= SIM_DT) {
      acc -= SIM_DT;
      clock += SIM_DT;
      fire(fakeTick(s));
      stepPlayer();
      const due = timeline.filter((e) => e.at <= clock);
      timeline = timeline.filter((e) => e.at > clock);
      due.forEach((e) => e.fn());
    }
  }
  draw();
  hud.update(s);
  const iv = document.getElementById('inputview');
  if (iv) iv.textContent = lastFrameText;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ------------------------------ sound board ------------------------------ */
const pos = (p: PlayerId) => ({ ...P(p).pos });
const SOUNDS: Record<string, () => GameEvent[]> = {
  'Snap kick': () => [{ type: 'kick', player: 0, pos: pos(0), dir: { x: 1, y: 0 }, speed: 900, power: 0.1, perfect: false, curve: false, element: null }],
  'Power kick': () => [{ type: 'kick', player: 0, pos: pos(0), dir: { x: 1, y: 0 }, speed: 1700, power: 1, perfect: false, curve: false, element: null }],
  'Curve kick': () => [{ type: 'kick', player: 0, pos: pos(0), dir: { x: 1, y: 0 }, speed: 1200, power: 0.5, perfect: false, curve: true, element: null }],
  'Charge (hold 1s)': () => {
    at(1.0, () => fire([{ type: 'chargeFull', player: 0 }]));
    at(1.25, () => fire(SOUNDS['Power kick']()));
    return [{ type: 'kickStart', player: 0, charge: 0 }];
  },
  Perfect: () => [{ type: 'kick', player: 0, pos: pos(0), dir: { x: 1, y: 0 }, speed: 2200, power: 0.7, perfect: true, curve: false, element: null }, callout('PERFECT!', 0, 2)],
  Bounce: () => [{ type: 'bounce', pos: { x: 1560, y: 300 }, normal: { x: -1, y: 0 }, speed: 1100 }],
  Hit: () => fakeHit(s, 0, 12, 1),
  'Combo x3': () => {
    at(0.25, () => fire(fakeHit(s, 0, 9, 2)));
    at(0.5, () => fire(fakeHit(s, 0, 7, 3)));
    return fakeHit(s, 0, 12, 1);
  },
  'Wall splat': () => [{ type: 'wallSplat', target: 1, pos: { x: 1560, y: 450 }, normal: { x: -1, y: 0 }, damage: 5 }],
  Clash: () => [{ type: 'clash', pos: { x: 800, y: 450 }, winner: 0 }, callout('CLASH!', null, 2)],
  'Close call': () => [{ type: 'closeCall', player: 0, pos: pos(0) }, callout('CLOSE CALL!', 0, 1)],
  Dash: () => [{ type: 'dash', player: 0, pos: pos(0), dir: { x: 1, y: 0 } }],
  Trap: () => [{ type: 'trap', player: 0, pos: pos(0) }],
  'Aura bar': () => { P(0).aura = Math.min(300, Math.floor(P(0).aura / 100) * 100 + 100); return [{ type: 'auraBar', player: 0, bars: Math.round(P(0).aura / 100) }]; },
  KO: () => fakeHit(s, 0, 100, 1),
  'Super': () => [{ type: 'superStart', player: 0, element: 'fire', name: HEROES.kael.superName }],
  'Sudden death': () => { s.suddenDeath = true; return [{ type: 'suddenDeath' }]; },
};

function buildBench() {
  const bench = document.getElementById('bench')!;
  if (params.get('clean') === '1') bench.classList.add('hidden');
  const section = (title: string) => {
    const h = document.createElement('h4'); h.textContent = title; bench.appendChild(h);
    const row = document.createElement('div'); row.className = 'row'; bench.appendChild(row);
    return row;
  };
  const btn = (row: HTMLElement, label: string, fn: () => void) => {
    const b = document.createElement('button'); b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); fn(); (b as HTMLButtonElement).blur(); });
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    row.appendChild(b);
  };
  const sc = section('HUD scenes (click, then watch the screen)');
  for (const name of Object.keys(scenes)) btn(sc, name, () => scenes[name]());
  const sb = section('Sounds (each also drives the HUD)');
  for (const [name, mk] of Object.entries(SOUNDS)) btn(sb, name, () => { if (s.phase !== 'playing') playing(); fire(mk()); });
  for (const el of ['fire', 'frost', 'volt', 'stone'] as Element[]) btn(sb, `Infuse ${el}`, () => fire([{ type: 'infuse', player: 0, element: el }]));
  const mu = section('Music intensity / volume');
  for (const l of [0, 1, 2] as const) btn(mu, `Music ${l}`, () => audio.setMusicIntensity(l));
  const vol = document.createElement('input');
  vol.type = 'range'; vol.min = '0'; vol.max = '1'; vol.step = '0.05'; vol.value = '0.8';
  vol.addEventListener('input', () => audio.setMasterVolume(Number(vol.value)));
  mu.appendChild(document.createTextNode(' Volume '));
  mu.appendChild(vol);
  const help = document.createElement('div');
  help.id = 'inputview';
  bench.appendChild(help);
  const tip = document.createElement('div');
  tip.style.cssText = 'margin-top:4px;color:#7f95c8';
  tip.textContent = 'WASD fly the orange ring · mouse aims (white line) · J/LMB kick · K/RMB trap · Space/Shift dash · E/Q/R · Esc/P pause · H hides this panel';
  bench.appendChild(tip);
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyH') bench.classList.toggle('hidden'); });
}
buildBench();

/* ------------------------------ automation hooks ------------------------------ */
function encodeWav(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true); out.setUint32(24, sr, true);
  out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); str(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { out.setInt16(o, Math.max(-1, Math.min(1, data[c][i])) * 0x7fff, true); o += 2; }
  const bytes = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Render a deliberately overloaded 6 s fight offline (music at max intensity,
 * a hit + kick + several bounces every few frames, clash, perfect, KO) and
 * measure the master output, to prove the limiter and voice caps hold.
 */
async function renderOffline(seconds = 6, wav = false) {
  const sr = 44100;
  const ctx = new OfflineAudioContext(2, sr * seconds, sr);
  const eng = createEngine(ctx);
  eng.mixer.setMaster(1, 0);
  eng.setIntensity(2);
  eng.music.start(0);
  eng.music.scheduleUntil(seconds);
  const st = fakeState();
  st.phase = 'playing';
  const ev = (t: number, e: GameEvent[]) => eng.handleEvents(e, st, t);
  ev(0.05, [{ type: 'countdown', secondsLeft: 1 }]);
  ev(0.4, [{ type: 'fight' }]);
  for (let t = 1.2; t < 4.2; t += 1 / 30) {
    const k = Math.round(t * 30);
    ev(t, [{ type: 'bounce', pos: { x: 40 + (k * 97) % 1500, y: 40 }, normal: { x: 0, y: 1 }, speed: 1600 }]);
    if (k % 3 === 0) ev(t, [{ type: 'kick', player: (k % 2) as PlayerId, pos: { x: 400, y: 450 }, dir: { x: 1, y: 0 }, speed: 1700, power: 1, perfect: k % 9 === 0, curve: k % 4 === 0, element: k % 5 === 0 ? 'fire' : null }]);
    if (k % 4 === 0) ev(t, [{ type: 'hit', target: 1, attacker: 0, pos: { x: 1200, y: 450 }, damage: 18, speed: 1700, bank: 2, combo: 1 + (k % 4), element: k % 8 === 0 ? 'volt' : null }]);
    if (k % 10 === 0) ev(t, [{ type: 'wallSplat', target: 1, pos: { x: 1560, y: 450 }, normal: { x: -1, y: 0 }, damage: 5 }]);
  }
  ev(3.0, [{ type: 'clash', pos: { x: 800, y: 450 }, winner: 0 }, { type: 'closeCall', player: 0, pos: { x: 400, y: 450 } }]);
  ev(4.4, [{ type: 'ko', loser: 1, pos: { x: 1200, y: 450 } }]);
  const buf = await ctx.startRendering();
  let peak = 0, clipped = 0, sumSq = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sumSq += d[i] * d[i];
    }
  }
  const rms = Math.sqrt(sumSq / (buf.length * buf.numberOfChannels));
  return { peak, clipped, rms, stats: { ...eng.mixer.stats }, wav: wav ? encodeWav(buf) : undefined };
}

/** Render each event type alone (no music) and report its peak, so a silent or clipping recipe is caught. */
async function renderEach() {
  const st = fakeState();
  st.phase = 'playing';
  const p0 = { x: 400, y: 450 };
  const cases: Record<string, GameEvent[]> = {
    kickSnap: [{ type: 'kick', player: 0, pos: p0, dir: { x: 1, y: 0 }, speed: 900, power: 0.1, perfect: false, curve: false, element: null }],
    kickPower: [{ type: 'kick', player: 0, pos: p0, dir: { x: 1, y: 0 }, speed: 1700, power: 1, perfect: false, curve: true, element: 'fire' }],
    perfect: [{ type: 'kick', player: 0, pos: p0, dir: { x: 1, y: 0 }, speed: 2200, power: 0.6, perfect: true, curve: false, element: null }],
    chargeWhine: [{ type: 'kickStart', player: 0, charge: 0 }],
    chargeFull: [{ type: 'chargeFull', player: 0 }],
    bounce: [{ type: 'bounce', pos: p0, normal: { x: 1, y: 0 }, speed: 900 }],
    hit: [{ type: 'hit', target: 1, attacker: 0, pos: p0, damage: 12, speed: 1300, bank: 0, combo: 1, element: null }],
    wallSplat: [{ type: 'wallSplat', target: 1, pos: p0, normal: { x: 1, y: 0 }, damage: 5 }],
    clash: [{ type: 'clash', pos: p0, winner: 0 }],
    closeCall: [{ type: 'closeCall', player: 0, pos: p0 }],
    dash: [{ type: 'dash', player: 0, pos: p0, dir: { x: 1, y: 0 } }],
    trap: [{ type: 'trap', player: 0, pos: p0 }],
    infuseFrost: [{ type: 'infuse', player: 0, element: 'frost' }],
    infuseVolt: [{ type: 'infuse', player: 0, element: 'volt' }],
    infuseStone: [{ type: 'infuse', player: 0, element: 'stone' }],
    auraBar: [{ type: 'auraBar', player: 0, bars: 2 }],
    countdown: [{ type: 'countdown', secondsLeft: 3 }],
    fight: [{ type: 'fight' }],
    ko: [{ type: 'ko', loser: 1, pos: p0 }],
    roundEnd: [{ type: 'roundEnd', winner: 0 }],
    matchEnd: [{ type: 'matchEnd', winner: 0 }],
    superStart: [{ type: 'superStart', player: 0, element: 'fire', name: 'X' }],
    suddenDeath: [{ type: 'suddenDeath' }],
  };
  const out: Record<string, number> = {};
  for (const [name, events] of Object.entries(cases)) {
    const ctx = new OfflineAudioContext(2, 44100 * 3, 44100);
    const eng = createEngine(ctx);
    eng.mixer.setMaster(0.8, 0);
    eng.handleEvents(events, st, 0.02);
    const buf = await ctx.startRendering();
    let peak = 0;
    for (let c = 0; c < 2; c++) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    out[name] = Math.round(peak * 1000) / 1000;
  }
  return out;
}

(window as unknown as { __hudDev: unknown }).__hudDev = {
  renderEach,
  scene: (name: string) => { scenes[name](); },
  scenes: Object.keys(scenes),
  state: () => s,
  fire,
  audio,
  renderOffline,
  audioStats: () => audio.engine()?.mixer.stats ?? null,
};

const start = params.get('scene');
if (start && scenes[start]) scenes[start]();
else scenes.countdown();
