---
name: module-workflow
description: How a Skystriker module session works. Read at the start of any session that builds part of the game (sim, render, audio/UI, AI, supers) - covers ownership, contracts, branch, checks and the handoff note.
---

# Module session workflow

1. **Orient (5 min):** read `skystriker/docs/GDD.md` (the sections for your module), `skystriker/docs/ARCHITECTURE.md`, and `skystriker/src/shared/types.ts` + `constants.ts`. Find your row in the ownership table.
2. **Stay in your lane:** edit only paths your session owns. Need something elsewhere? Note it under *Requests for lead*. Never rename or remove anything in `src/shared/types.ts`. Adding optional fields or new event types is fine, but list them.
3. **Build in small vertical slices.** Get something visible or testable quickly, commit, then deepen. Commit messages say *what changed for the player*.
4. **Test as you go:**
   - Logic: Vitest unit tests (`skystriker/tests/<module>/*.test.ts`).
   - Real game: `npm run build && npm run smoke`, then **open the screenshots** in `playtest-shots/` with the Read tool and check them yourself. For visual work, write extra Playwright scenarios (see the `playtest-verify` skill).
5. **Definition of done:** typecheck, tests, build and smoke all pass. Screenshots inspected. Branch pushed (`git push -u origin <your-branch>`; retry on network errors with backoff 2/4/8/16 s).
6. **Handoff note** `skystriker/docs/handoff/<module>.md`:
   - **What's done**, as a feature list.
   - **How to playtest it**: exact keys and what the tester should see or hear. Written for a non-programmer.
   - **Known issues / not done**
   - **Contract changes** (types/constants added)
   - **Requests for lead**
   - **Tuning knobs** worth playtesting (constant name, current value, what it changes)

Quality bar: this is a game people play for feel. "Works" isn't enough. It must feel snappy and readable. When unsure between two designs, pick the one the GDD pillars favour (Readable · Skill expression · Superhero feel · Short and replayable).
