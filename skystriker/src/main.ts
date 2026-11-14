import { createAI } from './ai';
import { createAudio } from './audio';
import { startGame } from './game/loop';
import { createKeyboardInput } from './input';
import { createRenderer } from './render';
import { createHud } from './ui';

async function boot() {
  const renderer = await createRenderer(document.getElementById('app')!);
  const audio = createAudio();
  const hud = createHud(document.getElementById('ui')!);
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  window.addEventListener('resize', () => renderer.resize(window.innerWidth, window.innerHeight));
  const game = startGame({ renderer, audio, hud, p1: createKeyboardInput(), p2: createAI('pro', 'rival') });
  // Exposed for automated playtests (scripts/smoke.mjs). Read-only use.
  (window as unknown as { __game: typeof game }).__game = game;
}

boot();
