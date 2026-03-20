import { Random } from "../random";

/** Convert a human-readable size string like "16k", "32m", "1g" to bytes. */
export function convertSize(size: string): number {
  const s = size.trim();
  const lastChar = s[s.length - 1].toLowerCase();
  if (lastChar === "k") {
    return parseInt(s.slice(0, -1), 10) * 1024;
  } else if (lastChar === "m") {
    return parseInt(s.slice(0, -1), 10) * 1024 * 1024;
  } else if (lastChar === "g") {
    return parseInt(s.slice(0, -1), 10) * 1024 * 1024 * 1024;
  }
  return parseInt(s, 10);
}

function isPowerOf2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function log2(n: number): number {
  return Math.log2(n);
}

export interface PageTableEntry {
  vpn: number;
  valid: boolean;
  pfn: number; // only meaningful if valid
  /** The raw 32-bit entry: high bit = valid, rest = PFN */
  raw: number;
}

export interface TranslationResult {
  virtualAddress: number;
  vpn: number;
  offset: number;
  valid: boolean;
  pfn: number;
  physicalAddress: number;
}

export interface PagingSimulation {
  addressSpaceSize: number;
  physicalMemSize: number;
  pageSize: number;
  numVirtualPages: number;
  numPhysicalPages: number;
  vaBits: number;
  pageBits: number;
  vpnBits: number;
  pageTable: PageTableEntry[];
  translations: TranslationResult[];
}

export interface PagingOptions {
  seed: number;
  asize: string;     // e.g. "16k"
  psize: string;     // e.g. "64k"
  pagesize: string;  // e.g. "4k"
  numAddrs: number;
  addresses: string; // comma-separated or "-1" for random
  usedPercent: number;
}

export const defaultPagingOptions: PagingOptions = {
  seed: 0,
  asize: "16k",
  psize: "64k",
  pagesize: "4k",
  numAddrs: 5,
  addresses: "-1",
  usedPercent: 50,
};

export function validatePagingOptions(opts: PagingOptions): string | null {
  const asize = convertSize(opts.asize);
  const psize = convertSize(opts.psize);
  const pagesize = convertSize(opts.pagesize);

  if (isNaN(asize) || asize < 1) return "Address space size must be positive.";
  if (isNaN(psize) || psize <= 1) return "Physical memory size must be > 1.";
  if (isNaN(pagesize) || pagesize < 1) return "Page size must be positive.";
  if (psize <= asize) return "Physical memory must be greater than address space size.";
  if (psize >= convertSize("1g") || asize >= convertSize("1g"))
    return "Sizes must be less than 1 GB.";
  if (!isPowerOf2(asize)) return "Address space size must be a power of 2.";
  if (!isPowerOf2(pagesize)) return "Page size must be a power of 2.";
  if (asize % pagesize !== 0) return "Address space must be a multiple of page size.";
  if (psize % pagesize !== 0) return "Physical memory must be a multiple of page size.";
  if (opts.usedPercent < 0 || opts.usedPercent > 100) return "Used percent must be 0-100.";
  return null;
}

export function runPagingSimulation(opts: PagingOptions): PagingSimulation {
  const rng = new Random(opts.seed);

  const asize = convertSize(opts.asize);
  const psize = convertSize(opts.psize);
  const pagesize = convertSize(opts.pagesize);

  const pages = Math.floor(psize / pagesize);
  const vpages = Math.floor(asize / pagesize);

  const vaBits = Math.round(log2(asize));
  const pageBits = Math.round(log2(pagesize));
  const vpnBits = vaBits - pageBits;
  const pageMask = (1 << pageBits) - 1;
  const vpnMask = 0xffffffff & ~pageMask;

  // Track which physical frames are in use
  const used: boolean[] = new Array(pages).fill(false);

  // Build page table, matching the Python algorithm exactly
  const pageTable: PageTableEntry[] = [];
  for (let v = 0; v < vpages; v++) {
    let done = false;
    while (!done) {
      if (rng.random() * 100.0 > 100.0 - opts.usedPercent) {
        const u = Math.floor(pages * rng.random());
        if (!used[u]) {
          used[u] = true;
          done = true;
          pageTable.push({
            vpn: v,
            valid: true,
            pfn: u,
            raw: 0x80000000 | u,
          });
        }
      } else {
        pageTable.push({
          vpn: v,
          valid: false,
          pfn: 0,
          raw: 0,
        });
        done = true;
      }
    }
  }

  // Generate or parse virtual addresses
  const addrList: number[] = [];
  if (opts.addresses.trim() === "-1") {
    for (let i = 0; i < opts.numAddrs; i++) {
      addrList.push(Math.floor(asize * rng.random()));
    }
  } else {
    for (const s of opts.addresses.split(",")) {
      const n = parseInt(s.trim(), 10);
      if (!isNaN(n)) addrList.push(n);
    }
  }

  // Translate each address
  const translations: TranslationResult[] = addrList.map((vaddr) => {
    const vpn = (vaddr & vpnMask) >>> pageBits;
    const offset = vaddr & pageMask;
    const entry = pageTable[vpn];
    if (!entry || !entry.valid) {
      return {
        virtualAddress: vaddr,
        vpn,
        offset,
        valid: false,
        pfn: 0,
        physicalAddress: 0,
      };
    }
    const pfn = entry.pfn;
    const paddr = (pfn << pageBits) | offset;
    return {
      virtualAddress: vaddr,
      vpn,
      offset,
      valid: true,
      pfn,
      physicalAddress: paddr,
    };
  });

  return {
    addressSpaceSize: asize,
    physicalMemSize: psize,
    pageSize: pagesize,
    numVirtualPages: vpages,
    numPhysicalPages: pages,
    vaBits,
    pageBits,
    vpnBits,
    pageTable,
    translations,
  };
}

/** Format a number as "0xHHHHHHHH" (8-digit hex). */
export function hex32(n: number): string {
  return "0x" + (n >>> 0).toString(16).padStart(8, "0");
}
