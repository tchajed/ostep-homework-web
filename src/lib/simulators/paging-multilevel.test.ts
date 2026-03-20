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

/**
 * Cross-validation tests: compare TypeScript simulator output against
 * known-good Python simulator output from paging-multilevel-translate.py.
 */
describe('paging-multilevel matches Python simulator output', () => {
  it('seed=0, allocated=64, num=10: PDBR, translations, and memory', () => {
    const result = simulate({ seed: 0, allocated: 64, numAddresses: 10 });
    expect(result.pdbr).toBe(108);

    // Every translation from Python's `-c` output
    const expected = [
      { vaddr: 0x611c, pdeIndex: 0x18, pdeContents: 0xa1, pdeValid: true, pdePfn: 0x21, pteIndex: 0x8, pteContents: 0xb5, pteValid: true, ptePfn: 0x35, fault: 'none' as const, physicalAddr: 0x6bc, value: 0x08 },
      { vaddr: 0x3da8, pdeIndex: 0xf, pdeContents: 0xd6, pdeValid: true, pdePfn: 0x56, pteIndex: 0xd, pteContents: 0x7f, pteValid: false, ptePfn: 0x7f, fault: 'pte' as const },
      { vaddr: 0x17f5, pdeIndex: 0x5, pdeContents: 0xd4, pdeValid: true, pdePfn: 0x54, pteIndex: 0x1f, pteContents: 0xce, pteValid: true, ptePfn: 0x4e, fault: 'none' as const, physicalAddr: 0x9d5, value: 0x1c },
      { vaddr: 0x7f6c, pdeIndex: 0x1f, pdeContents: 0xff, pdeValid: true, pdePfn: 0x7f, pteIndex: 0x1b, pteContents: 0x7f, pteValid: false, ptePfn: 0x7f, fault: 'pte' as const },
      { vaddr: 0x0bad, pdeIndex: 0x2, pdeContents: 0xe0, pdeValid: true, pdePfn: 0x60, pteIndex: 0x1d, pteContents: 0x7f, pteValid: false, ptePfn: 0x7f, fault: 'pte' as const },
      { vaddr: 0x6d60, pdeIndex: 0x1b, pdeContents: 0xc2, pdeValid: true, pdePfn: 0x42, pteIndex: 0xb, pteContents: 0x7f, pteValid: false, ptePfn: 0x7f, fault: 'pte' as const },
      { vaddr: 0x2a5b, pdeIndex: 0xa, pdeContents: 0xd5, pdeValid: true, pdePfn: 0x55, pteIndex: 0x12, pteContents: 0x7f, pteValid: false, ptePfn: 0x7f, fault: 'pte' as const },
      { vaddr: 0x4c5e, pdeIndex: 0x13, pdeContents: 0xf8, pdeValid: true, pdePfn: 0x78, pteIndex: 0x2, pteContents: 0x7f, pteValid: false, ptePfn: 0x7f, fault: 'pte' as const },
      { vaddr: 0x2592, pdeIndex: 0x9, pdeContents: 0x9e, pdeValid: true, pdePfn: 0x1e, pteIndex: 0xc, pteContents: 0xbd, pteValid: true, ptePfn: 0x3d, fault: 'none' as const, physicalAddr: 0x7b2, value: 0x1b },
      { vaddr: 0x3e99, pdeIndex: 0xf, pdeContents: 0xd6, pdeValid: true, pdePfn: 0x56, pteIndex: 0x14, pteContents: 0xca, pteValid: true, ptePfn: 0x4a, fault: 'none' as const, physicalAddr: 0x959, value: 0x1e },
    ];

    for (let i = 0; i < expected.length; i++) {
      const e = expected[i];
      const t = result.translations[i];
      expect(t.virtualAddr, `t${i} vaddr`).toBe(e.vaddr);
      expect(t.pdeIndex, `t${i} pdeIndex`).toBe(e.pdeIndex);
      expect(t.pdeContents, `t${i} pdeContents`).toBe(e.pdeContents);
      expect(t.pdeValid, `t${i} pdeValid`).toBe(e.pdeValid);
      expect(t.pdePfn, `t${i} pdePfn`).toBe(e.pdePfn);
      expect(t.fault, `t${i} fault`).toBe(e.fault);
      if (e.pdeValid && e.pteIndex !== undefined) {
        expect(t.pteIndex, `t${i} pteIndex`).toBe(e.pteIndex);
        expect(t.pteContents, `t${i} pteContents`).toBe(e.pteContents);
        expect(t.pteValid, `t${i} pteValid`).toBe(e.pteValid);
        expect(t.ptePfn, `t${i} ptePfn`).toBe(e.ptePfn);
      }
      if (e.fault === 'none') {
        expect(t.physicalAddr, `t${i} physAddr`).toBe(e.physicalAddr);
        expect(t.value, `t${i} value`).toBe(e.value);
      }
    }

    // Verify PDBR page (page 108) memory contents
    const page108 = [0x83,0xfe,0xe0,0xda,0x7f,0xd4,0x7f,0xeb,0xbe,0x9e,0xd5,0xad,0xe4,0xac,0x90,0xd6,0x92,0xd8,0xc1,0xf8,0x9f,0xe1,0xed,0xe9,0xa1,0xe8,0xc7,0xc2,0xa9,0xd1,0xdb,0xff];
    for (let i = 0; i < 32; i++) {
      expect(result.memory[108 * 32 + i], `page108[${i}]`).toBe(page108[i]);
    }

    // Verify data page 0 memory contents
    const page0 = [0x1b,0x1d,0x05,0x05,0x1d,0x0b,0x19,0x00,0x1e,0x00,0x12,0x1c,0x19,0x09,0x19,0x0c,0x0f,0x0b,0x0a,0x12,0x18,0x15,0x17,0x00,0x10,0x0a,0x06,0x1c,0x06,0x05,0x05,0x14];
    for (let i = 0; i < 32; i++) {
      expect(result.memory[i], `page0[${i}]`).toBe(page0[i]);
    }
  });

  it('seed=1, allocated=64, num=10', () => {
    const result = simulate({ seed: 1, allocated: 64, numAddresses: 10 });
    expect(result.pdbr).toBe(17);

    const expected = [
      { vaddr: 0x6c74, fault: 'none' as const, physicalAddr: 0xc34, value: 0x06 },
      { vaddr: 0x6b22, fault: 'none' as const, physicalAddr: 0x8e2, value: 0x1a },
      { vaddr: 0x03df, fault: 'none' as const, physicalAddr: 0x0bf, value: 0x0f },
      { vaddr: 0x69dc, fault: 'pte' as const },
      { vaddr: 0x317a, fault: 'none' as const, physicalAddr: 0x6ba, value: 0x1e },
      { vaddr: 0x4546, fault: 'pte' as const },
      { vaddr: 0x2c03, fault: 'none' as const, physicalAddr: 0xae3, value: 0x16 },
      { vaddr: 0x7fd7, fault: 'pte' as const },
      { vaddr: 0x390e, fault: 'pde' as const },
      { vaddr: 0x748b, fault: 'pte' as const },
    ];

    for (let i = 0; i < expected.length; i++) {
      const e = expected[i];
      const t = result.translations[i];
      expect(t.virtualAddr, `t${i} vaddr`).toBe(e.vaddr);
      expect(t.fault, `t${i} fault`).toBe(e.fault);
      if (e.fault === 'none') {
        expect(t.physicalAddr, `t${i} physAddr`).toBe(e.physicalAddr!);
        expect(t.value, `t${i} value`).toBe(e.value!);
      }
    }
  });

  it('seed=2, allocated=64, num=10', () => {
    const result = simulate({ seed: 2, allocated: 64, numAddresses: 10 });
    expect(result.pdbr).toBe(122);

    const expected = [
      { vaddr: 0x7570, fault: 'pte' as const },
      { vaddr: 0x7268, fault: 'none' as const, physicalAddr: 0xca8, value: 0x16 },
      { vaddr: 0x1f9f, fault: 'pte' as const },
      { vaddr: 0x0325, fault: 'none' as const, physicalAddr: 0xba5, value: 0x0b },
      { vaddr: 0x64c4, fault: 'pte' as const },
      { vaddr: 0x0cdf, fault: 'none' as const, physicalAddr: 0x2ff, value: 0x00 },
      { vaddr: 0x2906, fault: 'pde' as const },
      { vaddr: 0x7a36, fault: 'none' as const, physicalAddr: 0xcd6, value: 0x09 },
      { vaddr: 0x21e1, fault: 'pde' as const },
      { vaddr: 0x5149, fault: 'none' as const, physicalAddr: 0x029, value: 0x1b },
    ];

    for (let i = 0; i < expected.length; i++) {
      const e = expected[i];
      const t = result.translations[i];
      expect(t.virtualAddr, `t${i} vaddr`).toBe(e.vaddr);
      expect(t.fault, `t${i} fault`).toBe(e.fault);
      if (e.fault === 'none') {
        expect(t.physicalAddr, `t${i} physAddr`).toBe(e.physicalAddr!);
        expect(t.value, `t${i} value`).toBe(e.value!);
      }
    }
  });

  it('seed=5, allocated=20, num=5', () => {
    const result = simulate({ seed: 5, allocated: 20, numAddresses: 5 });
    expect(result.pdbr).toBe(79);

    const expected = [
      { vaddr: 0x6b4b, pdeIndex: 0x1a, pdeContents: 0x7f, pdeValid: false, fault: 'pde' as const },
      { vaddr: 0x4e34, pdeIndex: 0x13, pdeContents: 0xd0, pdeValid: true, pteIndex: 0x11, pteContents: 0x7f, pteValid: false, fault: 'pte' as const },
      { vaddr: 0x76f0, fault: 'none' as const, physicalAddr: 0x590, value: 0x09 },
      { vaddr: 0x1e9a, fault: 'pde' as const },
      { vaddr: 0x45a0, fault: 'pde' as const },
    ];

    for (let i = 0; i < expected.length; i++) {
      const e = expected[i];
      const t = result.translations[i];
      expect(t.virtualAddr, `t${i} vaddr`).toBe(e.vaddr);
      expect(t.fault, `t${i} fault`).toBe(e.fault);
      if (e.fault === 'none') {
        expect(t.physicalAddr, `t${i} physAddr`).toBe(e.physicalAddr!);
        expect(t.value, `t${i} value`).toBe(e.value!);
      }
    }
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
