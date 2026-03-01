/**
 * Developer screen: wraps DevPanel from nodeMap for use in app debug overlay.
 * Plan: DevScreen in ui/; theme and nodeMapRef are passed by App.
 */

import React from 'react';
import type { RefObject } from 'react';
import { DevPanel, type DevPanelTheme } from '../nodeMap/components/DevPanel';
import type { NodeMapEngineRef } from '../nodeMap/types';

export type DevScreenProps = {
  nodeMapRef: RefObject<NodeMapEngineRef | null>;
  onClose: () => void;
  theme: DevPanelTheme;
};

export function DevScreen({ nodeMapRef, onClose, theme }: DevScreenProps) {
  return (
    <DevPanel nodeMapRef={nodeMapRef} onClose={onClose} theme={theme} />
  );
}
