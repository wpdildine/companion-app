/**
 * nameShapingTouchLayout: 7 regions (6 selectors + voice) over shared center strip.
 */

import {
  NAME_SHAPING_LAYOUT_REGIONS,
  getVoiceRegion,
  VOICE_REGION_INDEX,
  regionsWithinCenterStrip,
  regionsWithinEnvelope,
} from './nameShapingTouchLayout';

describe('nameShapingTouchLayout', () => {
  describe('region count', () => {
    it('has exactly 7 regions with voice as one of the seven', () => {
      expect(NAME_SHAPING_LAYOUT_REGIONS).toHaveLength(7);
      const voiceRegion = NAME_SHAPING_LAYOUT_REGIONS[VOICE_REGION_INDEX];
      expect(voiceRegion.kind).toBe('voice');
      expect(voiceRegion.selector).toBeNull();
    });
  });

  describe('selector order', () => {
    it('ordering is BRIGHT, ROUND, LIQUID, voice, SOFT, HARD, BREAK', () => {
      const selectorsAndKind = NAME_SHAPING_LAYOUT_REGIONS.map(r =>
        r.kind === 'voice' ? 'voice' : r.selector,
      );
      expect(selectorsAndKind).toEqual([
        'BRIGHT',
        'ROUND',
        'LIQUID',
        'voice',
        'SOFT',
        'HARD',
        'BREAK',
      ]);
      expect(NAME_SHAPING_LAYOUT_REGIONS[3].kind).toBe('voice');
    });
  });

  describe('selector bounds containment', () => {
    it('all regions are within the shared center strip X bounds', () => {
      expect(regionsWithinCenterStrip()).toBe(true);
    });

    it('all regions are within the shared envelope Y bounds', () => {
      expect(regionsWithinEnvelope()).toBe(true);
    });

    it('each region has valid ndc bounds', () => {
      NAME_SHAPING_LAYOUT_REGIONS.forEach((r, i) => {
        expect(r.startNdcX).toBeLessThanOrEqual(r.endNdcX);
        expect(r.startNdcY).toBeLessThanOrEqual(r.endNdcY);
        expect(r.startNdcX).toBeGreaterThanOrEqual(-1);
        expect(r.endNdcX).toBeLessThanOrEqual(1);
        expect(r.startNdcY).toBeGreaterThanOrEqual(-1);
        expect(r.endNdcY).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('voice lane', () => {
    it('has exactly one voice region identified by metadata', () => {
      const voiceRegions = NAME_SHAPING_LAYOUT_REGIONS.filter(region => region.kind === 'voice');
      expect(voiceRegions).toHaveLength(1);
      expect(voiceRegions[0]).toBe(NAME_SHAPING_LAYOUT_REGIONS[VOICE_REGION_INDEX]);
    });

    it('getVoiceRegion returns the middle region (index 3)', () => {
      const voice = getVoiceRegion();
      expect(voice.kind).toBe('voice');
      expect(voice.selector).toBeNull();
      expect(voice.id).toBe('voice');
      expect(NAME_SHAPING_LAYOUT_REGIONS[VOICE_REGION_INDEX]).toBe(voice);
    });

    it('voice region has explicit bounds', () => {
      const voice = getVoiceRegion();
      expect(voice.startNdcY).toBeLessThan(voice.endNdcY);
      expect(voice.startNdcX).toBe(-0.145);
      expect(voice.endNdcX).toBe(0.145);
    });
  });

  describe('region ids and metadata', () => {
    it('each region has stable id', () => {
      const ids = NAME_SHAPING_LAYOUT_REGIONS.map(r => r.id);
      expect(ids).toEqual([
        'BRIGHT',
        'ROUND',
        'LIQUID',
        'voice',
        'SOFT',
        'HARD',
        'BREAK',
      ]);
    });

    it('selector regions have selector set; voice has null', () => {
      NAME_SHAPING_LAYOUT_REGIONS.forEach(r => {
        if (r.kind === 'voice') {
          expect(r.selector).toBeNull();
        } else {
          expect(r.selector).not.toBeNull();
        }
      });
    });
  });

  describe('vertical coverage', () => {
    it('covers the full center strip vertically without gaps', () => {
      expect(NAME_SHAPING_LAYOUT_REGIONS[0].endNdcY).toBe(1);
      expect(NAME_SHAPING_LAYOUT_REGIONS[NAME_SHAPING_LAYOUT_REGIONS.length - 1].startNdcY).toBe(-1);

      for (let index = 0; index < NAME_SHAPING_LAYOUT_REGIONS.length - 1; index += 1) {
        expect(NAME_SHAPING_LAYOUT_REGIONS[index].startNdcY).toBe(
          NAME_SHAPING_LAYOUT_REGIONS[index + 1].endNdcY,
        );
      }
    });
  });
});
