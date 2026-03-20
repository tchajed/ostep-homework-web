import { Random } from '../random';

export interface SegmentInfo {
  base: number;
  limit: number;
}

export interface TranslationResult {
  index: number;
  virtualAddr: number;
  segment: 0 | 1;
  valid: boolean;
  physicalAddr: number | null;
}

export interface SegmentationConfig {
  seed: number;
  addressSpaceSize: number;
  physicalMemSize: number;
  numAddresses: number;
  /** User-facing base for seg0 (or -1 for random) */
  base0: number;
  /** Limit for seg0 (or -1 for random) */
  len0: number;
  /** User-facing base for seg1 (top of segment, or -1 for random) */
  base1: number;
  /** Limit for seg1 (or -1 for random) */
  len1: number;
}

export interface SegmentationResult {
  seg0: SegmentInfo;
  /** seg1.base is the user-facing base (top of segment, i.e. internalBase1 + len1) */
  seg1: SegmentInfo;
  translations: TranslationResult[];
}

export const DEFAULT_CONFIG: SegmentationConfig = {
  seed: 0,
  addressSpaceSize: 1024,
  physicalMemSize: 16384,
  numAddresses: 5,
  base0: -1,
  len0: -1,
  base1: -1,
  len1: -1,
};

export function runSegmentation(config: SegmentationConfig): SegmentationResult {
  const rng = new Random(config.seed);
  const asize = config.addressSpaceSize;
  const psize = config.physicalMemSize;

  // Generate or use provided segment lengths
  let len0 = config.len0;
  let len1 = config.len1;

  if (len0 === -1) {
    len0 = Math.floor(asize / 4.0 + (asize / 4.0 * rng.random()));
  }
  if (len1 === -1) {
    len1 = Math.floor(asize / 4.0 + (asize / 4.0 * rng.random()));
  }

  // Generate or use provided bases
  let base0 = config.base0;
  let base1 = config.base1;

  if (base0 === -1) {
    while (true) {
      base0 = Math.floor(psize * rng.random());
      if (base0 + len0 < psize) break;
    }
  }

  // Internally, base1 points to the lower address of segment 1.
  // The user-facing base1 is the top: internalBase1 + len1
  if (base1 === -1) {
    while (true) {
      base1 = Math.floor(psize * rng.random());
      if (base1 + len1 < psize) {
        if (base1 > base0 + len0 || base1 + len1 < base0) {
          break;
        }
      }
    }
  } else {
    // user passes in the top of the segment; convert to internal (lower) base
    base1 = base1 - len1;
  }

  const nbase1 = base1 + len1; // user-facing base for seg1

  // Generate virtual addresses
  const addrList: number[] = [];
  for (let i = 0; i < config.numAddresses; i++) {
    addrList.push(Math.floor(asize * rng.random()));
  }

  // Translate each address
  const translations: TranslationResult[] = addrList.map((vaddr, i) => {
    if (vaddr >= asize / 2) {
      // Segment 1 (grows negative)
      const paddr = nbase1 + (vaddr - asize);
      const valid = paddr >= base1;
      return {
        index: i,
        virtualAddr: vaddr,
        segment: 1 as const,
        valid,
        physicalAddr: valid ? paddr : null,
      };
    } else {
      // Segment 0 (grows positive)
      const valid = vaddr < len0;
      return {
        index: i,
        virtualAddr: vaddr,
        segment: 0 as const,
        valid,
        physicalAddr: valid ? vaddr + base0 : null,
      };
    }
  });

  return {
    seg0: { base: base0, limit: len0 },
    seg1: { base: nbase1, limit: len1 },
    translations,
  };
}
