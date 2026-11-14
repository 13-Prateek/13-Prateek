/**
 * AUDIO MODULE — STUB. Owned by the audio/UI session (see docs/ARCHITECTURE.md).
 */
import type { AudioSystem } from '../shared/types';

export function createAudio(): AudioSystem {
  return { unlock() {}, onEvents() {}, setMasterVolume() {}, setMusicIntensity() {} };
}
