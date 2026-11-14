/**
 * GameEvent → sound routing + automatic music intensity. Context-agnostic so
 * the dev harness can render it offline and measure peaks.
 */
import { MAX_HP } from '../shared/constants';
import type { GameEvent, MatchState } from '../shared/types';
import { createMixer } from './mixer';
import { createMusic } from './music';
import { createSounds } from './sounds';

/** Music goes to intensity 2 when either fighter is at or below this HP. */
export const LOW_HP_MUSIC = 30;

export type Engine = ReturnType<typeof createEngine>;

export function createEngine(ctx: BaseAudioContext, destination?: AudioNode) {
  const mixer = createMixer(ctx, destination);
  const sounds = createSounds(mixer);
  const music = createMusic(mixer);
  /** When true, auto intensity is off because the game set it explicitly. */
  let manualIntensity = false;

  function autoIntensity(e: GameEvent, s: Readonly<MatchState>): 0 | 1 | 2 | null {
    const finalRound = s.wins[0] === s.config.roundsToWin - 1 && s.wins[1] === s.config.roundsToWin - 1;
    const lowHp = s.fighters.some((f) => f.hp > 0 && f.hp <= LOW_HP_MUSIC && f.hp < MAX_HP);
    switch (e.type) {
      case 'roundStart': case 'countdown': return finalRound ? 1 : 0;
      case 'fight': return finalRound || s.suddenDeath ? 2 : 1;
      case 'hit': case 'wallSplat': return lowHp || finalRound || s.suddenDeath ? 2 : null;
      case 'suddenDeath': return 2;
      case 'matchEnd': return 0;
      default: return null;
    }
  }

  function handleEvents(events: readonly GameEvent[], s: Readonly<MatchState>, t = ctx.currentTime) {
    for (const e of events) {
      switch (e.type) {
        case 'kickStart': sounds.startCharge(t, e.player, s.fighters[e.player]?.pos); break;
        case 'chargeFull': sounds.chargeFull(t, s.fighters[e.player]?.pos); break;
        case 'kick':
          sounds.stopCharge(t, e.player);
          sounds.kick(t, e.power, e.pos, e.curve, e.element);
          if (e.perfect) sounds.perfect(t, e.pos);
          break;
        case 'trap': sounds.trap(t, e.pos); break;
        case 'bounce': sounds.bounce(t, e.speed, e.pos); break;
        case 'hit':
          sounds.stopCharge(t, e.target);
          sounds.hit(t, e.damage, e.combo, e.pos, e.element);
          break;
        case 'wallSplat': sounds.wallSplat(t, e.pos); break;
        case 'clash': sounds.clash(t, e.pos); break;
        case 'closeCall': sounds.closeCall(t, e.pos); break;
        case 'dash': sounds.stopCharge(t, e.player); sounds.dash(t, e.pos); break;
        case 'infuse': sounds.infuse(t, e.element, s.fighters[e.player]?.pos); break;
        case 'auraBar': sounds.auraBar(t, e.bars); break;
        case 'countdown': sounds.countdown(t, e.secondsLeft); break;
        case 'fight': sounds.fight(t); break;
        case 'roundStart': sounds.roundStart(t); break;
        case 'ko': sounds.stopCharge(t, 0); sounds.stopCharge(t, 1); sounds.ko(t, e.pos); break;
        case 'roundEnd': sounds.roundEnd(t + 0.9); break;
        case 'matchEnd': sounds.matchEnd(t + 1.2); break;
        case 'superStart': sounds.superStart(t, e.element); break;
        case 'suddenDeath': sounds.suddenDeath(t); break;
        default: break;
      }
      if (!manualIntensity) {
        const lvl = autoIntensity(e, s);
        if (lvl !== null && lvl !== music.level) music.setLevel(lvl);
      }
    }
    // A whiffed kick emits no 'kick' event: stop the whine once the state says the charge is over.
    for (const f of s.fighters) if (f.kickPhase !== 'charging' && sounds.isCharging(f.id)) {
      if (!events.some((e) => e.type === 'kickStart' && e.player === f.id)) sounds.stopCharge(t, f.id);
    }
  }

  return {
    ctx, mixer, sounds, music, handleEvents,
    setIntensity(l: 0 | 1 | 2, manual = true) { manualIntensity = manual; music.setLevel(l); },
  };
}
