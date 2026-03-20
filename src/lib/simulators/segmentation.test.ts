import { describe, it, expect } from 'vitest';
import { runSegmentation, DEFAULT_CONFIG, type SegmentationConfig } from './segmentation';

function cfg(overrides: Partial<SegmentationConfig> = {}): SegmentationConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

describe('runSegmentation', () => {
  it('returns the right number of translations', () => {
    const result = runSegmentation(cfg({ seed: 1, numAddresses: 10 }));
    expect(result.translations).toHaveLength(10);
  });

  it('generates deterministic output for same seed', () => {
    const a = runSegmentation(cfg({ seed: 42 }));
    const b = runSegmentation(cfg({ seed: 42 }));
    expect(a).toEqual(b);
  });

  it('generates different output for different seeds', () => {
    const a = runSegmentation(cfg({ seed: 1 }));
    const b = runSegmentation(cfg({ seed: 2 }));
    expect(a.seg0.base).not.toEqual(b.seg0.base);
  });

  it('seg0 base + limit fits in physical memory', () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = runSegmentation(cfg({ seed }));
      expect(r.seg0.base + r.seg0.limit).toBeLessThanOrEqual(16384);
    }
  });

  it('seg1 base (user-facing) fits in physical memory', () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = runSegmentation(cfg({ seed }));
      expect(r.seg1.base).toBeLessThanOrEqual(16384);
      // internal lower bound is base - limit, must be >= 0
      expect(r.seg1.base - r.seg1.limit).toBeGreaterThanOrEqual(0);
    }
  });

  it('segments do not overlap', () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = runSegmentation(cfg({ seed }));
      const seg0Start = r.seg0.base;
      const seg0End = r.seg0.base + r.seg0.limit;
      const seg1Start = r.seg1.base - r.seg1.limit;
      const seg1End = r.seg1.base;
      // no overlap
      const overlap = seg0Start < seg1End && seg1Start < seg0End;
      expect(overlap).toBe(false);
    }
  });

  it('virtual addresses in lower half go to seg0', () => {
    const r = runSegmentation(cfg({ seed: 5 }));
    for (const t of r.translations) {
      if (t.virtualAddr < 512) {
        expect(t.segment).toBe(0);
      } else {
        expect(t.segment).toBe(1);
      }
    }
  });

  it('valid seg0 translations produce correct physical address', () => {
    const r = runSegmentation(cfg({ seed: 5 }));
    for (const t of r.translations) {
      if (t.segment === 0 && t.valid) {
        expect(t.physicalAddr).toBe(t.virtualAddr + r.seg0.base);
      }
    }
  });

  it('valid seg1 translations produce correct physical address', () => {
    const r = runSegmentation(cfg({ seed: 5 }));
    for (const t of r.translations) {
      if (t.segment === 1 && t.valid) {
        // paddr = base1 + (vaddr - asize)
        expect(t.physicalAddr).toBe(r.seg1.base + (t.virtualAddr - 1024));
      }
    }
  });

  it('invalid translations have null physical address', () => {
    const r = runSegmentation(cfg({ seed: 5 }));
    for (const t of r.translations) {
      if (!t.valid) {
        expect(t.physicalAddr).toBeNull();
      }
    }
  });

  it('respects explicit segment parameters', () => {
    const r = runSegmentation(cfg({
      seed: 0,
      base0: 100,
      len0: 50,
      base1: 1000,
      len1: 50,
    }));
    expect(r.seg0.base).toBe(100);
    expect(r.seg0.limit).toBe(50);
    expect(r.seg1.base).toBe(1000);
    expect(r.seg1.limit).toBe(50);
  });

  it('limits are bounded to half address space', () => {
    // When randomly generated, limits should be at most asize/2
    for (let seed = 0; seed < 20; seed++) {
      const r = runSegmentation(cfg({ seed }));
      expect(r.seg0.limit).toBeLessThanOrEqual(512);
      expect(r.seg1.limit).toBeLessThanOrEqual(512);
    }
  });
});

/**
 * Cross-validation against Python segmentation.py output.
 * Each expected result was captured by running:
 *   python3 segmentation.py [flags] -c
 */
interface ExpectedTranslation {
  virtualAddr: number;
  segment: 0 | 1;
  valid: boolean;
  physicalAddr: number | null;
}

interface ExpectedResult {
  seg0Base: number;
  seg0Limit: number;
  seg1Base: number;
  seg1Limit: number;
  translations: ExpectedTranslation[];
}

function checkAgainstPython(config: SegmentationConfig, expected: ExpectedResult) {
  const result = runSegmentation(config);

  expect(result.seg0.base).toBe(expected.seg0Base);
  expect(result.seg0.limit).toBe(expected.seg0Limit);
  expect(result.seg1.base).toBe(expected.seg1Base);
  expect(result.seg1.limit).toBe(expected.seg1Limit);

  expect(result.translations).toHaveLength(expected.translations.length);

  for (let i = 0; i < expected.translations.length; i++) {
    const got = result.translations[i];
    const exp = expected.translations[i];
    expect(got.virtualAddr, `VA ${i} virtualAddr`).toBe(exp.virtualAddr);
    expect(got.segment, `VA ${i} segment`).toBe(exp.segment);
    expect(got.valid, `VA ${i} valid`).toBe(exp.valid);
    expect(got.physicalAddr, `VA ${i} physicalAddr`).toBe(exp.physicalAddr);
  }
}

describe('segmentation: cross-validation with Python', () => {
  it('seed 0, default params (asize=1k, psize=16k, n=5)', () => {
    checkAgainstPython(cfg({ seed: 0 }), {
      seg0Base: 6890, seg0Limit: 472,
      seg1Base: 4692, seg1Limit: 450,
      translations: [
        { virtualAddr: 523, segment: 1, valid: false, physicalAddr: null },
        { virtualAddr: 414, segment: 0, valid: true, physicalAddr: 7304 },
        { virtualAddr: 802, segment: 1, valid: true, physicalAddr: 4470 },
        { virtualAddr: 310, segment: 0, valid: true, physicalAddr: 7200 },
        { virtualAddr: 488, segment: 0, valid: false, physicalAddr: null },
      ],
    });
  });

  it('seed 1, default params', () => {
    checkAgainstPython(cfg({ seed: 1 }), {
      seg0Base: 12513, seg0Limit: 290,
      seg1Base: 4651, seg1Limit: 472,
      translations: [
        { virtualAddr: 507, segment: 0, valid: false, physicalAddr: null },
        { virtualAddr: 460, segment: 0, valid: false, physicalAddr: null },
        { virtualAddr: 667, segment: 1, valid: true, physicalAddr: 4294 },
        { virtualAddr: 807, segment: 1, valid: true, physicalAddr: 4434 },
        { virtualAddr: 96, segment: 0, valid: true, physicalAddr: 12609 },
      ],
    });
  });

  it('seed 2, default params', () => {
    checkAgainstPython(cfg({ seed: 2 }), {
      seg0Base: 926, seg0Limit: 500,
      seg1Base: 14186, seg1Limit: 498,
      translations: [
        { virtualAddr: 753, segment: 1, valid: true, physicalAddr: 13915 },
        { virtualAddr: 685, segment: 1, valid: true, physicalAddr: 13847 },
        { virtualAddr: 315, segment: 0, valid: true, physicalAddr: 1241 },
        { virtualAddr: 620, segment: 1, valid: true, physicalAddr: 13782 },
        { virtualAddr: 621, segment: 1, valid: true, physicalAddr: 13783 },
      ],
    });
  });

  it('seed 0, asize=512 psize=8192 n=8', () => {
    checkAgainstPython(cfg({
      seed: 0,
      addressSpaceSize: 512,
      physicalMemSize: 8192,
      numAddresses: 8,
    }), {
      seg0Base: 3445, seg0Limit: 236,
      seg1Base: 2346, seg1Limit: 225,
      translations: [
        { virtualAddr: 261, segment: 1, valid: false, physicalAddr: null },
        { virtualAddr: 207, segment: 0, valid: true, physicalAddr: 3652 },
        { virtualAddr: 401, segment: 1, valid: true, physicalAddr: 2235 },
        { virtualAddr: 155, segment: 0, valid: true, physicalAddr: 3600 },
        { virtualAddr: 244, segment: 0, valid: false, physicalAddr: null },
        { virtualAddr: 298, segment: 1, valid: true, physicalAddr: 2132 },
        { virtualAddr: 464, segment: 1, valid: true, physicalAddr: 2298 },
        { virtualAddr: 258, segment: 1, valid: false, physicalAddr: null },
      ],
    });
  });

  it('seed 3, asize=2048 psize=32768 n=10', () => {
    checkAgainstPython(cfg({
      seed: 3,
      addressSpaceSize: 2048,
      physicalMemSize: 32768,
      numAddresses: 10,
    }), {
      seg0Base: 12122, seg0Limit: 633,
      seg1Base: 20579, seg1Limit: 790,
      translations: [
        { virtualAddr: 1281, segment: 1, valid: true, physicalAddr: 19812 },
        { virtualAddr: 134, segment: 0, valid: true, physicalAddr: 12256 },
        { virtualAddr: 26, segment: 0, valid: true, physicalAddr: 12148 },
        { virtualAddr: 1715, segment: 1, valid: true, physicalAddr: 20246 },
        { virtualAddr: 531, segment: 0, valid: true, physicalAddr: 12653 },
        { virtualAddr: 479, segment: 0, valid: true, physicalAddr: 12601 },
        { virtualAddr: 2039, segment: 1, valid: true, physicalAddr: 20570 },
        { virtualAddr: 963, segment: 0, valid: false, physicalAddr: null },
        { virtualAddr: 1713, segment: 1, valid: true, physicalAddr: 20244 },
        { virtualAddr: 975, segment: 0, valid: false, physicalAddr: null },
      ],
    });
  });
});
