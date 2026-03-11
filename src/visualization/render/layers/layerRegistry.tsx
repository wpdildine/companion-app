/**
 * Generic layer contract: registry maps mount id (VisualizationMountId) to component.
 * Single canonical order for layer descriptors; canvas mounts from layerDescriptors + registry.
 */

import React from 'react';
import type { RefObject } from 'react';
import type { VisualizationEngineRef } from '../../engine/types';
import { BackgroundLayer } from './BackgroundLayer';
import { BackPlaneLayer } from './BackPlaneLayer';
import { SpineLightCoreLayer } from './SpineLightCoreLayer';
import { Spine } from './Spine';
import { SpineRotLayer } from './SpineRotLayer';
import { ContextLinks } from './ContextLinks';
import { ContextGlyphs } from './ContextGlyphs';
import { TouchZones } from './TouchZones';
import {
  getDefaultLayerDescriptors,
  type LayerDescriptor,
  type VisualizationMountId,
} from '../../scene/layerDescriptor';

export type LayerComponentProps = {
  visualizationRef: RefObject<VisualizationEngineRef | null>;
  descriptor: LayerDescriptor;
};

/** Spine mount: wraps Spine + SpineRotLayer (one registry entry). */
function SpineLayerWrapper({ visualizationRef, descriptor }: LayerComponentProps) {
  return (
    <Spine visualizationRef={visualizationRef} descriptor={descriptor}>
      <SpineRotLayer visualizationRef={visualizationRef} descriptor={descriptor} />
    </Spine>
  );
}

const LAYER_REGISTRY: Record<
  VisualizationMountId,
  React.ComponentType<LayerComponentProps>
> = {
  background: BackgroundLayer,
  backPlane: BackPlaneLayer,
  spineLightCore: SpineLightCoreLayer,
  spine: SpineLayerWrapper,
  contextLinks: ContextLinks,
  contextGlyphs: ContextGlyphs,
  touchZones: TouchZones,
};

export { LAYER_REGISTRY };

/** Default descriptors when scene is not yet set (same canonical order as getSceneDescription()). */
export const DEFAULT_LAYER_DESCRIPTORS: LayerDescriptor[] =
  getDefaultLayerDescriptors();

export function isMountIdInRegistry(id: string): id is VisualizationMountId {
  return id in LAYER_REGISTRY;
}
