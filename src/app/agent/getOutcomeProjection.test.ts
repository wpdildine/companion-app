/**
 * Blocked outcomes now commit visible stub text; projection must still classify as blocked when
 * lastFrontDoorOutcome is set (before success-by-lifecycle).
 */
import { getOutcomeProjection } from './getOutcomeProjection';

describe('getOutcomeProjection', () => {
  it('returns blocked when lastFrontDoorOutcome is set even if hasCommittedResponse is true', () => {
    const p = getOutcomeProjection({
      lifecycle: 'idle',
      error: null,
      lastFrontDoorOutcome: {
        requestId: 1,
        semanticFrontDoor: {
          contract_version: 11,
          working_query: 'x',
          resolver_mode: 'none',
          transcript_decision: 'pass_through',
          front_door_verdict: 'abstain_no_grounding',
          failure_intent: null,
          routing_readiness: { sections_selected: [] },
        },
      },
      observedEvents: [],
      hasCommittedResponse: true,
    });
    expect(p).toEqual({ class: 'blocked', source: 'frontDoor' });
  });

  it('returns success when no front-door outcome and idle with committed response', () => {
    const p = getOutcomeProjection({
      lifecycle: 'idle',
      error: null,
      lastFrontDoorOutcome: null,
      observedEvents: [],
      hasCommittedResponse: true,
    });
    expect(p).toEqual({ class: 'success', source: 'lifecycle' });
  });
});
