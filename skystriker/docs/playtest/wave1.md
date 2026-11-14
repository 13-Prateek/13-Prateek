# Wave 1 playtest: what to try and what to tell us

This build has the real sim, renderer, HUD, sound and controls merged, plus a temporary **sparring bot** as player 2. The real AI with difficulty levels and personalities is wave 2.

## Start it
In `skystriker/`, run `npm run dev`, then open **http://localhost:5173/** in Chrome. **Click once** so the browser allows sound.

## Controls
| Do this | Press |
|---|---|
| Fly | **W A S D** |
| Aim | Move the **mouse**. Your kicks go toward the cursor. |
| Kick | **Left click** or **J**. Tap for a quick kick; **hold about 1 s, then let go** for a power kick. |
| Trap (stick the ball to your foot) | **Hold right click** or **K** near the ball. Kick while holding to fire it. |
| Dash | **Space** or **Shift**. Press it while touching a wall to launch off the wall. |
| Infuse (needs 1 full aura bar) | **E**. Your next kick becomes a fire shot. |
| Pause / resume | **Esc** or **P** |
| Rematch (on the result screen) | **Enter** |
| Mute / unmute | **M** |

## A 5-minute run-through
1. **Countdown:** "ROUND 1", then a big glowing 3, 2, 1, FIGHT! with beeps and a chord, and the music picks up.
2. **Fly around.** Your fighter is orange. You should glide and drift a little after letting go. Does it feel floaty in a good way, or sluggish?
3. **Tap-kick the ball at the cyan bot.** The ball turns orange with a comet trail. If it hits, the game freezes for a split second, the screen shakes, a damage number pops, their bar takes a white chunk, and you hear a crunch.
4. **Hold kick for a power shot.** You slow down while charging, your fighter glows brighter, a whine rises, and a ping plays at full charge. Let go for a much faster shot.
5. **Bank shots:** bounce the ball off a wall before it hits. You should see "BANK SHOT!" (one bounce) or "DOUBLE BANK!" (two).
6. **Defend:** when the bot's cyan ball comes at you, kick it back at the last moment for a **PERFECT!** return (a faster ball and a bigger freeze), or dash out of the way.
7. **Trap:** hold right click next to the ball and carry it around, then kick.
8. **Aura:** kicks and hits fill the three small bars under your health. With one bar full, press **E**. Your next kick is a fire shot that does 20% more damage.
9. **K.O.:** at 0 HP the screen flashes white, slow motion plays, and "K.O." slams in. Win 2 rounds to win the match, then press **Enter** to rematch.
10. Press **Esc** mid-fight: everything freezes with "PAUSED". Press **Esc** again to resume.

## Please report back
Just answer in plain words; no need to be technical.
- **Feel:** is flying too fast, too slow, too slippery? Do kicks feel instant, or a little late? (Kicks fire when you **let go** of the button. If taps feel laggy, we can change that.)
- **Readability:** can you always tell whose ball it is and whether it's dangerous?
- **Impact:** do hits feel punchy enough? Is anything too much (shake, flashes, noise)?
- **The bot:** too easy, too hard, or just dumb in some obvious way? It's a stand-in, but its worst habits tell the AI session what to avoid.
- **Rounds:** do they last about 60–90 seconds? Too long or too short?
- **Performance:** is it smooth, or does it stutter when lots of effects happen? If it stutters, try **http://localhost:5173/?lowfx=1**.
- **Bugs:** anything weird, stuck or broken. If you can, say roughly what you were doing.

## Extra test pages (optional)
- Every visual effect, played on demand: **http://localhost:5173/src/dev/vfx.html** (press 1–9, 0 and -).
- Every HUD screen and sound, on buttons: **http://localhost:5173/src/ui/dev/index.html**

## Known gaps in this build
- **Not yet built:** Guard (Q) and Super (R) are wave 2 and do nothing yet.
- **Temporary opponent:** P2 is a simple bot. It chases the ball and kicks it at you about every 3 seconds, sometimes dodges, and never traps or banks on purpose.
- **Sound starts on first click:** the very first countdown may be silent until you click or press a key.
