/**
 * Read-only outcome projection from existing state + observed listener mirrors.
 * Unresolved: listening/processing. Does not read refs or suppressed-failure internals.
 */

import type { AgentLifecycleState, LastFrontDoorOutcome } from './types';
import type { ObservedEvent, OutcomeProjection } from './semanticEvidenceTypes';

function lastIndexOfKind(events: readonly ObservedEvent[], kind: string): number {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === kind) return i;
  }
  return -1;
}

/** Last index of kind where index > afterIdx (afterIdx -1 means any index >= 0). */
function lastIndexOfKindAfter(
  events: readonly ObservedEvent[],
  kind: string,
  afterIdx: number,
): number {
  for (let i = events.length - 1; i > afterIdx; i--) {
    if (events[i].kind === kind) return i;
  }
  return -1;
}

export type GetOutcomeProjectionInput = {
  lifecycle: AgentLifecycleState;
  error: string | null;
  lastFrontDoorOutcome: LastFrontDoorOutcome | null | undefined;
  observedEvents: readonly ObservedEvent[];
  hasCommittedResponse: boolean;
};

/**
 * Outcomes exist only after request resolution (not while listening/processing).
 * Recoverable: last onRecoverableFailure after last onRequestStart has no onComplete after it.
 */
export function getOutcomeProjection(
  input: GetOutcomeProjectionInput,
): OutcomeProjection | null {
  const {
    lifecycle,
    error,
    lastFrontDoorOutcome,
    observedEvents,
    hasCommittedResponse,
  } = input;

  if (lifecycle === 'listening' || lifecycle === 'processing') {
    return null;
  }

  if (lifecycle === 'error') {
    return { class: 'terminal', source: 'lifecycle' };
  }
  if (error != null && error.trim().length > 0) {
    return { class: 'terminal', source: 'error' };
  }

  if (lastFrontDoorOutcome != null) {
    return { class: 'blocked', source: 'frontDoor' };
  }

  const iStart = lastIndexOfKind(observedEvents, 'onRequestStart');
  const iRec = lastIndexOfKindAfter(
    observedEvents,
    'onRecoverableFailure',
    iStart,
  );
  if (iRec >= 0) {
    const completeAfterRec = lastIndexOfKindAfter(
      observedEvents,
      'onComplete',
      iRec,
    );
    if (completeAfterRec < 0) {
      return { class: 'recoverable', source: 'listener' };
    }
  }

  if (
    (lifecycle === 'idle' || lifecycle === 'speaking') &&
    hasCommittedResponse
  ) {
    return { class: 'success', source: 'lifecycle' };
  }

  return null;
}
