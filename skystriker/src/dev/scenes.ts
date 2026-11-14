/**
 * DEV ONLY: scripted VFX scenes. Each scene sets up a fake state, then a script
 * runs every sim tick (t = ticks since the scene started) to trigger actions.
 */
import { FOOT_REACH } from '../shared/constants';
import type { FakeSim } from './fakeSim';

export interface Scene {
  id: string;
  label: string;
  /** What the playtester should look for. */
  look: string;
  ticks: number;
  setup(sim: FakeSim): void;
  script(sim: FakeSim, t: number, mem: Record<string, number>): void;
}

/** Rally helper: when the ball is coming at `p` and close, `p` returns it toward the other fighter. */
function returnIfClose(sim: FakeSim, p: 0 | 1, yOff: number, power: number): boolean {
  const b = sim.state.ball, f = sim.state.fighters[p], o = sim.state.fighters[1 - p];
  if (b.owner === p || b.mode === 'neutral') return false;
  const toward = (f.pos.x - b.pos.x) * b.vel.x > 0;
  if (!toward || Math.abs(b.pos.x - f.pos.x) > 100) return false;
  sim.kick(p, o.pos.x - b.pos.x, o.pos.y + yOff - b.pos.y, power);
  return true;
}

const place = (sim: FakeSim, p: 0 | 1, x: number, y: number, fx: number, fy = 0) => {
  const f = sim.state.fighters[p];
  f.pos = { x, y };
  f.vel = { x: 0, y: 0 };
  sim.face(p, fx, fy);
};
const ballAt = (sim: FakeSim, x: number, y: number) => {
  const b = sim.state.ball;
  b.pos = { x, y };
  b.vel = { x: 0, y: 0 };
  b.mode = 'neutral';
  b.owner = null;
  b.element = null;
};

export const SCENES: Scene[] = [
  {
    id: 'idle', label: 'Idle flight', ticks: 300,
    look: 'Both fighters fly in loops: bodies lean into the motion, legs trail behind, the aim chevron shows facing. The white ball is calm (no trail).',
    setup(sim) {
      place(sim, 0, 500, 450, 1); place(sim, 1, 1100, 450, -1);
      ballAt(sim, 800, 450);
      sim.state.ball.vel = { x: 60, y: -40 };
    },
    script(sim, t) {
      const a = t / 40;
      sim.move[0].x = Math.cos(a); sim.move[0].y = Math.sin(a);
      sim.move[1].x = -Math.cos(a * 1.3); sim.move[1].y = Math.sin(a * 2.6);
      const f0 = sim.state.fighters[0], f1 = sim.state.fighters[1];
      sim.aimAt(0, f1.pos.x, f1.pos.y); sim.aimAt(1, f0.pos.x, f0.pos.y);
    },
  },
  {
    id: 'kick', label: 'Power kick', ticks: 220,
    look: 'Orange fighter winds up (knee raised, glow grows, sparks pull in), flashes at full charge, then snaps the leg out: big burst, shake, and the ball turns orange with a long trail and bounces with sparks.',
    setup(sim) {
      place(sim, 0, 420, 560, 1, -0.45); place(sim, 1, 1250, 300, -1);
      const f = sim.state.fighters[0];
      ballAt(sim, f.pos.x + f.facing.x * FOOT_REACH, f.pos.y + f.facing.y * FOOT_REACH);
    },
    script(sim, t) {
      if (t === 10) sim.startCharge(0);
      if (t === 84) sim.kick(0, 1, -0.45, 1);
    },
  },
  {
    id: 'hit', label: 'Hit + wall splat', ticks: 170,
    look: 'Orange kicks the ball into blue: blue flashes white, a burst + ring + shockwave ripple, a damage number pops, then blue slams the right wall: crack on the wall, dust, second number.',
    setup(sim) {
      place(sim, 0, 560, 450, 1); place(sim, 1, 1380, 450, -1);
      ballAt(sim, 612, 450);
    },
    script(sim, t) {
      if (t === 20) sim.kick(0, 1, 0, 0.6);
    },
  },
  {
    id: 'perfect', label: 'Perfect return', ticks: 170,
    look: 'Blue fires at orange; orange kicks it back at the last moment: white flash ring, colour split, bigger freeze. The ball turns orange and flies back faster; blue dashes out of the way (afterimages) for a close-call whoosh.',
    setup(sim) {
      place(sim, 1, 1150, 450, -1); place(sim, 0, 430, 450, 1);
      ballAt(sim, 1150 - FOOT_REACH, 450);
    },
    script(sim, t, mem) {
      if (t === 10) sim.kick(1, -1, 0, 0.5);
      const b = sim.state.ball;
      if (t > 12 && !mem.done && b.owner === 1 && b.pos.x < 540) { mem.done = 1; sim.kick(0, 1, -0.06, 0.6, { perfect: true }); }
      if (mem.done === 1 && b.pos.x > 930) { mem.done = 2; sim.dash(1, 0.2, -1); }
    },
  },
  {
    id: 'clash', label: 'Clash', ticks: 150,
    look: 'Both fighters charge and kick the ball at the same instant: white screen flash, sparks in both colours, long freeze, then orange wins and the ball shoots up.',
    setup(sim) {
      ballAt(sim, 800, 450);
      place(sim, 0, 800 - FOOT_REACH, 450, 1); place(sim, 1, 800 + FOOT_REACH, 450, -1);
    },
    script(sim, t) {
      if (t === 5) { sim.startCharge(0); sim.startCharge(1); }
      if (t === 55) {
        for (const f of sim.state.fighters) { f.kickPhase = 'active'; f.kickTimer = 6; f.charge = 0; }
        sim.emit({ type: 'clash', pos: { x: 800, y: 450 }, winner: 0 });
        sim.state.hitstop = 18;
      }
      if (t === 57) sim.kick(0, 0.35, -1, 0.8);
    },
  },
  {
    id: 'ko', label: 'K.O.', ticks: 220,
    look: 'A full-power shot finishes blue: white screen flash, a heavy freeze, zoom toward the hit, slow-motion sparks and rings; blue turns grey and tumbles.',
    setup(sim) {
      place(sim, 0, 420, 450, 1); place(sim, 1, 1150, 470, -1);
      ballAt(sim, 420 + FOOT_REACH, 450);
      sim.state.fighters[1].hp = 12;
    },
    script(sim, t) {
      if (t === 6) sim.startCharge(0);
      if (t === 70) sim.kick(0, 1, 0.02, 1);
    },
  },
  {
    id: 'trail', label: 'Live ball + elements', ticks: 520,
    look: 'The ball changes colour with each kick: fire (embers), frost (ice shards), volt (sparks), stone (dust). The trail is long when fast and fades as it slows; when it drops below danger speed it turns calm white with a soft puff.',
    setup(sim) {
      sim.hits = false;
      place(sim, 0, 240, 650, 1); place(sim, 1, 1300, 250, -1);
      ballAt(sim, 300, 650);
    },
    script(sim, t) {
      if (t === 10) sim.kick(0, 1, -0.6, 1, { element: 'fire', curve: true, snapTo: true });
      if (t === 120) sim.kick(1, -1, 0.4, 0.9, { element: 'frost', snapTo: true });
      if (t === 230) sim.kick(0, 0.7, 0.7, 1, { element: 'volt', snapTo: true });
      if (t === 340) sim.kick(1, -0.8, -0.6, 0.6, { element: 'stone', snapTo: true });
    },
  },
  {
    id: 'dash', label: 'Dashes', ticks: 220,
    look: 'Free dashes leave afterimages and speed streaks and the body stretches into a flying pose (no shimmer: a free dash is not invulnerable). After each dash the fighter briefly slumps (winded).',
    setup(sim) {
      place(sim, 0, 450, 450, 1); place(sim, 1, 1150, 450, -1);
      ballAt(sim, 800, 450);
    },
    script(sim, t) {
      if (t === 10) sim.dash(1, -1, 0);
      if (t === 25) sim.dash(0, 1, -0.3);
      if (t === 45) sim.dash(1, 0, -1);
      if (t === 60) sim.dash(0, 0, 1);
      if (t === 80) sim.dash(1, 1, 1);
      if (t === 100) sim.dash(0, -1, -0.2);
      if (t === 130) sim.dash(1, -1, 0.3);
    },
  },
  {
    id: 'trap', label: 'Trap, infuse, element hit', ticks: 260,
    look: 'Orange catches the ball on its foot (rotating ring) and dribbles, the ball pops loose, orange infuses (fire spiral, glowing foot), then kicks a fire ball into blue.',
    setup(sim) {
      place(sim, 0, 420, 450, 1); place(sim, 1, 1150, 450, -1);
      ballAt(sim, 420 + FOOT_REACH, 450);
    },
    script(sim, t) {
      if (t === 8) sim.trap(0);
      if (t > 8 && t < 100) {
        const a = (t - 8) / 30;
        sim.move[0].x = Math.cos(a) * 0.7; sim.move[0].y = Math.sin(a) * 0.7;
        sim.face(0, Math.cos(a), Math.sin(a));
      }
      if (t === 100) { sim.move[0].x = sim.move[0].y = 0; sim.release(0, true); }
      if (t === 130) {
        sim.state.fighters[0].infused = true;
        sim.emit({ type: 'infuse', player: 0, element: 'fire' });
      }
      if (t === 175) {
        const b = sim.state.ball.pos, f1 = sim.state.fighters[1].pos;
        sim.kick(0, f1.x - b.x, f1.y - b.y, 0.7, { snapTo: true });
      }
    },
  },
  {
    id: 'closecall', label: 'Close call', ticks: 110,
    look: 'An orange ball whizzes just past blue: white whoosh streaks along its path and a faint ring around blue.',
    setup(sim) {
      place(sim, 1, 1100, 450, -1);
      place(sim, 0, 400 - FOOT_REACH, 384, 1);
      ballAt(sim, 400, 384);
    },
    script(sim, t) {
      if (t === 10) sim.kick(0, 1, 0, 0.7);
    },
  },
  {
    id: 'sudden', label: 'Sudden death', ticks: 300,
    look: 'Walls turn red and pulse, then slowly close in; the space outside darkens.',
    setup(sim) {
      place(sim, 0, 500, 450, 1); place(sim, 1, 1100, 450, -1);
      ballAt(sim, 800, 450);
    },
    script(sim, t) {
      if (t === 10) { sim.state.suddenDeath = true; sim.emit({ type: 'suddenDeath' }); }
      if (t > 30) {
        const a = sim.state.arena;
        if (a.left < 220) { a.left += 0.6; a.right -= 0.6; }
        if (a.top < 150) { a.top += 0.35; a.bottom -= 0.35; }
      }
      sim.move[0].x = Math.sin(t / 25) * 0.4; sim.move[1].y = Math.cos(t / 30) * 0.4;
    },
  },
  {
    id: 'heat', label: 'Heat rally 0→4', ticks: 330,
    look: 'Each return heats the ball up: one more orbiting spark per level, a bigger whiter glow and trail with a pulse on every heat-up. At heat 4 it flickers, sheds sparks and has a hot halo. When it finally hits blue, the heat resets with a blue-white cool-down puff.',
    setup(sim) {
      place(sim, 0, 360, 450, 1); place(sim, 1, 1240, 450, -1);
      ballAt(sim, 360 + FOOT_REACH, 450);
    },
    script(sim, t, mem) {
      sim.move[0].y = Math.sin(t / 22) * 0.35; sim.move[1].y = -Math.sin(t / 19) * 0.35;
      mem.kicks ??= 0;
      if (t === 10) { sim.kick(0, 1, 0.05, 0.3); mem.kicks = 1; }
      if (t > 10 && mem.kicks < 5) {
        const who = sim.state.ball.owner === 0 ? 1 : 0;
        if (returnIfClose(sim, who, mem.kicks % 2 ? 40 : -40, 0.3)) mem.kicks++;
      }
    },
  },
  {
    id: 'phase', label: 'Phase dash through a ball', ticks: 220,
    look: 'Blue fires at orange; orange phase-dashes straight into it: the body goes see-through and jittery inside a shimmering bubble with a long pale ghost streak, and ripples mark the ball passing through. Afterwards orange is winded for a long moment (hunched, dim, panting puffs). Later blue does a normal dash for comparison: short trail, no ghosting, brief slump.',
    setup(sim) {
      place(sim, 0, 420, 450, 1); place(sim, 1, 1150, 450, -1);
      ballAt(sim, 1150 - FOOT_REACH, 450);
    },
    script(sim, t, mem) {
      if (t === 10) sim.kick(1, -1, 0, 0.45);
      const b = sim.state.ball, f = sim.state.fighters[0];
      if (!mem.phased && b.owner === 1 && b.pos.x - f.pos.x < 190) { mem.phased = 1; sim.phaseDash(0, 1, 0); }
      if (t === 150) sim.dash(1, 0, -1);
    },
  },
  {
    id: 'winded', label: 'Winded = punish window', ticks: 230,
    look: 'Orange burns a phase dash away from nothing and ends up winded (hunched, dim, puffing, moving slowly). Blue sees it, charges and punishes with a hit.',
    setup(sim) {
      place(sim, 0, 640, 520, 1); place(sim, 1, 1150, 420, -1);
      ballAt(sim, 1150 - FOOT_REACH, 420);
    },
    script(sim, t) {
      if (t === 10) sim.phaseDash(0, 0.3, -1);
      sim.move[0].x = t > 30 ? 0.6 : 0;
      if (t === 34) { sim.aimAt(1, sim.state.fighters[0].pos.x, sim.state.fighters[0].pos.y); sim.startCharge(1); }
      if (t === 72) {
        const b = sim.state.ball.pos, f = sim.state.fighters[0].pos;
        sim.kick(1, f.x - b.x, f.y - b.y, 0.6);
      }
    },
  },
  {
    id: 'finalrush', label: 'Final Rush', ticks: 300,
    look: 'An amber flash around the screen edges, then the walls turn amber (not sudden-death red), pulse and close in. Every kick now carries at least heat 1 (one orbiting spark).',
    setup(sim) {
      place(sim, 0, 420, 450, 1); place(sim, 1, 1180, 450, -1);
      ballAt(sim, 420 + FOOT_REACH, 450);
    },
    script(sim, t, mem) {
      if (t === 10) sim.startFinalRush();
      if (t > 30) {
        const a = sim.state.arena;
        if (a.left < 200) { a.left += 0.5; a.right -= 0.5; }
        if (a.top < 120) { a.top += 0.3; a.bottom -= 0.3; }
      }
      mem.kicks ??= 0;
      if (t === 40) { sim.kick(0, 1, 0.1, 0.15); mem.kicks = 1; }
      if (t > 40 && mem.kicks < 4) {
        const who = sim.state.ball.owner === 0 ? 1 : 0;
        if (returnIfClose(sim, who, mem.kicks % 2 ? 50 : -50, 0.15)) mem.kicks++;
      }
    },
  },
];
