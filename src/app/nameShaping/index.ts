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
  NameShapingResolverCandidate,
  NameShapingState,
  NormalizedNameShapingSignature,
} from './nameShapingTypes';

export { buildCardNameSignature } from './buildCardNameSignature';
export type { CardNameSignatureResult } from './buildCardNameSignature';
