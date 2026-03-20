import { Random } from '../random';

// ---------- Types ----------

export type FileType = 'd' | 'f' | 'free';

export interface InodeState {
  ftype: FileType;
  addr: number; // -1 means no block
  refCnt: number;
}

export interface DirEntry {
  name: string;
  inum: number;
}

export interface BlockState {
  ftype: FileType;
  dirList: DirEntry[]; // only meaningful for 'd'
  data: string;        // only meaningful for 'f'
}

export interface FsState {
  ibitmap: number[];   // 0 or 1 per inode
  inodes: InodeState[];
  dbitmap: number[];   // 0 or 1 per data block
  data: BlockState[];
}

export interface CorruptionInfo {
  description: string;
}

export interface FsckParams {
  seed: number;
  seedCorrupt: number;
  numInodes: number;
  numData: number;
  numRequests: number;
  whichCorrupt: number; // -1 means random
  dontCorrupt: boolean;
}

export const defaultParams: FsckParams = {
  seed: 0,
  seedCorrupt: 0,
  numInodes: 16,
  numData: 16,
  numRequests: 15,
  whichCorrupt: -1,
  dontCorrupt: false,
};

export interface FsckResult {
  initialState: FsState;
  finalState: FsState;
  corruption: CorruptionInfo | null;
  files: string[];
  dirs: string[];
}

// ---------- Internal helpers ----------

class Bitmap {
  size: number;
  bmap: number[];
  numAllocated: number;

  constructor(size: number) {
    this.size = size;
    this.bmap = new Array(size).fill(0);
    this.numAllocated = 0;
  }

  clone(): Bitmap {
    const b = new Bitmap(this.size);
    b.bmap = [...this.bmap];
    b.numAllocated = this.numAllocated;
    return b;
  }

  corrupt(which: number): void {
    this.bmap[which] = 1 - this.bmap[which];
  }

  alloc(rng: Random): number {
    if (this.numAllocated === this.size) return -1;
    while (true) {
      const num = rng.randint(0, this.size - 1);
      if (this.bmap[num] === 0) {
        this.bmap[num] = 1;
        this.numAllocated++;
        return num;
      }
    }
  }

  findFree(rng: Random): number {
    if (this.numAllocated === this.size) return -1;
    while (true) {
      const num = rng.randint(0, this.size - 1);
      if (this.bmap[num] === 0) {
        return num;
      }
    }
  }

  free(num: number): void {
    this.bmap[num] = 0;
    this.numAllocated--;
  }

  markAllocated(num: number): void {
    this.bmap[num] = 1;
    this.numAllocated++;
  }

  numFree(): number {
    return this.size - this.numAllocated;
  }
}

class Block {
  ftype: FileType;
  dirUsed: number;
  maxUsed: number;
  dirList: DirEntry[];
  data: string;

  constructor(ftype: FileType) {
    this.ftype = ftype;
    this.dirUsed = 0;
    this.maxUsed = 32;
    this.dirList = [];
    this.data = '';
  }

  clone(): Block {
    const b = new Block(this.ftype);
    b.dirUsed = this.dirUsed;
    b.maxUsed = this.maxUsed;
    b.dirList = this.dirList.map(d => ({ ...d }));
    b.data = this.data;
    return b;
  }

  setType(ftype: FileType): void {
    this.ftype = ftype;
  }

  addData(data: string): void {
    this.data = data;
  }

  getFreeEntries(): number {
    return this.maxUsed - this.dirUsed;
  }

  addDirEntry(name: string, inum: number): void {
    this.dirList.push({ name, inum });
    this.dirUsed++;
  }

  delDirEntry(name: string): void {
    const parts = name.split('/');
    const dname = parts[parts.length - 1];
    const idx = this.dirList.findIndex(d => d.name === dname);
    if (idx >= 0) {
      this.dirList.splice(idx, 1);
      this.dirUsed--;
    }
  }

  dirEntryExists(name: string): boolean {
    return this.dirList.some(d => d.name === name);
  }

  freeBlock(): void {
    if (this.ftype === 'd') {
      this.dirUsed = 0;
    }
    this.data = '';
    this.dirList = [];
    this.ftype = 'free';
  }

  toState(): BlockState {
    return {
      ftype: this.ftype,
      dirList: this.dirList.map(d => ({ ...d })),
      data: this.data,
    };
  }
}

class Inode {
  ftype: FileType;
  addr: number;
  refCnt: number;

  constructor(ftype: FileType = 'free', addr: number = -1, refCnt: number = 1) {
    this.ftype = ftype;
    this.addr = addr;
    this.refCnt = refCnt;
  }

  clone(): Inode {
    return new Inode(this.ftype, this.addr, this.refCnt);
  }

  setAll(ftype: FileType, addr: number, refCnt: number): void {
    this.ftype = ftype;
    this.addr = addr;
    this.refCnt = refCnt;
  }

  getSize(): number {
    return this.addr === -1 ? 0 : 1;
  }

  freeInode(): void {
    this.ftype = 'free';
    this.addr = -1;
  }

  toState(): InodeState {
    return { ftype: this.ftype, addr: this.addr, refCnt: this.refCnt };
  }
}

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'.split('');

class Fs {
  numInodes: number;
  numData: number;
  ibitmap: Bitmap;
  inodes: Inode[];
  dbitmap: Bitmap;
  data: Block[];
  files: string[];
  dirs: string[];
  nameToInum: Map<string, number>;
  rng: Random;

  constructor(numInodes: number, numData: number, rng: Random) {
    this.numInodes = numInodes;
    this.numData = numData;
    this.rng = rng;

    this.ibitmap = new Bitmap(numInodes);
    this.inodes = [];
    for (let i = 0; i < numInodes; i++) {
      this.inodes.push(new Inode());
    }

    this.dbitmap = new Bitmap(numData);
    this.data = [];
    for (let i = 0; i < numData; i++) {
      this.data.push(new Block('free'));
    }

    // Create root directory
    const ROOT = 0;
    this.ibitmap.markAllocated(ROOT);
    this.inodes[ROOT].setAll('d', 0, 2);
    this.dbitmap.markAllocated(ROOT);
    this.data[0].setType('d');
    this.data[0].addDirEntry('.', ROOT);
    this.data[0].addDirEntry('..', ROOT);

    this.files = [];
    this.dirs = ['/'];
    this.nameToInum = new Map([['/', ROOT]]);
  }

  snapshot(): FsState {
    return {
      ibitmap: [...this.ibitmap.bmap],
      inodes: this.inodes.map(i => i.toState()),
      dbitmap: [...this.dbitmap.bmap],
      data: this.data.map(d => d.toState()),
    };
  }

  makeName(): string {
    return this.rng.choice(LOWERCASE);
  }

  getParent(name: string): string {
    const tmp = name.split('/');
    if (tmp.length === 2) return '/';
    let pname = '';
    for (let i = 1; i < tmp.length - 1; i++) {
      pname += '/' + tmp[i];
    }
    return pname;
  }

  deleteFile(tfile: string): number {
    const inum = this.nameToInum.get(tfile)!;
    const ftype = this.inodes[inum].ftype;

    if (this.inodes[inum].refCnt === 1) {
      const dblock = this.inodes[inum].addr;
      if (dblock !== -1) {
        this.dbitmap.free(dblock);
        this.data[dblock].freeBlock();
      }
      this.ibitmap.free(inum);
      this.inodes[inum].freeInode();
    } else {
      this.inodes[inum].refCnt--;
    }

    const parent = this.getParent(tfile);
    const pinum = this.nameToInum.get(parent)!;
    const pblock = this.inodes[pinum].addr;
    if (ftype === 'd') {
      this.inodes[pinum].refCnt--;
    }
    this.data[pblock].delDirEntry(tfile);

    const idx = this.files.indexOf(tfile);
    if (idx >= 0) this.files.splice(idx, 1);
    return 0;
  }

  createLink(target: string, newfile: string, parent: string): number {
    const parentInum = this.nameToInum.get(parent)!;
    const pblock = this.inodes[parentInum].addr;

    if (this.data[pblock].getFreeEntries() <= 0) return -1;
    if (this.data[pblock].dirEntryExists(newfile)) return -1;

    const tinum = this.nameToInum.get(target)!;
    this.inodes[tinum].refCnt++;

    const parts = newfile.split('/');
    const ename = parts[parts.length - 1];
    this.data[pblock].addDirEntry(ename, tinum);
    return tinum;
  }

  createFile(parent: string, newfile: string, ftype: FileType): number {
    const parentInum = this.nameToInum.get(parent)!;
    const pblock = this.inodes[parentInum].addr;

    if (this.data[pblock].getFreeEntries() <= 0) return -1;

    const block = this.inodes[parentInum].addr;
    if (this.data[block].dirEntryExists(newfile)) return -1;

    const inum = this.ibitmap.alloc(this.rng);
    if (inum === -1) return -1;

    let fblock = -1;
    let refCnt: number;
    if (ftype === 'd') {
      refCnt = 2;
      fblock = this.dbitmap.alloc(this.rng);
      if (fblock === -1) {
        this.ibitmap.free(inum);
        this.inodes[inum].freeInode();
        return -1;
      }
      this.data[fblock].setType('d');
      this.data[fblock].addDirEntry('.', inum);
      this.data[fblock].addDirEntry('..', parentInum);
    } else {
      refCnt = 1;
    }

    this.inodes[inum].setAll(ftype, fblock, refCnt);

    if (ftype === 'd') {
      this.inodes[parentInum].refCnt++;
    }

    this.data[pblock].addDirEntry(newfile, inum);
    return inum;
  }

  writeFile(tfile: string, data: string): number {
    const inum = this.nameToInum.get(tfile)!;
    if (this.inodes[inum].getSize() === 1) return -1;

    const fblock = this.dbitmap.alloc(this.rng);
    if (fblock === -1) return -1;

    this.data[fblock].setType('f');
    this.data[fblock].addData(data);
    this.inodes[inum].addr = fblock;
    return 0;
  }

  doDelete(): number {
    if (this.files.length === 0) return -1;
    const rv = Math.floor(this.rng.random());
    const dfile = this.files[rv * this.files.length];
    return this.deleteFile(dfile);
  }

  doLink(): number {
    if (this.files.length === 0) return -1;
    const parent = this.dirs[Math.floor(this.rng.random() * this.dirs.length)];
    const nfile = this.makeName();
    const target = this.files[Math.floor(this.rng.random() * this.files.length)];

    let fullName: string;
    if (parent === '/') {
      fullName = parent + nfile;
    } else {
      fullName = parent + '/' + nfile;
    }

    const inum = this.createLink(target, nfile, parent);
    if (inum >= 0) {
      this.files.push(fullName);
      this.nameToInum.set(fullName, inum);
      return 0;
    }
    return -1;
  }

  doCreate(ftype: FileType): number {
    const parent = this.dirs[Math.floor(this.rng.random() * this.dirs.length)];
    const nfile = this.makeName();
    const tlist = ftype === 'd' ? this.dirs : this.files;

    let fullName: string;
    if (parent === '/') {
      fullName = parent + nfile;
    } else {
      fullName = parent + '/' + nfile;
    }

    const inum = this.createFile(parent, nfile, ftype);
    if (inum >= 0) {
      tlist.push(fullName);
      this.nameToInum.set(fullName, inum);
      return 0;
    }
    return -1;
  }

  doAppend(): number {
    if (this.files.length === 0) return -1;
    const afile = this.files[Math.floor(this.rng.random() * this.files.length)];
    const data = String.fromCharCode('a'.charCodeAt(0) + Math.floor(this.rng.random() * 26));
    return this.writeFile(afile, data);
  }

  pickRandom(match: FileType, rng: Random): number {
    const candidates: number[] = [];
    for (let i = 0; i < this.inodes.length; i++) {
      if (this.inodes[i].ftype === match) candidates.push(i);
    }
    return rng.choice(candidates);
  }

  findFreeData(rng: Random): number {
    const candidates: number[] = [];
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i].ftype === 'free') candidates.push(i);
    }
    return rng.choice(candidates);
  }

  corrupt(seedCorrupt: number, whichCorrupt: number): CorruptionInfo {
    // Reseed the RNG for corruption
    const crng = new Random(seedCorrupt);
    let num = crng.randint(0, 11);
    if (whichCorrupt !== -1) {
      num = whichCorrupt;
    }

    // We still need crng for the corruption parameters
    let description = '';

    if (num === 0) {
      // Data bitmap corruption
      const badBit = crng.randint(0, this.numData - 1);
      description = `DATA BITMAP corrupt bit ${badBit}`;
      this.dbitmap.corrupt(badBit);
    } else if (num === 1) {
      // Inode bitmap corruption
      const badBit = crng.randint(0, this.numInodes - 1);
      description = `INODE BITMAP corrupt bit ${badBit}`;
      this.ibitmap.corrupt(badBit);
    } else if (num === 2 || num === 8) {
      // Corrupt live inode refcnt
      const badInode = num === 2 ? this.pickRandom('f', crng) : this.pickRandom('d', crng);
      if (crng.randint(0, 1) === 0) {
        description = `INODE ${badInode} refcnt increased`;
        this.inodes[badInode].refCnt++;
      } else {
        description = `INODE ${badInode} refcnt decreased`;
        this.inodes[badInode].refCnt--;
      }
    } else if (num === 3 || num === 9) {
      // Create orphan inode
      const badInode = this.pickRandom('free', crng);
      description = `INODE ${badInode} orphan`;
      if (num === 3) {
        this.inodes[badInode].setAll('f', -1, 1);
      } else {
        this.inodes[badInode].setAll('d', -1, 1);
      }
    } else if (num === 4 || num === 10) {
      // Inode points to dead block
      const badInode = num === 4 ? this.pickRandom('f', crng) : this.pickRandom('d', crng);
      const badData = this.findFreeData(crng);
      description = `INODE ${badInode} points to dead block ${badData}`;
      this.inodes[badInode].addr = badData;
    } else if (num === 5 || num === 11) {
      // Type switch
      const badInode = num === 5 ? this.pickRandom('f', crng) : this.pickRandom('d', crng);
      if (num === 5) {
        description = `INODE ${badInode} was type file, now dir`;
        this.inodes[badInode].ftype = 'd';
      } else {
        description = `INODE ${badInode} was type dir, now file`;
        this.inodes[badInode].ftype = 'f';
      }
    } else if (num === 6) {
      // Directory entry refers to bad inode
      const badInode = this.pickRandom('d', crng);
      const addr = this.inodes[badInode].addr;
      const dirList = this.data[addr].dirList;
      const badIndex = crng.randint(0, dirList.length - 1);
      const badEntry = dirList[badIndex];
      const badInodeNum = this.ibitmap.findFree(crng);
      description = `INODE ${badInode} directory entry ('${badEntry.name}', ${badEntry.inum}) altered to refer to unallocated inode (${badInodeNum})`;
      this.data[addr].dirList[badIndex] = { name: badEntry.name, inum: badInodeNum };
    } else if (num === 7) {
      // Directory entry name changed
      const badInode = this.pickRandom('d', crng);
      const addr = this.inodes[badInode].addr;
      const dirList = this.data[addr].dirList;
      const badIndex = crng.randint(0, dirList.length - 1);
      const badEntry = dirList[badIndex];
      const badName = crng.choice(LOWERCASE);
      description = `INODE ${badInode} directory entry ('${badEntry.name}', ${badEntry.inum}) altered to refer to different name (${badName})`;
      this.data[addr].dirList[badIndex] = { name: badName, inum: badEntry.inum };
    }

    return { description };
  }

  run(numRequests: number): void {
    for (let i = 0; i < numRequests; i++) {
      let rc = -1;
      while (rc === -1) {
        const r = this.rng.random();
        if (r < 0.3) {
          rc = this.doAppend();
        } else if (r < 0.5) {
          rc = this.doDelete();
        } else if (r < 0.7) {
          rc = this.doLink();
        } else {
          if (this.rng.random() < 0.75) {
            rc = this.doCreate('f');
          } else {
            rc = this.doCreate('d');
          }
        }
        if (this.ibitmap.numFree() === 0 || this.dbitmap.numFree() === 0) {
          throw new Error('File system out of inodes or data blocks; increase numInodes or numData.');
        }
      }
    }
  }
}

// ---------- Public API ----------

export function simulate(params: FsckParams): FsckResult {
  const rng = new Random(params.seed);
  const fs = new Fs(params.numInodes, params.numData, rng);

  fs.run(params.numRequests);

  const initialState = fs.snapshot();

  let corruption: CorruptionInfo | null = null;
  if (!params.dontCorrupt) {
    corruption = fs.corrupt(params.seedCorrupt, params.whichCorrupt);
  }

  const finalState = fs.snapshot();

  return {
    initialState,
    finalState,
    corruption,
    files: [...fs.files],
    dirs: [...fs.dirs],
  };
}

// ---------- Display helpers ----------

export function formatInode(inode: InodeState): string {
  if (inode.ftype === 'free') return '[]';
  return `[${inode.ftype} a:${inode.addr} r:${inode.refCnt}]`;
}

export function formatBlock(block: BlockState): string {
  if (block.ftype === 'free') return '[]';
  if (block.ftype === 'd') {
    const entries = block.dirList.map(d => `(${d.name},${d.inum})`).join(' ');
    return `[${entries}]`;
  }
  return `[${block.data}]`;
}

export function formatBitmap(bmap: number[]): string {
  return bmap.join('');
}
