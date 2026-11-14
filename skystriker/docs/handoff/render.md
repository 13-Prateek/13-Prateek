# Handoff: RENDER / VFX (wave 1)

Branch: `claude/skystriker-render` · Owner paths: `src/render/**`, `src/dev/**`

## What's done
- **Arena.** Near-black starfield with a faint blue grid, a soft blue haze in the middle, twinkling stars and drifting dust that shift slightly with the action (parallax). Neon double-line walls with corner brackets. They pulse when a round starts. In sudden death they turn red, pulse, and follow `state.arena` as it shrinks, with the area outside darkened.
- **Letterbox.** Same 1600×900 fit maths as the stub. It's now exported as `screenToWorld()` / `computeFit()` from `src/render` so mouse aim matches what's drawn. Shake and zoom don't affect it.
- **Fighters.** Glowing stick figures in hero colours, built from pooled sprites with nothing redrawn per frame.
  - They lean into flight with their legs trailing and bob gently while idle. A white visor slit on the head and a chevron show the aim direction.
  - **Charging:** the knee comes up, the front hand points at the aim, the body glow grows and pulses faster, a ring tightens around the body and sparks are pulled inward. At full charge the fighter flashes white.
  - **Kick (`active`):** the leg snaps straight out so the foot lands on the sim's foot hitbox, with a crescent swoosh and a glowing foot. During `recovery` the leg eases back.
  - **Trap:** the foot reaches to the ball and a rotating ring appears around it.
  - **Dash:** the body stretches into a flying pose, leaving afterimages and speed streaks.
  - **Hit:** pure white flash for a few frames, then a flickering tint while in hitstun, with limbs flailing and the body tumbling. During hitstop the victim shudders.
  - **Invulnerable:** shimmer.
  - **KO'd:** grey and limp.
  - **Infused:** the foot glows in the element colour and gives off embers.
- **Ball.**
  - Neutral: a calm white core and a soft breathing glow, with no trail and no ring.
  - Live: owner colour on the glow, a pulsing danger ring, and a trail whose length and brightness grow with speed.
  - Infused: element colour plus element particles (fire embers, frost shards, volt crackle, stone dust).
  - It squashes on bounces and kicks, stretches with speed, and a seam spins to show spin.
- **Event VFX** (every `GameEvent` the renderer cares about):
  - kick: a burst scaled by power, a ring, shake, and a small zoom on strong kicks
  - perfect: a white ring, a colour split for about 0.1 s, a light screen flash and zoom
  - chargeFull: a ring pulse
  - bounce: sparks plus a flare on that wall segment
  - ballNeutral: a soft white puff
  - hit: white flash, a burst in the attacker's colour, rings, a screen ripple (shockwave), shake scaled by damage, a zoom punch and a floating **damage number**
  - wallSplat: a crack decal that fades, dust, a ripple and heavy shake
  - clash: a burst in both colours, a light screen flash and a colour split
  - closeCall: whoosh streaks
  - **ko**: white screen flash, about 1 s of visual slow-mo (effects at 0.25×), a held zoom toward the KO point, a big burst, three rings and a ripple
  - dash: streaks and a puff
  - trap/trapRelease: ring / pop
  - infuse: an element spiral
  - superStart: a placeholder flash and ring
  - fight/countdown/roundStart/suddenDeath: arena pulses
- **Hitstop.** While `state.hitstop > 0` poses are held, idle animation and the ball trail freeze, and particles run at 0.35× so the impact still blooms. Shake runs in real time.
- **Performance.** Particles (900), tween sprites (220), decals and afterimages are fixed pools, with no allocation in the per-frame path. Bloom is one `AdvancedBloomFilter` on a screen-space container. `?lowfx=1` turns off bloom, the ripple and the colour split.
- **Dev harness (VFX lab).** `src/dev/vfx.html` plays 11 scripted scenes through the real renderer using a small fake sim (`src/dev/fakeSim.ts`), so every effect can be seen without the real sim.

## How to playtest it
### The VFX lab (every effect, no sim needed)
1. In `skystriker/`, run `npm run dev`.
2. Open **http://localhost:5173/src/dev/vfx.html**.
3. Press a number key (or click a button). The panel describes what you should see:

| Key | Scene | What you should see |
|---|---|---|
| 1 | Idle flight | Both fighters fly in loops, leaning into the motion with legs trailing. The white ball is calm with no trail. |
| 2 | Power kick | Orange crouches and winds up: the glow grows, a ring tightens and sparks pull in. It flashes at full charge, then the leg snaps out with a big burst and shake. The ball turns orange with a long trail and sparks off the walls. |
| 3 | Hit + wall splat | Blue gets hit: white flash, orange burst, ring, the screen ripples, and a damage number pops. Blue then slams into the right wall: a crack appears and a second number pops. |
| 4 | Perfect return | Orange kicks blue's shot back at the last moment: white ring, brief colour split, a longer freeze. Blue dashes away with afterimages, and a close-call whoosh appears. |
| 5 | Clash | Both kick at once: light flash, sparks in both colours, a long freeze, then the ball shoots up. |
| 6 | K.O. | Full-power hit: the whole screen flashes white, the view zooms toward blue, and sparks and rings play in slow motion. Blue turns grey and tumbles. |
| 7 | Live ball + elements | The ball goes fire → frost → volt → stone. The trail is long when fast and shorter as it slows. Below danger speed it turns calm white with a soft puff. |
| 8 | Dashes | Afterimages and streaks. Halfway through, orange starts to shimmer (invulnerable). |
| 9 | Trap / infuse | Orange catches the ball on its foot (rotating ring) and dribbles. The ball pops loose, orange powers up with a fire spiral and glowing foot, then fires a fire ball into blue. |
| 0 | Close call | The ball whizzes just past blue, leaving white whoosh lines. |
| - | Sudden death | The walls turn red, pulse and close in. |

Other keys: **A** cycles through all scenes · **S** toggles 0.25× slow motion (good for studying a hit) · **Space** pauses · **R** replays · **H** hides the panel. Add `?lowfx=1` to the URL to see the low-effects mode.

### The real game
`npm run dev`, then open http://localhost:5173/. The sim is still a stub, so for now you only see the arena, fighters that lean and trail as you fly with WASD, and the calm white ball. Kicks, hits and KOs light up as soon as the real sim emits its events. The renderer already handles every one of them, as the lab shows.

## Verification I ran
- `npm run typecheck` ✅ · `npm test` ✅ (9 tests, including `src/render/fit.test.ts` and `src/render/camera.test.ts`) · `npm run build && npm run smoke` ✅ (`02-playing.png`: the orange fighter leans into its flight and the neutral ball is calm white at the centre).
- `node src/dev/shots.mjs` steps each scene frame by frame and saves `playtest-shots/vfx-*.png`. I opened each one:
  - `01-kick-charge`: the orange figure is crouched with the knee up, a glow, and a ring around it.
  - `02-kick-impact`: a big orange/white spray along the kick direction, covering the fighter's extended leg.
  - `03-kick-trail`: the ball is orange with a long comet trail and a spinning seam.
  - `04-hit`: a white impact flash on blue with streaks.
  - `05-wall-splat`: the wall visibly ripples (shockwave), with a ring and a "9" damage number.
  - `06-perfect`: a white flash with a colour split on the edges.
  - `07-clash`: a burst between both fighters with a light screen wash.
  - `08-ko-flash`: the whole screen white.
  - `09-ko-slowmo`: zoomed in, huge rings and sparks, a "13", and blue grey and tumbling.
  - `10/11-trail`: fire and frost balls with element trails.
  - `12-dash`: stacked cyan afterimages.
  - `13-trap`: a ring on the ball at orange's foot.
  - `14-infuse`: an orange spiral of embers around the fighter.
  - `15-sudden-death`: red walls pulled in, with the outside darkened.
  - `16-idle`: both fighters in flight poses.
  - Close-ups made with `node src/dev/zoom.mjs`: charge pose, kick pose, hitstun recovery with a crack decal.
- **Frame time** (headless Chromium + SwiftShader software GL, 1280×720, real-time hit/trail/KO scenes, other sessions loading the CPU to about 57%):
  - Our JS per frame (sim + render update): **p50 0.40 ms, p95 0.70 ms, max 1.0 ms**. That means no GC hitches.
  - Total frame: p50 70–100 ms, p95 100–117 ms, with no spikes beyond the p99. This is dominated by CPU software rasterisation: our own JS is under 1 ms, and a blank page runs at 16.7 ms. So this is not a real-GPU number.
  - Peak live particles: 154 of 900.

## Known issues / not done
- **Damage numbers are drawn by the renderer** (world space, above the victim). The HUD should **not** also draw them. Callout text ("PERFECT!", "K.O.", "BANK SHOT!") is left to the HUD.
- Ball mode `super` only gets a bigger glow and denser element particles. Super cut-ins are wave 2.
- `superStart` has a placeholder flash/ring only.
- KO slow-mo is visual only (effects and numbers slow down). The sim keeps its own timing.
- In idle, the floating pose reads a little like walking. A floatier pose could be a later polish pass.
- The real-GPU frame rate hasn't been measured on the owner's machine yet. Please check by eye that `npm run dev` stays smooth during the lab's **A** (showcase) mode, and try `?lowfx=1` if not.
- The fake sim in `src/dev/` is only an approximation, for visuals.

## Contract changes
None to `src/shared/**`.
`createRenderer(host, opts?)` gains an **optional** second parameter (`{ lowFx?: boolean }`) and the returned object has an extra `debug` field. The `Renderer` interface and signature are unchanged, so `main.ts` and `loop.ts` work as they are.

## Requests for lead
1. **Mouse aim (input session):** use `screenToWorld(clientX, clientY, window.innerWidth, window.innerHeight)` exported from `src/render` (the canvas fills `#app`, which is `position: fixed; inset: 0`). It ignores shake and zoom by design.
2. **Sim event positions:** the effects assume:
   - `kick.pos` is the ball position at contact
   - `hit.pos` is the contact point on the ball/body
   - `bounce.pos` is the wall contact point, `bounce.normal` points into the arena, and `bounce.speed` is the speed before the bounce
   - `wallSplat.pos` is the wall contact point, with the normal pointing into the arena
   - `dash.dir` is a unit vector
   - The `hit` event is emitted after knockback is applied, so the burst follows `target.vel`.
3. **Optional:** add `src/dev/vfx.html` to `build.rollupOptions.input` if you want the VFX lab in published builds, and an npm script `"vfx": "node src/dev/shots.mjs"`. Neither is required: the lab works under `npm run dev`.
4. **HUD session:** please don't duplicate damage numbers (see above).

## Tuning knobs
All are in `src/render/palette.ts` (`FX`). They're purely visual, so changing them never affects gameplay.

| Constant | Value | What it changes |
|---|---|---|
| `SHAKE_MAX` | 22 | Max shake offset (world units) at full trauma |
| `SHAKE_DECAY` | 1.6 | How fast shake dies out (trauma per second) |
| `TRAUMA_KICK` / `TRAUMA_KICK_POWER` | 0.12 / 0.28 | Shake on a kick (base + × power²) |
| `TRAUMA_HIT` / `TRAUMA_HIT_PER_DMG` | 0.3 / 0.025 | Shake on a hit (base + per damage point) |
| `TRAUMA_PERFECT`, `TRAUMA_SPLAT`, `TRAUMA_CLASH`, `TRAUMA_KO` | 0.5, 0.5, 0.45, 0.85 | Shake for the big moments |
| `ZOOM_HIT`, `ZOOM_PERFECT`, `ZOOM_CLASH`, `ZOOM_KO` | 0.03, 0.05, 0.05, 0.16 | Zoom punch size (0.05 = 5%) |
| `KO_SLOWMO_SCALE` / `KO_SLOWMO_SECONDS` | 0.25 / 1.0 | KO slow-mo speed and length |
| `HITSTOP_FX_SCALE` | 0.35 | How fast sparks move during hitstop freezes |
| `TRAIL_POINTS` / `TRAIL_SPACING` | 18 / 0.011 s | Ball trail length (points × spacing = time span) |
| `TRAIL_FULL_SPEED` | 1700 | Ball speed at which the trail reaches full brightness |
| `BLOOM_THRESHOLD` / `BLOOM_SCALE` / `BLOOM_BLUR` | 0.35 / 1.1 / 7 | Glow strength (off with `?lowfx=1`) |
| `WALL`, `WALL_SUDDEN_DEATH`, `GRID`, `BG` | colours | Arena palette |

Element colours are in `ELEMENT_COLOR` and `ELEMENT_COLOR_2` in the same file.
