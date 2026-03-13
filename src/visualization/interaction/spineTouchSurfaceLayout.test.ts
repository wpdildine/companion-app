/**
 * spineTouchSurfaceLayout: shared physical spine touch surface (envelope + center strip).
 */

import {
  getEnvelopeBounds,
  getCenterStripBounds,
  getCenterStripNormalizedRect,
  isInsideEnvelope,
  isInsideCenterStrip,
  ENVELOPE_NDC,
  CENTER_STRIP_NDC,
  CENTER_STRIP_HALF_WIDTH,
} from './spineTouchSurfaceLayout';

describe('spineTouchSurfaceLayout', () => {
  describe('envelope bounds', () => {
    it('returns full band-local NDC envelope [-1, 1]', () => {
      const bounds = getEnvelopeBounds();
      expect(bounds.minX).toBe(-1);
      expect(bounds.maxX).toBe(1);
      expect(bounds.minY).toBe(-1);
      expect(bounds.maxY).toBe(1);
    });

    it('ENVELOPE_NDC is stable', () => {
      expect(ENVELOPE_NDC.minX).toBe(-1);
      expect(ENVELOPE_NDC.maxX).toBe(1);
      expect(ENVELOPE_NDC.minY).toBe(-1);
      expect(ENVELOPE_NDC.maxY).toBe(1);
    });
  });

  describe('center strip placement', () => {
    it('center strip is symmetric and spine-centered', () => {
      const strip = getCenterStripBounds();
      expect(strip.minX).toBe(-CENTER_STRIP_HALF_WIDTH);
      expect(strip.maxX).toBe(CENTER_STRIP_HALF_WIDTH);
      expect(strip.minX).toBe(-strip.maxX);
    });

    it('center strip Y spans full envelope', () => {
      const strip = getCenterStripBounds();
      expect(strip.minY).toBe(-1);
      expect(strip.maxY).toBe(1);
    });

    it('CENTER_STRIP_NDC matches getCenterStripBounds X', () => {
      expect(CENTER_STRIP_NDC.minX).toBe(-CENTER_STRIP_HALF_WIDTH);
      expect(CENTER_STRIP_NDC.maxX).toBe(CENTER_STRIP_HALF_WIDTH);
    });
  });

  describe('normalized helper output', () => {
    it('getCenterStripNormalizedRect returns [minX, maxX, minY, maxY]', () => {
      const rect = getCenterStripNormalizedRect();
      expect(rect).toHaveLength(4);
      expect(rect[0]).toBe(-CENTER_STRIP_HALF_WIDTH);
      expect(rect[1]).toBe(CENTER_STRIP_HALF_WIDTH);
      expect(rect[2]).toBe(-1);
      expect(rect[3]).toBe(1);
    });
  });

  describe('region containment', () => {
    it('isInsideEnvelope accepts points inside [-1,1]²', () => {
      expect(isInsideEnvelope(0, 0)).toBe(true);
      expect(isInsideEnvelope(1, 1)).toBe(true);
      expect(isInsideEnvelope(-1, -1)).toBe(true);
      expect(isInsideEnvelope(0.5, -0.5)).toBe(true);
    });

    it('isInsideEnvelope rejects points outside envelope', () => {
      expect(isInsideEnvelope(-1.001, 0)).toBe(false);
      expect(isInsideEnvelope(0, 1.001)).toBe(false);
      expect(isInsideEnvelope(1.01, 0)).toBe(false);
    });

    it('isInsideCenterStrip requires X within center strip and Y within envelope', () => {
      expect(isInsideCenterStrip(0, 0)).toBe(true);
      expect(isInsideCenterStrip(0.14, 0.5)).toBe(true);
      expect(isInsideCenterStrip(-0.14, -0.5)).toBe(true);
      expect(isInsideCenterStrip(0.2, 0)).toBe(false);
      expect(isInsideCenterStrip(-0.2, 0)).toBe(false);
      expect(isInsideCenterStrip(0, 1.001)).toBe(false);
    });

    it('center strip is horizontally symmetric', () => {
      expect(isInsideCenterStrip(CENTER_STRIP_HALF_WIDTH, 0)).toBe(true);
      expect(isInsideCenterStrip(-CENTER_STRIP_HALF_WIDTH, 0)).toBe(true);
      expect(isInsideCenterStrip(CENTER_STRIP_HALF_WIDTH + 0.001, 0)).toBe(false);
      expect(isInsideCenterStrip(-CENTER_STRIP_HALF_WIDTH - 0.001, 0)).toBe(false);
    });
  });
});
