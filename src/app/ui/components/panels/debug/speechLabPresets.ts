/**
 * Debug-only canned lines for VizDebugPanel Speech Lab (orchestrator playText validation).
 */

import {
  SCRIPTED_CLARIFY_ENTITY_PREFIX,
  SCRIPTED_EMPTY_OUTPUT_MESSAGE,
} from '../../../../agent/scripted/v1Copy';

export type SpeechLabPreset = {
  id: string;
  label: string;
  text: string;
};

export const SPEECH_LAB_PRESETS: SpeechLabPreset[] = [
  {
    id: 'clarify',
    label: 'Clarify (scripted prefix)',
    text: `${SCRIPTED_CLARIFY_ENTITY_PREFIX}Widget A, Widget B`,
  },
  {
    id: 'empty',
    label: 'Empty output (scripted)',
    text: SCRIPTED_EMPTY_OUTPUT_MESSAGE,
  },
  {
    id: 'neutral',
    label: 'Neutral short answer',
    text: 'The answer is forty-two. Thanks for asking.',
  },
  {
    id: 'technical',
    label: 'Long technical',
    text:
      'Latency p99 improved after batching: the worker pool now coalesces adjacent ' +
      'PCM chunks before resample, which reduced underruns on mid-tier Android devices ' +
      'when the UI thread is contended.',
  },
];
