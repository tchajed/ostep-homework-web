import { Random } from '../random';

export type Policy = 'FIRST' | 'BEST' | 'WORST';
export type ListOrder = 'ADDRSORT' | 'SIZESORT+' | 'SIZESORT-' | 'INSERT-FRONT' | 'INSERT-BACK';

export interface FreeEntry {
  addr: number;
  size: number;
}

export interface MallocResult {
  addr: number;   // -1 if failed
  searched: number;
}

export class Malloc {
  private freelist: FreeEntry[];
  private sizemap: Map<number, number>;
  private readonly policy: Policy;
  private readonly returnPolicy: ListOrder;
  private readonly coalesce: boolean;
  private readonly headerSize: number;
  private readonly align: number;
  private readonly totalSize: number;

  constructor(
    size: number,
    start: number,
    headerSize: number,
    policy: Policy,
    order: ListOrder,
    coalesce: boolean,
    align: number,
  ) {
    this.totalSize = size;
    this.headerSize = headerSize;
    this.freelist = [{ addr: start, size }];
    this.sizemap = new Map();
    this.policy = policy;
    this.returnPolicy = order;
    this.coalesce = coalesce;
    this.align = align;
  }

  private addToMap(addr: number, size: number): void {
    if (this.sizemap.has(addr)) {
      throw new Error(`Address ${addr} already in sizemap`);
    }
    this.sizemap.set(addr, size);
  }

  malloc(requestSize: number): MallocResult {
    let size = requestSize;

    if (this.align > 0) {
      const left = size % this.align;
      if (left !== 0) {
        size += this.align - left;
      }
    }

    size += this.headerSize;

    let bestIdx = -1;
    let bestSize: number;
    let bestAddr = 0;

    if (this.policy === 'BEST') {
      bestSize = this.totalSize + 1;
    } else {
      bestSize = -1;
    }

    let count = 0;

    for (let i = 0; i < this.freelist.length; i++) {
      const { addr: eaddr, size: esize } = this.freelist[i];
      count++;
      if (
        esize >= size &&
        ((this.policy === 'BEST' && esize < bestSize) ||
          (this.policy === 'WORST' && esize > bestSize) ||
          this.policy === 'FIRST')
      ) {
        bestAddr = eaddr;
        bestSize = esize;
        bestIdx = i;
        if (this.policy === 'FIRST') {
          break;
        }
      }
    }

    if (bestIdx !== -1) {
      if (bestSize > size) {
        this.freelist[bestIdx] = { addr: bestAddr + size, size: bestSize - size };
        this.addToMap(bestAddr, size);
      } else if (bestSize === size) {
        this.freelist.splice(bestIdx, 1);
        this.addToMap(bestAddr, size);
      }
      return { addr: bestAddr, searched: count };
    }

    return { addr: -1, searched: count };
  }

  free(addr: number): number {
    if (!this.sizemap.has(addr)) {
      return -1;
    }

    const size = this.sizemap.get(addr)!;

    if (this.returnPolicy === 'INSERT-BACK') {
      this.freelist.push({ addr, size });
    } else if (this.returnPolicy === 'INSERT-FRONT') {
      this.freelist.unshift({ addr, size });
    } else if (this.returnPolicy === 'ADDRSORT') {
      this.freelist.push({ addr, size });
      this.freelist.sort((a, b) => a.addr - b.addr);
    } else if (this.returnPolicy === 'SIZESORT+') {
      this.freelist.push({ addr, size });
      this.freelist.sort((a, b) => a.size - b.size);
    } else if (this.returnPolicy === 'SIZESORT-') {
      this.freelist.push({ addr, size });
      this.freelist.sort((a, b) => b.size - a.size);
    }

    if (this.coalesce) {
      const newlist: FreeEntry[] = [];
      let curr = this.freelist[0];
      for (let i = 1; i < this.freelist.length; i++) {
        const { addr: eaddr, size: esize } = this.freelist[i];
        if (eaddr === curr.addr + curr.size) {
          curr = { addr: curr.addr, size: curr.size + esize };
        } else {
          newlist.push(curr);
          curr = { addr: eaddr, size: esize };
        }
      }
      newlist.push(curr);
      this.freelist = newlist;
    }

    this.sizemap.delete(addr);
    return 0;
  }

  getFreelist(): FreeEntry[] {
    return this.freelist.map(e => ({ ...e }));
  }

  dump(): string {
    const entries = this.freelist.map(e => `[ addr:${e.addr} sz:${e.size} ]`).join('');
    return `Free List [ Size ${this.freelist.length} ]: ${entries}`;
  }
}

// --- Operation generation (mirrors the Python main program) ---

export type Operation =
  | { type: 'alloc'; ptrIndex: number; size: number }
  | { type: 'free'; ptrIndex: number };

export interface OperationResult {
  op: Operation;
  result: number;        // returned address (with headerSize offset for random ops) or free rc
  searched: number;      // elements searched (for alloc)
  freelistAfter: FreeEntry[];
}

export interface SimulationParams {
  seed: number;
  heapSize: number;
  baseAddr: number;
  headerSize: number;
  alignment: number;
  policy: Policy;
  listOrder: ListOrder;
  coalesce: boolean;
  numOps: number;
  opsRange: number;
  percentAlloc: number;
  opsList: string;
}

export const defaultParams: SimulationParams = {
  seed: 0,
  heapSize: 100,
  baseAddr: 1000,
  headerSize: 0,
  alignment: -1,
  policy: 'BEST',
  listOrder: 'ADDRSORT',
  coalesce: false,
  numOps: 10,
  opsRange: 10,
  percentAlloc: 50,
  opsList: '',
};

export interface SimulationResult {
  params: SimulationParams;
  steps: OperationResult[];
  initialFreelist: FreeEntry[];
}

export function simulate(params: SimulationParams): SimulationResult {
  const m = new Malloc(
    params.heapSize,
    params.baseAddr,
    params.headerSize,
    params.policy,
    params.listOrder,
    params.coalesce,
    params.alignment,
  );

  const initialFreelist = m.getFreelist();
  const steps: OperationResult[] = [];
  const percent = params.percentAlloc / 100.0;
  const rng = new Random(params.seed);

  // Track allocated pointers: ptrMap[ptrIndex] = addr, liveKeys = list of live ptr indices
  const ptrMap: Map<number, number> = new Map();
  const liveKeys: number[] = [];

  if (params.opsList.trim() === '') {
    // Random operations
    let c = 0; // ptr counter
    let j = 0; // completed ops
    while (j < params.numOps) {
      if (rng.random() < percent) {
        const size = Math.floor(rng.random() * params.opsRange) + 1;
        const { addr: ptr, searched: cnt } = m.malloc(size);
        if (ptr !== -1) {
          ptrMap.set(c, ptr);
          liveKeys.push(c);
        }
        // Python adds headerSize to returned addr in display for random mode
        steps.push({
          op: { type: 'alloc', ptrIndex: c, size },
          result: ptr !== -1 ? ptr + params.headerSize : -1,
          searched: cnt,
          freelistAfter: m.getFreelist(),
        });
        c++;
        j++;
      } else {
        if (liveKeys.length > 0) {
          const d = Math.floor(rng.random() * liveKeys.length);
          const ptrIdx = liveKeys[d];
          const rc = m.free(ptrMap.get(ptrIdx)!);
          steps.push({
            op: { type: 'free', ptrIndex: ptrIdx },
            result: rc,
            searched: 0,
            freelistAfter: m.getFreelist(),
          });
          ptrMap.delete(ptrIdx);
          liveKeys.splice(d, 1);
          j++;
        }
        // If no live pointers, skip (no j++ like Python)
      }
    }
  } else {
    // Explicit operations list
    let c = 0;
    for (const op of params.opsList.split(',')) {
      const trimmed = op.trim();
      if (trimmed.startsWith('+')) {
        const size = parseInt(trimmed.slice(1), 10);
        const { addr: ptr, searched: cnt } = m.malloc(size);
        if (ptr !== -1) {
          ptrMap.set(c, ptr);
        }
        steps.push({
          op: { type: 'alloc', ptrIndex: c, size },
          result: ptr,
          searched: cnt,
          freelistAfter: m.getFreelist(),
        });
        c++;
      } else if (trimmed.startsWith('-')) {
        const index = parseInt(trimmed.slice(1), 10);
        if (!ptrMap.has(index)) {
          // Invalid free - skip
          continue;
        }
        const rc = m.free(ptrMap.get(index)!);
        steps.push({
          op: { type: 'free', ptrIndex: index },
          result: rc,
          searched: 0,
          freelistAfter: m.getFreelist(),
        });
      }
    }
  }

  return { params, steps, initialFreelist };
}
