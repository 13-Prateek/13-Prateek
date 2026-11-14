import { Container, Text, TextStyle } from 'pixi.js';
import { DAMAGE_MAX, FIGHTER_HEIGHT, POWER_KICK_MAX_SPEED } from '../shared/constants';
import { HEROES } from '../shared/heroes';
import type { GameEvent, MatchState } from '../shared/types';
import type { ArenaView } from './arena';
import type { BallView } from './ball';
import type { CameraFx } from './camera';
import type { FighterView } from './fighter';
import { ELEMENT_COLOR, ELEMENT_COLOR_2, FX, mixColor } from './palette';
import { PKind, type ParticlePool, type TweenPool } from './pools';
import { rnd, rrange } from './rng';
import type { FxTextures } from './textures';

/** Hooks into the renderer's screen-space / filter effects. */
export interface ScreenFx {
  flash(color: number, alpha: number, seconds: number): void;
  shockwave(x: number, y: number, strength: number): void;
  chroma(seconds: number): void;
  slowmo(seconds: number): void;
  /** Glow around the screen edges (Final Rush). */
  edgeFlash(color: number, alpha: number, seconds: number): void;
}

const NUMBERS = 8;

/** Pooled floating damage numbers (world space). Text is re-rasterised only on hits. */
class DamageNumbers {
  readonly container = new Container();
  private readonly texts: Text[] = [];
  private readonly life = new Float32Array(NUMBERS);
  private readonly vy = new Float32Array(NUMBERS);
  private next = 0;

  constructor() {
    for (let i = 0; i < NUMBERS; i++) {
      const t = new Text({
        text: '0',
        style: new TextStyle({
          fontFamily: 'Arial Black, Arial, sans-serif', fontWeight: '900', fontSize: 40, fill: 0xffffff,
          stroke: { color: 0x000000, width: 7, join: 'round' }, fontStyle: 'italic',
        }),
      });
      t.anchor.set(0.5);
      t.visible = false;
      this.texts.push(t);
      this.container.addChild(t);
    }
  }

  spawn(x: number, y: number, value: number, color: number, big: boolean): void {
    const i = this.next;
    this.next = (this.next + 1) % NUMBERS;
    const t = this.texts[i];
    t.text = String(Math.round(value));
    t.style.stroke = { color, width: 7, join: 'round' };
    t.position.set(x + rrange(-14, 14), y);
    t.rotation = rrange(-0.12, 0.12);
    t.visible = true;
    t.alpha = 1;
    this.life[i] = 0.85;
    this.vy[i] = big ? -170 : -120;
    t.scale.set(big ? 1.9 : 1.5);
    t.zIndex = big ? 1 : 0;
  }

  update(dt: number): void {
    for (let i = 0; i < NUMBERS; i++) {
      if (this.life[i] <= 0) continue;
      const t = this.texts[i];
      this.life[i] -= dt;
      if (this.life[i] <= 0) { t.visible = false; continue; }
      const age = 0.85 - this.life[i];
      // punch in with overshoot, then float up and fade
      const target = age < 0.12 ? 1.25 : 1;
      const s = t.scale.x + (target * (t.zIndex ? 1.25 : 1) - t.scale.x) * Math.min(1, dt * 18);
      t.scale.set(s);
      this.vy[i] *= Math.exp(-3 * dt);
      t.position.y += this.vy[i] * dt;
      t.alpha = this.life[i] < 0.3 ? this.life[i] / 0.3 : 1;
    }
  }
}

/** Turns sim events into particles, rings, decals, flashes, shake and zoom. Never touches state. */
export class Vfx {
  readonly numbers = new DamageNumbers();

  constructor(
    private readonly tx: FxTextures,
    private readonly parts: ParticlePool,
    private readonly add: TweenPool,
    private readonly decals: TweenPool,
    private readonly cam: CameraFx,
    private readonly fighters: [FighterView, FighterView],
    private readonly ball: BallView,
    private readonly arena: ArenaView,
    private readonly screen: ScreenFx,
  ) {}

  /* ---- primitives ---- */

  private burst(x: number, y: number, n: number, color: number, color2: number, sMin: number, sMax: number,
    dir: number, spread: number, life: number, size: number, kind: PKind = PKind.Streak, drag = 4): void {
    for (let i = 0; i < n; i++) {
      const a = dir + (rnd() - 0.5) * 2 * spread;
      const sp = rrange(sMin, sMax);
      this.parts.spawn(kind, x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * rrange(0.6, 1.2), size * rrange(0.7, 1.3), size * 0.2,
        rnd() < 0.5 ? color : color2, drag, 1);
    }
  }

  private ring(x: number, y: number, color: number, r0: number, r1: number, life: number, alpha = 1, soft = false, delay = 0): void {
    const t = soft ? this.tx.ringSoft : this.tx.ring;
    const d = soft ? 256 : 244;
    this.add.spawn(t, x, y, 0, (r0 * 2) / d, (r0 * 2) / d, (r1 * 2) / d, (r1 * 2) / d, alpha, 0, life, color, 3, delay);
  }

  private glowFlash(x: number, y: number, color: number, size: number, life: number, alpha = 1): void {
    this.add.spawn(this.tx.glow, x, y, 0, size / 128, size / 128, (size * 1.3) / 128, (size * 1.3) / 128, alpha, 0, life, color, 2);
  }

  private heroColor(state: Readonly<MatchState>, p: 0 | 1): number {
    return HEROES[state.fighters[p].heroId].color;
  }

  /* ---- events ---- */

  handle(e: GameEvent, state: Readonly<MatchState>): void {
    switch (e.type) {
      case 'kick': {
        const col = e.element ? ELEMENT_COLOR[e.element] : this.heroColor(state, e.player);
        const p = Math.max(0, Math.min(1, e.power));
        const a = Math.atan2(e.dir.y, e.dir.x);
        this.ball.impact(e.dir.x, e.dir.y, 0.55 + 0.45 * p);
        this.ball.flash = 0.06;
        this.burst(e.pos.x, e.pos.y, 10 + Math.round(18 * p), col, 0xffffff, 350, 900 + 700 * p, a, 0.55, 0.3, 14 + 8 * p);
        this.burst(e.pos.x, e.pos.y, 6, col, col, 80, 260, a + Math.PI, 1.0, 0.35, 16, PKind.Dot, 3);
        this.ring(e.pos.x, e.pos.y, mixColor(col, 0xffffff, 0.4), 12, 50 + 70 * p, 0.22, 0.9);
        this.glowFlash(e.pos.x, e.pos.y, col, 90 + 110 * p, 0.12, 0.7);
        this.cam.addTrauma(FX.TRAUMA_KICK + FX.TRAUMA_KICK_POWER * p * p);
        if (p > 0.75) this.cam.zoomPunch(0.015 + 0.02 * p, e.pos.x, e.pos.y);
        if (e.curve) {
          const side = a + Math.PI / 2;
          this.burst(e.pos.x, e.pos.y, 8, 0xffffff, col, 200, 500, side, 0.3, 0.25, 10);
          this.burst(e.pos.x, e.pos.y, 8, 0xffffff, col, 200, 500, side + Math.PI, 0.3, 0.25, 10);
        }
        if (e.element) {
          this.burst(e.pos.x, e.pos.y, 22, ELEMENT_COLOR[e.element], ELEMENT_COLOR_2[e.element], 200, 800, a, 0.9, 0.5, 20, PKind.Dot, 3);
        }
        if (e.perfect) {
          this.ball.flash = 0.14;
          this.ring(e.pos.x, e.pos.y, 0xffffff, 20, 240, 0.35, 1);
          this.ring(e.pos.x, e.pos.y, col, 10, 170, 0.4, 1, true, 0.04);
          this.glowFlash(e.pos.x, e.pos.y, 0xffffff, 240, 0.16, 0.75);
          this.burst(e.pos.x, e.pos.y, 34, 0xffffff, col, 500, 1500, 0, Math.PI, 0.35, 18);
          this.cam.addTrauma(FX.TRAUMA_PERFECT);
          this.cam.zoomPunch(FX.ZOOM_PERFECT, e.pos.x, e.pos.y, 0.08);
          this.screen.chroma(0.12);
          this.screen.flash(0xffffff, 0.14, 0.1);
        }
        break;
      }
      case 'chargeFull': {
        const f = state.fighters[e.player];
        const col = this.heroColor(state, e.player);
        this.fighters[e.player].chargePulse = 1;
        this.ring(f.pos.x, f.pos.y, mixColor(col, 0xffffff, 0.5), 30, 120, 0.3, 1);
        this.burst(f.pos.x, f.pos.y, 16, col, 0xffffff, 300, 600, 0, Math.PI, 0.25, 12);
        break;
      }
      case 'bounce': {
        const k = Math.max(0, Math.min(1, e.speed / POWER_KICK_MAX_SPEED));
        const a = Math.atan2(e.normal.y, e.normal.x);
        const col = this.ball.color;
        this.ball.impact(e.normal.x, e.normal.y, 0.45 + 0.55 * k);
        this.burst(e.pos.x, e.pos.y, 5 + Math.round(16 * k), mixColor(col, 0xffffff, 0.5), col, 150, 300 + 700 * k, a, 1.15, 0.28, 10 + 6 * k);
        this.burst(e.pos.x, e.pos.y, 4, 0x8a93b8, 0x5b7cff, 30, 120, a, 1.3, 0.6, 20 + 10 * k, PKind.Dot, 2);
        // wall segment flares up
        const wx = e.pos.x - e.normal.x * 18, wy = e.pos.y - e.normal.y * 18;
        this.add.spawn(this.tx.glow, wx, wy, a + Math.PI / 2, (140 + 260 * k) / 128, 34 / 128, (220 + 340 * k) / 128, 24 / 128, 0.95, 0, 0.4, mixColor(col, FX.WALL, 0.3), 2);
        if (k > 0.55) this.cam.addTrauma(FX.TRAUMA_BOUNCE_FAST * k);
        break;
      }
      case 'ballNeutral': {
        this.ring(e.pos.x, e.pos.y, 0xdfe8ff, 22, 70, 0.45, 0.55);
        this.burst(e.pos.x, e.pos.y, 8, 0xffffff, 0x9aa6c8, 40, 140, 0, Math.PI, 0.5, 9, PKind.Dot, 2);
        break;
      }
      case 'hit': {
        const victim = this.fighters[e.target];
        const tf = state.fighters[e.target];
        const col = e.element ? ELEMENT_COLOR[e.element] : this.heroColor(state, e.attacker);
        const k = Math.max(0, Math.min(1.5, e.damage / DAMAGE_MAX));
        victim.flash = 0.07;
        victim.sinceHit = 0;
        const kv = Math.hypot(tf.vel.x, tf.vel.y);
        const ka = kv > 1 ? Math.atan2(tf.vel.y, tf.vel.x) : Math.atan2(tf.pos.y - e.pos.y, tf.pos.x - e.pos.x);
        this.burst(e.pos.x, e.pos.y, 24 + Math.round(20 * k), col, 0xffffff, 400, 1100 + 600 * k, ka, 0.8, 0.35, 18 + 8 * k);
        this.burst(e.pos.x, e.pos.y, 14, 0xffffff, col, 200, 700, 0, Math.PI, 0.3, 12);
        this.glowFlash(e.pos.x, e.pos.y, 0xffffff, 140 + 90 * k, 0.12, 0.7);
        this.ring(e.pos.x, e.pos.y, 0xffffff, 16, 120 + 80 * k, 0.24, 1);
        this.ring(e.pos.x, e.pos.y, col, 30, 230 + 120 * k, 0.42, 0.9, true, 0.03);
        this.screen.shockwave(e.pos.x, e.pos.y, 0.6 + 0.4 * k);
        this.cam.addTrauma(FX.TRAUMA_HIT + FX.TRAUMA_HIT_PER_DMG * e.damage);
        this.cam.zoomPunch(FX.ZOOM_HIT * (0.6 + k), e.pos.x, e.pos.y, 0.05);
        this.numbers.spawn(tf.pos.x, tf.pos.y - FIGHTER_HEIGHT * 0.6, e.damage, col, e.damage >= 12 || e.combo >= 2);
        if (e.element) this.burst(e.pos.x, e.pos.y, 26, ELEMENT_COLOR[e.element], ELEMENT_COLOR_2[e.element], 150, 700, 0, Math.PI, 0.6, 22, PKind.Dot, 2.5);
        break;
      }
      case 'wallSplat': {
        const a = Math.atan2(e.normal.y, e.normal.x);
        const victim = this.fighters[e.target];
        const col = this.heroColor(state, e.target);
        victim.flash = 0.06;
        victim.sinceHit = 0;
        const wx = e.pos.x - e.normal.x * 30, wy = e.pos.y - e.normal.y * 30;
        // crack decal on the wall (fades over a couple of seconds)
        this.decals.spawn(this.tx.crack, wx + e.normal.x * 20, wy + e.normal.y * 20, a, 1.25, 1.25, 1.45, 1.45, 1, 0, 2.6, mixColor(FX.WALL, 0xffffff, 0.5), 8);
        this.add.spawn(this.tx.glow, wx, wy, a + Math.PI / 2, 360 / 128, 44 / 128, 480 / 128, 24 / 128, 0.8, 0, 0.45, mixColor(col, 0xffffff, 0.3), 2);
        this.burst(wx, wy, 34, 0xffffff, col, 300, 1100, a, 1.2, 0.35, 16);
        this.burst(wx, wy, 14, 0x8a93b8, 0x5b7cff, 60, 260, a, 1.3, 0.8, 34, PKind.Dot, 2);
        this.ring(wx, wy, 0xffffff, 24, 200, 0.35, 0.9, true);
        this.screen.shockwave(wx, wy, 0.9);
        this.cam.addTrauma(FX.TRAUMA_SPLAT);
        this.cam.zoomPunch(FX.ZOOM_HIT, wx, wy, 0.04);
        this.numbers.spawn(e.pos.x + e.normal.x * 40, e.pos.y - FIGHTER_HEIGHT * 0.6, e.damage, 0xffffff, false);
        break;
      }
      case 'clash': {
        const c0 = this.heroColor(state, 0), c1 = this.heroColor(state, 1);
        this.burst(e.pos.x, e.pos.y, 26, c0, 0xffffff, 400, 1300, 0, Math.PI, 0.4, 16);
        this.burst(e.pos.x, e.pos.y, 26, c1, 0xffffff, 400, 1300, 0, Math.PI, 0.4, 16);
        this.ring(e.pos.x, e.pos.y, 0xffffff, 20, 260, 0.35, 1);
        this.ring(e.pos.x, e.pos.y, e.winner === null ? 0xffffff : this.heroColor(state, e.winner), 10, 180, 0.45, 1, true, 0.05);
        this.glowFlash(e.pos.x, e.pos.y, 0xffffff, 220, 0.2, 0.7);
        this.screen.flash(0xffffff, 0.18, 0.14);
        this.screen.chroma(0.1);
        this.cam.addTrauma(FX.TRAUMA_CLASH);
        this.cam.zoomPunch(FX.ZOOM_CLASH, e.pos.x, e.pos.y, 0.1);
        break;
      }
      case 'closeCall': {
        const f = state.fighters[e.player];
        const bv = state.ball.vel;
        const bl = Math.hypot(bv.x, bv.y) || 1;
        const dx = bv.x / bl, dy = bv.y / bl;
        const a = Math.atan2(dy, dx);
        for (let i = -1; i <= 1; i++) {
          const ox = -dy * i * 26, oy = dx * i * 26;
          this.add.spawn(this.tx.streak, e.pos.x + ox - dx * 40, e.pos.y + oy - dy * 40, a, 1.5, 0.9, 5, 0.5, 0.9, 0, 0.26, 0xffffff, 3, i === 0 ? 0 : 0.03);
        }
        this.ring(f.pos.x, f.pos.y, 0xffffff, 40, 80, 0.25, 0.4);
        break;
      }
      case 'ko': {
        const winner = (1 - e.loser) as 0 | 1;
        const col = this.heroColor(state, winner);
        const lc = this.heroColor(state, e.loser);
        this.fighters[e.loser].flash = 0.12;
        this.fighters[e.loser].sinceHit = 0;
        this.screen.flash(0xffffff, 0.95, 0.55);
        this.screen.slowmo(FX.KO_SLOWMO_SECONDS);
        this.screen.shockwave(e.pos.x, e.pos.y, 1.4);
        this.screen.chroma(0.25);
        this.cam.addTrauma(FX.TRAUMA_KO);
        this.cam.zoomPunch(FX.ZOOM_KO, e.pos.x, e.pos.y, 0.9);
        this.burst(e.pos.x, e.pos.y, 56, col, 0xffffff, 500, 2000, 0, Math.PI, 0.7, 22);
        this.burst(e.pos.x, e.pos.y, 30, lc, 0xffffff, 100, 600, 0, Math.PI, 1.2, 30, PKind.Dot, 1.5);
        this.ring(e.pos.x, e.pos.y, 0xffffff, 30, 420, 0.5, 1);
        this.ring(e.pos.x, e.pos.y, col, 20, 320, 0.6, 1, true, 0.06);
        this.ring(e.pos.x, e.pos.y, 0xffffff, 10, 200, 0.6, 0.8, false, 0.14);
        this.glowFlash(e.pos.x, e.pos.y, 0xffffff, 360, 0.4, 0.8);
        break;
      }
      case 'dash': {
        const col = this.heroColor(state, e.player);
        const a = Math.atan2(e.dir.y, e.dir.x) + Math.PI;
        this.burst(e.pos.x, e.pos.y, 10, col, mixColor(col, 0xffffff, 0.6), 300, 800, a, 0.35, 0.22, 14);
        this.ring(e.pos.x, e.pos.y, mixColor(col, 0xffffff, 0.3), 20, 60, 0.2, 0.6);
        for (let i = -1; i <= 1; i += 2) {
          const ox = -e.dir.y * i * 22, oy = e.dir.x * i * 22;
          this.add.spawn(this.tx.streak, e.pos.x + ox - e.dir.x * 30, e.pos.y + oy - e.dir.y * 30, a + Math.PI, 2.2, 0.8, 4, 0.4, 0.8, 0, 0.2, col, 3);
        }
        break;
      }
      case 'trap': {
        const col = this.heroColor(state, e.player);
        this.ring(e.pos.x, e.pos.y, col, 18, 46, 0.2, 0.9);
        break;
      }
      case 'trapRelease': {
        if (e.forced) {
          const b = state.ball.pos;
          this.burst(b.x, b.y, 12, 0xffffff, this.heroColor(state, e.player), 150, 450, 0, Math.PI, 0.25, 10);
          this.ring(b.x, b.y, 0xffffff, 14, 60, 0.2, 0.8);
        }
        break;
      }
      case 'infuse': {
        const f = state.fighters[e.player];
        const c = ELEMENT_COLOR[e.element], c2 = ELEMENT_COLOR_2[e.element];
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          const r = 70;
          // spiral inward
          this.parts.spawn(PKind.Dot, f.pos.x + Math.cos(a) * r, f.pos.y + Math.sin(a) * r,
            -Math.sin(a) * 260 - Math.cos(a) * 160, Math.cos(a) * 260 - Math.sin(a) * 160, 0.45, 16, 3, i % 2 ? c : c2, 1, 1);
        }
        this.ring(f.pos.x, f.pos.y, c, 90, 30, 0.35, 0.9);
        this.glowFlash(f.pos.x, f.pos.y, c, 200, 0.3, 0.7);
        break;
      }
      case 'superStart': {
        const f = state.fighters[e.player];
        const c = ELEMENT_COLOR[e.element];
        this.screen.flash(c, 0.5, 0.3);
        this.ring(f.pos.x, f.pos.y, c, 30, 360, 0.5, 1, true);
        this.cam.zoomPunch(0.08, f.pos.x, f.pos.y, 0.3);
        this.cam.addTrauma(0.4);
        break;
      }
      case 'heat': {
        const b = state.ball;
        // read the owner from state: the heat event arrives in the same tick as the kick that changed it
        const col = b.element ? ELEMENT_COLOR[b.element] : b.owner !== null ? this.heroColor(state, b.owner) : 0xffffff;
        if (e.level <= 0) {
          // cool-down puff: steam + a soft blue-white ring, the danger is gone
          this.ring(e.pos.x, e.pos.y, 0xa9c8ff, 20, 90, 0.45, 0.55, true);
          this.burst(e.pos.x, e.pos.y, 12, 0xc4cbe0, 0x9fb4ff, 40, 160, 0, Math.PI, 0.7, 22, PKind.Dot, 2);
          this.burst(e.pos.x, e.pos.y, 6, 0xffffff, 0xa9c8ff, 60, 140, -Math.PI / 2, 0.6, 0.5, 10, PKind.Streak, 1.5);
          break;
        }
        const lv = Math.min(FX.HEAT_MAX, e.level);
        const hot = mixColor(col, FX.HEAT_COLOR, 0.1 + 0.1 * lv);
        this.ball.heatUp();
        this.ball.flash = 0.05;
        this.ring(e.pos.x, e.pos.y, hot, 16, 50 + 22 * lv, 0.25, 0.95);
        this.ring(e.pos.x, e.pos.y, 0xffffff, 10, 30 + 14 * lv, 0.18, 0.8, false, 0.03);
        this.burst(e.pos.x, e.pos.y, 6 + 5 * lv, hot, 0xffffff, 200, 420 + 140 * lv, 0, Math.PI, 0.25, 10 + 2 * lv);
        if (lv >= FX.HEAT_MAX) {
          // max heat: the ball becomes a hazard
          this.ring(e.pos.x, e.pos.y, col, 20, 220, 0.45, 0.9, true, 0.04);
          this.glowFlash(e.pos.x, e.pos.y, hot, 200, 0.2, 0.7);
          this.screen.chroma(0.07);
          this.cam.addTrauma(0.15);
        }
        break;
      }
      case 'phaseDash': {
        const f = state.fighters[e.player];
        const col = mixColor(this.heroColor(state, e.player), FX.PHASE_COLOR, 0.55);
        // implosion: the body "drops out of phase"
        this.ring(e.pos.x, e.pos.y, col, 95, 22, 0.22, 0.95);
        this.ring(e.pos.x, e.pos.y, 0xffffff, 60, 14, 0.16, 0.7, false, 0.02);
        const a = Math.atan2(e.dir.y, e.dir.x);
        // scanline streaks fanned across the dash line
        for (let i = -2; i <= 2; i++) {
          const ox = -e.dir.y * i * 14, oy = e.dir.x * i * 14;
          this.add.spawn(this.tx.streak, e.pos.x + ox - e.dir.x * 20, e.pos.y + oy - e.dir.y * 20, a, 1.2, 0.6, 4.5, 0.35, 0.85, 0, 0.3, col, 3, Math.abs(i) * 0.015);
        }
        this.burst(f.pos.x, f.pos.y, 14, 0xffffff, col, 80, 260, a + Math.PI, 1.3, 0.35, 8, PKind.Dot, 3);
        break;
      }
      case 'winded': {
        const f = state.fighters[e.player];
        const sx = f.facing.x >= 0 ? 1 : -1;
        // a heavy "huff" from the head
        this.burst(f.pos.x + sx * 12, f.pos.y - 44, 7, 0xc4cbe0, 0x8a93b8, 40, 130, sx > 0 ? -0.5 : Math.PI + 0.5, 0.7, 0.6, 20, PKind.Dot, 2.5);
        break;
      }
      case 'finalRush': {
        this.arena.pulse = 1;
        this.screen.edgeFlash(FX.WALL_FINAL_RUSH, 0.9, 0.8);
        this.ring(800, 450, FX.WALL_FINAL_RUSH, 80, 950, 0.7, 0.45, true);
        this.cam.addTrauma(0.22);
        break;
      }
      case 'bump': {
        this.ring(e.pos.x, e.pos.y, 0xdfe8ff, 14, 40, 0.18, 0.4);
        break;
      }
      case 'noAura': {
        const f = state.fighters[e.player];
        this.burst(f.pos.x, f.pos.y - 10, 8, 0x6b7290, 0x9aa6c8, 60, 180, 0, Math.PI, 0.25, 8, PKind.Dot, 3);
        break;
      }
      case 'auraBar': {
        this.fighters[e.player].chargePulse = Math.max(this.fighters[e.player].chargePulse, 0.45);
        break;
      }
      case 'fight': {
        this.arena.pulse = 1;
        this.ring(800, 450, 0xffffff, 60, 900, 0.6, 0.35, true);
        break;
      }
      case 'countdown': {
        this.ring(state.ball.pos.x, state.ball.pos.y, 0x5b7cff, 90, 130, 0.5, 0.5);
        break;
      }
      case 'roundStart': {
        this.ball.resetTrail();
        this.arena.pulse = 0.6;
        break;
      }
      case 'suddenDeath': {
        this.arena.pulse = 1;
        this.screen.flash(FX.WALL_SUDDEN_DEATH, 0.3, 0.4);
        this.cam.addTrauma(0.3);
        break;
      }
      default:
        break;
    }
  }
}
