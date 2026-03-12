/**
 * buildCardNameSignature: stable selector sequences and base-name extraction.
 */

import { buildCardNameSignature } from './buildCardNameSignature';

describe('buildCardNameSignature', () => {
  it('returns structured result with normalizedName, baseName, fullNameSignature, baseNameSignature', () => {
    const result = buildCardNameSignature('Atraxa');
    expect(result).toMatchObject({
      normalizedName: 'atraxa',
      baseName: 'atraxa',
    });
    expect(Array.isArray(result.fullNameSignature)).toBe(true);
    expect(Array.isArray(result.baseNameSignature)).toBe(true);
  });

  it('produces stable fullNameSignature for Urborg', () => {
    const result = buildCardNameSignature('Urborg');
    expect(result.normalizedName).toBe('urborg');
    expect(result.baseName).toBe('urborg');
    expect(result.fullNameSignature).toEqual([
      'ROUND',
      'HARD',
      'ROUND',
      'HARD',
    ]);
    expect(result.baseNameSignature).toEqual(result.fullNameSignature);
  });

  it('produces stable fullNameSignature for Ayesha', () => {
    const result = buildCardNameSignature('Ayesha');
    expect(result.normalizedName).toBe('ayesha');
    expect(result.fullNameSignature).toEqual([
      'BRIGHT',
      'BRIGHT',
      'SOFT',
      'BRIGHT',
    ]);
  });

  it('produces stable fullNameSignature for Gitrog', () => {
    const result = buildCardNameSignature('Gitrog');
    expect(result.normalizedName).toBe('gitrog');
    expect(result.fullNameSignature).toEqual([
      'HARD',
      'BRIGHT',
      'HARD',
      'LIQUID',
      'ROUND',
      'HARD',
    ]);
  });

  it('produces stable fullNameSignature for Atraxa', () => {
    const result = buildCardNameSignature('Atraxa');
    expect(result.normalizedName).toBe('atraxa');
    expect(result.fullNameSignature).toEqual([
      'BRIGHT',
      'HARD',
      'LIQUID',
      'BRIGHT',
      'SOFT',
      'BRIGHT',
    ]);
  });

  it('produces stable fullNameSignature for Sheoldred', () => {
    const result = buildCardNameSignature('Sheoldred');
    expect(result.normalizedName).toBe('sheoldred');
    expect(result.fullNameSignature).toEqual([
      'SOFT',
      'BRIGHT',
      'ROUND',
      'LIQUID',
      'HARD',
      'LIQUID',
      'BRIGHT',
      'HARD',
    ]);
  });

  it('extracts baseName before first comma and baseNameSignature matches that segment only', () => {
    const result = buildCardNameSignature('Sheoldred, the Apocalypse');
    expect(result.normalizedName).toBe('sheoldred the apocalypse');
    expect(result.baseName).toBe('sheoldred');
    expect(result.baseNameSignature).toEqual([
      'SOFT',
      'BRIGHT',
      'ROUND',
      'LIQUID',
      'HARD',
      'LIQUID',
      'BRIGHT',
      'HARD',
    ]);
    expect(result.fullNameSignature).toContain('BREAK');
    expect(result.baseNameSignature).not.toContain('BREAK');
  });

  it('emits BREAK only at spaces in fullNameSignature', () => {
    const result = buildCardNameSignature('Ur Borg');
    expect(result.normalizedName).toBe('ur borg');
    expect(result.fullNameSignature).toEqual([
      'ROUND',
      'BREAK',
      'HARD',
      'ROUND',
      'HARD',
    ]);
  });

  it('normalizes: lowercase and strip punctuation', () => {
    const result = buildCardNameSignature("O'Brien");
    expect(result.normalizedName).toBe('obrien');
    expect(result.fullNameSignature).toEqual([
      'ROUND',
      'HARD',
      'LIQUID',
      'BRIGHT',
      'HARD',
    ]);
    const result2 = buildCardNameSignature('Jace, the Mind Sculptor');
    expect(result2.normalizedName).toBe('jace the mind sculptor');
    expect(result2.baseName).toBe('jace');
  });

  it('does not emit BREAK for apostrophes or hyphens', () => {
    const apostrophe = buildCardNameSignature("Urza's");
    expect(apostrophe.normalizedName).toBe('urzas');
    expect(apostrophe.fullNameSignature).toEqual([
      'ROUND',
      'SOFT',
      'BRIGHT',
      'SOFT',
    ]);
    expect(apostrophe.fullNameSignature).not.toContain('BREAK');

    const hyphen = buildCardNameSignature('Hans-Eriksson');
    expect(hyphen.normalizedName).toBe('hanseriksson');
    expect(hyphen.fullNameSignature).not.toContain('BREAK');
  });

  it('greedily prefers sh over s + h', () => {
    const result = buildCardNameSignature('Sh');
    expect(result.fullNameSignature).toEqual(['SOFT']);
  });

  it('greedily prefers th over t + h', () => {
    const result = buildCardNameSignature('Th');
    expect(result.fullNameSignature).toEqual(['SOFT']);
  });

  it('greedily prefers ch over c + h', () => {
    const result = buildCardNameSignature('Ch');
    expect(result.fullNameSignature).toEqual(['HARD']);
  });

  it('greedily prefers ur over u + r', () => {
    const result = buildCardNameSignature('Ur');
    expect(result.fullNameSignature).toEqual(['ROUND']);
  });

  it('empty string yields empty strings and empty signature arrays', () => {
    const result = buildCardNameSignature('');
    expect(result).toEqual({
      normalizedName: '',
      baseName: '',
      fullNameSignature: [],
      baseNameSignature: [],
    });
  });

  it('nullish input yields the empty deterministic result', () => {
    expect(buildCardNameSignature(null)).toEqual({
      normalizedName: '',
      baseName: '',
      fullNameSignature: [],
      baseNameSignature: [],
    });
    expect(buildCardNameSignature(undefined)).toEqual({
      normalizedName: '',
      baseName: '',
      fullNameSignature: [],
      baseNameSignature: [],
    });
  });

  it('no comma: baseName equals normalizedName', () => {
    const result = buildCardNameSignature('Atraxa');
    expect(result.baseName).toBe(result.normalizedName);
  });
});
