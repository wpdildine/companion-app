/**
 * Developer screen: wraps DevPanel from visualization for use in app debug overlay.
 * Theme and visualizationRef are passed by VoiceScreen.
 */

import React from 'react';
import type { RefObject } from 'react';
import { DevPanel, type DevPanelTheme } from '../../visualization';
import type { VisualizationEngineRef } from '../../visualization';

export type DevScreenProps = {
  visualizationRef: RefObject<VisualizationEngineRef | null>;
  onClose: () => void;
  theme: DevPanelTheme;
};

export function DevScreen({ visualizationRef, onClose, theme }: DevScreenProps) {
  return (
    <DevPanel visualizationRef={visualizationRef} onClose={onClose} theme={theme} />
  );
}
