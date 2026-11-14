/**
 * GameEvent → sound routing + automatic music intensity. Context-agnostic so
 * the dev harness can render it offline and measure peaks.
 */
import { MAX_HP } from '../shared/constants';
import type { GameEvent, MatchState, Vec2 } from '../shared/types';
import { createMixer } from './mixer';
import { createMusic } from './music';
import { createSounds } from './sounds';
import * as C from '../shared/constants';

/** Max rally Heat (the sim's HEAT_MAX once it exists; GDD §3 says 4). */
const HEAT_MAX: number = typeof (C as Record<string, unknown>).HEAT_MAX === 'number' ? (C as Record<string, unknown>).HEAT_MAX as number : 4;

/** Music goes to intensity 2 when either fighter is at or below this HP. */
export const LOW_HP_MUSIC = 30;

export type Engine = ReturnType<typeof createEngine>;

export function createEngine(ctx: BaseAudioContext, destination?: AudioNode) {
  const mixer = createMixer(ctx, destination);
  const sounds = createSounds(mixer);
  const music = createMusic(mixer);
  /** When true, auto intensity is off because the game set it explicitly. */
  let manualIntensity = false;
  /** Was each fighter charging at the last poll (so the whine starts once per charge). */
  const wasCharging = [false, false];

  /**
   * Charge-up has no start event (the sim's kickStart fires on RELEASE), so the whine
   * is driven by state: call this often (every frame or scheduler tick).
   */
  function update(s: Readonly<MatchState>, t = ctx.currentTime) {
    for (const f of s.fighters) {
      const charging = f.kickPhase === 'charging' && s.phase === 'playing';
      if (charging && !wasCharging[f.id]) sounds.startCharge(t, f.id, f.pos, f.charge);
      else if (!charging && wasCharging[f.id]) sounds.stopCharge(t, f.id);
      wasCharging[f.id] = charging;
    }
  }

  function autoIntensity(e: GameEvent, s: Readonly<MatchState>): 0 | 1 | 2 | null {
    const finalRound = s.wins[0] === s.config.roundsToWin - 1 && s.wins[1] === s.config.roundsToWin - 1;
    const lowHp = s.fighters.some((f) => f.hp > 0 && f.hp <= LOW_HP_MUSIC && f.hp < MAX_HP);
    switch (e.type) {
      case 'roundStart': case 'countdown': return finalRound ? 1 : 0;
      case 'fight': return finalRound || s.suddenDeath ? 2 : 1;
      case 'hit': case 'wallSplat': return lowHp || finalRound || s.suddenDeath ? 2 : null;
      case 'suddenDeath': case 'finalRush': return 2;
      case 'matchEnd': return 0;
      default: return null;
    }
  }

  function handleEvents(events: readonly GameEvent[], s: Readonly<MatchState>, t = ctx.currentTime) {
    const heat = s.ball.heat ?? 0; // state is post-tick, so this already includes any heat change
    for (const e of events) {
      switch (e.type) {
        case 'kickStart': // the kick goes active (button released); fires on whiffs too
          sounds.stopCharge(t, e.player);
          wasCharging[e.player] = false;
          sounds.swing(t, e.charge, s.fighters[e.player]?.pos);
          break;
        case 'chargeFull': sounds.chargeFull(t, s.fighters[e.player]?.pos); break;
        case 'kick':
          sounds.stopCharge(t, e.player);
          sounds.kick(t, e.power, e.pos, e.curve, e.element, heat);
          if (e.perfect) sounds.perfect(t, e.pos);
          break;
        case 'trap': sounds.trap(t, e.pos); break;
        case 'bounce': sounds.bounce(t, e.speed, e.pos, heat); break;
        case 'hit':
          sounds.stopCharge(t, e.target);
          sounds.hit(t, e.damage, e.combo, e.pos, e.element);
          break;
        case 'wallSplat': sounds.wallSplat(t, e.pos); break;
        case 'clash': sounds.clash(t, e.pos); break;
        case 'closeCall': sounds.closeCall(t, e.pos, heat); break;
        case 'heat': sounds.heatUp(t, e.level, HEAT_MAX, e.pos); break;
        case 'phaseDash': sounds.phaseDash(t, e.pos); break;
        case 'winded': sounds.winded(t, s.fighters[e.player]?.pos); break;
        case 'noAura': sounds.noAura(t); break;
        case 'finalRush': sounds.finalRush(t); break;
        case 'dash':
          sounds.dash(t, e.pos);
          if ((e as { wallKick?: boolean }).wallKick) sounds.wallKick(t, e.pos);
          break;
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
        default: {
          // Events added on other branches after this was written (e.g. the sim's 'bump').
          const x = e as { type: string; pos?: Vec2; speed?: number };
          if (x.type === 'bump') sounds.bump(t, x.speed ?? 300, x.pos);
          break;
        }
      }
      if (!manualIntensity) {
        const lvl = autoIntensity(e, s);
        if (lvl !== null && lvl !== music.level) music.setLevel(lvl);
      }
    }
    update(s, t);
  }

  return {
    ctx, mixer, sounds, music, handleEvents, update,
    setIntensity(l: 0 | 1 | 2, manual = true) { manualIntensity = manual; music.setLevel(l); },
  };
}
