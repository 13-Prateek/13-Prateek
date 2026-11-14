# Repository notes

This repo is the owner's GitHub profile (`README.md` at the root is their profile page, so **don't edit it**).
The game project lives in **`skystriker/`**. Work from that directory.

## Skystriker (1v1 flying ball-fighter, TypeScript + PixiJS)
- Design: `skystriker/docs/GDD.md`. Architecture, module ownership and workflow: `skystriker/docs/ARCHITECTURE.md`.
- Commands (run in `skystriker/`): `npm install`, `npm run dev`, `npm run typecheck`, `npm test`, `npm run build && npm run smoke`.
- Project skills in `.claude/skills/`. Use them:
  - `module-workflow`: how a module session works, what it owns, how it hands off. **Read it first.**
  - `sim-rules`: determinism and physics rules for `src/sim`.
  - `game-feel`: juice checklist for render/audio/UI.
  - `playtest-verify`: how to prove your change works in a real browser.
- The human owner is the playtester, not a code reviewer. Handoffs must say in plain language what to press and what they should see.
