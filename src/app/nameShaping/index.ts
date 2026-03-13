/**
 * Name Shaping: canonical vocabulary, types, and runtime state shape.
 * Later executables (overlay, resolver, input capture) import from here as shared truth.
 *
 * Invariant: Touch/layout modules here are lightweight and must not trigger full RAG or
 * pack initialization. Resolver index is built separately when needed; layout refactors
 * must not eagerly load it.
 */

export {
  SELECTOR_METADATA,
  SELECTOR_ORDER,
} from './nameShapingConstants';
export type {
  NameShapingSelector,
  NameShapingSelectorMetadata,
} from './nameShapingConstants';
export type {
  NameShapingRawToken,
  NormalizedNameShapingSignature,
  ResolverIndex,
  ResolverIndexEntry,
  NameShapingResolverCandidate,
  NameShapingState,
} from './nameShapingTypes';

export { buildCardNameSignature } from './buildCardNameSignature';
export type { CardNameSignatureResult } from './buildCardNameSignature';

export { normalizeNameShapingSequence } from './normalizeNameShapingSequence';

export { buildResolverIndex } from './resolverIndex';
export type { ResolverIndexReader } from './resolverIndex';

export {
  resolveProperNounBySignature,
  scoreSignatureMatch,
} from './resolveProperNounBySignature';
export type { ScoreResult } from './resolveProperNounBySignature';

export { getSelectorFromNdc } from './nameShapingTouchRegions';

export { useNameShapingState } from './useNameShapingState';
export type { NameShapingActions } from './useNameShapingState';

export { useNameShapingController } from './useNameShapingController';

export { useSpineNameShapingCapture } from './useSpineNameShapingCapture';
export type { NameShapingCaptureHandlers } from './useSpineNameShapingCapture';

export { NameShapingDebugOverlay } from './NameShapingDebugOverlay';
export type {
  NameShapingDebugOverlayProps,
  NameShapingDebugOverlayTheme,
} from './NameShapingDebugOverlay';

export { NameShapingTouchGuideOverlay } from './NameShapingTouchGuideOverlay';
export type { NameShapingTouchGuideOverlayProps } from './NameShapingTouchGuideOverlay';
