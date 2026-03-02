/**
 * Shader isolation toggles for diagnosing rendering artifacts.
 * Flip one flag at a time to identify the offending pass/material.
 */
export const SHADER_DEBUG_FLAGS = {
  postFx: true,
  backgroundBase: true,
  backgroundDetail: true,
  spineHalftone: true,
  contextGlyphs: true,
  contextLinks: true,
} as const;
