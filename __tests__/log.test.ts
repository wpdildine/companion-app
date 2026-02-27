/**
 * Logging: mode change logs include sessionId; pulse logs include slot index.
 */

import { logModeChange, logPulse, logViz } from '../src/shared/helpers/log';

// Capture console.log
let logCalls: string[] = [];
const originalLog = console.log;
beforeEach(() => {
  logCalls = [];
  console.log = (...args: unknown[]) => {
    logCalls.push(args.map(String).join(' '));
  };
});
afterEach(() => {
  console.log = originalLog;
});

describe('logModeChange', () => {
  it('includes sessionId in output', () => {
    logModeChange('listening', 'session-123');
    expect(logCalls.length).toBeGreaterThan(0);
    const out = logCalls[0];
    expect(out).toContain('[Viz]');
    expect(out).toContain('session-123');
    expect(out).toContain('listening');
  });
});

describe('logPulse', () => {
  it('includes slotIndex in output', () => {
    logPulse(1);
    expect(logCalls.length).toBeGreaterThan(0);
    const out = logCalls[0];
    expect(out).toContain('[Viz]');
    expect(out).toContain('1'); // slotIndex
  });

  it('includes sessionId when provided', () => {
    logPulse(2, 'sess-456');
    expect(logCalls.length).toBeGreaterThan(0);
    expect(logCalls[0]).toContain('sess-456');
    expect(logCalls[0]).toContain('2');
  });
});

describe('logViz', () => {
  it('includes sessionId and slotIndex in payload when provided', () => {
    logViz('test', { sessionId: 'sid', slotIndex: 0 });
    expect(logCalls.length).toBeGreaterThan(0);
    expect(logCalls[0]).toContain('sid');
    expect(logCalls[0]).toContain('0');
  });
});
