/**
 * Pure Act descriptor resolution: SemanticEvidence → ActDescriptor.
 * See docs/ACT_DESCRIPTOR_SPEC.md.
 */

import type {
  ActAffordanceTag,
  ActContinuationMode,
  ActDescriptor,
  ActPathwayDescriptor,
  ActSituationFamily,
  GestureChannelId,
  GestureInterpretiveRole,
} from './actDescriptorTypes';
import { ACT_DESCRIPTOR_SCHEMA_VERSION } from './actDescriptorTypes';
import type { SemanticEvidence, SemanticSurfaceState } from './semanticEvidenceTypes';
import type { AgentLifecycleState } from './types';

function hasTrimmedResponseText(runtime: SemanticEvidence['runtime']): boolean {
  const t = runtime.responseText;
  return typeof t === 'string' && t.trim().length > 0;
}

function resolveSituationFamily(evidence: SemanticEvidence): ActSituationFamily {
  const { runtime, outcome } = evidence;

  if (outcome?.class === 'terminal') {
    return 'SystemFault';
  }
  if (outcome?.class === 'blocked') {
    return 'ClarificationPending';
  }
  if (outcome?.class === 'recoverable') {
    return 'RecoverableSetback';
  }
  if (outcome?.class === 'success') {
    return 'AnswerActive';
  }

  if (runtime.lifecycle === 'processing' || runtime.lifecycle === 'listening') {
    return 'WorkInFlight';
  }
  if (runtime.lifecycle === 'speaking') {
    return 'WorkInFlight';
  }
  if (runtime.lifecycle === 'error') {
    return 'SystemFault';
  }

  return 'InputOpen';
}

function inFlightBucket(
  lifecycle: AgentLifecycleState,
): 'open_mic' | 'awaiting_async' | 'none' {
  if (lifecycle === 'listening') return 'open_mic';
  if (lifecycle === 'processing') return 'awaiting_async';
  return 'none';
}

function continuationMode(
  family: ActSituationFamily,
  identity: SemanticEvidence['identity'],
): ActContinuationMode {
  switch (family) {
    case 'SystemFault':
      return 'terminal';
    case 'ClarificationPending':
      return 'blocked_path';
    case 'RecoverableSetback':
      return 'post_recover_retry';
    case 'AnswerActive':
      return 'answer_retention';
    case 'WorkInFlight':
      if (identity.requestInFlight || identity.activeRequestId != null) {
        return 'same_request_continuation';
      }
      return 'fresh_play';
    case 'InputOpen':
    default:
      return 'fresh_play';
  }
}

function canRevealMore(surface: SemanticSurfaceState): boolean {
  const r = surface.revealedBlocks;
  return !(r.answer && r.cards && r.rules && r.sources);
}

function buildPathways(
  family: ActSituationFamily,
  evidence: SemanticEvidence,
): ActPathwayDescriptor[] {
  const { runtime, surface } = evidence;
  const paths: ActPathwayDescriptor[] = [];

  const add = (tag: ActPathwayDescriptor['tag'], keys?: readonly string[]) => {
    paths.push(keys?.length ? { tag, evidenceKeys: keys } : { tag });
  };

  switch (family) {
    case 'SystemFault':
      add('surface_fault', ['outcome', 'runtime.lifecycle']);
      add('no_normal_path', ['outcome']);
      break;
    case 'ClarificationPending':
      add('supplement_input', ['runtime.lastFrontDoorOutcome', 'outcome']);
      add('blocked_until_resolution', ['outcome']);
      add('start_fresh_play', ['identity']);
      break;
    case 'RecoverableSetback':
      add('retry_after_recovery', ['outcome', 'interaction.observedEvents']);
      add('continue_input', ['runtime.lifecycle']);
      add('start_fresh_play', ['identity']);
      break;
    case 'AnswerActive':
      add('consume_answer', ['outcome', 'runtime.responseText']);
      if (canRevealMore(surface)) {
        add('reveal_supporting_material', ['surface.revealedBlocks']);
      }
      add('start_fresh_play', ['identity']);
      break;
    case 'WorkInFlight':
      add('wait_for_async_completion', ['runtime.lifecycle', 'identity.requestInFlight']);
      if (runtime.lifecycle === 'listening') {
        add('continue_input', ['runtime.lifecycle']);
      }
      break;
    case 'InputOpen':
      add('continue_input', ['surface.interactionBandEnabled', 'runtime.lifecycle']);
      add('start_fresh_play', ['identity']);
      break;
    default:
      break;
  }

  return paths;
}

function holdInterpretiveRole(
  family: ActSituationFamily,
  surface: SemanticSurfaceState,
  lifecycle: AgentLifecycleState,
): GestureInterpretiveRole {
  if (!surface.interactionBandEnabled) return 'unavailable_for_interpretation';
  const owner = surface.activeInteractionOwner;
  if (owner === 'overlay' || owner === 'debug') {
    return 'unavailable_for_interpretation';
  }

  if (family === 'SystemFault' || family === 'ClarificationPending') {
    return family === 'ClarificationPending'
      ? 'secondary_clarification'
      : 'unavailable_for_interpretation';
  }

  if (family === 'WorkInFlight') {
    return lifecycle === 'listening' ? 'primary_utterance' : 'unavailable_for_interpretation';
  }

  if (
    family === 'RecoverableSetback' ||
    family === 'InputOpen' ||
    family === 'AnswerActive'
  ) {
    return 'primary_utterance';
  }

  return 'unavailable_for_interpretation';
}

function buildGestureMeanings(
  family: ActSituationFamily,
  evidence: SemanticEvidence,
): Partial<Record<GestureChannelId, GestureInterpretiveRole>> {
  const { runtime, surface } = evidence;
  const { lifecycle } = runtime;
  const band = surface.interactionBandEnabled;
  const owner = surface.activeInteractionOwner;

  const hold = holdInterpretiveRole(family, surface, lifecycle);
  const swipe: GestureInterpretiveRole =
    band && owner !== 'overlay' && owner !== 'debug'
      ? 'supplement_utterance'
      : 'unavailable_for_interpretation';
  const playback: GestureInterpretiveRole =
    family === 'AnswerActive' && hasTrimmedResponseText(runtime)
      ? 'replay_or_navigate_answer'
      : 'unavailable_for_interpretation';

  const out: Partial<Record<GestureChannelId, GestureInterpretiveRole>> = {};

  switch (owner) {
    case 'debug':
      out.debug = 'debug_only';
      out.holdToSpeak = 'unavailable_for_interpretation';
      out.swipeContext = 'unavailable_for_interpretation';
      out.playbackTap = 'unavailable_for_interpretation';
      out.overlay = 'unavailable_for_interpretation';
      break;
    case 'overlay':
      out.overlay = 'overlay_chrome';
      out.holdToSpeak = 'unavailable_for_interpretation';
      out.swipeContext = 'unavailable_for_interpretation';
      out.playbackTap = 'unavailable_for_interpretation';
      out.debug = 'unavailable_for_interpretation';
      break;
    case 'holdToSpeak':
      out.holdToSpeak = hold;
      out.swipeContext = swipe;
      out.playbackTap = playback;
      out.overlay = 'unavailable_for_interpretation';
      out.debug = 'unavailable_for_interpretation';
      break;
    case 'swipeContext':
      out.swipeContext = swipe;
      out.holdToSpeak = hold;
      out.playbackTap = playback;
      out.overlay = 'unavailable_for_interpretation';
      out.debug = 'unavailable_for_interpretation';
      break;
    case 'playbackTap':
      out.playbackTap = playback;
      out.holdToSpeak = hold;
      out.swipeContext = swipe;
      out.overlay = 'unavailable_for_interpretation';
      out.debug = 'unavailable_for_interpretation';
      break;
    case 'none':
    default:
      out.holdToSpeak = hold;
      out.swipeContext = swipe;
      out.playbackTap = playback;
      out.overlay = 'unavailable_for_interpretation';
      out.debug = 'unavailable_for_interpretation';
      break;
  }

  return out;
}

function buildAffordances(
  family: ActSituationFamily,
  evidence: SemanticEvidence,
): ActAffordanceTag[] {
  const { runtime, surface } = evidence;
  const band = surface.interactionBandEnabled;
  const tags: ActAffordanceTag[] = [];

  const push = (t: ActAffordanceTag) => {
    if (!tags.includes(t)) tags.push(t);
  };

  if (family === 'InputOpen' || family === 'RecoverableSetback') {
    if (band && surface.activeInteractionOwner !== 'overlay' && surface.activeInteractionOwner !== 'debug') {
      push('voice_intake');
    }
  }
  if (family === 'RecoverableSetback') {
    push('retry_voice');
  }
  if (family === 'ClarificationPending') {
    push('supplement_voice');
    if (band) push('voice_intake');
  }
  if (family === 'AnswerActive') {
    if (hasTrimmedResponseText(runtime)) push('playback_gesture');
    const r = surface.revealedBlocks;
    if (!r.answer) push('reveal_answer_block');
    if (!r.cards) push('reveal_cards');
    if (!r.rules) push('reveal_rules');
    if (!r.sources) push('reveal_sources');
  }
  if (
    family === 'InputOpen' ||
    family === 'AnswerActive' ||
    family === 'RecoverableSetback' ||
    family === 'ClarificationPending'
  ) {
    push('new_question');
  }
  if (band && surface.activeInteractionOwner === 'swipeContext') {
    push('swipe_context');
  }

  return tags;
}

function buildScene(
  family: ActSituationFamily,
  evidence: SemanticEvidence,
): ActDescriptor['scene'] {
  const { runtime, identity } = evidence;
  const lc = runtime.lifecycle;
  const hasResp = hasTrimmedResponseText(runtime);

  return {
    captureOriented: lc === 'listening' || family === 'InputOpen',
    workInFlight:
      lc === 'processing' ||
      lc === 'listening' ||
      identity.requestInFlight ||
      (lc === 'speaking' && !hasResp),
    resultVisible: hasResp && family !== 'SystemFault',
    faultVisible: family === 'SystemFault' || lc === 'error',
  };
}

/**
 * Pure projection: one ActDescriptor per SemanticEvidence snapshot.
 * No side effects; reads only the evidence object.
 */
export function resolveActDescriptor(evidence: SemanticEvidence): ActDescriptor {
  const family = resolveSituationFamily(evidence);
  const { runtime, identity, outcome, presentation } = evidence;

  return {
    identity: {
      family,
      schemaVersion: ACT_DESCRIPTOR_SCHEMA_VERSION,
    },
    scene: buildScene(family, evidence),
    semanticSituation: {
      lifecycle: runtime.lifecycle,
      processingSubstate: runtime.processingSubstate,
      outcomeProjection: outcome,
      inFlightBucket: outcome == null ? inFlightBucket(runtime.lifecycle) : 'none',
    },
    gestureMeanings: buildGestureMeanings(family, evidence),
    pathways: buildPathways(family, evidence),
    continuation: {
      mode: continuationMode(family, identity),
      replacementHints: {
        activeRequestId: identity.activeRequestId,
        requestInFlight: identity.requestInFlight,
        playbackRequestId: identity.playbackRequestId,
      },
    },
    affordances: buildAffordances(family, evidence),
    presentationHints: {
      playActAccessibilityLabel: presentation.playActAccessibilityLabel,
      playActPhaseCaptionText: presentation.playActPhaseCaptionText,
    },
  };
}

export type ActDescriptorValidationIssue = { code: string; message: string };

/**
 * Observational coherence checks for tests and dev tooling.
 * Does not mutate; Act remains non-authoritative.
 */
export function validateActDescriptorCoherence(
  evidence: SemanticEvidence,
  act: ActDescriptor,
): ActDescriptorValidationIssue[] {
  const issues: ActDescriptorValidationIssue[] = [];

  if (evidence.outcome?.class === 'terminal' && act.identity.family !== 'SystemFault') {
    issues.push({
      code: 'family_terminal_mismatch',
      message: 'Terminal outcome requires SystemFault family',
    });
  }

  if (evidence.outcome?.class === 'blocked' && act.identity.family !== 'ClarificationPending') {
    issues.push({
      code: 'family_blocked_mismatch',
      message: 'Blocked outcome requires ClarificationPending family',
    });
  }

  if (evidence.outcome?.class === 'recoverable' && act.identity.family !== 'RecoverableSetback') {
    issues.push({
      code: 'family_recoverable_mismatch',
      message: 'Recoverable outcome requires RecoverableSetback family',
    });
  }

  if (evidence.outcome?.class === 'success' && act.identity.family !== 'AnswerActive') {
    issues.push({
      code: 'family_success_mismatch',
      message: 'Success outcome requires AnswerActive family',
    });
  }

  const owner = evidence.surface.activeInteractionOwner;
  if (
    (owner === 'overlay' || owner === 'debug') &&
    act.gestureMeanings.holdToSpeak === 'primary_utterance'
  ) {
    issues.push({
      code: 'gesture_hold_arbitration',
      message: 'Hold cannot be primary while overlay/debug owns interaction',
    });
  }

  if (act.pathways.length === 0) {
    issues.push({
      code: 'pathways_empty',
      message: 'Pathways should not be empty for a populated descriptor',
    });
  }

  return issues;
}
