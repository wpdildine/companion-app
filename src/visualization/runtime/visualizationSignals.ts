/**
 * Unified visualization signal contract.
 * This is the input vocabulary the app/controller may send into visualization runtime.
 */

export type TransientVisualSignal = 'softFail' | 'terminalFail' | 'firstToken' | 'shortTap';

export type VisualizationSignalEvent =
  | 'tapCitation'
  | 'chunkAccepted'
  | 'warning'
  | 'tapCard'
  | TransientVisualSignal
  | null;

/** UI-semantic signals for the visualization layer only. Not render params. */
export type VisualizationSignals = {
  phase: 'idle' | 'processing' | 'resolved';
  grounded: boolean;
  confidence: number; // 0..1
  retrievalDepth: number; // count of selected rule snippets
  cardRefsCount: number; // count of referenced cards
  event?: VisualizationSignalEvent;
};

export const VALID_TRANSIENT_SIGNALS: readonly TransientVisualSignal[] = ['softFail', 'terminalFail', 'firstToken', 'shortTap'];

export const TRANSIENT_SIGNAL_SOFT_FAIL: TransientVisualSignal = 'softFail';
export const TRANSIENT_SIGNAL_TERMINAL_FAIL: TransientVisualSignal = 'terminalFail';
export const TRANSIENT_SIGNAL_FIRST_TOKEN: TransientVisualSignal = 'firstToken';
export const TRANSIENT_SIGNAL_SHORT_TAP: TransientVisualSignal = 'shortTap';

export function isTransientVisualSignal(s: string | null): s is TransientVisualSignal {
  return s !== null && (VALID_TRANSIENT_SIGNALS as readonly string[]).includes(s);
}
