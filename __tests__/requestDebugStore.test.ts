/**
 * Request-debug store: processingSubstate merges and clears.
 */

describe('requestDebugStore processingSubstate', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('stores and clears processingSubstate', () => {
    const { emit, getState } = require('../src/app/agent/requestDebugStore');

    emit({
      type: 'processing_substate',
      requestId: 1,
      processingSubstate: 'retrieving',
      timestamp: 1,
    });

    let snapshot = getState().snapshotsById.get(1);
    expect(snapshot?.processingSubstate).toBe('retrieving');

    emit({
      type: 'processing_substate',
      requestId: 1,
      processingSubstate: null,
      timestamp: 2,
    });

    snapshot = getState().snapshotsById.get(1);
    expect(snapshot?.processingSubstate).toBeNull();
  });
});
