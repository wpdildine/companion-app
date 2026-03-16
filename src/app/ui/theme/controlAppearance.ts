export type ControlSurface = 'product' | 'debug';

export type ControlTone =
  | 'default'
  | 'muted'
  | 'accent'
  | 'success'
  | 'danger'
  | 'warning';

type ControlColors = {
  ink: string;
  borderColor: string;
  backgroundColor: string;
};

const PRODUCT_COLORS: Record<ControlTone, ControlColors> = {
  default: {
    ink: '#f5f5f5',
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  muted: {
    ink: '#b8b8b8',
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  accent: {
    ink: '#ffffff',
    borderColor: 'rgba(120,193,255,0.45)',
    backgroundColor: 'rgba(88,166,255,0.16)',
  },
  success: {
    ink: '#ffffff',
    borderColor: 'rgba(63,185,80,0.5)',
    backgroundColor: 'rgba(63,185,80,0.16)',
  },
  danger: {
    ink: '#ffffff',
    borderColor: 'rgba(248,81,73,0.5)',
    backgroundColor: 'rgba(248,81,73,0.16)',
  },
  warning: {
    ink: '#ffffff',
    borderColor: 'rgba(210,153,34,0.5)',
    backgroundColor: 'rgba(210,153,34,0.16)',
  },
};

const DEBUG_COLORS: Record<ControlTone, ControlColors> = {
  default: {
    ink: '#ffffff',
    borderColor: '#4b5563',
    backgroundColor: 'rgba(48,54,61,0.7)',
  },
  muted: {
    ink: '#d0d7de',
    borderColor: '#6e7681',
    backgroundColor: 'rgba(110,118,129,0.35)',
  },
  accent: {
    ink: '#ffffff',
    borderColor: '#8957e5',
    backgroundColor: 'rgba(137,87,229,0.6)',
  },
  success: {
    ink: '#ffffff',
    borderColor: '#238636',
    backgroundColor: 'rgba(35,134,54,0.8)',
  },
  danger: {
    ink: '#ffffff',
    borderColor: '#da3633',
    backgroundColor: 'rgba(218,54,51,0.82)',
  },
  warning: {
    ink: '#ffffff',
    borderColor: '#9a6700',
    backgroundColor: 'rgba(154,103,0,0.82)',
  },
};

function getSurfaceColors(surface: ControlSurface): Record<ControlTone, ControlColors> {
  return surface === 'debug' ? DEBUG_COLORS : PRODUCT_COLORS;
}

export function resolveControlColors(
  surface: ControlSurface = 'product',
  tone: ControlTone = 'default',
): ControlColors {
  return getSurfaceColors(surface)[tone];
}
