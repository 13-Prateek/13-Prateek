/**
 * INPUT MODULE — STUB. Owned by the audio/UI session (see docs/ARCHITECTURE.md).
 * Keyboard + mouse for player 1. Gamepad is a later addition.
 */
import type { InputFrame, InputSource } from '../shared/types';

export function createKeyboardInput(target: Window = window): InputSource {
  const down = new Set<string>();
  const onDown = (e: KeyboardEvent) => down.add(e.code);
  const onUp = (e: KeyboardEvent) => down.delete(e.code);
  target.addEventListener('keydown', onDown);
  target.addEventListener('keyup', onUp);
  return {
    sample(): InputFrame {
      const h = (c: string) => down.has(c);
      return {
        moveX: (h('KeyD') ? 1 : 0) - (h('KeyA') ? 1 : 0),
        moveY: (h('KeyS') ? 1 : 0) - (h('KeyW') ? 1 : 0),
        aimX: 0, aimY: 0,
        kick: h('KeyJ'), trap: h('KeyK'), dash: h('Space'),
        infuse: h('KeyE'), super: h('KeyR'), guard: h('KeyQ'),
      };
    },
    destroy() { target.removeEventListener('keydown', onDown); target.removeEventListener('keyup', onUp); },
  };
}
