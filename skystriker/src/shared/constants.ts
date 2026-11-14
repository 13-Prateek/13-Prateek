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
export const FIGHTER_ACCEL = 2600; // units/s^2 (× hero.speed)
export const FIGHTER_MAX_SPEED = 520; // units/s (× hero.speed); excess speed from dashes/knockback decays by drag
export const FIGHTER_DRAG = 5.5; // per second, exponential
export const DASH_SPEED = 1150; // held constant for DASH_TICKS, then drag takes over
export const DASH_TICKS = sec(0.14);
export const DASH_COOLDOWN = sec(0.8);
export const DASH_INVULN = sec(0.1); // invulnerable ticks at the start of a dash (enemy balls pass through)
export const WALL_KICKOFF_SPEED = 1300; // dash while touching a wall: launch away from it (faster than a dash, rewards wall play)
export const WALL_TOUCH_SLOP = 6; // a fighter within this many units of a wall counts as touching it
export const CHARGE_MOVE_MULT = 0.6; // move speed while charging a power kick
export const TRAP_MOVE_MULT = 0.85; // move speed while dribbling a trapped ball
export const HITSTUN_DRAG = 1.5; // per second; low so hit fighters FLY (and can wall splat)

/* Kick */
export const FOOT_REACH = 52; // foot hitbox centre distance from body centre along aim
export const FOOT_RADIUS = 30;
export const KICK_ACTIVE_TICKS = 6; // foot hitbox live after the kick button is released
export const KICK_RECOVERY_TICKS = 10; // after a whiff or a connected kick, before the next kick
export const KICK_CHARGE_START = 8; // held this many ticks before it counts as charging
export const KICK_CHARGE_FULL = sec(1.0); // held ticks for a full charge
export const SNAP_KICK_SPEED = 1050; // tap kick (playtest: 900 felt slow)
export const POWER_KICK_MAX_SPEED = 1900; // full-charge kick
/**
 * Perfect return: ticks from the kick going active (button released) to the moment the
 * enemy ball WOULD have hit the body (time-to-impact). Release within this window = PERFECT.
 */
export const PERFECT_WINDOW = 6;
export const PERFECT_SPEED_MULT = 1.5;
/**
 * Curve shots are deliberate: only a kick charged to at least CURVE_MIN_CHARGE, released while
 * moving sideways to the aim, curves. Snap kicks always fly straight where you aim.
 */
export const CURVE_MIN_CHARGE = 0.5;
export const CURVE_MIN_MOVE = 0.3; // move-stick length needed for a curve shot
export const CURVE_MIN_CROSS = 0.45; // |cross(aim, moveDir)| needed: "moving sideways to the aim"
export const SPIN_DECAY = 1.4; // per second: how quickly a curve's bend is used up
export const CURVE_BEND = 0.52; // radians (~30°): TOTAL turn of a curve shot over its whole flight (× hero.control)
export const CURVE_SPIN = CURVE_BEND * SPIN_DECAY; // initial spin (rad/s) that adds up to CURVE_BEND as it decays
export const CLASH_MIN_CHARGE = 0.25; // snap kicks count as this much charge in a clash
export const CLASH_POP_SPEED = 520; // tied clash: ball pops straight up at this speed

/* Trap */
export const TRAP_MAX_TICKS = sec(1.5);
export const TRAP_RANGE = 70; // max distance from the FOOT centre to the ball centre to trap it
export const TRAP_CATCH_MAX_SPEED = 800; // an enemy live ball slower than this can be trapped (caught)
export const TRAP_DROP_SPEED = 120; // letting go of trap nudges the ball forward this fast
export const TRAP_POP_SPEED = 380; // forced release (held too long) pops the ball loose this fast
export const TRAP_POP_SPREAD = 0.9; // radians of random spread on the forced pop

/* Ball */
export const BALL_RADIUS = 18;
export const BALL_DRAG = 0.4; // per second, exponential (applies after the cruise)
export const BALL_CRUISE_TICKS = sec(0.25); // a kicked ball keeps its full speed this long before drag starts
export const BALL_NEUTRAL_DRAG = 1.0; // per second: a harmless (neutral) ball settles instead of drifting into corners
export const BALL_WALL_RESTITUTION = 0.9;
export const BALL_WALL_SPIN_KEEP = 0.6; // spin kept after a wall bounce
export const BALL_LIVE_MIN_SPEED = 480; // below this, a live ball goes neutral (harmless, white)
export const BALL_MAX_SPEED = 2600;
export const BALL_MAX_SUBSTEPS = 12; // movement split so a fast ball can't tunnel
export const BUMP_RESTITUTION = 0.3; // body bump bounciness (neutral ball, or your own live ball)
export const BUMP_EVENT_MIN_SPEED = 150; // only emit `bump` events above this closing speed
export const BOUNCE_EVENT_MIN_SPEED = 60; // only emit `bounce` events above this impact speed
export const HIT_BALL_RESTITUTION = 0.55; // ball rebounds off a fighter it hits (stays live)

/* Damage */
export const MAX_HP = 100;
export const DAMAGE_MIN = 4; // at or below DAMAGE_MIN_SPEED (any live ball does at least this)
export const DAMAGE_MAX = 16; // at DAMAGE_MAX_SPEED (before bonuses); keeps rising above it (perfect returns)
/**
 * Ball speeds the damage line runs between. Tuned (bot-vs-bot stats) so an average hit still does
 * ~8 damage after the faster-ball retune: balls now stay live longer and land more far-away hits.
 * Kael: snap point-blank ≈ 8, snap from 600 u ≈ 8, power kick point-blank ≈ 17.
 */
export const DAMAGE_MIN_SPEED = 560;
export const DAMAGE_MAX_SPEED = 2000;
export const BANK_BONUS_PER_BOUNCE = 0.15;
export const BANK_BONUS_MAX_BOUNCES = 2;
export const COMBO_SCALING = [1, 0.8, 0.65, 0.5, 0.4];
export const INFUSE_DAMAGE_MULT = 1.2; // infused (element) ball damage multiplier
export const WALL_SPLAT_DAMAGE = 5;
export const WALL_SPLAT_MIN_SPEED = 600; // speed INTO the wall needed for a splat
export const WALL_SPLAT_RESTITUTION = 0.5;
export const WALL_SPLAT_STUN = sec(0.45); // a splat refreshes hitstun to at least this: follow-up window
export const HITSTUN_TICKS = sec(0.35); // first hit of a combo
export const HITSTUN_COMBO_DECAY = 0.8; // each further combo hit stuns for 80% of the previous
export const HITSTUN_MIN = sec(0.12);
export const COMBO_MAX_HITS = 5; // the hit that reaches this combo count also grants COMBO_BREAK_INVULN
export const COMBO_BREAK_INVULN = sec(0.6); // no infinites: the victim can't be hit again for this long
export const HIT_KNOCKBACK = 1000; // knockback speed from a max-power hit
export const HIT_KNOCKBACK_MIN = 550; // knockback speed from a barely-live hit

/* Hitstop (global freeze frames) */
export const HITSTOP_KICK = 3;
export const HITSTOP_POWER_BONUS = 3; // extra kick hitstop at full charge
export const HITSTOP_PERFECT = 8;
export const HITSTOP_HIT = 6;
export const HITSTOP_SPLAT = 5;
export const HITSTOP_CLASH = 14;
export const HITSTOP_KO = 30;

/* Aura */
export const AURA_PER_BAR = 100;
export const AURA_MAX = 300;
export const AURA_GAIN_KICK = 8;
export const AURA_GAIN_PERFECT = 35; // replaces the normal kick gain
export const AURA_GAIN_CLOSE_CALL = 15;
export const AURA_GAIN_HIT_LANDED = 20;
export const AURA_GAIN_HIT_TAKEN = 12;
export const AURA_CARRIES_OVER = true; // aura is kept between rounds
export const INFUSE_COST = AURA_PER_BAR; // E: next kick carries your element
export const CLOSE_CALL_DISTANCE = 26; // gap between ball and body edge

/* Match flow */
export const ROUNDS_TO_WIN = 2;
export const ROUND_TIME = sec(90);
export const COUNTDOWN_TICKS = sec(3);
export const ROUND_OVER_TICKS = sec(2.5);
export const SUDDEN_DEATH_BALL_MULT = 1.25;
export const SUDDEN_DEATH_SHRINK_SPEED = 30; // units/s each wall moves inward in sudden death
export const SUDDEN_DEATH_MIN_W = 700; // arena stops shrinking at this size
export const SUDDEN_DEATH_MIN_H = 420;
export const SUDDEN_DEATH_ONE_HIT = true; // in sudden death any damage is a K.O.
