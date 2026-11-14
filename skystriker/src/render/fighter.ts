import { Container, Sprite } from 'pixi.js';
import {
  BALL_RADIUS, FIGHTER_MAX_SPEED, FOOT_REACH, HITSTUN_TICKS, KICK_RECOVERY_TICKS,
} from '../shared/constants';
import { HEROES } from '../shared/heroes';
import type { FighterState, MatchState } from '../shared/types';
import { ELEMENT_COLOR, FX, mixColor } from './palette';
import { PKind, type ParticlePool, type TweenPool } from './pools';
import { rrange } from './rng';
import { LIMB_CORE, type FxTextures } from './textures';

/* Skeleton ---------------------------------------------------------- */
const HEAD = 0, NECK = 1, HIP = 2, ELB_F = 3, HAND_F = 4, ELB_B = 5, HAND_B = 6, KNEE_K = 7, FOOT_K = 8, KNEE_S = 9, FOOT_S = 10;
const NJ = 11;
const TORSO = 34, NECK_LEN = 16, UPPER_ARM = 18, FOREARM = 17, THIGH = 23, SHIN = 23, LEG = THIGH + SHIN;
const HEAD_R = 12;
/** [from, to, thickness] */
const SEGMENTS: readonly [number, number, number][] = [
  [HIP, NECK, 10],
  [NECK, ELB_B, 6.5], [ELB_B, HAND_B, 6],
  [HIP, KNEE_S, 8], [KNEE_S, FOOT_S, 7],
  [NECK, ELB_F, 6.5], [ELB_F, HAND_F, 6],
  [HIP, KNEE_K, 8], [KNEE_K, FOOT_K, 7.5],
];
/** [joint, diameter] */
const JOINTS: readonly [number, number][] = [
  [NECK, 10], [HIP, 10], [ELB_F, 6.5], [HAND_F, 8], [ELB_B, 6.5], [HAND_B, 8], [KNEE_K, 8], [FOOT_K, 11], [KNEE_S, 8], [FOOT_S, 10],
];

type Pose = Float32Array; // NJ * 2

/** Two-bone IK: writes the middle joint `m` (and clamps end `e` to reach). bend = ±1 picks the side. */
function ik(p: Pose, r: number, m: number, e: number, l1: number, l2: number, bend: number): void {
  const ax = p[r * 2], ay = p[r * 2 + 1];
  let dx = p[e * 2] - ax, dy = p[e * 2 + 1] - ay;
  let d = Math.sqrt(dx * dx + dy * dy);
  if (d < 1e-4) { dx = 0; dy = 1; d = 1e-4; }
  const ux = dx / d, uy = dy / d;
  const dc = Math.min(l1 + l2 - 0.01, Math.max(Math.abs(l1 - l2) + 0.01, d));
  if (dc !== d) { p[e * 2] = ax + ux * dc; p[e * 2 + 1] = ay + uy * dc; }
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  p[m * 2] = ax + ux * a - uy * h * bend;
  p[m * 2 + 1] = ay + uy * a + ux * h * bend;
}

const set = (p: Pose, j: number, x: number, y: number) => { p[j * 2] = x; p[j * 2 + 1] = y; };

/** A drawable stick figure built from pooled sprites (no per-frame Graphics). */
export class Rig {
  readonly root = new Container();
  private readonly segs: Sprite[] = [];
  private readonly joints: Sprite[] = [];
  private readonly head: Sprite;
  readonly visor: Sprite;

  constructor(tx: FxTextures, additive = false) {
    for (const [, , th] of SEGMENTS) {
      const s = new Sprite(tx.limb);
      s.anchor.set(0, 0.5);
      s.scale.y = th / LIMB_CORE;
      if (additive) s.blendMode = 'add';
      this.segs.push(s);
      this.root.addChild(s);
    }
    for (const [, dia] of JOINTS) {
      const s = new Sprite(tx.disc);
      s.anchor.set(0.5);
      s.scale.set(dia / 60);
      if (additive) s.blendMode = 'add';
      this.joints.push(s);
      this.root.addChild(s);
    }
    this.head = new Sprite(tx.disc);
    this.head.anchor.set(0.5);
    this.head.scale.set((HEAD_R * 2) / 60);
    if (additive) this.head.blendMode = 'add';
    this.root.addChild(this.head);
    this.visor = new Sprite(tx.limb);
    this.visor.anchor.set(0, 0.5);
    this.visor.scale.set(9 / this.visor.texture.width, 4 / LIMB_CORE);
    this.visor.tint = 0xffffff;
    this.root.addChild(this.visor);
  }

  apply(p: Pose, fx: number, fy: number): void {
    const w = this.segs[0].texture.width;
    for (let i = 0; i < SEGMENTS.length; i++) {
      const [a, b] = SEGMENTS[i];
      const s = this.segs[i];
      const ax = p[a * 2], ay = p[a * 2 + 1], dx = p[b * 2] - ax, dy = p[b * 2 + 1] - ay;
      s.position.set(ax, ay);
      s.rotation = Math.atan2(dy, dx);
      s.scale.x = Math.sqrt(dx * dx + dy * dy) / w;
    }
    for (let i = 0; i < JOINTS.length; i++) {
      const j = JOINTS[i][0];
      this.joints[i].position.set(p[j * 2], p[j * 2 + 1]);
    }
    const hx = p[HEAD * 2], hy = p[HEAD * 2 + 1];
    this.head.position.set(hx, hy);
    // visor: a white slit on the head facing the aim direction
    this.visor.position.set(hx + fx * 2, hy + fy * 2);
    this.visor.rotation = Math.atan2(fy, fx);
  }

  setTint(c: number): void {
    for (const s of this.segs) s.tint = c;
    for (const s of this.joints) s.tint = c;
    this.head.tint = c;
  }
}

const GHOSTS = 10;

/**
 * One fighter: procedural pose from FighterState, charge glow, aim chevron,
 * kick-foot glow, dash afterimages, hit flash / hitstun tint / invuln shimmer.
 */
export class FighterView {
  readonly root = new Container();
  readonly ghostLayer = new Container();
  private readonly rig: Rig;
  private readonly aura: Sprite;
  private readonly footGlow: Sprite;
  private readonly chevron: Sprite;
  private readonly chargeRing: Sprite;
  private readonly ghosts: Rig[] = [];
  private readonly ghostLife = new Float32Array(GHOSTS);
  private ghostNext = 0;
  private ghostTimer = 0;

  private readonly pose: Pose = new Float32Array(NJ * 2);
  private readonly poseB: Pose = new Float32Array(NJ * 2);
  private readonly activePose: Pose = new Float32Array(NJ * 2);
  private lean = 0;
  private sx = 1;
  private anim = 0;
  private time = 0;
  private lastPhase = 'idle';
  private chargeSparkAcc = 0;
  /** 0..1 Winded slump (eased so the pose settles in / recovers smoothly). */
  private slump = 0;
  private puffAcc = 0;
  private rippleT = 0;
  private readonly phaseBubble: Sprite;
  private readonly ghostMax = new Float32Array(GHOSTS);
  private emberAcc = 0;
  /** Set by VFX: seconds of pure white flash left (hit). */
  flash = 0;
  /** Seconds since last hit (for hitstop shudder). */
  sinceHit = 99;
  /** Charge-full pulse 0..1. */
  chargePulse = 0;
  x = 0;
  y = 0;

  constructor(private readonly tx: FxTextures, id: 0 | 1, private readonly fxAdd: TweenPool, private readonly parts: ParticlePool) {
    this.aura = new Sprite(tx.glow);
    this.aura.anchor.set(0.5);
    this.aura.blendMode = 'add';
    this.footGlow = new Sprite(tx.glow);
    this.footGlow.anchor.set(0.5);
    this.footGlow.blendMode = 'add';
    this.chevron = new Sprite(tx.chevron);
    this.chevron.anchor.set(0.5);
    this.chargeRing = new Sprite(tx.ring);
    this.chargeRing.anchor.set(0.5);
    this.chargeRing.blendMode = 'add';
    this.rig = new Rig(tx);
    this.phaseBubble = new Sprite(tx.ringSoft);
    this.phaseBubble.anchor.set(0.5);
    this.phaseBubble.blendMode = 'add';
    this.phaseBubble.visible = false;
    this.root.addChild(this.aura, this.chargeRing, this.chevron, this.rig.root, this.footGlow, this.phaseBubble);
    for (let i = 0; i < GHOSTS; i++) {
      const g = new Rig(tx, true);
      g.root.visible = false;
      g.visor.visible = false;
      this.ghosts.push(g);
      this.ghostLayer.addChild(g.root);
    }
    if (id === 1) this.sx = -1;
  }

  /** Idle / flying pose into `p`. */
  private idlePose(p: Pose, f: FighterState, t: number): void {
    const sx = this.sx;
    const sl = this.slump;
    const th = this.lean + sx * 0.55 * sl; // winded: hunched forward
    const ux = Math.sin(th), uy = -Math.cos(th); // torso up
    const sdx = -uy, sdy = ux; // body "right"
    const vx = f.vel.x / FIGHTER_MAX_SPEED, vy = f.vel.y / FIGHTER_MAX_SPEED;
    const tx = -vx * 16, ty = -vy * 16; // limbs trail behind motion
    const bob = Math.sin(t * (2.4 + 5 * sl)) * (2.5 + 2 * sl); // winded: quick heavy panting
    const hipX = 0, hipY = 10 + bob;
    set(p, HIP, hipX, hipY);
    set(p, NECK, hipX + ux * TORSO, hipY + uy * TORSO);
    // head droops forward and down when winded
    set(p, HEAD, hipX + ux * (TORSO + NECK_LEN * (1 - 0.3 * sl)) + sdx * sx * 6 * sl, hipY + uy * (TORSO + NECK_LEN * (1 - 0.3 * sl)) + sdy * sx * 6 * sl + 4 * sl);
    const sw = Math.sin(t * 2.2) * 3 * (1 - sl), sw2 = Math.sin(t * 2.2 + 1.7) * 3 * (1 - sl);
    const legLen = 40 - 7 * sl;
    set(p, FOOT_K, hipX - ux * legLen + sdx * (sx * 9 + sw) + tx, hipY - uy * 40 + sdy * (sx * 9 + sw) + ty);
    set(p, FOOT_S, hipX - ux * (legLen - 2) + sdx * (-sx * 7 + sw2) + tx * 1.4, hipY - uy * 38 + sdy * (-sx * 7 + sw2) + ty * 1.4);
    ik(p, HIP, KNEE_K, FOOT_K, THIGH, SHIN, -sx);
    ik(p, HIP, KNEE_S, FOOT_S, THIGH, SHIN, -sx);
    const nx = p[NECK * 2], ny = p[NECK * 2 + 1];
    // winded: arms hang limp
    const hf = 16 + 16 * sl, hb = 24 + 8 * sl, af = 22 - 12 * sl, ab = 13 - 6 * sl;
    set(p, HAND_F, nx - ux * hf + sdx * sx * af + tx * 0.5, ny - uy * hf + sdy * sx * af + ty * 0.5 + 6 * sl);
    set(p, HAND_B, nx - ux * hb - sdx * sx * ab + tx * 0.9, ny - uy * hb - sdy * sx * ab + ty * 0.9 + 6 * sl);
    ik(p, NECK, ELB_F, HAND_F, UPPER_ARM, FOREARM, sx);
    ik(p, NECK, ELB_B, HAND_B, UPPER_ARM, FOREARM, -sx);
  }

  /** Torso direction for kick poses: leaning back, away from the kick, head as "up" as possible. */
  private kickTorso(kx: number, ky: number, amount: number): [number, number] {
    const c = Math.cos(amount), s = Math.sin(amount);
    const ax = kx * c - ky * s, ay = kx * s + ky * c; // +amount
    const bx = kx * c + ky * s, by = -kx * s + ky * c; // -amount
    if (Math.abs(ay - by) < 0.05) return this.sx > 0 ? [bx, by] : [ax, ay];
    return ay < by ? [ax, ay] : [bx, by];
  }

  /** Leg fully extended along facing: foot lands on the sim's foot hitbox. */
  private kickActivePose(p: Pose, kx: number, ky: number): void {
    const [tx, ty] = this.kickTorso(kx, ky, 2.25);
    const hx = kx * (FOOT_REACH - LEG + 2), hy = ky * (FOOT_REACH - LEG + 2);
    set(p, HIP, hx, hy);
    set(p, NECK, hx + tx * TORSO, hy + ty * TORSO);
    set(p, HEAD, hx + tx * (TORSO + NECK_LEN), hy + ty * (TORSO + NECK_LEN));
    set(p, FOOT_K, hx + kx * (LEG + 1), hy + ky * (LEG + 1));
    set(p, KNEE_K, hx + kx * THIGH, hy + ky * THIGH);
    // support leg tucked behind
    set(p, KNEE_S, hx + (kx * 0.45 - tx * 0.85) * 22, hy + (ky * 0.45 - ty * 0.85) * 22);
    set(p, FOOT_S, p[KNEE_S * 2] - kx * 21, p[KNEE_S * 2 + 1] - ky * 21);
    const nx = p[NECK * 2], ny = p[NECK * 2 + 1];
    set(p, HAND_F, nx + (-kx * 0.75 + tx * 0.35) * 32, ny + (-ky * 0.75 + ty * 0.35) * 32);
    set(p, HAND_B, nx + (kx * 0.35 - tx * 0.75) * 30, ny + (ky * 0.35 - ty * 0.75) * 30);
    ik(p, NECK, ELB_F, HAND_F, UPPER_ARM, FOREARM, this.sx);
    ik(p, NECK, ELB_B, HAND_B, UPPER_ARM, FOREARM, -this.sx);
  }

  /** Chambered wind-up: knee up toward the aim, foot pulled back, front hand points at the aim. */
  private chamberPose(p: Pose, kx: number, ky: number, charge: number): void {
    const [tx, ty] = this.kickTorso(kx, ky, 2.25);
    // torso between upright and leaning back
    const th = this.lean;
    let ux = Math.sin(th) * 0.6 + tx * 0.4, uy = -Math.cos(th) * 0.6 + ty * 0.4;
    const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    const crouch = 1 - charge * 0.12; // compresses as it charges
    const hx = -kx * 4, hy = -ky * 4 + 6;
    set(p, HIP, hx, hy);
    set(p, NECK, hx + ux * TORSO * crouch, hy + uy * TORSO * crouch);
    set(p, HEAD, hx + ux * (TORSO * crouch + NECK_LEN), hy + uy * (TORSO * crouch + NECK_LEN));
    let kxn = kx * 0.8 + ux * 0.6, kyn = ky * 0.8 + uy * 0.6;
    const kl = Math.hypot(kxn, kyn) || 1; kxn /= kl; kyn /= kl;
    set(p, KNEE_K, hx + kxn * THIGH, hy + kyn * THIGH);
    set(p, FOOT_K, p[KNEE_K * 2] - kx * (SHIN - 2) - ux * 4, p[KNEE_K * 2 + 1] - ky * (SHIN - 2) - uy * 4);
    set(p, FOOT_S, hx - ux * 40 - kx * 8, hy - uy * 40 - ky * 8);
    ik(p, HIP, KNEE_S, FOOT_S, THIGH, SHIN, -this.sx);
    const nx = p[NECK * 2], ny = p[NECK * 2 + 1];
    set(p, HAND_F, nx + kx * 32, ny + ky * 32);
    set(p, HAND_B, nx - kx * 22 - ux * 14, ny - ky * 22 - uy * 14);
    ik(p, NECK, ELB_F, HAND_F, UPPER_ARM, FOREARM, this.sx);
    ik(p, NECK, ELB_B, HAND_B, UPPER_ARM, FOREARM, -this.sx);
  }

  /** Streamlined dash: body along the motion, legs trailing, fist forward. */
  private dashPose(p: Pose, dx: number, dy: number): void {
    const sdx = -dy, sdy = dx;
    set(p, HIP, -dx * 8, -dy * 8);
    set(p, NECK, p[HIP * 2] + dx * TORSO, p[HIP * 2 + 1] + dy * TORSO);
    set(p, HEAD, p[HIP * 2] + dx * (TORSO + NECK_LEN), p[HIP * 2 + 1] + dy * (TORSO + NECK_LEN));
    set(p, FOOT_K, p[HIP * 2] - dx * 44 + sdx * 6, p[HIP * 2 + 1] - dy * 44 + sdy * 6);
    set(p, FOOT_S, p[HIP * 2] - dx * 42 - sdx * 6, p[HIP * 2 + 1] - dy * 42 - sdy * 6);
    ik(p, HIP, KNEE_K, FOOT_K, THIGH, SHIN, 1);
    ik(p, HIP, KNEE_S, FOOT_S, THIGH, SHIN, -1);
    const nx = p[NECK * 2], ny = p[NECK * 2 + 1];
    set(p, HAND_F, nx + dx * 30, ny + dy * 30);
    set(p, HAND_B, nx - dx * 26 - sdx * 8, ny - dy * 26 - sdy * 8);
    ik(p, NECK, ELB_F, HAND_F, UPPER_ARM, FOREARM, 1);
    ik(p, NECK, ELB_B, HAND_B, UPPER_ARM, FOREARM, -1);
  }

  /** Ragdoll-ish flail while in hitstun. */
  private hitstunPose(p: Pose, f: FighterState, t: number): void {
    this.idlePose(p, f, t);
    const vl = Math.hypot(f.vel.x, f.vel.y) || 1;
    const bx = -f.vel.x / vl, by = -f.vel.y / vl; // limbs fly opposite to knockback
    const nx = p[NECK * 2], ny = p[NECK * 2 + 1];
    const w = Math.sin(t * 22) * 6;
    set(p, HAND_F, nx + bx * 26 - by * (14 + w), ny + by * 26 + bx * (14 + w));
    set(p, HAND_B, nx + bx * 24 + by * (14 - w), ny + by * 24 - bx * (14 - w));
    ik(p, NECK, ELB_F, HAND_F, UPPER_ARM, FOREARM, 1);
    ik(p, NECK, ELB_B, HAND_B, UPPER_ARM, FOREARM, -1);
    const hx = p[HIP * 2], hy = p[HIP * 2 + 1];
    set(p, FOOT_K, hx + bx * 40 - by * 12, hy + by * 40 + bx * 12);
    set(p, FOOT_S, hx + bx * 36 + by * 14, hy + by * 36 - bx * 14);
    ik(p, HIP, KNEE_K, FOOT_K, THIGH, SHIN, 1);
    ik(p, HIP, KNEE_S, FOOT_S, THIGH, SHIN, -1);
  }

  private trapPose(p: Pose, bx: number, by: number): void {
    // reach the kicking foot to the near side of the ball
    const d = Math.hypot(bx, by) || 1;
    set(p, FOOT_K, bx - (bx / d) * BALL_RADIUS * 0.8, by - (by / d) * BALL_RADIUS * 0.8);
    ik(p, HIP, KNEE_K, FOOT_K, THIGH, SHIN, -this.sx);
  }

  /**
   * @param fxDt effect time step (already slowed for hitstop / slow-mo)
   * @param frozen true while the sim is in hitstop: hold the pose, only shudder
   */
  update(f: FighterState, prevF: FighterState, alpha: number, state: Readonly<MatchState>, dt: number, fxDt: number, frozen: boolean): void {
    const hero = HEROES[f.heroId];
    this.time += dt;
    this.x = prevF.pos.x + (f.pos.x - prevF.pos.x) * alpha;
    this.y = prevF.pos.y + (f.pos.y - prevF.pos.y) * alpha;
    if (f.facing.x > 0.2) this.sx = 1; else if (f.facing.x < -0.2) this.sx = -1;
    if (!frozen) {
      this.anim += dt;
      const targetLean = Math.max(-1, Math.min(1, f.vel.x / FIGHTER_MAX_SPEED)) * 0.34;
      this.lean += (targetLean - this.lean) * (1 - Math.exp(-10 * dt));
    }
    this.sinceHit += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.chargePulse = Math.max(0, this.chargePulse - dt * 3);

    const fl = Math.hypot(f.facing.x, f.facing.y) || 1;
    const kx = f.facing.x / fl, ky = f.facing.y / fl;
    const p = this.pose;
    const t = this.anim;
    const ko = f.hp <= 0 && (state.phase === 'roundOver' || state.phase === 'matchOver');
    const phasing = (f.phaseDashTimer ?? 0) > 0;
    const winded = (f.winded ?? 0) > 0 && !ko && f.hitstun <= 0;
    if (!frozen) {
      const target = winded ? 1 : 0;
      this.slump += (target - this.slump) * (1 - Math.exp(-(winded ? 14 : 6) * dt));
    }
    let rot = 0;

    // swoosh + snap when a kick goes active (covers whiffs too)
    if (f.kickPhase === 'active' && this.lastPhase !== 'active') {
      const ang = Math.atan2(ky, kx);
      this.fxAdd.spawn(this.tx.swoosh, this.x + kx * 34, this.y + ky * 34, ang, 0.45, 0.6, 0.85, 1.0, 0.95, 0, 0.18, mixColor(hero.color, 0xffffff, 0.35), 3);
    }
    this.lastPhase = f.kickPhase;

    if (f.hitstun > 0 || ko) {
      this.hitstunPose(p, f, ko ? 0 : t);
      const frac = ko ? 1 : f.hitstun / HITSTUN_TICKS;
      rot = (f.vel.x >= 0 ? 1 : -1) * frac * 0.7;
    } else if (f.dashTimer > 0 || phasing) {
      const vl = Math.hypot(f.vel.x, f.vel.y);
      if (vl > 1) this.dashPose(p, f.vel.x / vl, f.vel.y / vl); else this.idlePose(p, f, t);
    } else if (f.kickPhase === 'active') {
      this.kickActivePose(p, kx, ky);
    } else if (f.kickPhase === 'recovery') {
      this.kickActivePose(this.activePose, kx, ky);
      this.idlePose(this.poseB, f, t);
      const r = 1 - Math.max(0, f.kickTimer) / KICK_RECOVERY_TICKS;
      const e = r * r * (3 - 2 * r);
      for (let i = 0; i < NJ * 2; i++) p[i] = this.activePose[i] + (this.poseB[i] - this.activePose[i]) * e;
    } else if (f.kickPhase === 'charging') {
      this.idlePose(this.poseB, f, t);
      this.chamberPose(this.activePose, kx, ky, f.charge);
      const c = Math.min(1, 0.45 + f.charge * 0.8);
      for (let i = 0; i < NJ * 2; i++) p[i] = this.poseB[i] + (this.activePose[i] - this.poseB[i]) * c;
    } else {
      this.idlePose(p, f, t);
    }
    if (f.trapping && state.ball.heldBy === f.id && f.hitstun <= 0) {
      this.trapPose(p, state.ball.pos.x - f.pos.x, state.ball.pos.y - f.pos.y);
    }

    // hitstop shudder on the victim
    let shx = 0;
    if (frozen && this.sinceHit < 0.6) shx = Math.sin(this.time * 90) * 3.5;
    if (phasing) shx += Math.sin(this.time * 130) * 2.2; // phase shimmer: body jitters out of sync
    this.root.position.set(this.x + shx, this.y);
    this.rig.root.rotation = rot;
    this.rig.apply(p, kx, ky);

    /* colour: hit flash > KO grey > hitstun flicker > phase ghost > winded dim > hero colour.
       (No shimmer for plain invulnerability: the free dash is no longer invulnerable.) */
    let tint = hero.color;
    let a = 1;
    if (this.flash > 0) tint = 0xffffff;
    else if (ko) { tint = mixColor(hero.color, 0x555566, 0.75); a = 0.65; }
    else if (f.hitstun > 0) tint = mixColor(hero.color, 0xffffff, 0.35 + 0.3 * (Math.sin(this.time * 40) > 0 ? 1 : 0));
    else if (phasing) {
      tint = mixColor(hero.color, FX.PHASE_COLOR, 0.3);
      a = 0.42 + 0.2 * (0.5 + 0.5 * Math.sin(this.time * 38));
    } else if (this.slump > 0.02) {
      tint = mixColor(hero.color, 0x4c5270, 0.45 * this.slump);
      a = 1 - 0.15 * this.slump;
    }
    if (this.chargePulse > 0) tint = mixColor(tint, 0xffffff, this.chargePulse * 0.8);
    this.rig.setTint(tint);
    this.rig.root.alpha = a;

    /* aura / charge glow */
    const charging = f.kickPhase === 'charging';
    const ch = charging ? f.charge : 0;
    const pulseHz = 3 + ch * 12;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * pulseHz * 6.283);
    const full = ch >= 0.999;
    this.aura.tint = full ? mixColor(hero.color, 0xffffff, 0.35 + 0.3 * pulse) : hero.color;
    this.aura.alpha = Math.min(1, ko ? 0.05 : (0.18 + ch * (0.6 + 0.3 * pulse) + this.chargePulse * 0.6 + (this.flash > 0 ? 0.5 : 0)) * (1 - 0.7 * this.slump));
    this.aura.scale.set((160 + ch * 170 + this.chargePulse * 140) / 128);
    // focus ring tightens around the body as the kick charges
    if (charging && ch > 0.02) {
      const rr = 92 - 34 * ch;
      this.chargeRing.visible = true;
      this.chargeRing.tint = full ? 0xffffff : mixColor(hero.color, 0xffffff, 0.25);
      this.chargeRing.alpha = full ? 0.6 + 0.4 * pulse : 0.25 + 0.5 * ch;
      this.chargeRing.scale.set((rr * 2) / 244);
      this.chargeRing.position.set(this.aura.position.x, this.aura.position.y);
    } else this.chargeRing.visible = false;
    this.aura.position.set(p[HIP * 2] * 0.5, p[HIP * 2 + 1] * 0.5 - 8);

    // charge sparks converge inward
    if (charging && !frozen && ch > 0.05) {
      this.chargeSparkAcc += fxDt * (10 + ch * 60);
      while (this.chargeSparkAcc >= 1) {
        this.chargeSparkAcc -= 1;
        const ang = rrange(0, 6.283), r = rrange(55, 95);
        const cx = Math.cos(ang), cy = Math.sin(ang);
        this.parts.spawn(PKind.Streak, this.x + cx * r, this.y + cy * r, -cx * r * 4, -cy * r * 4, 0.22, 7 + ch * 4, 3, full ? 0xffffff : hero.color, 1, 0.9);
      }
    } else this.chargeSparkAcc = 0;

    /* kicking foot: glows while active (shows the hitbox), element-tinted when infused */
    const fx = p[FOOT_K * 2], fy = p[FOOT_K * 2 + 1];
    const cr = Math.cos(rot), sr = Math.sin(rot);
    this.footGlow.position.set(fx * cr - fy * sr, fx * sr + fy * cr);
    const elemCol = ELEMENT_COLOR[f.element];
    if (f.kickPhase === 'active') {
      this.footGlow.tint = f.infused ? elemCol : mixColor(hero.color, 0xffffff, 0.5);
      this.footGlow.alpha = 0.95;
      this.footGlow.scale.set(78 / 128);
    } else if (f.infused) {
      this.footGlow.tint = elemCol;
      this.footGlow.alpha = 0.55 + 0.25 * pulse;
      this.footGlow.scale.set(52 / 128);
      if (!frozen) {
        this.emberAcc += fxDt * 22;
        while (this.emberAcc >= 1) {
          this.emberAcc -= 1;
          this.parts.spawn(PKind.Dot, this.x + this.footGlow.x, this.y + this.footGlow.y, rrange(-30, 30), rrange(-60, 10), 0.4, 9, 2, elemCol, 1.5, 0.9);
        }
      }
    } else {
      this.footGlow.alpha = 0;
    }

    /* aim chevron */
    const cd = 96 + (charging ? 6 * pulse : 0);
    this.chevron.position.set(kx * cd, ky * cd - 4);
    this.chevron.rotation = Math.atan2(ky, kx);
    this.chevron.tint = charging && full ? 0xffffff : hero.color;
    this.chevron.alpha = ko ? 0 : (charging ? 0.9 : 0.45) * (1 - 0.5 * this.slump);

    /* phase bubble: a hollow shimmering shell; flares (with ripples) when the ball passes through */
    if (phasing) {
      const b = state.ball;
      const near = Math.hypot(b.pos.x - f.pos.x, b.pos.y - f.pos.y) < 34 + b.radius + 26;
      this.phaseBubble.visible = true;
      this.phaseBubble.tint = mixColor(hero.color, FX.PHASE_COLOR, 0.25);
      this.phaseBubble.alpha = (near ? 0.8 : 0.45) + 0.12 * Math.sin(this.time * 31);
      this.phaseBubble.scale.set(((near ? 120 : 104) + 6 * Math.sin(this.time * 23)) / 256);
      this.phaseBubble.position.set(this.aura.position.x, this.aura.position.y);
      this.rippleT -= dt;
      if (near && this.rippleT <= 0) {
        this.rippleT = 0.045;
        this.fxAdd.spawn(this.tx.ring, b.pos.x, b.pos.y, 0, 24 / 244, 24 / 244, 90 / 244, 90 / 244, 0.9, 0, 0.22, FX.PHASE_COLOR, 3);
      }
    } else this.phaseBubble.visible = false;

    /* winded: breath puffs from the head */
    if (winded && !frozen) {
      this.puffAcc += fxDt * 4.5;
      while (this.puffAcc >= 1) {
        this.puffAcc -= 1;
        const hx = this.x + p[HEAD * 2] + this.sx * 10, hy = this.y + p[HEAD * 2 + 1] + 4;
        this.parts.spawn(PKind.Dot, hx, hy, this.sx * rrange(40, 80), rrange(-50, -15), 0.7, 18, 38, 0xc4cbe0, 2.5, 0.7);
      }
    } else this.puffAcc = 0.6;
    this.chevron.scale.set(charging ? 0.8 + ch * 0.35 : 0.7);

    /* dash afterimages */
    /* afterimages: normal dash = short hero-coloured trail; phase dash = dense, long, pale ghost streak */
    if ((f.dashTimer > 0 || phasing) && !frozen) {
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) {
        this.ghostTimer = phasing ? 0.02 : 0.022;
        const gi = this.ghostNext;
        const g = this.ghosts[gi];
        this.ghostNext = (this.ghostNext + 1) % GHOSTS;
        g.apply(p, kx, ky);
        g.setTint(phasing ? mixColor(hero.color, FX.PHASE_COLOR, 0.4) : mixColor(hero.color, hero.accent, 0.3));
        g.root.position.set(this.x, this.y);
        g.root.rotation = rot;
        g.root.visible = true;
        this.ghostMax[gi] = phasing ? 0.4 : 0.26;
        this.ghostLife[gi] = this.ghostMax[gi];
      }
    } else this.ghostTimer = 0;
    for (let i = 0; i < GHOSTS; i++) {
      if (this.ghostLife[i] <= 0) continue;
      this.ghostLife[i] -= fxDt;
      const g = this.ghosts[i];
      if (this.ghostLife[i] <= 0) { g.root.visible = false; continue; }
      g.root.alpha = (this.ghostLife[i] / this.ghostMax[i]) * (this.ghostMax[i] > 0.3 ? 0.32 : 0.5);
    }
  }
}
