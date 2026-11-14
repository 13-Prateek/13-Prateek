/**
 * AI MODULE — STUB. Owned by the AI session (wave 2, see docs/ARCHITECTURE.md).
 */
import type { AIController, AIDifficulty, AIPersonality, InputFrame } from '../shared/types';
import { EMPTY_INPUT } from '../shared/types';

export function createAI(_difficulty: AIDifficulty, _personality: AIPersonality): AIController {
  return { think: (): InputFrame => ({ ...EMPTY_INPUT }), reset() {} };
}
