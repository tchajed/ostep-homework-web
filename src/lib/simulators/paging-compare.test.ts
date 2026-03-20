/**
 * Compare TypeScript paging simulator output against Python reference output.
 *
 * Each test case captures the exact output from:
 *   python3 paging-linear-translate.py [flags] -c
 * and verifies the TypeScript simulator produces identical results.
 */
import { describe, it, expect } from "vitest";
import {
  runPagingSimulation,
  defaultPagingOptions,
  type PagingOptions,
} from "./paging";

interface PythonReference {
  label: string;
  opts: PagingOptions;
  pageTableRaw: number[];
  translations: Array<{
    va: number;
    valid: boolean;
    pa?: number;
    vpn: number;
  }>;
}

const testCases: PythonReference[] = [
  {
    label: "seed=0, defaults (16k/64k/4k)",
    opts: { ...defaultPagingOptions, seed: 0 },
    pageTableRaw: [0x8000000c, 0x00000000, 0x00000000, 0x80000006],
    translations: [
      { va: 12841, valid: true,  pa: 25129, vpn: 3 },
      { va: 4969,  valid: false, vpn: 1 },
      { va: 7808,  valid: false, vpn: 1 },
      { va: 9558,  valid: false, vpn: 2 },
      { va: 14878, valid: true,  pa: 27166, vpn: 3 },
    ],
  },
  {
    label: "seed=1, defaults (16k/64k/4k)",
    opts: { ...defaultPagingOptions, seed: 1 },
    pageTableRaw: [0x00000000, 0x8000000c, 0x00000000, 0x00000000],
    translations: [
      { va: 7364,  valid: true,  pa: 52420, vpn: 1 },
      { va: 10675, valid: false, vpn: 2 },
      { va: 12922, valid: false, vpn: 3 },
      { va: 1537,  valid: false, vpn: 0 },
      { va: 464,   valid: false, vpn: 0 },
    ],
  },
  {
    label: "seed=2, defaults (16k/64k/4k)",
    opts: { ...defaultPagingOptions, seed: 2 },
    pageTableRaw: [0x8000000f, 0x00000000, 0x00000000, 0x8000000b],
    translations: [
      { va: 10972, valid: false, vpn: 2 },
      { va: 5048,  valid: false, vpn: 1 },
      { va: 9927,  valid: false, vpn: 2 },
      { va: 9941,  valid: false, vpn: 2 },
      { va: 9522,  valid: false, vpn: 2 },
    ],
  },
  {
    label: "seed=0, 8k pages, 32k/128k",
    opts: { ...defaultPagingOptions, seed: 0, pagesize: "8k", asize: "32k", psize: "128k" },
    pageTableRaw: [0x8000000c, 0x00000000, 0x00000000, 0x80000006],
    translations: [
      { va: 25683, valid: true,  pa: 50259, vpn: 3 },
      { va: 9938,  valid: false, vpn: 1 },
      { va: 15617, valid: false, vpn: 1 },
      { va: 19116, valid: false, vpn: 2 },
      { va: 29757, valid: true,  pa: 54333, vpn: 3 },
    ],
  },
  {
    label: "seed=3, 2k pages, 8k/32k, 75% used",
    opts: { ...defaultPagingOptions, seed: 3, pagesize: "2k", asize: "8k", psize: "32k", usedPercent: 75 },
    pageTableRaw: [0x00000000, 0x80000005, 0x8000000a, 0x00000000],
    translations: [
      { va: 107,  valid: false, vpn: 0 },
      { va: 6860, valid: false, vpn: 3 },
      { va: 2124, valid: true,  pa: 10316, vpn: 1 },
      { va: 1919, valid: false, vpn: 0 },
      { va: 8156, valid: false, vpn: 3 },
    ],
  },
];

describe("paging simulator: Python reference comparison", () => {
  for (const tc of testCases) {
    describe(tc.label, () => {
      const result = runPagingSimulation(tc.opts);

      it("page table matches Python output", () => {
        expect(result.pageTable.length).toBe(tc.pageTableRaw.length);
        for (let i = 0; i < tc.pageTableRaw.length; i++) {
          const tsRaw = result.pageTable[i].raw >>> 0;
          const pyRaw = tc.pageTableRaw[i] >>> 0;
          expect(tsRaw).toBe(pyRaw);
        }
      });

      it("virtual addresses match Python output", () => {
        expect(result.translations.length).toBe(tc.translations.length);
        for (let i = 0; i < tc.translations.length; i++) {
          expect(result.translations[i].virtualAddress).toBe(tc.translations[i].va);
        }
      });

      it("VPN extraction matches Python output", () => {
        for (let i = 0; i < tc.translations.length; i++) {
          expect(result.translations[i].vpn).toBe(tc.translations[i].vpn);
        }
      });

      it("validity matches Python output", () => {
        for (let i = 0; i < tc.translations.length; i++) {
          expect(result.translations[i].valid).toBe(tc.translations[i].valid);
        }
      });

      it("physical addresses match Python output for valid translations", () => {
        for (let i = 0; i < tc.translations.length; i++) {
          const py = tc.translations[i];
          if (py.valid && py.pa !== undefined) {
            expect(result.translations[i].physicalAddress).toBe(py.pa);
          }
        }
      });
    });
  }
});
