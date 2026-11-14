---
name: game-feel
description: Game-feel / juice checklist and recipes for Skystriker's renderer, VFX, audio and HUD (neon style, PixiJS 8). Use when building or reviewing anything the player sees or hears.
---

# Game feel checklist

The test: mute the sound and squint. Can you still tell what happened and who did it? Then unmute. Does every impact feel *heavy*?

## Visual language (neon energy style)
- Dark arena (#05060d-ish), a faint grid, slowly drifting parallax dust. The background is quiet so the action pops.
- Fighters: stick figures drawn with thick rounded lines in hero `color`, with a glow (pixi-filters `GlowFilter`/`AdvancedBloomFilter` on the world layer, not per object, for performance). Pose them procedurally: lean into velocity, legs trail, a kick leg snaps out along `facing` during `active`, a crouched wind-up while charging.
- Ball: white core. When `live` it gets the owner's hero colour and a trail (a ribbon or fading circles, length ∝ speed). `element` set → element particles (fire embers, frost shards, volt sparks, stone dust).
- **Readability first:** the danger state of the ball must be visible from colour alone. A neutral ball looks clearly calm.

## Impact recipes
| Moment | Must have |
|---|---|
| Kick | Foot swoosh arc, a small spark burst at the contact point, ball squash-and-stretch, tiny shake |
| Perfect return | White flash ring, bigger burst, chromatic split for about 100 ms, "PERFECT!" |
| Hit | Victim flashes white for 2–3 frames, a burst in the attacker's colour, shake ∝ damage, a damage number popping up |
| Wall bounce | Small dust and spark burst on the wall, a brief wall-segment glow |
| Wall splat | Shockwave filter at the impact, crack decal that fades |
| Charge full | A glow pulse on the fighter, a rising tone |
| KO | Slow-mo (visual time scale about 0.25 for 1 s), white flash, zoom punch toward the KO point, big "K.O." |

## Screen shake
- Trauma-based: `trauma += amount` (capped at 1), offset = `maxOffset × trauma² × noise(t)`, decays about 1.5/s. Never use plain random jitter. Add a small rotation component.

## Performance (smooth on any machine)
- Pool every particle/sprite. No allocation per frame in hot paths. Use `ParticleContainer` or pooled `Graphics`/`Sprite`s with prebuilt textures (`renderer.generateTexture`).
- Interpolate positions with `alpha` from `render(prev, curr, alpha)`. Never draw raw `curr` positions for moving things.
- Effects are driven by real `dtSeconds`, not sim ticks, so they're smooth at 144 Hz.
- Target: 60 FPS on integrated graphics at 1080p. Expose a `?lowfx=1` URL flag that disables the bloom filter.

## Audio
- Every event in the impact table has a sound. Synthesised with Web Audio (no asset files needed): kick = a short noise burst plus a pitched thump, with pitch rising with power. Hit = a low thump plus crunch. Perfect = a bright ping plus whoosh. Bounce = a soft tick. KO = a boom plus reverb tail.
- Randomise pitch ±5% so repeated sounds don't machine-gun. Limit voices per sound.
- Music intensity: calm (0) → combat (1) → final round / low HP / sudden death (2).

## HUD
- Health bars at the top corners in hero colours, with a white "recent damage" chunk that drains after a delay. Three aura pips under each bar that glow when full. Round wins as dots, timer at the top centre.
- Callouts: big, skewed, outlined text that punches in (scale 1.4 → 1 with overshoot) and fades. Tier 3 is huge and centred.
