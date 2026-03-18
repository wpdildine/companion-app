import { perfTrace } from '../../../../shared/logging';

const _verifyPath = typeof __filename !== 'undefined' ? __filename : 'FLAGS_FILE_V1';
const _cwd = typeof process !== 'undefined' && typeof process.cwd === 'function' ? process.cwd() : 'N/A';
console.log('[BisectFlagsModule VERIFY PATH]', _verifyPath);
console.log('[BisectFlagsModule WORKSPACE]', {
  processCwd: _cwd,
  flagsFileResolved: _verifyPath,
  repoRootExpected: _cwd === 'N/A' ? 'N/A' : _cwd,
});

/**
 * Diagnostic flags for bisecting response UI commit (~929 ms gap).
 * Toggle one at a time to isolate which subtree causes the stall.
 * Remove this file and all references after investigation.
 *
 * After changing a flag: save, then restart Metro with --reset-cache
 * (e.g. pnpm run start:local:reset) and reload the app so the bundle picks up the new value.
 */
const SOURCE_ID = 'src/app/ui/components/overlays/responseRenderBisectFlags.ts';

export const DIAG_RENDER_NO_OVERLAY_PANELS = true;
export const DIAG_RENDER_ANSWER_ONLY = false;
export const DIAG_RENDER_NO_CARDS = false;
export const DIAG_RENDER_NO_RULES = false;
export const DIAG_RENDER_MINIMAL_PANEL_BODY = false;
export const DIAG_RENDER_NO_RESPONSE_TEXT = false;
export const DIAG_RENDER_MINIMAL_RESPONSE_TEXT = false;
export const DIAG_DROP_RESPONSE_TEXT_PROP = false;
export const DIAG_SKIP_SET_RESPONSE_TEXT_STATE = true;
export const DIAG_SKIP_SETTLEMENT_CONTROL_STATE = true;
/** When true, skip final settled writes to response surface (text/cards/rules/validation); playback still uses runResult.committedText. */
export const DIAG_SKIP_SETTLED_PAYLOAD_PUBLICATION = true;
/** When true, skip setMode/setLifecycle speaking and related UI callbacks; playText/native audio unchanged. */
export const DIAG_SKIP_PLAYBACK_TRANSITION_STATE = true;
/** When true, pass responseText=null to ResultsOverlay while lifecycle === processing (orchestrator state unchanged). */
export const DIAG_FREEZE_RESPONSE_TEXT_PROP_DURING_PROCESSING = true;
/** When true, skip response_settled / payload / playback-bound logs and debug sink for those steps. */
export const DIAG_SKIP_RESPONSE_SURFACE_SETTLED_EVENTS = true;

export type ResponseSurfaceSettledEventOp =
  | 'response_settled'
  | 'response_settled_payload'
  | 'response_surface_playback_bound_to_committed_response';

export function traceResponseSurfaceSettledEvent(
  requestId: number,
  op: ResponseSurfaceSettledEventOp,
  execute: () => void,
): void {
  const skip = DIAG_SKIP_RESPONSE_SURFACE_SETTLED_EVENTS;
  perfTrace('Runtime', 'response surface settled event decision', {
    requestId,
    skipResponseSurfaceSettledEvents: skip,
    op,
  });
  if (skip) {
    perfTrace('Runtime', 'skipped response surface settled event', {
      requestId,
      op,
    });
  } else {
    execute();
    perfTrace('Runtime', 'response surface settled event executed', {
      requestId,
      op,
    });
  }
}

/** When true, skip viz setSignals during validating/settling and chunkAccepted emit. */
export const DIAG_SKIP_LATE_PROCESSING_VIZ_UPDATES = true;
/** When true, AgentSurface omits the ResultsOverlay element entirely (Fabric bisect). */
export const DIAG_SKIP_RESULTS_OVERLAY_ELEMENT = true;
/** When true, AgentSurface omits SemanticChannelView + overlay host (full response-channel branch). */
export const DIAG_SKIP_RESPONSE_CHANNEL_BRANCH = true;
/** When true, AgentSurface omits VisualizationSurface + canvas + embedded response channel subtree. */
/** Off for hold-to-speak path; use DIAG_DISABLE_VISUALIZATION_RUNTIME_CONTENT instead. */
export const DIAG_SKIP_VISUALIZATION_SURFACE_BRANCH = false;
/** When true, VisualizationSurface omits canvas (breaks touch path); keep false for freeze bisect. */
export const DIAG_DISABLE_VISUALIZATION_RUNTIME_CONTENT = false;
/** When true, all visualization runtime layers are forced off (overrides isolation mode). */
export const DIAG_FREEZE_VISUALIZATION_RUNTIME_UPDATES = false;

/** Single active viz runtime layer at a time (hold canvas + touch mounted). */
export type VisualizationRuntimeIsolationMode =
  | 'all_on'
  | 'all_off'
  | 'signal_apply_only'
  | 'spine_only'
  | 'r3f_only'
  | 'runtime_loop_only'
  | 'fallback_only';

export type VisualizationRuntimeLayer =
  | 'signal_apply'
  | 'spine_step'
  | 'r3f_frame'
  | 'runtime_loop'
  | 'fallback_interval';

export const VISUALIZATION_RUNTIME_LAYERS: VisualizationRuntimeLayer[] = [
  'signal_apply',
  'spine_step',
  'r3f_frame',
  'runtime_loop',
  'fallback_interval',
];

export const DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE: VisualizationRuntimeIsolationMode =
  'signal_apply_only';

export function isVisualizationLayerEnabled(
  layer: VisualizationRuntimeLayer,
  mode: VisualizationRuntimeIsolationMode,
): boolean {
  switch (mode) {
    case 'all_on':
      return true;
    case 'all_off':
      return false;
    case 'signal_apply_only':
      return layer === 'signal_apply';
    case 'spine_only':
      return layer === 'spine_step';
    case 'r3f_only':
      return layer === 'r3f_frame';
    case 'runtime_loop_only':
      return layer === 'runtime_loop';
    case 'fallback_only':
      return layer === 'fallback_interval';
    default:
      return true;
  }
}

/** Respects DIAG_FREEZE_VISUALIZATION_RUNTIME_UPDATES (all layers off when true). */
export function effectiveVisualizationLayerEnabled(
  layer: VisualizationRuntimeLayer,
): boolean {
  if (DIAG_FREEZE_VISUALIZATION_RUNTIME_UPDATES) return false;
  return isVisualizationLayerEnabled(
    layer,
    DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE,
  );
}

export function effectiveSignalApplyEnabled(
  freezeVisualizationRuntimeUpdatesFromParent: boolean,
): boolean {
  if (
    freezeVisualizationRuntimeUpdatesFromParent ||
    DIAG_FREEZE_VISUALIZATION_RUNTIME_UPDATES
  ) {
    return false;
  }
  return isVisualizationLayerEnabled(
    'signal_apply',
    DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE,
  );
}

export function effectiveFallbackIntervalEnabled(
  freezeVisualizationRuntimeUpdatesFromParent: boolean,
): boolean {
  if (
    freezeVisualizationRuntimeUpdatesFromParent ||
    DIAG_FREEZE_VISUALIZATION_RUNTIME_UPDATES
  ) {
    return false;
  }
  return isVisualizationLayerEnabled(
    'fallback_interval',
    DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE,
  );
}

/** R3F subtree gates (spine_step, r3f_frame, runtime_loop). Parent freeze forces all off. */
export function buildR3fVizIsolationGates(freezeVisualizationRuntimeUpdatesFromParent: boolean): {
  spine_step: boolean;
  r3f_frame: boolean;
  runtime_loop: boolean;
} {
  const kill =
    freezeVisualizationRuntimeUpdatesFromParent ||
    DIAG_FREEZE_VISUALIZATION_RUNTIME_UPDATES;
  if (kill) {
    return { spine_step: false, r3f_frame: false, runtime_loop: false };
  }
  return {
    spine_step: isVisualizationLayerEnabled(
      'spine_step',
      DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE,
    ),
    r3f_frame: isVisualizationLayerEnabled(
      'r3f_frame',
      DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE,
    ),
    runtime_loop: isVisualizationLayerEnabled(
      'runtime_loop',
      DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE,
    ),
  };
}

export function traceVisualizationLayerDecision(
  requestId: number | undefined,
  lifecycle: string | null | undefined,
  layer: VisualizationRuntimeLayer,
  enabled: boolean,
  extra?: Record<string, unknown>,
  execute?: () => void,
): void {
  perfTrace('Runtime', 'visualization layer decision', {
    requestId,
    lifecycle: lifecycle ?? null,
    layer,
    isolationMode: DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE,
    enabled,
    freezeVisualizationRuntimeUpdates: DIAG_FREEZE_VISUALIZATION_RUNTIME_UPDATES,
    ...extra,
  });
  if (execute === undefined) return;
  if (!enabled) {
    perfTrace('Runtime', 'skipped visualization layer', {
      requestId,
      lifecycle: lifecycle ?? null,
      layer,
      ...extra,
    });
    return;
  }
  execute();
  perfTrace('Runtime', 'visualization layer executed', {
    requestId,
    lifecycle: lifecycle ?? null,
    layer,
    ...extra,
  });
}

export type LateProcessingVizOp =
  | 'processingSubstate_validating'
  | 'processingSubstate_settling'
  | 'chunkAccepted_event'
  | 'visualization_signal_apply_validating'
  | 'visualization_signal_apply_settling';

export function traceLateProcessingVizUpdate(
  requestId: number | undefined,
  op: LateProcessingVizOp,
  execute: () => void,
): void {
  const skip = DIAG_SKIP_LATE_PROCESSING_VIZ_UPDATES;
  perfTrace('Runtime', 'late processing viz decision', {
    requestId,
    op,
    skipLateProcessingVizUpdates: skip,
  });
  if (skip) {
    perfTrace('Runtime', 'skipped late processing viz update', {
      requestId,
      op,
    });
  } else {
    execute();
    perfTrace('Runtime', 'late processing viz update executed', {
      requestId,
      op,
    });
  }
}

export const DIAG_SETTLE_RESPONSE_TEXT_ONLY = true;
export const DIAG_SETTLE_VALIDATION_ONLY = false;
export const DIAG_DEFER_VALIDATION_SUMMARY_ONE_RAF = false;
export const DIAG_DEFER_RESPONSE_TEXT_ONE_RAF = false;

console.log('[BisectFlagsModule] loaded', {
  sourceId: SOURCE_ID,
  noOverlayPanels: DIAG_RENDER_NO_OVERLAY_PANELS,
  answerOnly: DIAG_RENDER_ANSWER_ONLY,
  noCards: DIAG_RENDER_NO_CARDS,
  noRules: DIAG_RENDER_NO_RULES,
  minimalPanelBody: DIAG_RENDER_MINIMAL_PANEL_BODY,
  noResponseText: DIAG_RENDER_NO_RESPONSE_TEXT,
  minimalResponseText: DIAG_RENDER_MINIMAL_RESPONSE_TEXT,
  dropResponseTextProp: DIAG_DROP_RESPONSE_TEXT_PROP,
  skipSetResponseTextState: DIAG_SKIP_SET_RESPONSE_TEXT_STATE,
  skipSettlementControlState: DIAG_SKIP_SETTLEMENT_CONTROL_STATE,
  settleResponseTextOnly: DIAG_SETTLE_RESPONSE_TEXT_ONLY,
  settleValidationOnly: DIAG_SETTLE_VALIDATION_ONLY,
  deferValidationSummaryOneRaf: DIAG_DEFER_VALIDATION_SUMMARY_ONE_RAF,
  deferResponseTextOneRaf: DIAG_DEFER_RESPONSE_TEXT_ONE_RAF,
  skipSettledPayloadPublication: DIAG_SKIP_SETTLED_PAYLOAD_PUBLICATION,
  skipPlaybackTransitionState: DIAG_SKIP_PLAYBACK_TRANSITION_STATE,
  freezeResponseTextPropDuringProcessing:
    DIAG_FREEZE_RESPONSE_TEXT_PROP_DURING_PROCESSING,
  skipResponseSurfaceSettledEvents: DIAG_SKIP_RESPONSE_SURFACE_SETTLED_EVENTS,
  skipLateProcessingVizUpdates: DIAG_SKIP_LATE_PROCESSING_VIZ_UPDATES,
  skipResultsOverlayElement: DIAG_SKIP_RESULTS_OVERLAY_ELEMENT,
  skipResponseChannelBranch: DIAG_SKIP_RESPONSE_CHANNEL_BRANCH,
  skipVisualizationSurfaceBranch: DIAG_SKIP_VISUALIZATION_SURFACE_BRANCH,
  disableVisualizationRuntimeContent: DIAG_DISABLE_VISUALIZATION_RUNTIME_CONTENT,
  freezeVisualizationRuntimeUpdates: DIAG_FREEZE_VISUALIZATION_RUNTIME_UPDATES,
  visualizationRuntimeIsolationMode: DIAG_VISUALIZATION_RUNTIME_ISOLATION_MODE,
});
