import { describe, it, expect } from 'vitest';
import { simulate, toHex } from './paging-multilevel';

describe('paging-multilevel simulate', () => {
  it('returns correct structure with default params', () => {
    const result = simulate({ seed: 0, allocated: 64, numAddresses: 10 });
    expect(result.pageSize).toBe(32);
    expect(result.physPages).toBe(128);
    expect(result.physMem).toBe(4096);
    expect(result.vaPages).toBe(1024);
    expect(result.vaSize).toBe(32768);
    expect(result.pageBits).toBe(5);
    expect(result.memory.length).toBe(4096);
    expect(result.translations.length).toBe(10);
    expect(result.allocatedVPs.length).toBe(64);
  });

  it('produces deterministic results for same seed', () => {
    const r1 = simulate({ seed: 42, allocated: 10, numAddresses: 5 });
    const r2 = simulate({ seed: 42, allocated: 10, numAddresses: 5 });
    expect(r1.pdbr).toBe(r2.pdbr);
    expect(r1.memory).toEqual(r2.memory);
    expect(r1.translations).toEqual(r2.translations);
    expect(r1.allocatedVPs).toEqual(r2.allocatedVPs);
  });

  it('produces different results for different seeds', () => {
    const r1 = simulate({ seed: 1, allocated: 10, numAddresses: 5 });
    const r2 = simulate({ seed: 100, allocated: 10, numAddresses: 5 });
    // Memory contents should differ even if pdbr happens to collide
    expect(r1.memory).not.toEqual(r2.memory);
  });

  it('allocates exactly the requested number of virtual pages', () => {
    const result = simulate({ seed: 7, allocated: 20, numAddresses: 5 });
    expect(result.allocatedVPs.length).toBe(20);
    // All allocated VPs should be unique
    const unique = new Set(result.allocatedVPs);
    expect(unique.size).toBe(20);
  });

  it('allocated VPs are within valid range', () => {
    const result = simulate({ seed: 3, allocated: 30, numAddresses: 5 });
    for (const vp of result.allocatedVPs) {
      expect(vp).toBeGreaterThanOrEqual(0);
      expect(vp).toBeLessThan(result.vaPages);
    }
  });

  it('PDBR page is initialized as page directory (0x7f entries)', () => {
    const result = simulate({ seed: 0, allocated: 0, numAddresses: 0 });
    const pdbrStart = result.pdbr * result.pageSize;
    // With 0 allocations, every PDE should be 0x7f (invalid)
    for (let i = 0; i < result.pageSize; i++) {
      expect(result.memory[pdbrStart + i]).toBe(0x7f);
    }
  });

  it('translations have valid structure', () => {
    const result = simulate({ seed: 5, allocated: 64, numAddresses: 10 });
    for (const t of result.translations) {
      expect(t.virtualAddr).toBeGreaterThanOrEqual(0);
      expect(t.virtualAddr).toBeLessThan(32768);
      expect(t.pdeIndex).toBeGreaterThanOrEqual(0);
      expect(t.pdeIndex).toBeLessThan(32);

      if (t.fault === 'pde') {
        expect(t.pdeValid).toBe(false);
        expect(t.pteIndex).toBeUndefined();
      } else if (t.fault === 'pte') {
        expect(t.pdeValid).toBe(true);
        expect(t.pteValid).toBe(false);
        expect(t.pteIndex).toBeDefined();
        expect(t.physicalAddr).toBeUndefined();
      } else {
        // successful translation
        expect(t.pdeValid).toBe(true);
        expect(t.pteValid).toBe(true);
        expect(t.physicalAddr).toBeDefined();
        expect(t.physicalAddr!).toBeGreaterThanOrEqual(0);
        expect(t.physicalAddr!).toBeLessThan(4096);
        expect(t.value).toBeDefined();
        expect(t.value!).toBeGreaterThanOrEqual(0);
        expect(t.value!).toBeLessThan(31);
        expect(t.offset).toBeDefined();
        expect(t.offset!).toBeGreaterThanOrEqual(0);
        expect(t.offset!).toBeLessThan(32);
      }
    }
  });

  it('translated physical address is consistent with memory', () => {
    const result = simulate({ seed: 10, allocated: 64, numAddresses: 20 });
    for (const t of result.translations) {
      if (t.fault === 'none' && t.physicalAddr !== undefined) {
        expect(t.value).toBe(result.memory[t.physicalAddr]);
      }
    }
  });

  it('PDE contents match memory at PDE address', () => {
    const result = simulate({ seed: 4, allocated: 64, numAddresses: 10 });
    for (const t of result.translations) {
      expect(t.pdeContents).toBe(result.memory[t.pdeAddr]);
    }
  });

  it('PTE contents match memory at PTE address', () => {
    const result = simulate({ seed: 4, allocated: 64, numAddresses: 10 });
    for (const t of result.translations) {
      if (t.pdeValid && t.pteAddr !== undefined) {
        expect(t.pteContents).toBe(result.memory[t.pteAddr]);
      }
    }
  });

  it('with few allocations most translations fault', () => {
    const result = simulate({ seed: 99, allocated: 2, numAddresses: 20 });
    const faults = result.translations.filter(t => t.fault !== 'none');
    // With only 2 pages allocated out of 1024, most random addresses should fault
    expect(faults.length).toBeGreaterThan(10);
  });
});

describe('toHex', () => {
  it('formats numbers correctly', () => {
    expect(toHex(0, 2)).toBe('0x00');
    expect(toHex(255, 2)).toBe('0xff');
    expect(toHex(0x1234, 4)).toBe('0x1234');
    expect(toHex(10, 4)).toBe('0x000a');
  });
});
