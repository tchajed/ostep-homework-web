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
