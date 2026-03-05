/**
 * Motion grammar: exports the active grammar for MotionGrammarEngine.
 * Swap here to use a different motion style (e.g. ARCHITECTURAL_CALM_GRAMMAR) without changing the engine.
 */

import { ORGANISM_GRAMMAR } from './organismGrammar';

export const MOTION_GRAMMAR = ORGANISM_GRAMMAR;

export type { MotionGrammarTemplate, MotionSignals, MotionTargets } from './types';
