/**
 * Tuning constants. All distances are in WORLD UNITS (arena is 1600 x 900),
 * all times in SIM TICKS (SIM_HZ per second) unless the name says otherwise.
 *
 * Ownership: sim session tunes these. Other modules may READ them.
 * Rule: no magic numbers in sim code — put them here with a comment.
 */

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
export const sec = (s: number): number => Math.round(s * SIM_HZ);

/* Arena */
export const WORLD_W = 1600;
export const WORLD_H = 900;
export const ARENA_MARGIN = 40;

/* Fighters */
export const FIGHTER_BODY_RADIUS = 34; // body hurtbox (circle)
export const FIGHTER_HEIGHT = 110; // visual height, for rendering
export const FIGHTER_ACCEL = 2600; // units/s^2
export const FIGHTER_MAX_SPEED = 520; // units/s
export const FIGHTER_DRAG = 5.5; // per second, exponential
export const DASH_SPEED = 1150;
export const DASH_TICKS = sec(0.14);
export const DASH_COOLDOWN = sec(0.8);
export const DASH_INVULN = sec(0.1);
export const WALL_KICKOFF_SPEED = 1000;

/* Kick */
export const FOOT_REACH = 52; // foot hitbox centre distance from body centre along aim
export const FOOT_RADIUS = 30;
export const KICK_ACTIVE_TICKS = 6;
export const KICK_RECOVERY_TICKS = 10;
export const KICK_CHARGE_START = 8; // held this many ticks before it counts as charging
export const KICK_CHARGE_FULL = sec(1.0);
export const SNAP_KICK_SPEED = 900;
export const POWER_KICK_MAX_SPEED = 1700;
export const PERFECT_WINDOW = 4; // ticks before body impact
export const PERFECT_SPEED_MULT = 1.5;
export const CURVE_SPIN = 3.2; // spin added by cross-movement kicks

/* Trap */
export const TRAP_MAX_TICKS = sec(1.5);
export const TRAP_RANGE = 70;

/* Ball */
export const BALL_RADIUS = 18;
export const BALL_DRAG = 0.55; // per second
export const BALL_WALL_RESTITUTION = 0.9;
export const BALL_LIVE_MIN_SPEED = 420; // below this, a live ball goes neutral
export const BALL_MAX_SPEED = 2600;
export const SPIN_DECAY = 1.4; // per second

/* Damage */
export const MAX_HP = 100;
export const DAMAGE_MIN = 4; // at BALL_LIVE_MIN_SPEED
export const DAMAGE_MAX = 16; // at POWER_KICK_MAX_SPEED (before bonuses)
export const BANK_BONUS_PER_BOUNCE = 0.15;
export const BANK_BONUS_MAX_BOUNCES = 2;
export const COMBO_SCALING = [1, 0.8, 0.65, 0.5, 0.4];
export const WALL_SPLAT_DAMAGE = 5;
export const WALL_SPLAT_MIN_SPEED = 600;
export const HITSTUN_TICKS = sec(0.35);
export const HIT_KNOCKBACK = 900;

/* Hitstop (global freeze frames) */
export const HITSTOP_KICK = 3;
export const HITSTOP_PERFECT = 8;
export const HITSTOP_HIT = 6;
export const HITSTOP_KO = 30;

/* Aura */
export const AURA_PER_BAR = 100;
export const AURA_MAX = 300;
export const AURA_GAIN_KICK = 8;
export const AURA_GAIN_PERFECT = 35;
export const AURA_GAIN_CLOSE_CALL = 15;
export const AURA_GAIN_HIT_LANDED = 20;
export const AURA_GAIN_HIT_TAKEN = 12;
export const CLOSE_CALL_DISTANCE = 26; // gap between ball and body edge

/* Match flow */
export const ROUNDS_TO_WIN = 2;
export const ROUND_TIME = sec(90);
export const COUNTDOWN_TICKS = sec(3);
export const ROUND_OVER_TICKS = sec(2.5);
export const SUDDEN_DEATH_BALL_MULT = 1.25;
