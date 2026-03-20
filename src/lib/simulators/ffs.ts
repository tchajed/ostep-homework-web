/**
 * Fast File System (FFS) simulator.
 *
 * Translates the Python ffs.py homework from OSTEP into TypeScript.
 * The simulator models cylinder-group-based allocation policies:
 *   - Inode placement (near parent vs spread)
 *   - Data block placement (near inode vs spread)
 *   - Large file exception (spill to next group after N blocks)
 *   - Contiguous allocation policy (require N free contiguous blocks)
 */

const BITMAP_FREE = '__FREE__';

export interface FfsParams {
  numGroups: number;
  blocksPerGroup: number;
  inodesPerGroup: number;
  largeFileException: number;
  spreadInodes: boolean;
  contigAllocationPolicy: number;
  spreadDataBlocks: boolean;
  allocateFaraway: number;
}

export const defaultParams: FfsParams = {
  numGroups: 10,
  blocksPerGroup: 30,
  inodesPerGroup: 10,
  largeFileException: 30,
  spreadInodes: false,
  contigAllocationPolicy: 1,
  spreadDataBlocks: false,
  allocateFaraway: 1,
};

export type FileType = 'directory' | 'regular';

export interface FileOp {
  kind: 'mkdir' | 'create' | 'delete';
  path: string;
  size?: number; // only for create
}

export interface SymbolEntry {
  inodeNumber: number;
  symbol: string;
  filename: string;
  fileType: FileType;
  blockAddresses: number[];
}

export interface GroupState {
  inodeBitmap: (string | number)[]; // BITMAP_FREE or inode number
  dataBitmap: (string | number)[];  // BITMAP_FREE or inode number
}

export interface OpResult {
  op: FileOp;
  success: boolean;
  message?: string;
}

export interface SpanResult {
  path: string;
  fileType: FileType;
  span: number;
}

export interface FfsState {
  params: FfsParams;
  groups: GroupState[];
  symbolMap: Map<number, string>;
  nameToInode: Map<string, number>;
  inodeType: Map<number, FileType>;
  inodeBlocks: Map<number, number[]>;
  dirData: Map<number, [string, number][]>;
  totalDataFree: number;
  totalInodesFree: number;
  opResults: OpResult[];
  symbolEntries: SymbolEntry[];
  fileSpans: SpanResult[];
  dirSpans: SpanResult[];
  fileSpanAvg: number | null;
  dirSpanAvg: number | null;
}

const ALL_SYMBOLS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMOPQRSTUVWXYZ0123456789!@#%^&*()[]{}/.<>|'.split('');

class FfsFileSystem {
  private params: FfsParams;
  private inodeBitmap: (string | number)[][];
  private dataBitmap: (string | number)[][];
  private dirData: Map<number, [string, number][]>;
  private inodeType: Map<number, FileType | ''>;
  private inodeBlocks: Map<number, number[]>;
  private nameToInodeMap: Map<string, number>;
  private symbolMap: Map<number, string>;
  private usedSymbols: string[];
  private availableSymbols: string[];
  private totalDataFree: number;
  private totalInodesFree: number;
  private opResults: OpResult[];

  constructor(params: FfsParams) {
    this.params = params;
    this.inodeBitmap = [];
    this.dataBitmap = [];
    for (let i = 0; i < params.numGroups; i++) {
      this.inodeBitmap.push(Array(params.inodesPerGroup).fill(BITMAP_FREE));
      this.dataBitmap.push(Array(params.blocksPerGroup).fill(BITMAP_FREE));
    }

    this.usedSymbols = [];
    this.availableSymbols = [...ALL_SYMBOLS];
    this.symbolMap = new Map();

    this.totalDataFree = params.blocksPerGroup * params.numGroups;
    this.totalInodesFree = params.inodesPerGroup * params.numGroups;

    // Root directory
    this.inodeBitmap[0][0] = 0;
    this.dataBitmap[0][0] = 0;
    this.allocateSymbol(0, '/');
    this.totalDataFree -= 1;
    this.totalInodesFree -= 1;

    this.dirData = new Map();
    this.dirData.set(0, [['.', 0], ['..', 0]]);

    this.inodeType = new Map();
    this.inodeType.set(0, 'directory');

    this.inodeBlocks = new Map();
    this.inodeBlocks.set(0, [0]);

    this.nameToInodeMap = new Map();
    this.nameToInodeMap.set('/', 0);

    this.opResults = [];
  }

  private getParent(path: string): [string, string] {
    const idx = path.lastIndexOf('/');
    if (idx === 0) {
      return ['/', path.slice(1)];
    }
    return [path.slice(0, idx), path.slice(idx + 1)];
  }

  private nameToInode(path: string): number {
    return this.nameToInodeMap.get(path) ?? -1;
  }

  private setNameToInode(path: string, inodeNum: number): void {
    if (this.nameToInodeMap.has(path)) {
      throw new Error(`path already in mapping: ${path}`);
    }
    this.nameToInodeMap.set(path, inodeNum);
  }

  private getFreeCount(bitmap: (string | number)[]): number {
    let cnt = 0;
    for (const b of bitmap) {
      if (b === BITMAP_FREE) cnt++;
    }
    return cnt;
  }

  private getFreeInodeCount(group: number): number {
    return this.getFreeCount(this.inodeBitmap[group]);
  }

  private getFreeDataCount(group: number): number {
    return this.getFreeCount(this.dataBitmap[group]);
  }

  private findMostFreeInodes(startingPoint: number): number {
    let freeInodesMax = 0;
    let targetGroup = -1;
    for (let g = startingPoint; g < this.params.numGroups; g++) {
      const free = this.getFreeInodeCount(g);
      if (free > freeInodesMax) {
        freeInodesMax = free;
        targetGroup = g;
      }
    }
    for (let g = 0; g < startingPoint; g++) {
      const free = this.getFreeInodeCount(g);
      if (free > freeInodesMax) {
        freeInodesMax = free;
        targetGroup = g;
      }
    }
    return targetGroup;
  }

  private findFreeInodesInRange(group: number, howMany: number): number {
    let sumFree = 0;
    for (let g = group; g < group + howMany; g++) {
      const gCurr = g % this.params.numGroups;
      sumFree += this.getFreeInodeCount(gCurr);
    }
    return sumFree;
  }

  private findMostFreeInodesMultiple(startingPoint: number, howMany: number): number {
    let freeInodesMax = 0;
    let targetGroup = -1;
    for (let g = startingPoint; g < this.params.numGroups; g += howMany) {
      const sumFree = this.findFreeInodesInRange(g, howMany);
      if (sumFree > freeInodesMax) {
        freeInodesMax = sumFree;
        targetGroup = g;
      }
    }
    for (let g = 0; g < startingPoint; g += howMany) {
      const sumFree = this.findFreeInodesInRange(g, howMany);
      if (sumFree > freeInodesMax) {
        freeInodesMax = sumFree;
        targetGroup = g;
      }
    }
    return targetGroup;
  }

  private findFreeInodesNear(targetGroup: number): number {
    let grower = (targetGroup + 1) % this.params.numGroups;
    let shrinker = ((targetGroup - 1) % this.params.numGroups + this.params.numGroups) % this.params.numGroups;
    for (let i = 0; i < this.params.numGroups - 1; i++) {
      let currentGroup: number;
      if (i % 2 === 0) {
        currentGroup = grower;
        grower = (grower + 1) % this.params.numGroups;
      } else {
        currentGroup = shrinker;
        shrinker = ((shrinker - 1) % this.params.numGroups + this.params.numGroups) % this.params.numGroups;
      }
      if (this.getFreeInodeCount(currentGroup) > 0) {
        return currentGroup;
      }
    }
    return 1;
  }

  private pickGroup(parent: string, _filename: string, type: FileType): number {
    if (type === 'regular' && !this.params.spreadInodes) {
      const parentInodeNumber = this.nameToInode(parent);
      let targetGroup = Math.floor(parentInodeNumber / this.params.inodesPerGroup);
      const numFreeInodes = this.getFreeInodeCount(targetGroup);
      if (numFreeInodes === 0) {
        targetGroup = this.findFreeInodesNear(targetGroup);
      }
      return targetGroup;
    } else {
      // directory or spread_inodes
      return this.findMostFreeInodesMultiple(0, this.params.allocateFaraway);
    }
  }

  private rangeFree(group: number, index: number, needed: number, chunksFree: number): boolean {
    if (needed < chunksFree) {
      chunksFree = needed;
    }
    const indexEnd = index + chunksFree - 1;
    if (indexEnd >= this.params.blocksPerGroup) {
      return false;
    }
    for (let i = index; i <= indexEnd; i++) {
      if (this.dataBitmap[group][i] !== BITMAP_FREE) {
        return false;
      }
    }
    return true;
  }

  private allocateBlocks(targetGroup: number, size: number, inodeNumber: number): [number, number][] {
    const allocated: [number, number][] = [];
    let index = 0;
    let allocatedInGroup = 0;
    let currentGroup = targetGroup;
    let chunksFree = this.params.contigAllocationPolicy;

    while (true) {
      if (this.rangeFree(currentGroup, index, size - allocated.length, chunksFree)) {
        this.dataBitmap[currentGroup][index] = inodeNumber;
        allocatedInGroup++;
        allocated.push([currentGroup, index]);
      }
      index++;

      if (allocated.length === size) {
        break;
      }

      if (index === this.params.blocksPerGroup ||
          (this.params.largeFileException > 0 &&
           allocatedInGroup === this.params.largeFileException)) {
        allocatedInGroup = 0;
        index = 0;
        currentGroup = (currentGroup + 1) % this.params.numGroups;
        if (currentGroup === targetGroup) {
          chunksFree = 1;
        }
      }
    }

    return allocated;
  }

  private findFreeInode(group: number): number {
    for (let i = 0; i < this.params.inodesPerGroup; i++) {
      if (this.inodeBitmap[group][i] === BITMAP_FREE) {
        return i;
      }
    }
    return -1;
  }

  private findMinDataUsage(): number {
    let minGroup = -1;
    let minUsage = 0;
    for (let g = 0; g < this.params.numGroups; g++) {
      const dataFree = this.getFreeDataCount(g);
      if (dataFree > minUsage) {
        minUsage = dataFree;
        minGroup = g;
      }
    }
    return minGroup;
  }

  private markInodeUsed(group: number, inodeIndex: number): void {
    this.inodeBitmap[group][inodeIndex] = inodeIndex + (group * this.params.inodesPerGroup);
  }

  private allocateSymbol(inodeNumber: number, suggestedName: string): void {
    let choice: string;
    if (!this.usedSymbols.includes(suggestedName) && this.availableSymbols.includes(suggestedName)) {
      choice = suggestedName;
    } else {
      choice = this.availableSymbols[0];
    }
    this.usedSymbols.push(choice);
    this.availableSymbols.splice(this.availableSymbols.indexOf(choice), 1);
    this.symbolMap.set(inodeNumber, choice);
  }

  private freeSymbol(inodeNumber: number): void {
    const symbol = this.symbolMap.get(inodeNumber)!;
    this.symbolMap.delete(inodeNumber);
    this.usedSymbols.splice(this.usedSymbols.indexOf(symbol), 1);
    this.availableSymbols.push(symbol);
  }

  doDelete(path: string): { success: boolean; message?: string } {
    const [parent, filename] = this.getParent(path);
    const parentInodeNumber = this.nameToInode(parent);
    if (parentInodeNumber === -1) {
      return { success: false, message: `cannot find parent inode ${parent}` };
    }

    const dirEntries = this.dirData.get(parentInodeNumber)!;
    let delIndex = -1;
    let inodeNumber = -1;
    for (let i = 0; i < dirEntries.length; i++) {
      const [name, inum] = dirEntries[i];
      if (name === filename) {
        delIndex = i;
        inodeNumber = inum;
        break;
      }
    }

    if (delIndex === -1) {
      return { success: false, message: `cannot find ${filename} in dir ${parent}` };
    }

    if (this.inodeType.get(inodeNumber) === 'directory') {
      return { success: false, message: 'cannot delete directories' };
    }

    dirEntries.splice(delIndex, 1);

    // Free data blocks - note: Python code uses num_groups for both group and index
    // which appears to be a bug in the original; we replicate the behavior
    const blocks = this.inodeBlocks.get(inodeNumber)!;
    for (const b of blocks) {
      const dataGroup = Math.floor(b / this.params.numGroups);
      const dataIndex = b % this.params.numGroups;
      this.dataBitmap[dataGroup][dataIndex] = BITMAP_FREE;
    }

    const inodeGroup = Math.floor(inodeNumber / this.params.numGroups);
    const inodeIndex = inodeNumber % this.params.numGroups;
    this.inodeBitmap[inodeGroup][inodeIndex] = BITMAP_FREE;
    this.freeSymbol(inodeNumber);

    this.nameToInodeMap.delete(path);

    this.totalInodesFree += 1;
    this.totalDataFree += blocks.length;

    this.inodeType.set(inodeNumber, '');
    this.inodeBlocks.set(inodeNumber, []);

    return { success: true };
  }

  doCreate(path: string, size: number, type: FileType): { success: boolean; message?: string } {
    const [parent, filename] = this.getParent(path);

    if (this.totalInodesFree === 0) {
      return { success: false, message: 'out of inodes' };
    }
    if (this.totalDataFree < size) {
      return { success: false, message: 'out of disk space' };
    }

    const parentInodeNumber = this.nameToInode(parent);
    if (parentInodeNumber === -1) {
      return { success: false, message: `failed to find parent ${parent}` };
    }

    const parentDir = this.dirData.get(parentInodeNumber)!;
    for (const [name] of parentDir) {
      if (name === filename) {
        return { success: false, message: `file ${filename} already exists in dir ${parent}` };
      }
    }

    const group = this.pickGroup(parent, filename, type);
    const inodeIndex = this.findFreeInode(group);
    const inodeNumber = inodeIndex + (group * this.params.inodesPerGroup);

    let allocated: [number, number][];
    if (this.params.spreadDataBlocks) {
      const destBlockGroup = this.findMinDataUsage();
      allocated = this.allocateBlocks(destBlockGroup, size, inodeNumber);
    } else {
      allocated = this.allocateBlocks(group, size, inodeNumber);
    }

    if (allocated.length === 0) {
      return { success: false, message: 'no room in file system' };
    }

    this.markInodeUsed(group, inodeIndex);
    parentDir.push([filename, inodeNumber]);

    this.inodeType.set(inodeNumber, type);
    this.inodeBlocks.set(inodeNumber, []);

    for (const [selectedGroup, idx] of allocated) {
      const globalBlockNumber = idx + (selectedGroup * this.params.blocksPerGroup);
      this.inodeBlocks.get(inodeNumber)!.push(globalBlockNumber);
    }

    this.setNameToInode(path, inodeNumber);
    this.allocateSymbol(inodeNumber, filename);

    if (type === 'directory') {
      this.dirData.set(inodeNumber, [['.', 0], ['..', 0]]);
    }

    this.totalInodesFree -= 1;
    this.totalDataFree -= size;

    return { success: true };
  }

  create(path: string, size: number): boolean {
    const result = this.doCreate(path, size, 'regular');
    this.opResults.push({
      op: { kind: 'create', path, size },
      success: result.success,
      message: result.message,
    });
    return result.success;
  }

  mkdir(path: string): boolean {
    const result = this.doCreate(path, 1, 'directory');
    this.opResults.push({
      op: { kind: 'mkdir', path },
      success: result.success,
      message: result.message,
    });
    return result.success;
  }

  delete(path: string): boolean {
    const result = this.doDelete(path);
    this.opResults.push({
      op: { kind: 'delete', path },
      success: result.success,
      message: result.message,
    });
    return result.success;
  }

  getGroupState(group: number): GroupState {
    return {
      inodeBitmap: [...this.inodeBitmap[group]],
      dataBitmap: [...this.dataBitmap[group]],
    };
  }

  getSymbol(inodeNumber: number): string {
    return this.symbolMap.get(inodeNumber) ?? '?';
  }

  bitmapToString(bitmap: (string | number)[]): string {
    let out = '';
    for (let i = 0; i < bitmap.length; i++) {
      if (bitmap[i] === BITMAP_FREE) {
        out += '-';
      } else {
        out += this.getSymbol(bitmap[i] as number);
      }
    }
    return out;
  }

  private getSpans(path: string): {
    inodeNumber: number;
    inodeAddress: number;
    minAddress: number;
    maxAddress: number;
  } {
    const inodeNumber = this.nameToInode(path);
    const groupSize = this.params.inodesPerGroup + this.params.blocksPerGroup;
    const inodeGroup = Math.floor(inodeNumber / this.params.inodesPerGroup);
    const inodeIdx = inodeNumber % this.params.inodesPerGroup;
    const inodeAddress = inodeIdx + inodeGroup * groupSize;

    let minAddress = 1 + (this.params.numGroups * groupSize);
    let maxAddress = -1;

    const dataBlocks = this.inodeBlocks.get(inodeNumber)!;
    for (const d of dataBlocks) {
      const dataGroup = Math.floor(d / this.params.blocksPerGroup);
      const dataIndex = d % this.params.blocksPerGroup;
      const dataAddress = dataIndex + (dataGroup * groupSize) + this.params.inodesPerGroup;
      if (dataAddress > maxAddress) maxAddress = dataAddress;
      if (dataAddress < minAddress) minAddress = dataAddress;
    }

    return { inodeNumber, inodeAddress, minAddress, maxAddress };
  }

  computeSpans(): { fileSpans: SpanResult[]; dirSpans: SpanResult[]; fileSpanAvg: number | null; dirSpanAvg: number | null } {
    const fileSpans: SpanResult[] = [];
    const dirSpans: SpanResult[] = [];
    const spanResults = new Map<number, { inodeAddress: number; minAddress: number; maxAddress: number }>();

    // File spans
    let fileSpanSum = 0;
    let fileSpanCnt = 0;
    for (const [path] of this.nameToInodeMap) {
      const { inodeNumber, inodeAddress, minAddress, maxAddress } = this.getSpans(path);
      if (this.inodeType.get(inodeNumber) !== 'regular') continue;

      const dataSpan = maxAddress - minAddress;
      let absMin = minAddress;
      let absMax = maxAddress;
      if (inodeAddress < absMin) absMin = inodeAddress;
      if (inodeAddress > absMax) absMax = inodeAddress;
      const fileSpan = absMax - absMin;

      spanResults.set(inodeNumber, { inodeAddress, minAddress, maxAddress });
      fileSpans.push({ path, fileType: 'regular', span: fileSpan });
      fileSpanSum += fileSpan;
      fileSpanCnt++;
    }

    // Dir spans
    let dirSpanSum = 0;
    let dirSpanCnt = 0;
    for (const [path] of this.nameToInodeMap) {
      const { inodeNumber, inodeAddress, minAddress, maxAddress } = this.getSpans(path);
      if (this.inodeType.get(inodeNumber) !== 'directory') continue;

      const allAddresses: number[] = [inodeAddress, minAddress, maxAddress];
      const entries = this.dirData.get(inodeNumber) ?? [];
      for (const [entryName, entryInodeNumber] of entries) {
        if (entryName === '.' || entryName === '..') continue;
        if (this.inodeType.get(entryInodeNumber) === 'directory') continue;
        const sr = spanResults.get(entryInodeNumber);
        if (sr) {
          allAddresses.push(sr.inodeAddress, sr.minAddress, sr.maxAddress);
        }
      }
      allAddresses.sort((a, b) => a - b);
      const dirspan = allAddresses[allAddresses.length - 1] - allAddresses[0];
      dirSpans.push({ path, fileType: 'directory', span: dirspan });
      dirSpanSum += dirspan;
      dirSpanCnt++;
    }

    return {
      fileSpans,
      dirSpans,
      fileSpanAvg: fileSpanCnt > 0 ? fileSpanSum / fileSpanCnt : null,
      dirSpanAvg: dirSpanCnt > 0 ? dirSpanSum / dirSpanCnt : null,
    };
  }

  getState(): FfsState {
    const groups: GroupState[] = [];
    for (let i = 0; i < this.params.numGroups; i++) {
      groups.push(this.getGroupState(i));
    }

    const symbolEntries: SymbolEntry[] = [];
    const sortedNames = [...this.nameToInodeMap.keys()].sort();
    for (const name of sortedNames) {
      const inodeNumber = this.nameToInodeMap.get(name)!;
      const fileType = this.inodeType.get(inodeNumber) as FileType;
      if (!fileType) continue;
      symbolEntries.push({
        inodeNumber,
        symbol: this.getSymbol(inodeNumber),
        filename: name,
        fileType,
        blockAddresses: [...(this.inodeBlocks.get(inodeNumber) ?? [])],
      });
    }

    const { fileSpans, dirSpans, fileSpanAvg, dirSpanAvg } = this.computeSpans();

    return {
      params: { ...this.params },
      groups,
      symbolMap: new Map(this.symbolMap),
      nameToInode: new Map(this.nameToInodeMap),
      inodeType: new Map(this.inodeType) as Map<number, FileType>,
      inodeBlocks: new Map([...this.inodeBlocks].map(([k, v]) => [k, [...v]])),
      dirData: new Map([...this.dirData].map(([k, v]) => [k, [...v] as [string, number][]])),
      totalDataFree: this.totalDataFree,
      totalInodesFree: this.totalInodesFree,
      opResults: [...this.opResults],
      symbolEntries,
      fileSpans,
      dirSpans,
      fileSpanAvg,
      dirSpanAvg,
    };
  }
}

/** Parse a multi-line command string into FileOp array. */
export function parseCommands(input: string): FileOp[] {
  const ops: FileOp[] = [];
  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const parts = line.split(/\s+/);
    if (parts.length === 0) continue;
    if (parts[0] === 'file') {
      if (parts.length !== 3) throw new Error(`Invalid file command: ${line}`);
      ops.push({ kind: 'create', path: parts[1], size: parseInt(parts[2], 10) });
    } else if (parts[0] === 'dir') {
      if (parts.length !== 2) throw new Error(`Invalid dir command: ${line}`);
      ops.push({ kind: 'mkdir', path: parts[1] });
    } else if (parts[0] === 'delete') {
      if (parts.length !== 2) throw new Error(`Invalid delete command: ${line}`);
      ops.push({ kind: 'delete', path: parts[1] });
    } else {
      throw new Error(`Unknown command: ${parts[0]}`);
    }
  }
  return ops;
}

/** Run the FFS simulation with given params and operations. */
export function simulate(params: FfsParams, ops: FileOp[]): FfsState {
  const fs = new FfsFileSystem(params);

  for (const op of ops) {
    switch (op.kind) {
      case 'create':
        fs.create(op.path, op.size!);
        break;
      case 'mkdir':
        fs.mkdir(op.path);
        break;
      case 'delete':
        fs.delete(op.path);
        break;
    }
  }

  return fs.getState();
}

/** Get the symbol for a bitmap entry, or '-' for free. */
export function bitmapChar(entry: string | number, symbolMap: Map<number, string>): string {
  if (entry === BITMAP_FREE) return '-';
  return symbolMap.get(entry as number) ?? '?';
}

/** Check if a bitmap entry is free. */
export function isFree(entry: string | number): boolean {
  return entry === BITMAP_FREE;
}

/** Example input strings for the presets dropdown. */
export const presets: { name: string; commands: string }[] = [
  {
    name: 'Example 1: Two dirs with files',
    commands: `dir /a
dir /b
file /a/c 2
file /a/d 2
file /a/e 2
file /b/f 2`,
  },
  {
    name: 'Example 2: Large file (30 blocks)',
    commands: `file /a 30`,
  },
  {
    name: 'Large file (40 blocks)',
    commands: `file /a 40`,
  },
  {
    name: 'Fragmented allocation',
    commands: `file /a 1
file /b 1
file /c 1
file /d 1
file /e 1
file /f 1
file /g 1
file /h 1
delete /a
delete /c
delete /e
delete /g
file /i 8`,
  },
  {
    name: 'Many small files',
    commands: `dir /a
dir /b
dir /c
file /a/x 1
file /a/y 1
file /a/z 1
file /b/x 1
file /b/y 1
file /c/x 1
file /c/y 1
file /c/z 1`,
  },
];
