/**
 * Append-only bounded buffer for observed semantic evidence.
 * Suppressed recoverable/terminal paths that skip listener fanout also skip append (no new truth).
 *
 * FIFO trim: when length exceeds `maxEvents`, oldest rows drop first. Heuristics that scan for
 * `onRequestStart` / `onRecoverableFailure` (e.g. outcome projection) can mis-classify if those
 * markers fall off the tail of a long session.
 */

import type { ObservedEvent, ObservedEventSource } from './semanticEvidenceTypes';

export const SEMANTIC_EVIDENCE_DEFAULT_MAX_EVENTS = 50;

export type SemanticEvidenceEventsRef = {
  current: ObservedEvent[];
};

export function appendSemanticEvidenceEvent(
  ref: SemanticEvidenceEventsRef | null | undefined,
  event: {
    kind: string;
    source: ObservedEventSource;
    timestamp?: number;
    payload?: Record<string, unknown>;
  },
  maxEvents: number = SEMANTIC_EVIDENCE_DEFAULT_MAX_EVENTS,
): void {
  if (!ref) return;
  const row: ObservedEvent = {
    kind: event.kind,
    source: event.source,
    timestamp: event.timestamp ?? Date.now(),
    ...(event.payload !== undefined ? { payload: event.payload } : {}),
  };
  ref.current.push(row);
  while (ref.current.length > maxEvents) {
    ref.current.shift();
  }
}
