import { Random } from '../random';

// ── Types ──────────────────────────────────────────────────────────────

export type SsdType = 'direct' | 'log' | 'ideal';

export const enum PageState {
  Invalid = 1,
  Erased = 2,
  Valid = 3,
}

export interface SsdParams {
  seed: number;
  numCmds: number;
  opPercentages: string; // "40/50/10"
  skew: string;          // "" or "80/20"
  skewStart: number;
  readFail: number;
  cmdList: string;       // "" or "r10,w20:a,t5"
  ssdType: SsdType;
  numLogicalPages: number;
  numBlocks: number;
  pagesPerBlock: number;
  highWaterMark: number;
  lowWaterMark: number;
  eraseTime: number;
  programTime: number;
  readTime: number;
}

export const defaultParams: SsdParams = {
  seed: 0,
  numCmds: 10,
  opPercentages: '40/50/10',
  skew: '',
  skewStart: 0,
  readFail: 0,
  cmdList: '',
  ssdType: 'direct',
  numLogicalPages: 50,
  numBlocks: 7,
  pagesPerBlock: 10,
  highWaterMark: 10,
  lowWaterMark: 8,
  eraseTime: 1000,
  programTime: 40,
  readTime: 10,
};

export interface CmdResult {
  op: number;
  type: 'read' | 'write' | 'trim';
  address: number;
  data?: string;
  result: string;
}

export interface GcEvent {
  gcCount: number;
  action: string; // e.g. "read(physical_page=3)", "write()", "erase(block=1)"
}

export interface BlockStats {
  erases: number;
  writes: number;
  reads: number;
}

export interface SsdSnapshot {
  forwardMap: number[];    // logical -> physical (-1 if unmapped)
  state: PageState[];      // per physical page
  data: string[];          // per physical page
  blockStats: BlockStats[];
}

export interface SsdResult {
  cmds: CmdResult[];
  gcEvents: GcEvent[];
  initialSnapshot: SsdSnapshot;
  finalSnapshot: SsdSnapshot;
  // aggregate stats
  physicalEraseSum: number;
  physicalWriteSum: number;
  physicalReadSum: number;
  logicalWriteSum: number;
  logicalWriteFailSum: number;
  logicalReadSum: number;
  logicalReadFailSum: number;
  logicalTrimSum: number;
  logicalTrimFailSum: number;
  eraseTime: number;
  writeTime: number;
  readTimeTotal: number;
  totalTime: number;
}

// ── SSD Simulator Class ────────────────────────────────────────────────

class Ssd {
  private ssdType: SsdType;
  private numLogicalPages: number;
  private numBlocks: number;
  private pagesPerBlock: number;
  private numPages: number;

  private blockEraseTime: number;
  private pageProgramTime: number;
  private pageReadTime: number;

  state: PageState[];
  data: string[];

  private currentPage: number;
  private currentBlock: number;

  private gcCount: number;
  private gcCurrentBlock: number;
  private gcHighWaterMark: number;
  private gcLowWaterMark: number;

  gcEvents: GcEvent[];

  private gcUsedBlocks: number[];
  private liveCount: number[];

  forwardMap: number[];
  private reverseMap: number[];

  private physicalEraseCount: number[];
  private physicalReadCount: number[];
  private physicalWriteCount: number[];

  physicalEraseSum: number;
  physicalWriteSum: number;
  physicalReadSum: number;

  logicalTrimSum: number;
  logicalWriteSum: number;
  logicalReadSum: number;

  logicalTrimFailSum: number;
  logicalWriteFailSum: number;
  logicalReadFailSum: number;

  constructor(
    ssdType: SsdType,
    numLogicalPages: number,
    numBlocks: number,
    pagesPerBlock: number,
    blockEraseTime: number,
    pageProgramTime: number,
    pageReadTime: number,
    highWaterMark: number,
    lowWaterMark: number,
  ) {
    this.ssdType = ssdType;
    this.numLogicalPages = numLogicalPages;
    this.numBlocks = numBlocks;
    this.pagesPerBlock = pagesPerBlock;
    this.numPages = numBlocks * pagesPerBlock;

    this.blockEraseTime = blockEraseTime;
    this.pageProgramTime = pageProgramTime;
    this.pageReadTime = pageReadTime;

    this.state = new Array(this.numPages).fill(PageState.Invalid);
    this.data = new Array(this.numPages).fill(' ');

    this.currentPage = -1;
    this.currentBlock = 0;

    this.gcCount = 0;
    this.gcCurrentBlock = 0;
    this.gcHighWaterMark = highWaterMark;
    this.gcLowWaterMark = lowWaterMark;
    this.gcEvents = [];

    this.gcUsedBlocks = new Array(numBlocks).fill(0);
    this.liveCount = new Array(numBlocks).fill(0);

    this.forwardMap = new Array(numLogicalPages).fill(-1);
    this.reverseMap = new Array(this.numPages).fill(-1);

    this.physicalEraseCount = new Array(numBlocks).fill(0);
    this.physicalReadCount = new Array(numBlocks).fill(0);
    this.physicalWriteCount = new Array(numBlocks).fill(0);

    this.physicalEraseSum = 0;
    this.physicalWriteSum = 0;
    this.physicalReadSum = 0;

    this.logicalTrimSum = 0;
    this.logicalWriteSum = 0;
    this.logicalReadSum = 0;

    this.logicalTrimFailSum = 0;
    this.logicalWriteFailSum = 0;
    this.logicalReadFailSum = 0;
  }

  private blocksInUse(): number {
    let used = 0;
    for (let i = 0; i < this.numBlocks; i++) {
      used += this.gcUsedBlocks[i];
    }
    return used;
  }

  private physicalErase(blockAddress: number): void {
    const pageBegin = blockAddress * this.pagesPerBlock;
    const pageEnd = pageBegin + this.pagesPerBlock;
    for (let page = pageBegin; page < pageEnd; page++) {
      this.data[page] = ' ';
      this.state[page] = PageState.Erased;
    }
    this.gcUsedBlocks[blockAddress] = 0;
    this.physicalEraseCount[blockAddress] += 1;
    this.physicalEraseSum += 1;
  }

  private physicalProgram(pageAddress: number, data: string): void {
    this.data[pageAddress] = data;
    this.state[pageAddress] = PageState.Valid;
    const block = Math.floor(pageAddress / this.pagesPerBlock);
    this.physicalWriteCount[block] += 1;
    this.physicalWriteSum += 1;
  }

  private physicalRead(pageAddress: number): string {
    const block = Math.floor(pageAddress / this.pagesPerBlock);
    this.physicalReadCount[block] += 1;
    this.physicalReadSum += 1;
    return this.data[pageAddress];
  }

  private readDirect(address: number): string {
    return this.physicalRead(address);
  }

  private writeDirect(pageAddress: number, data: string): string {
    const blockAddress = Math.floor(pageAddress / this.pagesPerBlock);
    const pageBegin = blockAddress * this.pagesPerBlock;
    const pageEnd = pageBegin + this.pagesPerBlock;

    const oldList: [number, string][] = [];
    for (let oldPage = pageBegin; oldPage < pageEnd; oldPage++) {
      if (this.state[oldPage] === PageState.Valid) {
        const oldData = this.physicalRead(oldPage);
        oldList.push([oldPage, oldData]);
      }
    }

    this.physicalErase(blockAddress);
    for (const [oldPage, oldData] of oldList) {
      if (oldPage === pageAddress) continue;
      this.physicalProgram(oldPage, oldData);
    }

    this.physicalProgram(pageAddress, data);
    this.forwardMap[pageAddress] = pageAddress;
    this.reverseMap[pageAddress] = pageAddress;
    return 'success';
  }

  private writeIdeal(pageAddress: number, data: string): string {
    this.physicalProgram(pageAddress, data);
    this.forwardMap[pageAddress] = pageAddress;
    this.reverseMap[pageAddress] = pageAddress;
    return 'success';
  }

  private isBlockFree(block: number): boolean {
    const firstPage = block * this.pagesPerBlock;
    if (
      this.state[firstPage] === PageState.Invalid ||
      this.state[firstPage] === PageState.Erased
    ) {
      if (this.state[firstPage] === PageState.Invalid) {
        this.physicalErase(block);
      }
      this.currentBlock = block;
      this.currentPage = firstPage;
      this.gcUsedBlocks[block] = 1;
      return true;
    }
    return false;
  }

  private getCursor(): number {
    if (this.currentPage === -1) {
      for (let block = this.currentBlock; block < this.numBlocks; block++) {
        if (this.isBlockFree(block)) return 0;
      }
      for (let block = 0; block < this.currentBlock; block++) {
        if (this.isBlockFree(block)) return 0;
      }
      return -1;
    }
    return 0;
  }

  private updateCursor(): void {
    this.currentPage += 1;
    if (this.currentPage % this.pagesPerBlock === 0) {
      this.currentPage = -1;
    }
  }

  private writeLogging(pageAddress: number, data: string): string {
    if (this.getCursor() === -1) {
      this.logicalWriteFailSum += 1;
      return 'failure: device full';
    }
    this.physicalProgram(this.currentPage, data);
    this.forwardMap[pageAddress] = this.currentPage;
    this.reverseMap[this.currentPage] = pageAddress;
    this.updateCursor();
    return 'success';
  }

  private garbageCollect(): void {
    // iterate blocks starting from gcCurrentBlock, wrapping around
    const blockOrder: number[] = [];
    for (let b = this.gcCurrentBlock; b < this.numBlocks; b++) blockOrder.push(b);
    for (let b = 0; b < this.gcCurrentBlock; b++) blockOrder.push(b);

    for (const block of blockOrder) {
      if (block === this.currentBlock) continue;

      const pageStart = block * this.pagesPerBlock;
      if (this.state[pageStart] === PageState.Erased) continue;

      const livePages: number[] = [];
      for (let page = pageStart; page < pageStart + this.pagesPerBlock; page++) {
        const logicalPage = this.reverseMap[page];
        if (logicalPage !== -1 && this.forwardMap[logicalPage] === page) {
          livePages.push(page);
        }
      }

      if (livePages.length === this.pagesPerBlock) continue;

      for (const page of livePages) {
        this.gcEvents.push({
          gcCount: this.gcCount,
          action: `read(physical_page=${page})`,
        });
        this.gcEvents.push({
          gcCount: this.gcCount,
          action: 'write()',
        });
        const d = this.physicalRead(page);
        this.write(this.reverseMap[page], d);
      }

      this.physicalErase(block);
      this.gcEvents.push({
        gcCount: this.gcCount,
        action: `erase(block=${block})`,
      });

      if (this.blocksInUse() <= this.gcLowWaterMark) {
        this.gcCurrentBlock = block;
        this.gcCount += 1;
        return;
      }
    }
  }

  upkeep(): void {
    if (this.blocksInUse() >= this.gcHighWaterMark) {
      this.garbageCollect();
    }
  }

  trim(address: number): string {
    this.logicalTrimSum += 1;
    if (address < 0 || address >= this.numLogicalPages) {
      this.logicalTrimFailSum += 1;
      return 'fail: illegal trim address';
    }
    if (this.forwardMap[address] === -1) {
      this.logicalTrimFailSum += 1;
      return 'fail: uninitialized trim';
    }
    this.forwardMap[address] = -1;
    return 'success';
  }

  read(address: number): string {
    this.logicalReadSum += 1;
    if (address < 0 || address >= this.numLogicalPages) {
      this.logicalReadFailSum += 1;
      return 'fail: illegal read address';
    }
    if (this.forwardMap[address] === -1) {
      this.logicalReadFailSum += 1;
      return 'fail: uninitialized read';
    }
    return this.readDirect(this.forwardMap[address]);
  }

  write(address: number, data: string): string {
    this.logicalWriteSum += 1;
    if (address < 0 || address >= this.numLogicalPages) {
      this.logicalWriteFailSum += 1;
      return 'fail: illegal write address';
    }
    if (this.ssdType === 'direct') {
      return this.writeDirect(address, data);
    } else if (this.ssdType === 'ideal') {
      return this.writeIdeal(address, data);
    } else {
      return this.writeLogging(address, data);
    }
  }

  snapshot(): SsdSnapshot {
    return {
      forwardMap: [...this.forwardMap],
      state: [...this.state],
      data: [...this.data],
      blockStats: Array.from({ length: this.numBlocks }, (_, i) => ({
        erases: this.physicalEraseCount[i],
        writes: this.physicalWriteCount[i],
        reads: this.physicalReadCount[i],
      })),
    };
  }
}

// ── Command Generation ─────────────────────────────────────────────────

const PRINTABLE =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateCommands(rng: Random, params: SsdParams): string[] {
  if (params.cmdList !== '') {
    return params.cmdList.split(',').filter(c => c !== '');
  }

  const maxPageAddr = params.numLogicalPages;
  const numCmds = params.numCmds;
  const p = params.opPercentages.split('/');
  const percentReads = parseInt(p[0], 10);
  const percentWrites = parseInt(p[1], 10);

  const hotCold = params.skew !== '';
  let hotPercent = 0;
  let hotTarget = 0;
  if (hotCold) {
    const sk = params.skew.split('/');
    hotPercent = parseInt(sk[0], 10) / 100.0;
    hotTarget = parseInt(sk[1], 10) / 100.0;
  }
  let skewStart = params.skewStart;

  const cmdList: string[] = [];
  const validAddresses: number[] = [];

  while (cmdList.length < numCmds) {
    const whichCmd = Math.floor(rng.random() * 100.0);
    if (whichCmd < percentReads) {
      // READ
      if (rng.randint(0, 99) < params.readFail) {
        const address = rng.randint(0, maxPageAddr - 1);
        cmdList.push(`r${address}`);
      } else {
        if (validAddresses.length < 2) continue;
        const address = rng.choice(validAddresses);
        cmdList.push(`r${address}`);
      }
    } else if (whichCmd < percentReads + percentWrites) {
      // WRITE
      let address: number;
      if (skewStart === 0 && hotCold && rng.random() < hotPercent) {
        address = rng.randint(0, Math.floor(hotTarget * (maxPageAddr - 1)));
      } else {
        address = rng.randint(0, maxPageAddr - 1);
      }
      if (!validAddresses.includes(address)) {
        validAddresses.push(address);
      }
      const data = rng.choice(PRINTABLE.split(''));
      cmdList.push(`w${address}:${data}`);
      if (skewStart > 0) {
        skewStart -= 1;
      }
    } else {
      // TRIM
      if (validAddresses.length < 1) continue;
      const address = rng.choice(validAddresses);
      cmdList.push(`t${address}`);
      const idx = validAddresses.indexOf(address);
      if (idx >= 0) validAddresses.splice(idx, 1);
    }
  }

  return cmdList;
}

// ── Main simulate function ─────────────────────────────────────────────

export function simulate(params: SsdParams): SsdResult {
  const rng = new Random(params.seed);

  const s = new Ssd(
    params.ssdType,
    params.numLogicalPages,
    params.numBlocks,
    params.pagesPerBlock,
    params.eraseTime,
    params.programTime,
    params.readTime,
    params.highWaterMark,
    params.lowWaterMark,
  );

  const cmdStrings = generateCommands(rng, params);
  const initialSnapshot = s.snapshot();

  const cmds: CmdResult[] = [];
  let op = 0;

  for (const cmd of cmdStrings) {
    if (cmd === '') break;

    if (cmd[0] === 'r') {
      const address = parseInt(cmd.slice(1), 10);
      const data = s.read(address);
      cmds.push({ op, type: 'read', address, result: data });
      op++;
    } else if (cmd[0] === 'w') {
      const parts = cmd.split(':');
      const address = parseInt(parts[0].slice(1), 10);
      const data = parts[1];
      const rc = s.write(address, data);
      cmds.push({ op, type: 'write', address, data, result: rc });
      op++;
    } else if (cmd[0] === 't') {
      const address = parseInt(cmd.slice(1), 10);
      const rc = s.trim(address);
      cmds.push({ op, type: 'trim', address, result: rc });
      op++;
    }

    s.upkeep();
  }

  const finalSnapshot = s.snapshot();

  const eraseTime = s.physicalEraseSum * params.eraseTime;
  const writeTime = s.physicalWriteSum * params.programTime;
  const readTimeTotal = s.physicalReadSum * params.readTime;

  return {
    cmds,
    gcEvents: s.gcEvents,
    initialSnapshot,
    finalSnapshot,
    physicalEraseSum: s.physicalEraseSum,
    physicalWriteSum: s.physicalWriteSum,
    physicalReadSum: s.physicalReadSum,
    logicalWriteSum: s.logicalWriteSum,
    logicalWriteFailSum: s.logicalWriteFailSum,
    logicalReadSum: s.logicalReadSum,
    logicalReadFailSum: s.logicalReadFailSum,
    logicalTrimSum: s.logicalTrimSum,
    logicalTrimFailSum: s.logicalTrimFailSum,
    eraseTime,
    writeTime,
    readTimeTotal,
    totalTime: eraseTime + writeTime + readTimeTotal,
  };
}

// ── Helpers for display ────────────────────────────────────────────────

export function pageStateChar(s: PageState): string {
  switch (s) {
    case PageState.Invalid:
      return 'i';
    case PageState.Erased:
      return 'E';
    case PageState.Valid:
      return 'v';
  }
}

export function isPageLive(
  snap: SsdSnapshot,
  physPage: number,
): boolean {
  if (snap.state[physPage] !== PageState.Valid) return false;
  // Find the logical page that maps to this physical page
  for (let lp = 0; lp < snap.forwardMap.length; lp++) {
    if (snap.forwardMap[lp] === physPage) return true;
  }
  return false;
}
