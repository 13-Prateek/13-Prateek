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

  const p1 = createKeyboardInput();
  const game = startGame({ renderer, audio, hud, p1, p2: createAI('pro', 'rival') });

  // Esc / P / pad Start = pause; Enter (or Start) on the result screen = rematch.
  p1.onMenu((action) => {
    if (game.state().phase === 'matchOver') {
      game.restart();
      hud.setPaused(false);
      return;
    }
    if (action === 'pause') {
      const p = !game.isPaused();
      game.setPaused(p);
      hud.setPaused(p);
    }
  });

  // M = mute / unmute.
  let muted = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      muted = !muted;
      audio.setMuted(muted);
    }
  });

  // Exposed for automated playtests (scripts/smoke.mjs). Read-only use.
  (window as unknown as { __game: typeof game }).__game = game;
}

boot();
