/**
 * Panel state and gesture contract for Cards/Rules (and answer) panels.
 * Plan Phase 4.1: Panel gestures implemented in src/ui/; nodeMap receives only
 * panelRects, panelState, and emphasis events.
 *
 * Zones: header strip = active zone; tap toggles expand/collapse; drag moves panel
 * (bounded), snap/dismiss. Release: snap back 180–260ms, dismiss |dx|>80 or dy>90.
 */

export type PanelInstanceState =
  | 'resting'
  | 'dragging'
  | 'snapping'
  | 'dismissed'
  | 'expanded';

export type PanelState = {
  answer?: PanelInstanceState;
  cards?: PanelInstanceState;
  rules?: PanelInstanceState;
};
