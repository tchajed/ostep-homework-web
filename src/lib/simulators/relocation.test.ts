import { describe, it, expect } from 'vitest';
import { simulate, toHex } from './relocation';

describe('relocation simulator', () => {
  it('returns correct number of addresses', () => {
    const result = simulate({ seed: 0, asize: 1024, psize: 16384, numAddresses: 5 });
    expect(result.addresses).toHaveLength(5);
  });

  it('base + limit fits in physical memory', () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = simulate({ seed, asize: 1024, psize: 16384, numAddresses: 5 });
      expect(result.base + result.limit).toBeLessThanOrEqual(result.psize);
      expect(result.base).toBeGreaterThanOrEqual(0);
      expect(result.limit).toBeGreaterThan(0);
    }
  });

  it('valid addresses translate correctly', () => {
    const result = simulate({ seed: 0, asize: 1024, psize: 16384, numAddresses: 10 });
    for (const addr of result.addresses) {
      if (addr.valid) {
        expect(addr.physicalAddr).toBe(addr.virtualAddr + result.base);
        expect(addr.virtualAddr).toBeLessThan(result.limit);
      } else {
        expect(addr.physicalAddr).toBeNull();
        expect(addr.virtualAddr).toBeGreaterThanOrEqual(result.limit);
      }
    }
  });

  it('all virtual addresses are within address space', () => {
    const result = simulate({ seed: 5, asize: 256, psize: 4096, numAddresses: 20 });
    for (const addr of result.addresses) {
      expect(addr.virtualAddr).toBeGreaterThanOrEqual(0);
      expect(addr.virtualAddr).toBeLessThan(result.asize);
    }
  });

  it('uses explicit base and limit when provided', () => {
    const result = simulate({ seed: 0, asize: 1024, psize: 16384, numAddresses: 3, base: 1000, limit: 500 });
    expect(result.base).toBe(1000);
    expect(result.limit).toBe(500);
  });

  it('throws for invalid parameters', () => {
    expect(() => simulate({ seed: 0, asize: 0, psize: 16384, numAddresses: 1 })).toThrow();
    expect(() => simulate({ seed: 0, asize: 1024, psize: 0, numAddresses: 1 })).toThrow();
    expect(() => simulate({ seed: 0, asize: 1024, psize: 512, numAddresses: 1 })).toThrow();
  });

  it('throws when explicit base+limit exceeds physical memory', () => {
    expect(() =>
      simulate({ seed: 0, asize: 1024, psize: 16384, numAddresses: 1, base: 16000, limit: 500 })
    ).toThrow('does not fit');
  });

  it('is deterministic for the same seed', () => {
    const a = simulate({ seed: 42, asize: 1024, psize: 16384, numAddresses: 10 });
    const b = simulate({ seed: 42, asize: 1024, psize: 16384, numAddresses: 10 });
    expect(a).toEqual(b);
  });

  it('produces different results for different seeds', () => {
    const a = simulate({ seed: 1, asize: 1024, psize: 16384, numAddresses: 5 });
    const b = simulate({ seed: 2, asize: 1024, psize: 16384, numAddresses: 5 });
    expect(a.base).not.toBe(b.base);
  });
});

describe('relocation simulator matches Python output', () => {
  const pythonCases = [
    {
      label: "seed=0, defaults (asize=1k, psize=16k, n=5)",
      params: { seed: 0, asize: 1024, psize: 16384, numAddresses: 5 },
      base: 12418, limit: 472,
      addresses: [
        { vaddr: 430, valid: true, paddr: 12848 },
        { vaddr: 265, valid: true, paddr: 12683 },
        { vaddr: 523, valid: false, paddr: null },
        { vaddr: 414, valid: true, paddr: 12832 },
        { vaddr: 802, valid: false, paddr: null },
      ]
    },
    {
      label: "seed=1, defaults",
      params: { seed: 1, asize: 1024, psize: 16384, numAddresses: 5 },
      base: 13884, limit: 290,
      addresses: [
        { vaddr: 782, valid: false, paddr: null },
        { vaddr: 261, valid: true, paddr: 14145 },
        { vaddr: 507, valid: false, paddr: null },
        { vaddr: 460, valid: false, paddr: null },
        { vaddr: 667, valid: false, paddr: null },
      ]
    },
    {
      label: "seed=2, defaults",
      params: { seed: 2, asize: 1024, psize: 16384, numAddresses: 5 },
      base: 15529, limit: 500,
      addresses: [
        { vaddr: 57, valid: true, paddr: 15586 },
        { vaddr: 86, valid: true, paddr: 15615 },
        { vaddr: 855, valid: false, paddr: null },
        { vaddr: 753, valid: false, paddr: null },
        { vaddr: 685, valid: false, paddr: null },
      ]
    },
    {
      label: "seed=3, asize=512, psize=8k, n=8",
      params: { seed: 3, asize: 512, psize: 8192, numAddresses: 8 },
      base: 4458, limit: 158,
      addresses: [
        { vaddr: 189, valid: false, paddr: null },
        { vaddr: 309, valid: false, paddr: null },
        { vaddr: 320, valid: false, paddr: null },
        { vaddr: 33, valid: true, paddr: 4491 },
        { vaddr: 6, valid: true, paddr: 4464 },
        { vaddr: 428, valid: false, paddr: null },
        { vaddr: 132, valid: true, paddr: 4590 },
        { vaddr: 119, valid: true, paddr: 4577 },
      ]
    },
    {
      label: "seed=5, asize=2k, psize=32k, n=10",
      params: { seed: 5, asize: 2048, psize: 32768, numAddresses: 10 },
      base: 24306, limit: 830,
      addresses: [
        { vaddr: 1628, valid: false, paddr: null },
        { vaddr: 1930, valid: false, paddr: null },
        { vaddr: 1515, valid: false, paddr: null },
        { vaddr: 1888, valid: false, paddr: null },
        { vaddr: 59, valid: true, paddr: 24365 },
        { vaddr: 953, valid: false, paddr: null },
        { vaddr: 1931, valid: false, paddr: null },
        { vaddr: 1329, valid: false, paddr: null },
        { vaddr: 1845, valid: false, paddr: null },
        { vaddr: 231, valid: true, paddr: 24537 },
      ]
    },
    {
      label: "seed=10, asize=256, psize=4k, n=3",
      params: { seed: 10, asize: 256, psize: 4096, numAddresses: 3 },
      base: 1756, limit: 100,
      addresses: [
        { vaddr: 147, valid: false, paddr: null },
        { vaddr: 52, valid: true, paddr: 1808 },
        { vaddr: 208, valid: false, paddr: null },
      ]
    },
  ];

  for (const tc of pythonCases) {
    it(tc.label, () => {
      const result = simulate(tc.params);
      expect(result.base).toBe(tc.base);
      expect(result.limit).toBe(tc.limit);
      expect(result.addresses).toHaveLength(tc.addresses.length);
      for (let i = 0; i < tc.addresses.length; i++) {
        const exp = tc.addresses[i];
        const got = result.addresses[i];
        expect(got.virtualAddr).toBe(exp.vaddr);
        expect(got.valid).toBe(exp.valid);
        expect(got.physicalAddr).toBe(exp.paddr);
      }
    });
  }
});

describe('toHex', () => {
  it('formats numbers as hex', () => {
    expect(toHex(0)).toBe('0x00000000');
    expect(toHex(255)).toBe('0x000000ff');
    expect(toHex(13884)).toBe('0x0000363c');
  });

  it('respects digit count', () => {
    expect(toHex(255, 4)).toBe('0x00ff');
  });
});
