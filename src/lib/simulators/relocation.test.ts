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
