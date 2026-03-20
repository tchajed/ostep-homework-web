import { Random } from '../random';

const BLOCKSIZE = 4096;

export type RaidLevel = 0 | 1 | 4 | 5;
export type Raid5Type = 'LS' | 'LA';
export type Workload = 'rand' | 'seq';

export interface RaidParams {
  seed: number;
  numDisks: number;
  chunkSize: number;       // in blocks (1 block = 4096 bytes)
  numRequests: number;
  reqSize: number;         // in blocks
  workload: Workload;
  writeFrac: number;       // 0-100
  randRange: number;
  level: RaidLevel;
  raid5type: Raid5Type;
}

export const defaultParams: RaidParams = {
  seed: 0,
  numDisks: 4,
  chunkSize: 1,           // 4k = 1 block
  numRequests: 10,
  reqSize: 1,             // 4k = 1 block
  workload: 'rand',
  writeFrac: 0,
  randRange: 10000,
  level: 0,
  raid5type: 'LS',
};

export interface PhysicalOp {
  type: 'read' | 'write';
  disk: number;
  offset: number;
}

export interface RequestResult {
  logicalAddr: number;
  size: number;             // in blocks
  isWrite: boolean;
  ops: PhysicalOp[];
}

export interface RaidResult {
  params: RaidParams;
  requests: RequestResult[];
}

// ----- Block mapping functions (pure, no side effects) -----

/** RAID-0 striping: map logical block -> (disk, offset) */
function bmap0(bnum: number, chunkSize: number, numDisks: number): [number, number] {
  const cnum = Math.floor(bnum / chunkSize);
  const coff = bnum % chunkSize;
  return [cnum % numDisks, Math.floor(cnum / numDisks) * chunkSize + coff];
}

/** RAID-1 mirroring: map logical block -> (disk1, disk2, offset) */
function bmap1(bnum: number, chunkSize: number, numDisks: number): [number, number, number] {
  const cnum = Math.floor(bnum / chunkSize);
  const coff = bnum % chunkSize;
  const halfDisks = Math.floor(numDisks / 2);
  const disk = 2 * (cnum % halfDisks);
  const off = Math.floor(cnum / halfDisks) * chunkSize + coff;
  return [disk, disk + 1, off];
}

/** RAID-4: map logical block -> (disk, offset). Parity always on last disk. */
function bmap4(bnum: number, chunkSize: number, numDisks: number): [number, number] {
  const cnum = Math.floor(bnum / chunkSize);
  const coff = bnum % chunkSize;
  return [cnum % (numDisks - 1), Math.floor(cnum / (numDisks - 1)) * chunkSize + coff];
}

function pmap4(_snum: number, numDisks: number): number {
  return numDisks - 1;
}

/**
 * RAID-5 internal mapping: map logical block -> (dataDisk, parityDisk, offset)
 * Supports left-symmetric (LS) and left-asymmetric (LA) layouts.
 */
function bmap5full(
  bnum: number,
  chunkSize: number,
  numDisks: number,
  raid5type: Raid5Type,
): [number, number, number] {
  const cnum = Math.floor(bnum / chunkSize);
  const coff = bnum % chunkSize;
  const ddsk = Math.floor(cnum / (numDisks - 1));
  const doff = ddsk * chunkSize + coff;
  let disk = cnum % (numDisks - 1);
  const col = ddsk % numDisks;
  const pdisk = (numDisks - 1) - col;

  if (raid5type === 'LA') {
    if (disk >= pdisk) {
      disk += 1;
    }
  } else {
    // LS: left-symmetric
    disk = ((disk - col) % numDisks + numDisks) % numDisks;
  }
  return [disk, pdisk, doff];
}

function bmap5(
  bnum: number,
  chunkSize: number,
  numDisks: number,
  raid5type: Raid5Type,
): [number, number] {
  const [disk, , off] = bmap5full(bnum, chunkSize, numDisks, raid5type);
  return [disk, off];
}

function pmap5(
  snum: number,
  chunkSize: number,
  numDisks: number,
  raid5type: Raid5Type,
): number {
  const blocksInStripe = (numDisks - 1) * chunkSize;
  const [, pdisk] = bmap5full(snum * blocksInStripe, chunkSize, numDisks, raid5type);
  return pdisk;
}

// ----- Enqueue logic (builds PhysicalOp arrays) -----

function enqueue0(addr: number, size: number, isWrite: boolean, chunkSize: number, numDisks: number): PhysicalOp[] {
  const ops: PhysicalOp[] = [];
  for (let b = addr; b < addr + size; b++) {
    const [disk, off] = bmap0(b, chunkSize, numDisks);
    ops.push({ type: isWrite ? 'write' : 'read', disk, offset: off });
  }
  return ops;
}

function enqueue1(addr: number, size: number, isWrite: boolean, chunkSize: number, numDisks: number): PhysicalOp[] {
  const ops: PhysicalOp[] = [];
  for (let b = addr; b < addr + size; b++) {
    const [disk1, disk2, off] = bmap1(b, chunkSize, numDisks);
    if (isWrite) {
      ops.push({ type: 'write', disk: disk1, offset: off });
      ops.push({ type: 'write', disk: disk2, offset: off });
    } else {
      // Read balancing: even offsets go to disk1, odd to disk2
      if (off % 2 === 0) {
        ops.push({ type: 'read', disk: disk1, offset: off });
      } else {
        ops.push({ type: 'read', disk: disk2, offset: off });
      }
    }
  }
  return ops;
}

function doPartialWrite(
  stripe: number,
  begin: number,
  end: number,
  bmapFn: (bnum: number) => [number, number],
  pmapFn: (snum: number) => number,
  blocksInStripe: number,
): PhysicalOp[] {
  const ops: PhysicalOp[] = [];
  const numWrites = end - begin;
  const pdisk = pmapFn(stripe);

  if ((numWrites + 1) <= (blocksInStripe - numWrites)) {
    // SUBTRACTIVE PARITY: read old data + old parity, write new data + new parity
    const offList: number[] = [];
    for (let voff = begin; voff < end; voff++) {
      const [disk, off] = bmapFn(voff);
      ops.push({ type: 'read', disk, offset: off });
      if (!offList.includes(off)) {
        offList.push(off);
      }
    }
    for (const off of offList) {
      ops.push({ type: 'read', disk: pdisk, offset: off });
    }
  } else {
    // ADDITIVE PARITY: read all other data blocks in stripe
    const stripeBegin = stripe * blocksInStripe;
    const stripeEnd = stripeBegin + blocksInStripe;
    for (let voff = stripeBegin; voff < begin; voff++) {
      const [disk, off] = bmapFn(voff);
      ops.push({ type: 'read', disk, offset: off });
    }
    for (let voff = end; voff < stripeEnd; voff++) {
      const [disk, off] = bmapFn(voff);
      ops.push({ type: 'read', disk, offset: off });
    }
  }

  // Writes: same for additive or subtractive
  const offList: number[] = [];
  for (let voff = begin; voff < end; voff++) {
    const [disk, off] = bmapFn(voff);
    ops.push({ type: 'write', disk, offset: off });
    if (!offList.includes(off)) {
      offList.push(off);
    }
  }
  for (const off of offList) {
    ops.push({ type: 'write', disk: pdisk, offset: off });
  }

  return ops;
}

function enqueue45(
  addr: number,
  size: number,
  isWrite: boolean,
  chunkSize: number,
  numDisks: number,
  level: 4 | 5,
  raid5type: Raid5Type,
): PhysicalOp[] {
  const blocksInStripe = (numDisks - 1) * chunkSize;

  const bmapFn = level === 4
    ? (bnum: number) => bmap4(bnum, chunkSize, numDisks)
    : (bnum: number) => bmap5(bnum, chunkSize, numDisks, raid5type);

  const pmapFn = level === 4
    ? (_snum: number) => pmap4(_snum, numDisks)
    : (snum: number) => pmap5(snum, chunkSize, numDisks, raid5type);

  if (!isWrite) {
    const ops: PhysicalOp[] = [];
    for (let b = addr; b < addr + size; b++) {
      const [disk, off] = bmapFn(b);
      ops.push({ type: 'read', disk, offset: off });
    }
    return ops;
  }

  // Process writes one stripe at a time
  const ops: PhysicalOp[] = [];
  const initStripe = Math.floor(addr / blocksInStripe);
  const finalStripe = Math.floor((addr + size - 1) / blocksInStripe);

  let left = size;
  let begin = addr;
  for (let stripe = initStripe; stripe <= finalStripe; stripe++) {
    const endOfStripe = (stripe + 1) * blocksInStripe;
    let end: number;
    if (left >= blocksInStripe) {
      end = begin + blocksInStripe;
    } else {
      end = begin + left;
    }
    if (end > endOfStripe) {
      end = endOfStripe;
    }

    ops.push(...doPartialWrite(stripe, begin, end, bmapFn, pmapFn, blocksInStripe));

    left -= (end - begin);
    begin = end;
  }

  return ops;
}

function enqueueRequest(
  addr: number,
  size: number,
  isWrite: boolean,
  params: RaidParams,
): PhysicalOp[] {
  switch (params.level) {
    case 0:
      return enqueue0(addr, size, isWrite, params.chunkSize, params.numDisks);
    case 1:
      return enqueue1(addr, size, isWrite, params.chunkSize, params.numDisks);
    case 4:
    case 5:
      return enqueue45(addr, size, isWrite, params.chunkSize, params.numDisks, params.level, params.raid5type);
  }
}

// ----- Public API -----

export function simulate(params: RaidParams): RaidResult {
  if (params.level === 1 && params.numDisks % 2 !== 0) {
    throw new Error('RAID-1: number of disks must be even.');
  }
  if ((params.level === 4 || params.level === 5) && params.numDisks < 2) {
    throw new Error('RAID-4 and RAID-5 need more than 1 disk.');
  }

  const rng = new Random(params.seed);
  const writeFrac = params.writeFrac / 100.0;
  const requests: RequestResult[] = [];

  let off = 0;
  for (let i = 0; i < params.numRequests; i++) {
    let blk: number;
    if (params.workload === 'seq') {
      blk = off;
      off += params.reqSize;
    } else {
      blk = Math.floor(rng.random() * params.randRange);
    }

    const isWrite = rng.random() < writeFrac;
    const ops = enqueueRequest(blk, params.reqSize, isWrite, params);
    requests.push({
      logicalAddr: blk,
      size: params.reqSize,
      isWrite,
      ops,
    });
  }

  return { params, requests };
}

/**
 * Compute the block mapping table for visualization.
 * Returns an array of stripes, where each stripe is an array of disk columns.
 * Each cell contains either a logical block number or 'P' for parity.
 */
export interface DiskCell {
  label: string;      // logical block number or 'P' or 'P#'
  isParity: boolean;
}

export function computeDiskLayout(params: RaidParams, numStripes: number): DiskCell[][] {
  const rows: DiskCell[][] = [];

  if (params.level === 0) {
    for (let stripe = 0; stripe < numStripes; stripe++) {
      const row: DiskCell[] = [];
      for (let d = 0; d < params.numDisks; d++) {
        for (let c = 0; c < params.chunkSize; c++) {
          const logicalBlock = stripe * params.numDisks * params.chunkSize + d * params.chunkSize + c;
          row.push({ label: String(logicalBlock), isParity: false });
        }
      }
      rows.push(row);
    }
  } else if (params.level === 1) {
    const halfDisks = Math.floor(params.numDisks / 2);
    for (let stripe = 0; stripe < numStripes; stripe++) {
      const row: DiskCell[] = [];
      for (let d = 0; d < halfDisks; d++) {
        for (let c = 0; c < params.chunkSize; c++) {
          const logicalBlock = stripe * halfDisks * params.chunkSize + d * params.chunkSize + c;
          // Each logical block maps to two disks (mirrored)
          row.push({ label: String(logicalBlock), isParity: false });
          row.push({ label: String(logicalBlock), isParity: false });
        }
      }
      rows.push(row);
    }
  } else if (params.level === 4) {
    for (let stripe = 0; stripe < numStripes; stripe++) {
      const row: DiskCell[] = [];
      for (let d = 0; d < params.numDisks - 1; d++) {
        for (let c = 0; c < params.chunkSize; c++) {
          const logicalBlock = stripe * (params.numDisks - 1) * params.chunkSize + d * params.chunkSize + c;
          row.push({ label: String(logicalBlock), isParity: false });
        }
      }
      // Parity disk (always last)
      for (let c = 0; c < params.chunkSize; c++) {
        row.push({ label: 'P' + stripe, isParity: true });
      }
      rows.push(row);
    }
  } else if (params.level === 5) {
    for (let stripe = 0; stripe < numStripes; stripe++) {
      // Figure out where parity goes for this stripe
      const pdisk = pmap5(stripe, params.chunkSize, params.numDisks, params.raid5type);
      const row: DiskCell[] = [];
      let logBase = stripe * (params.numDisks - 1) * params.chunkSize;
      let dataIdx = 0;
      for (let d = 0; d < params.numDisks; d++) {
        for (let c = 0; c < params.chunkSize; c++) {
          if (d === pdisk) {
            row.push({ label: 'P' + stripe, isParity: true });
          } else {
            // figure out the logical block via bmap5
            // Simpler: enumerate data blocks in order
            row.push({ label: String(logBase + dataIdx), isParity: false });
            dataIdx++;
          }
        }
        if (d === pdisk) {
          // don't increment dataIdx for parity chunks
        }
      }
      rows.push(row);
    }
  }

  return rows;
}

/** Map a single logical block to its physical location(s) for a given RAID level. */
export function mapBlock(
  bnum: number,
  params: RaidParams,
): { disk: number; offset: number }[] {
  switch (params.level) {
    case 0: {
      const [disk, off] = bmap0(bnum, params.chunkSize, params.numDisks);
      return [{ disk, offset: off }];
    }
    case 1: {
      const [d1, d2, off] = bmap1(bnum, params.chunkSize, params.numDisks);
      return [{ disk: d1, offset: off }, { disk: d2, offset: off }];
    }
    case 4: {
      const [disk, off] = bmap4(bnum, params.chunkSize, params.numDisks);
      return [{ disk, offset: off }];
    }
    case 5: {
      const [disk, off] = bmap5(bnum, params.chunkSize, params.numDisks, params.raid5type);
      return [{ disk, offset: off }];
    }
  }
}
