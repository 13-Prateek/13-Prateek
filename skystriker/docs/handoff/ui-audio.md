# Handoff: Audio + UI + Input (wave 1)

Branch: `claude/skystriker-ui-audio`. Files: `src/input/**`, `src/ui/**`, `src/audio/**`, the crosshair cursor in `index.html`,
`tests/input/`, `tests/ui/`, `scripts/scenario-ui-hud.mjs`, `scripts/scenario-ui-integ.mjs`.
No changes to `src/shared/**`, `src/game/**` or `src/main.ts`.

## What's done
**Input (player 1)**
- Full GDD §10 map: WASD fly, mouse aims, left click / J kick, right click / K trap, Space / Shift dash, E infuse, Q guard, R super.
- Aim is a unit vector from your fighter to the cursor in world space, using the same letterbox maths as the renderer (checked against the render branch's `fit.ts`). Before you touch the mouse, aim is (0,0), so the sim aims at the opponent for you.
- Diagonals aren't faster. The right-click menu is blocked. Ctrl+R and other browser shortcuts still work. Releasing focus (alt-tab) lets go of every key.
- Very quick taps (down and up inside one frame) still reach the sim once.
- Esc / P (pause) and Enter (rematch) are reported to the game loop through `onMenu(cb)`, not as gameplay input.
- Gamepad (standard mapping): left stick or D-pad fly, right stick aims (auto-aim when centred), RT/RB kick, LT trap, A dash, X infuse, B guard, Y super, Start pause.
- Crosshair cursor over the game.

**HUD** (DOM overlay in `#ui`, scaled to the same letterbox as the arena)
- Hero names in hero colours, a P1/P2 tag, and round-win pips.
- Skewed neon health bars. Lost health shows as a white chunk that holds for about half a second, then drains. The bar shakes when you're hit and pulses red at 25 HP or less.
- Three aura segments per player that fill, flash when a bar completes, and glow when full. There's an "ELEMENT INFUSED" tag while infuse is armed.
- Centre timer in whole seconds. It pulses red at 10 s or less, shows SD in sudden death, and reads 0 after a timeout. "ROUND N" / "FINAL ROUND" sits under it.
- Countdown: a big "ROUND 1" (or gold "FINAL ROUND") label, punchy 3, 2, 1, then FIGHT!
- Callouts from the sim, sized by tier: tier 1 is small and sits by that player's side, tier 2 is medium, tier 3 is huge and centred and clears the small ones. Hero colour glow. K.O./TIME!/SUDDEN DEATH callouts from the sim are not doubled, because the announcer shows them itself.
- Combo counter ("3 HIT COMBO") on the attacker's side that pops on each hit and fades after 1.6 s.
- K.O. slam, then "<HERO> WINS THE ROUND" (or "TIME!" first on a timeout, "DRAW" on a tie).
- Match result screen: winner's name in their colour, "WINS!", the score, and a blinking "Press ENTER to rematch".
- Super banner (wave 2 ready): the super's name across the screen on `superStart`.
- Pause overlay "PAUSED · Press ESC or P to resume". It's display only, via `hud.setPaused(bool)`.

**Audio** (Web Audio, everything synthesised, no files)
- Kick thump that gets heavier with power (sub boom on power kicks, whistle on curve shots, element layer on infused kicks). A leg-swing swoosh on every kick release, even a whiff. A rising charge whine while you hold kick, and a ping at full charge.
- Bounce tick (louder when faster), hit crunch (pitch climbs through a combo), wall splat, metallic clash, bright PERFECT sting, close-call whoosh, dash and wall kick-off, trap thud, soft bump, element-flavoured infuse (fire crackle, frost shimmer, volt buzz, stone rumble), aura chime, countdown beeps, a FIGHT! chord stinger, a K.O. boom with a reverb tail, round/match jingles, a super riser and a sudden-death alarm.
- Every sound is panned left/right by where it happens and pitch-randomised ±5%.
- Procedural music loop (A minor, 128 BPM) with three intensities: calm pad (countdown), combat drums and bass (fighting), and an arp with snare (final round, someone at 30 HP or less, sudden death). It switches by itself from the events. Music dips under big hits and the K.O.
- Master bus: compressor → limiter → soft clip, max 28 voices plus a per-sound cap. In a deliberately overloaded stress render (music at max, a kick + hit + bounces every 2–3 frames, a clash and a K.O.), the peak is about 0.93 with **zero clipped samples**.
- `unlock()` creates/resumes the AudioContext on the first click/key. `main.ts` already calls it.

## How to playtest it
### A. The test bench (works now, without the other branches)
1. In `skystriker/`, run `npm run dev`, then open **http://localhost:5173/src/ui/dev/index.html**.
2. Click anywhere once to turn sound on. You'll hear a soft synth pad (calm music).
3. The panel at the bottom-left has buttons. Press **H** to hide or show it.
   - **HUD scenes** (click one and watch):
     - `countdown`: "ROUND 1", then big 3 … 2 … 1 … FIGHT! with a beep on each number and a chord on FIGHT. The music picks up drums.
     - `damage`: three quick hits on the blue player. Their bar drops instantly, a white chunk lingers then drains, the bar shakes, a "3 HIT COMBO" counter pops on the left, and you hear three crunches climbing in pitch.
     - `callouts`: a huge centred "DOUBLE BANK!", a small blue "CLOSE CALL!" on the right and an orange "PERFECT!" on the left.
     - `ko`: K.O. slams in with a deep boom (the music dips), then "KAEL EMBER WINS THE ROUND" and the left win pip lights. After a pause round 2 counts down.
     - `match`: final round. Blue K.O.s orange, then the result screen "YUKI RIVEN WINS! 1 — 2 · Press ENTER to rematch". Press **Enter** to start over.
     - `timeout`: the clock runs 4, 3, 2, 1 in red, then "TIME!" and the round goes to the player with more HP.
     - `final`, `sd` (timer shows SD and an alarm sounds), `super` (an "INFERNO COMET" banner with a riser), `pause`, `demo` (a whole scripted round with every sound).
   - **Sounds**: each button plays one sound and shows its HUD reaction. `Charge (hold 1s)` gives the whine, then a ping, then a heavy kick.
   - **Music 0 / 1 / 2** switches intensity by hand. **Volume** is the master slider.
4. **Input check:** fly the orange ring with **WASD**. The white line always points from the ring to your mouse; check it in a tall or wide window too. **Hold J or left click**: a rising whine, then a ping at full charge. Let go: a swoosh. **Space** or **Shift**: a dash whoosh. **Esc** or **P** toggles the PAUSED screen. Right click doesn't open a menu. The text line in the panel shows the exact input being sent (move, aim, held buttons, keyboard or gamepad).

### B. The real game (after the lead merges sim + render + this branch)
1. `npm run dev`, open the game, click once for sound.
2. You should see the HUD at the top: names, bars, aura, timer. You'll hear the countdown beeps and the FIGHT! chord, then the music picks up.
3. Fly to the ball with WASD, point the mouse at the opponent and tap **J** or left click: a kick thump, the ball flies where the cursor points. A hit takes a white chunk out of their bar with a crunch, and repeated hits build the combo counter. Hold kick to hear the whine rise, then ping. Let the timer run out: the clock reads 0 under "TIME!".
4. I verified this in a scratch merge of `claude/skystriker-sim` + `claude/skystriker-render` + this branch: all 101 tests pass, it builds, and a scripted bot (`scripts/scenario-ui-integ.mjs`) produced real hits, a "2-HIT COMBO!" callout with the counter, the damage chip, and a real TIME! round win with the pip lit, with no console errors.

## Automated checks I ran
- `npm run typecheck` ✓ · `npm test` ✓ (29 tests in my folders: key/mouse/pad mapping, screen→world through 16:9, 4:3 and ultrawide letterboxes, quick taps, menu keys, blur, chip drain, aura split, timer/countdown labels) · `npm run build && npm run smoke` ✓.
- `node scripts/scenario-ui-hud.mjs` ✓ (starts the vite dev server itself): asserts 3-2-1-FIGHT!, that the damage chip appears and drains, combo 3, three callouts on screen, K.O. then the round winner, the result screen with the rematch prompt, and the HUD letterboxed in a 4:3 window. It renders every sound offline (all audible, none clip) and the stress mix above. Screenshots: `playtest-shots/ui-*.png`. The stress mix is at `playtest-shots/ui-audio-stress.wav` (open it to hear a chaotic fight).
- Screenshots I looked at: the countdown "3" under "ROUND 1"; the damage scene (white chunk on the blue bar, "3 HIT COMBO", FIRE INFUSED tag, 2.9 aura bars glowing); callouts of three sizes with no overlap; the K.O. slam; the round-winner banner; the match result screen; the SD timer; the super banner; and the 4:3 letterbox with the HUD aligned to the arena.

## Known issues / not done
- **Pause and rematch aren't wired into the loop** (that's lead code, see below). Esc/P and Enter are detected and reported, and the overlays exist.
- The stub sim never counts the round timer down, so on this branch alone the in-game timer stays at 90. The real sim does count it down.
- Gamepad was tested with fake pad objects in unit tests only. No physical pad here.
- The charge whine is state-driven (the sim has no "charge started" event). The audio module polls the last state it was given every 40 ms, or the loop can call `audio.update(state)` each frame for exact timing.
- Callout text can overlap a fighter near the top of the arena. It's short-lived and outlined, so it stays readable.
- If the browser blocks audio until a gesture, the first countdown of the very first match is silent until you click or press a key.

## Contract changes
None to `src/shared/types.ts`. Extra (additive) members on my modules' return values, all optional for the loop:
- `createKeyboardInput()` returns `KeyboardInput` = `InputSource` + `onMenu(cb: ('pause'|'rematch') => void)` + `lastDevice()`.
- `createHud()` returns `Hud` = `HudSystem` + `setPaused(bool)` + `destroy()`.
- `createAudio()` returns `GameAudio` = `AudioSystem` + `update(state)` + `setMuted(bool)` + `engine()` + `destroy()`.
- The audio handles the sim's added `bump` event and `dash.wallKick` flag defensively (no type dependency).

## Requests for lead
1. **Pause + rematch wiring** in `main.ts` (needs a `restart()` on the loop for rematch):
   ```ts
   const p1 = createKeyboardInput();
   let paused = false;
   p1.onMenu((a) => {
     const phase = game.state().phase;
     if (phase === 'matchOver' && (a === 'rematch' || a === 'pause')) { game.restart(); return; } // pad Start also rematches
     if (a === 'pause') { paused = !paused; game.setPaused(paused); hud.setPaused(paused); }
   });
   ```
   `restart()` = `createMatch` again into the same loop (the HUD resets itself when `state.tick` goes backwards or the state is new).
2. Optional: call `audio.update(state)` once per animation frame next to `hud.update(state)` (tighter charge-whine timing).
3. Optional: an M key → `audio.setMuted(!muted)`, and a volume setting → `audio.setMasterVolume(v)`.
4. Music intensity is automatic. If the loop ever calls `setMusicIntensity`, the game takes over from then on.
5. `src/ui/dev/index.html` is a dev-only page (Vite serves it in dev, it isn't in the production build). Keep it, or exclude `src/ui/dev` from `tsconfig` if you'd rather not typecheck it.

## Tuning knobs
| Where | Name | Value | What it changes |
|---|---|---|---|
| `src/ui/model.ts` | `CHIP_DELAY` | 0.55 s | How long the white damage chunk waits before draining |
| `src/ui/model.ts` | `CHIP_DRAIN_PER_SEC` | 55 HP/s | How fast the chunk drains |
| `src/ui/model.ts` | `LOW_HP` | 25 | Bar pulses red at or below this |
| `src/ui/model.ts` | `TIMER_URGENT` | 10 s | Timer turns red and pulses |
| `src/ui/model.ts` | `COMBO_HOLD` | 1.6 s | Combo counter stays up after the last hit |
| `src/ui/model.ts` | `CALLOUT_SIZE` / `CALLOUT_LIFE` | 38/62/118 px · 0.9/1.2/1.6 s | Callout size and duration per tier |
| `src/input/mapping.ts` | `AIM_DEADZONE` | 8 world units | Cursor this close to your fighter keeps the old aim |
| `src/input/mapping.ts` | `STICK_DEADZONE` / `AIM_STICK_THRESHOLD` / `TRIGGER_THRESHOLD` | 0.22 / 0.45 / 0.35 | Gamepad feel |
| `src/input/mapping.ts` | `KEY_BINDINGS` | GDD §10 | Remap keys here |
| `src/audio/mixer.ts` | `DEFAULT_MASTER` | 0.8 | Master volume |
| `src/audio/mixer.ts` | `MUSIC_LEVEL` | 0.3 | Music loudness vs SFX |
| `src/audio/mixer.ts` | `MAX_VOICES` | 28 | Global voice cap |
| `src/audio/mixer.ts` | `PITCH_JITTER` | 0.05 | Random pitch spread on repeats |
| `src/audio/music.ts` | `MUSIC_BPM` | 128 | Music tempo |
| `src/audio/engine.ts` | `LOW_HP_MUSIC` | 30 | HP that pushes the music to max intensity |
| `src/audio/sounds.ts` | per-sound gains | — | Each recipe's last numbers are its loudness. Re-run the scenario to see peaks per sound |
