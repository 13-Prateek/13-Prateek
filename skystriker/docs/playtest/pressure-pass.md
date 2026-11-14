# Pressure pass playtest: harder dodges, fewer stalemates

**Goal of this build:** dodging should be a skill, not the default; rallies should build tension; rounds should end before the timer.

Start: in `skystriker/`, run `npm run dev`, open **http://localhost:5173/**, click once for sound. Press **Esc** any time to see every control and rule on the pause screen.

## What changed
| | Before | Now |
|---|---|---|
| Ball | Tap kick 1050, power 1900 | About 15% faster. A tap from mid-range reaches you in about 0.6 s (was 0.76 s). Damage per hit is the same. |
| Dash (**Space / Shift**, pad **A**) | Free, invincible for a moment, every 0.8 s | Free, **not invincible**, every 1.2 s, and you're **Winded** (half speed) for a quarter second after it |
| **Phase Dash** (**Q**, pad **B**) | – | Costs **half an aura bar** (the notch on your meter, shown as "PHASE READY"). The ball passes through you, then you're Winded longer. |
| **Rally Heat** | – | Every time the ball is kicked back by the other player it heats up (max 4): faster, brighter, higher-pitched. "MAX HEAT!" at 4. It cools when someone is hit. |
| **Final Rush** | – | The last 20 s of a round: "FINAL RUSH!", amber walls that slowly close in, and the ball never fully cools |

## Try these (about 10 minutes)
1. **Dodge without dashing:** let the bot shoot at you and just fly sideways. Slow shots should still be dodgeable, but it should feel tighter than before.
2. **Dash into a ball:** dash straight across an incoming ball. It should now **hit you**: the free dash is for moving, not for invincibility. Notice the short slump afterwards (Winded).
3. **Earn a Phase Dash:** kick and land hits until the "PHASE" tag under your health lights up. When a shot is about to hit you, press **Q**. You go ghostly and the ball passes through. Then you're slowed for a moment, so it's not free.
4. **Q without aura:** press **Q** when the tag is dark. The meter flashes red with a soft buzz, and nothing else happens.
5. **Build Heat:** kick the bot's ball back at it, and keep returning. Each return makes the ball glow hotter and sound higher. Around the 4th return, "MAX HEAT!" appears and it's very hard to dodge.
6. **Final Rush:** let a round run to 0:20. "FINAL RUSH!" appears, the walls turn amber and close in.

## Please tell me
- Does dodging now feel like a **skill** rather than something you always do? Too hard, or still too easy?
- Is the **Winded** slow-down noticeable? Too long or too short?
- Is half a bar the right **Phase Dash** price? Do you have it when you need it?
- Do **Heat** rallies feel tense? Does max heat feel fair, or impossible?
- Do rounds still reach the timer, or end earlier now?
- Is the ball speed right now, or does it want more?

## Known
- The sparring bot never uses Phase Dash yet (the real AI in wave 2 will).
- The HUD at the top covers a thin strip of the arena: a fighter or ball right against the top wall can be partly hidden behind the health bars.
