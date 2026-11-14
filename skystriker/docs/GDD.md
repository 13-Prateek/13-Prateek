# SKYSTRIKER: Game Design Document

> A 1v1 flying ball-fighter. Two super-powered fighters fly freely in a closed
> 2D arena with one ball. **You can never touch your opponent directly. The
> ball is your only weapon.** Fill your aura, power up, and fire a named super
> shot with a cinematic freeze.

Pillars (every decision is checked against these):
1. **Readable:** at any moment, the player can see whose ball it is and how dangerous it is.
2. **Skill expression:** timing, angles, and movement separate good players from great ones.
3. **Superhero feel:** every impact is loud; supers are spectacle.
4. **Short and replayable:** rounds take 60–90 s, and a rematch is one button away.

All numbers live in `src/shared/constants.ts`. This doc describes intent.

---

## 1. Arena
- Fixed 1600×900 world, scaled to fit the screen (letterboxed). There's no camera scroll, only shake and zoom punches.
- A closed box with four walls. The ball bounces off them, and fighters stop at them or kick off them.
- **Zero gravity.** Fighters and the ball both feel light exponential drag.

## 2. Fighters and movement
- **Free 360° flight with momentum.** Movement accelerates toward the input direction, has a capped speed, and drifts under drag. There's no flight bar.
- **Dash** (free) on a press: a short burst in the move direction (or facing direction when not moving). It has a cooldown, is **not** invulnerable, and leaves you **Winded** (slowed) for a moment afterwards. It's for repositioning and reading shots early, not a panic button.
- **Phase Dash** (costs aura, see §7): the same burst, but **invulnerable for its whole duration** (the ball passes through you), followed by a longer Winded slow-down. Shares the dash cooldown.
- **Wall kick-off:** dashing while touching a wall launches you away from it at `WALL_KICKOFF_SPEED`.
- *Why (pressure pass, after the first playtest):* in open zero-gravity space, flying sideways already dodges slow shots, and a free invulnerable dash made dodging the default. Dodging must cost commitment or meter.
- Body hurtbox: a circle of `FIGHTER_BODY_RADIUS`.

## 3. The ball: three modes
| Mode | Visual | Rule |
|---|---|---|
| `neutral` | White, calm glow | Harmless. Touching it with your body just bumps it softly. |
| `live` | Owner's colour + trail | Hurts **only the non-owner**. The owner's body bumps it harmlessly. |
| `super` | Element VFX | Like live, but bigger damage plus an effect. Wave 2. |

- After a kick the ball is `live` with `owner = kicker`. It returns to `neutral` when its speed falls below `BALL_LIVE_MIN_SPEED`.
- `bounces` counts wall bounces since the last kick and resets on each kick.
- Spin bends the trajectory: acceleration is perpendicular to velocity, proportional to spin, and spin decays over time.
- **Rally Heat (0–4):** each time a live ball is kicked back by the *other* player (a return), Heat goes up by 1 and the ball flies `HEAT_SPEED_PER_LEVEL` faster per level. Heat resets to 0 when the ball hits someone or goes neutral. Long rallies escalate until someone breaks. Shown by the ball's glow and the pitch of its sound.

## 4. Hit vs. kick resolution (the core rule)
Each tick, in this order:
1. **Foot first.** If the fighter's kick is in its `active` window and the ball overlaps the **foot hitbox** (a circle at `pos + facing * FOOT_REACH`), it's a **KICK**. The ball becomes the kicker's, with its speed set by charge.
2. **Body second.** Otherwise, if a ball that is `live`/`super` and owned by the opponent overlaps the **body**, it's a **HIT** (unless the fighter is invulnerable).
3. Otherwise any overlap with a body is a soft bump with no damage.

**Perfect return:** a kick on a live enemy ball that lands within `PERFECT_WINDOW` ticks of when the ball *would have* hit the body sends it back at `PERFECT_SPEED_MULT` speed. Use time-to-impact: distance over closing speed. It also gives big hitstop, aura and a callout.

**Clash:** if both fighters' foot hitboxes touch the ball on the same tick, the ball freezes (big hitstop). The higher `charge × hero.power × elementAdvantage` wins and kicks it. Ties go to neutral, with the ball popping straight up.

## 5. Kick toolkit
| Input | Move | Notes |
|---|---|---|
| Tap kick (release before `KICK_CHARGE_START`) | Snap kick | `SNAP_KICK_SPEED`, fast startup |
| Hold kick | Power kick | Charge 0→1 over `KICK_CHARGE_FULL`, fires on release; speed lerps to `POWER_KICK_MAX_SPEED`. While charging, the fighter moves at 60% speed. A `chargeFull` event fires at max. |
| Kick while moving perpendicular to the aim | Curve shot | Adds spin of `CURVE_SPIN × sign(cross(aim, moveDir))`, scaled by hero control |
| Hold trap near the ball | Trap / dribble | Ball sticks to the foot, carried along. Releases when trap is let go or after `TRAP_MAX_TICKS` (pops loose; event has `forced: true`). Kicking while trapping kicks it instantly with charge. |

Kick direction is the aim direction from the input. If none is given, it aims at the opponent.

## 6. Damage, health, combos
- `MAX_HP` each. Damage scales linearly from `DAMAGE_MIN` at the live threshold to `DAMAGE_MAX` at max power-kick speed, then:
  - × `(1 + BANK_BONUS_PER_BOUNCE × min(bounces, 2))` (callouts "BANK SHOT!" / "DOUBLE BANK!")
  - × the attacker's hero `power`
  - × `COMBO_SCALING[comboAgainst]`
  - Perfect-returned balls get no extra damage multiplier, because the extra speed already raises the damage.
- A hit applies hitstun, knockback along the ball direction, `HITSTOP_HIT`, and bounces the ball off the victim (it stays live).
- **Wall splat:** a fighter in hitstun hitting a wall above `WALL_SPLAT_MIN_SPEED` takes `WALL_SPLAT_DAMAGE` and bounces off.
- **Combo:** `comboAgainst` goes up for each hit taken while still in hitstun and resets when hitstun ends.
- **Close call:** a live enemy ball passing within `CLOSE_CALL_DISTANCE` of the body without hitting gives aura and a "CLOSE CALL!" callout (once per ball pass).

## 7. Aura (3 bars)
- Gained from kicks, perfect returns, close calls, hits landed and (less) hits taken, all scaled by hero `auraGain`.
- Wave 1: **Infuse** (1 bar). The next kick carries your element: the ball's `element` is set, its colour changes, and damage gets ×1.2.
- **Phase Dash** (half a bar, Q): the invulnerable dodge (§2). It replaces the old Guard idea as the defensive aura spend. Dodging with it does not earn close-call aura.
- Wave 2: **Super** (3 bars) for a super shot with the cinematic cut-in and power struggle.

## 8. Match flow
- Best of 3 (`roundsToWin = 2`). Each round has a 3-second countdown (ball spawns at the centre, fighters at ¼ and ¾), then `ROUND_TIME`.
- KO: hp ≤ 0 gives `HITSTOP_KO`, a slow-mo KO event, then `roundOver` for `ROUND_OVER_TICKS`, then the next round or `matchOver`.
- **Final Rush:** the last 20 s of a round. A "FINAL RUSH!" callout, the ball's Heat never drops below 1, and the walls start closing in, so rounds rarely reach the timer quietly.
- Timeout: the player with higher HP wins. If HP is equal, **sudden death** starts: ball speed ×1.25 and the walls slowly close in.

## 9. AI (wave 2)
- It predicts the ball's path, bounces included, about 1 s ahead, and uses utility scoring to choose intercept / attack / dodge / trap / bait / save aura.
- Difficulty adds reaction delay, aim noise and a chance to misread: Rookie 350 ms, Pro 200 ms, Legend 120 ms.
- Personalities: Brawler, Wall, Trickster, Rival (adapts to your habits).

## 10. Controls (player 1)
| Action | Keyboard + mouse | Gamepad |
|---|---|---|
| Fly | WASD | Left stick |
| Aim | Mouse (direction from fighter to cursor) | Right stick |
| Kick | Left click / J | RT |
| Trap | Right click / K | LT |
| Dash (free) | Space / Shift | A |
| Infuse / Phase Dash / Super | E / Q / R | X / B / Y |
| Pause | Esc / P | Start |

## 11. Feel ("juice") requirements
Hitstop on every kick and hit · screen shake scaled by impact · particles on kicks, bounces and hits · ball trail coloured by owner · charge glow · callout text · slow-mo plus a white flash on KO · instant rematch. See `.claude/skills/game-feel`.

## 12. Roadmap
- **Wave 1 (parallel):** sim core · renderer/VFX · audio + HUD + input + menus
- **Wave 2 (parallel):** AI opponent · supers and cinematic cut-ins · balance pass
- **Wave 3:** remaining heroes' supers, power struggles, Shot Chain, Awakening, story ladder, unlocks, arenas
