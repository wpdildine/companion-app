/**
 * nameShapingLayoutTransforms: band-local NDC to screen/render geometry.
 */

import {
  ndcRegionToScreenRect,
  ndcToScreen,
  ndcRegionToRenderDescriptor,
  type ActiveBandEnvelope,
  type NdcRegionBounds,
} from './nameShapingLayoutTransforms';

const sampleEnvelope: ActiveBandEnvelope = {
  widthPx: 400,
  activeHeightPx: 600,
  topOffsetPx: 100,
};

describe('nameShapingLayoutTransforms', () => {
  describe('ndcRegionToScreenRect', () => {
    it('maps corners correctly for full-strip region', () => {
      const region: NdcRegionBounds = {
        startNdcX: -0.145,
        endNdcX: 0.145,
        startNdcY: -1,
        endNdcY: 1,
      };
      const rect = ndcRegionToScreenRect(region, sampleEnvelope);
      expect(rect.left).toBeCloseTo((-0.145 + 1) * 0.5 * 400, 5);
      expect(rect.top).toBeCloseTo(100 + (1 - 1) * 0.5 * 600, 5);
      expect(rect.width).toBeCloseTo(0.29 * 200, 5);
      expect(rect.height).toBeCloseTo(600, 5);
    });

    it('top/bottom/center map correctly', () => {
      const region: NdcRegionBounds = {
        startNdcX: 0,
        endNdcX: 0,
        startNdcY: 0,
        endNdcY: 0.5,
      };
      const rect = ndcRegionToScreenRect(region, sampleEnvelope);
      expect(rect.width).toBe(0);
      expect(rect.left).toBe(200);
      expect(rect.top).toBeCloseTo(100 + 0.25 * 600, 5);
      expect(rect.height).toBeCloseTo(0.25 * 600, 5);
    });

    it('center strip remains centered in target geometry', () => {
      const centerStrip: NdcRegionBounds = {
        startNdcX: -0.145,
        endNdcX: 0.145,
        startNdcY: 0,
        endNdcY: 0.5,
      };
      const rect = ndcRegionToScreenRect(centerStrip, sampleEnvelope);
      const centerX = rect.left + rect.width / 2;
      expect(centerX).toBeCloseTo(sampleEnvelope.widthPx / 2, 5);
    });

    it('produces stable outputs for same inputs', () => {
      const region: NdcRegionBounds = {
        startNdcX: -0.1,
        endNdcX: 0.1,
        startNdcY: -0.5,
        endNdcY: 0.5,
      };
      const a = ndcRegionToScreenRect(region, sampleEnvelope);
      const b = ndcRegionToScreenRect(region, sampleEnvelope);
      expect(a).toEqual(b);
    });
  });

  describe('ndcToScreen', () => {
    it('maps NDC [-1,1] to screen with envelope', () => {
      const top = ndcToScreen(0, 1, sampleEnvelope);
      expect(top.xPx).toBe(200);
      expect(top.yPx).toBe(100);

      const bottom = ndcToScreen(0, -1, sampleEnvelope);
      expect(bottom.yPx).toBe(100 + 600);
    });
  });

  describe('ndcRegionToRenderDescriptor', () => {
    it('center and ratios match region bounds', () => {
      const region: NdcRegionBounds = {
        startNdcX: -0.145,
        endNdcX: 0.145,
        startNdcY: 0.2,
        endNdcY: 0.6,
      };
      const d = ndcRegionToRenderDescriptor(region);
      expect(d.centerNdcX).toBe(0);
      expect(d.centerNdcY).toBeCloseTo(0.4, 10);
      expect(d.widthRatio).toBeCloseTo(0.145, 10);
      expect(d.heightRatio).toBeCloseTo(0.2, 10);
    });
  });
});
