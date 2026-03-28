/**
 * Contract surface tests (JS-visible event names + idempotency expectations).
 * Native idempotency is enforced in ObjC/Kotlin; this guards the shared TS contract.
 */
import { MIC_EVENT_TYPES } from '../contract';

describe('atlas-native-mic contract', () => {
  it('exposes stable event type strings for native parity', () => {
    expect(MIC_EVENT_TYPES.CAPTURE_STARTED).toBe('mic_capture_started');
    expect(MIC_EVENT_TYPES.CAPTURE_STOPPING).toBe('mic_capture_stopping');
    expect(MIC_EVENT_TYPES.CAPTURE_FINALIZED).toBe('mic_capture_finalized');
    expect(MIC_EVENT_TYPES.INTERRUPTION).toBe('mic_interruption');
    expect(MIC_EVENT_TYPES.FAILURE).toBe('mic_failure');
  });

  it('has no duplicate values across MIC_EVENT_TYPES', () => {
    const vals = Object.values(MIC_EVENT_TYPES);
    expect(new Set(vals).size).toBe(vals.length);
  });
});
