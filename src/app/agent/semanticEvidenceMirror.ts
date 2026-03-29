/**
 * Pure mirror of orchestrator request-identity refs onto published state fields.
 */

export function mirrorRequestIdentityFromRefs(
  activeRequestIdRef: number,
  requestInFlight: boolean,
  playbackRequestId: number | null,
): {
  activeRequestId: number | null;
  requestInFlight: boolean;
  playbackRequestId: number | null;
} {
  return {
    activeRequestId: activeRequestIdRef === 0 ? null : activeRequestIdRef,
    requestInFlight,
    playbackRequestId,
  };
}
