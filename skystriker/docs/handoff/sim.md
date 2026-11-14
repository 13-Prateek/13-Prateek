# Sim handoff

Branch: `claude/skystriker-sim`. Code: `src/sim/**`, tests: `tests/sim/**`, tuning: `src/shared/constants.ts`.

## Latest: ball-feel fix (after the first playtest)
Owner's report: *"the ball is a bit slow, and sometimes it's curving away and sometimes being dragged down heavily."*

**Cause:** every kick made while moving sideways to the aim curved, by up to about 74°. Players hold WASD all the time while fighting, so most shots bent without the player meaning it. The sparring bot's kicks curved 46–78% of the time. The ball was also slow and bled speed straight away: a snap kick died mid-arena.

**What changed for the player:**
- **Shots go where you aim.** Snap kicks (taps) never curve.
- **Curve shots are on purpose only.** Charge the kick at least halfway, then release while moving sideways to your aim. The ball bends toward the side you're moving, about **30° in total** (24–34° depending on the hero's control stat), and never more.
- **Faster, livelier ball.**
  - Snap 900 → **1050**, full power kick 1700 → **1900**.
  - A kicked ball keeps its full speed for its first **0.25 s**, then slows gently (drag 0.55 → 0.4).
  - A snap kick now stays dangerous for **~1500 units** (was ~840) and can bank off the far wall. A full power kick crosses the arena, banks off the far wall and is **still live all the way back**.
- **A harmless (white) ball settles** within about half a screen instead of drifting into corners. The live threshold is 480, so a slow ball is clearly safe.
- **Damage per hit and round length stay about the same.** Damage now scales between ball speeds 560 and 2000 instead of 420 and 1700, because balls stay live longer and land more far-away hits. Knockback follows ball speed (live threshold → full power kick).

| Measured (Kael, from (300,450), kicking right) | Before | Now |
|---|---|---|
| Snap: dangerous for | 1.45 s, ~840 u, dies at x≈1140 | **2.0 s, ~1516 u**, banks, dies at x≈1208 |
| Snap: speed after 1 s | 534 | **794** |
| Power kick: speed after 1 s | ~980 | **1318** |
| Power kick: after banking off the far wall | — | still live back at x≈352 |
| Snap while holding S | bent ~60° down within 1 s | **dead straight** |
| Full-charge curve shot, total bend | ~74° | **~28° (Kael)**, capped |

Bot-vs-bot stats (same scripted bots, 6 matches each; the "chaser" is a test-only dummy):

| Matchup | Damage per hit (before → now) | Mean round (before → now) |
|---|---|---|
| Idle player vs sparring bot | 8.0 → 8.6 | 77 s → 65 s |
| Chaser vs sparring bot | 8.7 → 8.5 | 76 s → 79 s |
| Chaser vs chaser (point-blank brawl) | 8.6 → 7.8 | 29 s → 25 s |

The sparring bot is now *more* accurate because its shots fly straight. That's why "idle vs bot" rounds got a bit shorter.

## How to playtest the ball fix
1. Start a match. With **WASD** to fly and the **mouse/trackpad** to aim, get the ball in front of you.
2. **Straight shot:** tap **J** (or left click) while flying in any direction, including sideways. The ball shoots in a dead straight line exactly where your cursor points. It should feel fast: it zips across most of the arena and often bounces off the far wall before it turns white (harmless).
3. **Power shot:** hold **J** for about a second (you slow down; the charge glow fills), then release with the ball at your foot. It crosses the whole arena, bounces off the far wall and comes back still glowing (still dangerous).
4. **Curve shot, on purpose:**
   - Hold **J** for at least half a second.
   - Keep flying **sideways** relative to where you aim. Aiming right, hold **W** or **S**; aiming up, hold **A** or **D**.
   - Release **J** while still moving sideways.
   - The ball starts toward your cursor and gently bends toward the side you were moving, about 30° by the time it reaches the other side. It's good for curling around the opponent or into a bank shot.
   - A quick tap never curves, so normal fighting shots stay predictable.
5. **Dead ball:** when the ball turns white it slows down and stops fairly soon, so it's easy to go and collect.

What to report: does the ball now go where you point? Is it fast enough, or too fast? Is a curve shot easy to do on purpose, and does 30° feel like enough bend?

## What's done (full feature list)
- **Flight:** 360° movement with momentum and drag, a capped top speed (× hero speed), and wall stops at the body edge. You face your aim, or the opponent when there's no aim.
- **Dash** (press): a burst in the move direction (or facing). It has a cooldown, and its first ticks are invulnerable, so enemy balls pass through.
- **Wall kick-off:** dash while touching a wall to launch off it at 1300, keeping the sideways part of your input.
- **Ball:**
  - Kicks cruise for 0.25 s, then drag applies: 0.4 while live, 1.0 once neutral.
  - Wall bounces count `bounces`.
  - Curve spin bends the path by a capped total.
  - Movement is sub-stepped (no tunnelling at 2600 u/s), and a slow ball returns to neutral.
- **Kicks:** they fire on release.
  - A tap is a snap kick (1050). Holding charges a power kick (up to 1900) at 60% move speed, with one `chargeFull` event.
  - Curve shot (charge ≥ 0.5 + moving sideways): the bend is capped at `CURVE_BEND × control`.
  - Kicks go in the aim direction, or toward the opponent.
- **Trap / dribble:**
  - Hold trap near the ball and it sticks to your foot. It pops loose after 1.5 s, and you must let go of trap to re-grab.
  - Kick while trapping to fire instantly.
  - You can catch slow enemy balls (≤ 800), and an enemy kick steals a trapped ball.
- **Resolution order (GDD §4):** foot, then body hit, then soft bump. A live ball never hurts its owner, and a neutral ball never hurts anyone.
- **Perfect return:** release within 6 ticks of the projected body impact. The ball goes back at ×1.5 with big hitstop, 35 aura and a PERFECT! callout.
- **Clash:** same-tick double touch → 14 ticks of freeze. The higher `charge × power × element` wins; a tie pops the ball up, neutral.
- **Damage (GDD §6):** linear between `DAMAGE_MIN_SPEED` and `DAMAGE_MAX_SPEED` and still rising above it, × bank bonus (max 2) × hero power × combo scaling × Infuse 1.2.
- **Hit effects:** knockback along the ball's path (550–1000, by ball speed), hitstun, hitstop, and the ball rebounds (straight, still live).
- **Combos:** each further hit stuns for 80% of the previous one, and the 5th hit gives 0.6 s of invulnerability (no infinites).
- **Wall splat:** a stunned fighter hitting a wall above 600 takes 5 damage, bounces, and gets a longer stun.
- **Close call:** an enemy ball within 26 units (or through you mid-dash), once per pass, gives 15 aura.
- **Aura and Infuse:** kicks, perfects, close calls and hits fill aura. **Infuse** (E, 1 bar): the next kick carries your element and does ×1.2 damage.
- **Match flow:**
  - Countdown 3-2-1 → FIGHT → 90 s.
  - K.O.: a 30-tick freeze, then round over (2.5 s), then the next round or the match end (best of 3).
  - Timeout: higher HP wins. A tie starts sudden death (walls close in, ball ×1.25, next damage wins).
  - Aura carries over between rounds.
- **Hitstop:** the world freezes; presses during the freeze fire on the first tick after it.

## Verified (ball-feel fix)
- `npm run typecheck`, `npm test` (118 tests in 14 files, including the lead's `tests/integration/sparring-bot.test.ts`), `npm run build && npm run smoke`, and `node scripts/scenario-integration.mjs` all pass.
- New tests in `tests/sim/ballfeel.test.ts` pin the targets:
  - A snap kick flies straight while moving sideways.
  - Full speed is kept through the cruise.
  - A snap stays live for ≥ 1300 units.
  - A power kick is still live past mid-arena after banking.
  - The live threshold is under half a snap.
  - A neutral ball settles within 600 units.
  - A light charge plus sideways movement doesn't curve; half charge does.
  - Total bend is ≤ `CURVE_BEND × control` and within 23–35° for every hero.
- Integration scenario: after ~12 s of scripted fighting vs the bot, HP was [66, 91] with the ball live; pause and restart work.
- Screenshots:
  - **int-02:** Yuki's shot hits Kael, with a cyan shockwave ring and an "11" damage number.
  - **int-03:** Yuki has the ball trapped, with a FROST INFUSED badge, and Kael is at about 66% HP.
  - **Smoke 02-playing:** a cyan kick burst on the ball by Yuki.

## Known issues / not done
- Guard (Q) and Super (R) are wave 2; their inputs are ignored and `superStart` / ball `super` mode are never produced.
- Kicks fire on **release** (GDD §5), so a snap has the tap length as latency (about 50–80 ms).
- The `move` event (reserved) is not emitted.
- Sudden death is "next damage wins" (`SUDDEN_DEATH_ONE_HIT`).
- A fighter can push a ball that's pinned in a wall corner into its own body (the ball sits inside the body until kicked). I tried pushing the body off instead, but that also shoved fighters away while dribbling along walls and badly hurt play, so I reverted it. Harmless for humans (just kick it); see request 1 for the bot.

## Contract changes (`src/shared/types.ts`, additive only)
- `BallState.cruise?: number`: **new in this fix**, sim-internal (ticks left of no-drag flight after a kick). Ignore it in presentation.
- `FighterState.trapLock?`, `FighterState.closeCall?`: sim-internal.
- `dash` event: optional `wallKick?: boolean`.
- New event `{ type: 'bump'; player; pos; speed }`: a soft body push of the ball (above 150 closing speed).
- New constants: `BALL_CRUISE_TICKS`, `BALL_NEUTRAL_DRAG`, `CURVE_MIN_CHARGE`, `CURVE_BEND`, `DAMAGE_MIN_SPEED`, `DAMAGE_MAX_SPEED`. `CURVE_SPIN` still exists but is now derived (`CURVE_BEND × SPIN_DECAY`, about 0.73). `src/dev/fakeSim.ts` reads the old speed constants and keeps working, but its damage mapping won't match the real sim any more (dev tool only).

### Event notes for render / audio / UI
- `kickStart` fires when the kick goes active (release), with the charge. While charging, read `kickPhase === 'charging'` and `charge`.
- `kick.power` is 0..1: 0 at the live threshold, 1 at a full power kick. `kick.curve` is now true **only** for deliberate curve shots.
- `hit.combo` includes this hit; `hit.bank` is 0–2.
- `ko` fires on the K.O. tick; `roundEnd` fires on the first tick after the freeze; `matchEnd` fires at the end of the round-over pause.
- Callouts: `PERFECT!`(3) `BANK SHOT!`(2) `DOUBLE BANK!`(3) `N-HIT COMBO!`(2/3) `WALL SPLAT!`(2) `CLOSE CALL!`(1) `CLASH!`(3) `K.O.!`(3) `TIME!`(2) `SUDDEN DEATH!`(3).

## Requests for lead
1. **Sparring bot corner stall** (`src/ai`, yours). When the ball comes to rest in a corner, the bot tries to stand "behind the ball" (opposite its target), which is outside the arena. It wedges itself into the corner facing away and stops kicking until the round resets.
   - I saw this with the in-between tuning: in one run with seed 1337 the bot made only 4 kicks in 90 s.
   - With the final tuning, `sparring-bot.test.ts` passes, and over 5-minute runs the pro bot makes ~39 kicks (rookie 20, legend 64; before: 64 / 15 / 19).
   - The test is chaotic, though: small sim changes move the ball's resting spots.
   - Suggested fix: if the behind-the-ball spot is outside the arena (or the ball is within ~60 u of two walls), aim the kick from where you are toward the arena centre, or toward the opponent via a bank.
2. Earlier requests (mouse aim, a dummy opponent, smoke server polling, the hitstop rule in `sim-rules`) are all resolved by the wave 1 integration. Thanks.

## Tuning knobs worth playtesting (`src/shared/constants.ts`)
| Constant | Value | What it changes |
|---|---|---|
| `SNAP_KICK_SPEED` / `POWER_KICK_MAX_SPEED` | **1050 / 1900** (was 900 / 1700) | Shot speeds |
| `BALL_CRUISE_TICKS` | **15 (0.25 s)**, new | How long a fresh kick flies at full speed before slowing |
| `BALL_DRAG` | **0.4** (was 0.55) | How fast a live ball slows after the cruise |
| `BALL_NEUTRAL_DRAG` | **1.0**, new | How quickly a harmless ball settles |
| `BALL_LIVE_MIN_SPEED` | **480** (was 420) | Below this the ball turns white and harmless |
| `CURVE_MIN_CHARGE` | **0.5**, new | How much charge a curve shot needs |
| `CURVE_BEND` | **0.52 rad ≈ 30°**, new (× hero control) | Total bend of a curve shot |
| `SPIN_DECAY` | 1.4 | How quickly that bend is used up (higher = bends early, then flies straight) |
| `DAMAGE_MIN_SPEED` / `DAMAGE_MAX_SPEED` | **560 / 2000**, new | Ball speeds where damage is 4 and 16. **Round length**: raise both to shorten damage, lower to lengthen |
| `DAMAGE_MIN` / `DAMAGE_MAX` | 4 / 16 | Damage at those speeds |
| `FIGHTER_ACCEL` / `FIGHTER_MAX_SPEED` / `FIGHTER_DRAG` | 2600 / 520 / 5.5 | Snappy vs floaty flight |
| `DASH_SPEED` / `DASH_TICKS` / `DASH_COOLDOWN` / `DASH_INVULN` | 1150 / 8 / 48 / 6 | Dash distance, frequency and dodge generosity |
| `WALL_KICKOFF_SPEED` | 1300 | Wall kick-off launch |
| `KICK_CHARGE_FULL` | 60 ticks | Time to a full charge |
| `PERFECT_WINDOW` | 6 ticks | Perfect timing window (release → would-be impact) |
| `TRAP_MAX_TICKS` / `TRAP_CATCH_MAX_SPEED` | 90 / 800 | Dribble time; the fastest enemy ball you can catch |
| `HIT_KNOCKBACK_MIN` / `HIT_KNOCKBACK` / `HITSTUN_DRAG` | 550 / 1000 / 1.5 | How far hits throw you |
| `HITSTUN_TICKS` / `HITSTUN_COMBO_DECAY` / `COMBO_MAX_HITS` | 21 / 0.8 / 5 | Combo length |
| `HITSTOP_KICK` / `HITSTOP_HIT` / `HITSTOP_PERFECT` / `HITSTOP_KO` | 3 / 6 / 8 / 30 | Impact freeze frames |
| `SUDDEN_DEATH_SHRINK_SPEED` / `SUDDEN_DEATH_ONE_HIT` | 30 u/s / true | Sudden death pressure |
