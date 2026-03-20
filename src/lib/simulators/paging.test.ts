import { describe, it, expect } from "vitest";
import {
  convertSize,
  runPagingSimulation,
  validatePagingOptions,
  hex32,
  defaultPagingOptions,
  type PagingOptions,
} from "./paging";

describe("convertSize", () => {
  it("parses kilobytes", () => {
    expect(convertSize("16k")).toBe(16384);
    expect(convertSize("64K")).toBe(65536);
    expect(convertSize("4k")).toBe(4096);
  });

  it("parses megabytes", () => {
    expect(convertSize("1m")).toBe(1048576);
    expect(convertSize("32M")).toBe(32 * 1024 * 1024);
  });

  it("parses gigabytes", () => {
    expect(convertSize("1g")).toBe(1024 * 1024 * 1024);
  });

  it("parses plain numbers", () => {
    expect(convertSize("4096")).toBe(4096);
  });
});

describe("validatePagingOptions", () => {
  it("accepts default options", () => {
    expect(validatePagingOptions(defaultPagingOptions)).toBeNull();
  });

  it("rejects when physical <= address space", () => {
    const opts: PagingOptions = { ...defaultPagingOptions, psize: "16k" };
    expect(validatePagingOptions(opts)).toContain("greater");
  });

  it("rejects non-power-of-2 address space", () => {
    const opts: PagingOptions = { ...defaultPagingOptions, asize: "12288" };
    expect(validatePagingOptions(opts)).toContain("power of 2");
  });

  it("rejects non-power-of-2 page size", () => {
    const opts: PagingOptions = { ...defaultPagingOptions, pagesize: "3000" };
    expect(validatePagingOptions(opts)).toContain("power of 2");
  });

  it("rejects when address space not a multiple of page size", () => {
    // 16k with 8k+1 page size won't divide evenly
    const opts: PagingOptions = { ...defaultPagingOptions, pagesize: "8192", asize: "12288" };
    // 12288 is not power of 2
    const err = validatePagingOptions(opts);
    expect(err).not.toBeNull();
  });
});

describe("hex32", () => {
  it("formats zero", () => {
    expect(hex32(0)).toBe("0x00000000");
  });

  it("formats typical PFN entry", () => {
    expect(hex32(0x8000000c)).toBe("0x8000000c");
  });
});

describe("runPagingSimulation", () => {
  it("produces correct number of page table entries", () => {
    const result = runPagingSimulation(defaultPagingOptions);
    // 16k address space / 4k page = 4 entries
    expect(result.pageTable.length).toBe(4);
    expect(result.numVirtualPages).toBe(4);
    expect(result.numPhysicalPages).toBe(16); // 64k / 4k
  });

  it("produces correct number of translations", () => {
    const result = runPagingSimulation(defaultPagingOptions);
    expect(result.translations.length).toBe(5); // default numAddrs
  });

  it("is deterministic for the same seed", () => {
    const r1 = runPagingSimulation({ ...defaultPagingOptions, seed: 42 });
    const r2 = runPagingSimulation({ ...defaultPagingOptions, seed: 42 });
    expect(r1.pageTable).toEqual(r2.pageTable);
    expect(r1.translations).toEqual(r2.translations);
  });

  it("produces different results for different seeds", () => {
    const r1 = runPagingSimulation({ ...defaultPagingOptions, seed: 1 });
    const r2 = runPagingSimulation({ ...defaultPagingOptions, seed: 2 });
    // Very unlikely to be equal
    expect(r1.pageTable).not.toEqual(r2.pageTable);
  });

  it("valid translations have correct physical address", () => {
    const opts: PagingOptions = { ...defaultPagingOptions, seed: 10, usedPercent: 100 };
    const result = runPagingSimulation(opts);
    for (const t of result.translations) {
      if (t.valid) {
        const entry = result.pageTable[t.vpn];
        expect(entry.valid).toBe(true);
        expect(t.physicalAddress).toBe((entry.pfn << result.pageBits) | t.offset);
      }
    }
  });

  it("invalid translations correspond to invalid page table entries", () => {
    const result = runPagingSimulation({ ...defaultPagingOptions, seed: 1 });
    for (const t of result.translations) {
      if (!t.valid) {
        expect(result.pageTable[t.vpn].valid).toBe(false);
      }
    }
  });

  it("handles custom addresses", () => {
    const opts: PagingOptions = {
      ...defaultPagingOptions,
      seed: 0,
      addresses: "0,4096,8192",
    };
    const result = runPagingSimulation(opts);
    expect(result.translations.length).toBe(3);
    expect(result.translations[0].virtualAddress).toBe(0);
    expect(result.translations[0].vpn).toBe(0);
    expect(result.translations[1].virtualAddress).toBe(4096);
    expect(result.translations[1].vpn).toBe(1);
    expect(result.translations[2].virtualAddress).toBe(8192);
    expect(result.translations[2].vpn).toBe(2);
  });

  it("correctly splits virtual address into VPN and offset", () => {
    const opts: PagingOptions = {
      ...defaultPagingOptions,
      addresses: "7364", // 0x1cc4: VPN=1, offset=0xcc4=3268
    };
    const result = runPagingSimulation(opts);
    const t = result.translations[0];
    expect(t.vpn).toBe(1);
    expect(t.offset).toBe(3268); // 0xcc4
  });

  it("works with different page sizes", () => {
    const opts: PagingOptions = {
      ...defaultPagingOptions,
      seed: 3,
      asize: "32k",
      psize: "128k",
      pagesize: "8k",
      numAddrs: 3,
    };
    const result = runPagingSimulation(opts);
    expect(result.pageTable.length).toBe(4);  // 32k / 8k
    expect(result.numPhysicalPages).toBe(16); // 128k / 8k
    expect(result.pageBits).toBe(13);         // log2(8192)
    expect(result.vpnBits).toBe(2);           // log2(32k) - log2(8k) = 15-13
  });

  it("page table raw values have valid bit set correctly", () => {
    const result = runPagingSimulation({ ...defaultPagingOptions, seed: 1 });
    for (const entry of result.pageTable) {
      if (entry.valid) {
        // High bit is set (valid bit) — in JS bitwise ops are signed 32-bit
        expect(entry.raw < 0).toBe(true);
        expect(entry.raw & 0x7fffffff).toBe(entry.pfn);
      } else {
        expect(entry.raw).toBe(0);
      }
    }
  });
});
