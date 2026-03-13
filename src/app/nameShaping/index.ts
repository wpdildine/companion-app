/**
 * Name Shaping: canonical vocabulary, types, and runtime state shape.
 * Later executables (overlay, resolver, input capture) import from here as shared truth.
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

export { useSpineNameShapingCapture } from './useSpineNameShapingCapture';
export type { NameShapingCaptureHandlers } from './useSpineNameShapingCapture';
