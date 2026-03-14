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
} from './foundation/nameShapingConstants';
export type {
  NameShapingSelector,
  NameShapingSelectorMetadata,
} from './foundation/nameShapingConstants';
export type {
  NameShapingRawToken,
  NormalizedNameShapingSignature,
  ResolverIndex,
  ResolverIndexEntry,
  NameShapingResolverCandidate,
  NameShapingState,
} from './foundation/nameShapingTypes';

export { buildCardNameSignature } from './foundation/buildCardNameSignature';
export type { CardNameSignatureResult } from './foundation/buildCardNameSignature';

export { normalizeNameShapingSequence } from './foundation/normalizeNameShapingSequence';

export { buildResolverIndex } from './resolver/resolverIndex';
export type { ResolverIndexReader } from './resolver/resolverIndex';

export {
  resolveProperNounBySignature,
  scoreSignatureMatch,
} from './resolver/resolveProperNounBySignature';
export type { ScoreResult } from './resolver/resolveProperNounBySignature';

export { getSelectorFromNdc } from './layout/nameShapingTouchRegions';

export { useNameShapingState } from './runtime/useNameShapingState';
export type { NameShapingActions } from './runtime/useNameShapingState';

export { useNameShapingController } from './runtime/useNameShapingController';

export { useSpineNameShapingCapture } from './runtime/useSpineNameShapingCapture';
export type { NameShapingCaptureHandlers } from './runtime/useSpineNameShapingCapture';

export { NameShapingDebugOverlay } from './ui/NameShapingDebugOverlay';
export type {
  NameShapingDebugOverlayProps,
  NameShapingDebugOverlayTheme,
} from './ui/NameShapingDebugOverlay';

export { NameShapingTouchGuideOverlay } from './ui/NameShapingTouchGuideOverlay';
export type { NameShapingTouchGuideOverlayProps } from './ui/NameShapingTouchGuideOverlay';
