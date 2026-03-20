import { Random } from '../random';

export interface RelocationParams {
  seed: number;
  asize: number;      // address space size in bytes
  psize: number;      // physical memory size in bytes
  numAddresses: number;
  base?: number;      // -1 or undefined means auto-generate
  limit?: number;     // -1 or undefined means auto-generate
}

export interface AddressResult {
  index: number;
  virtualAddr: number;
  valid: boolean;
  physicalAddr: number | null;  // null if segfault
}

export interface RelocationResult {
  base: number;
  limit: number;
  asize: number;
  psize: number;
  addresses: AddressResult[];
}

export function simulate(params: RelocationParams): RelocationResult {
  const { seed, asize, psize, numAddresses } = params;

  if (psize <= 1) {
    throw new Error('Physical memory size must be greater than 1.');
  }
  if (asize === 0) {
    throw new Error('Address space size must be non-zero.');
  }
  if (psize <= asize) {
    throw new Error('Physical memory size must be greater than address space size.');
  }

  const rng = new Random(seed);

  // Generate limit (bounds register)
  let limit: number;
  if (params.limit !== undefined && params.limit >= 0) {
    limit = params.limit;
  } else {
    limit = Math.floor(asize / 4.0 + (asize / 4.0 * rng.random()));
  }

  // Generate base register
  let base: number;
  if (params.base !== undefined && params.base >= 0) {
    base = params.base;
  } else {
    // Find a base where the segment fits in physical memory
    do {
      base = Math.floor(psize * rng.random());
    } while (base + limit >= psize);
  }

  if (base + limit > psize) {
    throw new Error(
      `Address space does not fit into physical memory. Base + Limit = ${base + limit}, Psize = ${psize}`
    );
  }

  // Generate virtual address trace
  const addresses: AddressResult[] = [];
  for (let i = 0; i < numAddresses; i++) {
    const vaddr = Math.floor(asize * rng.random());
    if (vaddr >= limit) {
      addresses.push({ index: i, virtualAddr: vaddr, valid: false, physicalAddr: null });
    } else {
      addresses.push({ index: i, virtualAddr: vaddr, valid: true, physicalAddr: vaddr + base });
    }
  }

  return { base, limit, asize, psize, addresses };
}

/** Format a number as 0x-prefixed hex with at least the given number of digits. */
export function toHex(n: number, digits: number = 8): string {
  return '0x' + n.toString(16).padStart(digits, '0');
}
