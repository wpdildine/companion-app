/**
 * Act descriptor: declarative scene / pathway description over SemanticEvidence only.
 * See docs/ACT_DESCRIPTOR_SPEC.md.
 */

import type { AgentLifecycleState, ProcessingSubstate } from './types';
import type { OutcomeProjection } from './semanticEvidenceTypes';

/** Monotonic when the Act schema shape changes. */
export const ACT_DESCRIPTOR_SCHEMA_VERSION = 1 as const;

/** Situation family: pathway topology + continuation, not a lifecycle rename. */
export type ActSituationFamily =
  | 'InputOpen'
  | 'WorkInFlight'
  | 'ClarificationPending'
  | 'RecoverableSetback'
  | 'AnswerActive'
  | 'SystemFault';

/**
 * Closed registry of pathway tags (descriptive capability regions, not transitions).
 * @see docs/ACT_DESCRIPTOR_SPEC.md §7
 */
export type ActPathwayTag =
  | 'continue_input'
  | 'wait_for_async_completion'
  | 'reveal_supporting_material'
  | 'retry_after_recovery'
  | 'consume_answer'
  | 'supplement_input'
  | 'blocked_until_resolution'
  | 'start_fresh_play'
  | 'surface_fault'
  | 'no_normal_path';

/** All pathway tags (for tests and exhaustive checks). */
export const ACT_PATHWAY_TAGS_ALL: readonly ActPathwayTag[] = [
  'continue_input',
  'wait_for_async_completion',
  'reveal_supporting_material',
  'retry_after_recovery',
  'consume_answer',
  'supplement_input',
  'blocked_until_resolution',
  'start_fresh_play',
  'surface_fault',
  'no_normal_path',
] as const;

export type ActContinuationMode =
  | 'fresh_play'
  | 'same_request_continuation'
  | 'post_recover_retry'
  | 'blocked_path'
  | 'answer_retention'
  | 'terminal';

/** Channels aligned with SemanticSurfaceState.activeInteractionOwner (+ hold/swipe/playback). */
export type GestureChannelId =
  | 'holdToSpeak'
  | 'swipeContext'
  | 'playbackTap'
  | 'overlay'
  | 'debug';

export type GestureInterpretiveRole =
  | 'primary_utterance'
  | 'secondary_clarification'
  | 'supplement_utterance'
  | 'replay_or_navigate_answer'
  | 'overlay_chrome'
  | 'debug_only'
  | 'unavailable_for_interpretation';

/** Non-authoritative UX eligibility hints (intersect with lifecycle + arbitration at consume time). */
export type ActAffordanceTag =
  | 'voice_intake'
  | 'swipe_context'
  | 'playback_gesture'
  | 'reveal_answer_block'
  | 'reveal_cards'
  | 'reveal_rules'
  | 'reveal_sources'
  | 'new_question'
  | 'supplement_voice'
  | 'retry_voice';

export type ActPathwayDescriptor = {
  tag: ActPathwayTag;
  /** Optional evidence field paths for traceability (e.g. `runtime.lifecycle`). */
  evidenceKeys?: readonly string[];
};

export type ActDescriptor = {
  identity: {
    family: ActSituationFamily;
    schemaVersion: typeof ACT_DESCRIPTOR_SCHEMA_VERSION;
  };
  scene: {
    captureOriented: boolean;
    workInFlight: boolean;
    resultVisible: boolean;
    faultVisible: boolean;
  };
  semanticSituation: {
    lifecycle: AgentLifecycleState;
    processingSubstate: ProcessingSubstate | null;
    outcomeProjection: OutcomeProjection | null;
    /** When outcome is null (listening/processing): coarse bucket for readers. */
    inFlightBucket: 'open_mic' | 'awaiting_async' | 'none';
  };
  gestureMeanings: Partial<Record<GestureChannelId, GestureInterpretiveRole>>;
  pathways: readonly ActPathwayDescriptor[];
  continuation: {
    mode: ActContinuationMode;
    replacementHints: {
      activeRequestId: number | null;
      requestInFlight: boolean;
      playbackRequestId: number | null;
    };
  };
  affordances: readonly ActAffordanceTag[];
  presentationHints: {
    playActAccessibilityLabel?: string;
    playActPhaseCaptionText?: string | null;
  };
};
