import { Random } from '../random';

// --- Types ---

export type FileType = 'd' | 'f' | 'free';

export interface InodeInfo {
  ftype: FileType;
  addr: number;   // data block index, -1 if none
  refCnt: number;
}

export interface DirEntry {
  name: string;
  inum: number;
}

export interface BlockInfo {
  ftype: FileType;
  dirList: DirEntry[];
  data: string;
}

export interface FsState {
  inodeBitmap: number[];
  dataBitmap: number[];
  inodes: InodeInfo[];
  data: BlockInfo[];
}

export interface VsfsStep {
  operation: string;        // e.g. 'mkdir("/n");'
  stateAfter: FsState;
}

export interface VsfsParams {
  seed: number;
  numInodes: number;
  numData: number;
  numRequests: number;
}

export const defaultParams: VsfsParams = {
  seed: 0,
  numInodes: 8,
  numData: 8,
  numRequests: 10,
};

export interface VsfsResult {
  initialState: FsState;
  steps: VsfsStep[];
  files: string[];
  dirs: string[];
}

// --- Internal classes ---

class Bitmap {
  bmap: number[];
  numAllocated: number;

  constructor(size: number) {
    this.bmap = new Array(size).fill(0);
    this.numAllocated = 0;
  }

  alloc(): number {
    for (let i = 0; i < this.bmap.length; i++) {
      if (this.bmap[i] === 0) {
        this.bmap[i] = 1;
        this.numAllocated++;
        return i;
      }
    }
    return -1;
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
    return this.bmap.length - this.numAllocated;
  }

  dump(): number[] {
    return [...this.bmap];
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

  setAll(ftype: FileType, addr: number, refCnt: number): void {
    this.ftype = ftype;
    this.addr = addr;
    this.refCnt = refCnt;
  }

  getSize(): number {
    return this.addr === -1 ? 0 : 1;
  }

  free(): void {
    this.ftype = 'free';
    this.addr = -1;
  }

  snapshot(): InodeInfo {
    return { ftype: this.ftype, addr: this.addr, refCnt: this.refCnt };
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

  setType(ftype: FileType): void {
    this.ftype = ftype;
  }

  addData(data: string): void {
    this.data = data;
  }

  getFreeEntries(): number {
    return this.maxUsed - this.dirUsed;
  }

  dirEntryExists(name: string): boolean {
    return this.dirList.some(d => d.name === name);
  }

  addDirEntry(name: string, inum: number): void {
    this.dirList.push({ name, inum });
    this.dirUsed++;
  }

  delDirEntry(name: string): void {
    const tname = name.split('/');
    const dname = tname[tname.length - 1];
    const idx = this.dirList.findIndex(d => d.name === dname);
    if (idx >= 0) {
      this.dirList.splice(idx, 1);
      this.dirUsed--;
    }
  }

  freeBlock(): void {
    if (this.ftype === 'd') {
      this.dirUsed = 0;
      this.dirList = [];
    }
    this.data = '';
    this.ftype = 'free';
  }

  snapshot(): BlockInfo {
    return {
      ftype: this.ftype,
      dirList: this.dirList.map(d => ({ ...d })),
      data: this.data,
    };
  }
}

class Fs {
  numInodes: number;
  numData: number;
  ibitmap: Bitmap;
  inodes: Inode[];
  dbitmap: Bitmap;
  data: Block[];
  ROOT = 0;

  files: string[];
  dirs: string[];
  nameToInum: Map<string, number>;

  constructor(numInodes: number, numData: number) {
    this.numInodes = numInodes;
    this.numData = numData;

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
    this.ibitmap.markAllocated(this.ROOT);
    this.inodes[this.ROOT].setAll('d', 0, 2);
    this.dbitmap.markAllocated(this.ROOT);
    this.data[0].setType('d');
    this.data[0].addDirEntry('.', this.ROOT);
    this.data[0].addDirEntry('..', this.ROOT);

    this.files = [];
    this.dirs = ['/'];
    this.nameToInum = new Map<string, number>([['/', this.ROOT]]);
  }

  snapshot(): FsState {
    return {
      inodeBitmap: this.ibitmap.dump(),
      dataBitmap: this.dbitmap.dump(),
      inodes: this.inodes.map(i => i.snapshot()),
      data: this.data.map(b => b.snapshot()),
    };
  }

  private getParent(name: string): string {
    const tmp = name.split('/');
    if (tmp.length === 2) return '/';
    let pname = '';
    for (let i = 1; i < tmp.length - 1; i++) {
      pname += '/' + tmp[i];
    }
    return pname;
  }

  deleteFile(tfile: string): string {
    const inum = this.nameToInum.get(tfile)!;
    const ftype = this.inodes[inum].ftype;

    if (this.inodes[inum].refCnt === 1) {
      // free data blocks first
      const dblock = this.inodes[inum].addr;
      if (dblock !== -1) {
        this.dbitmap.free(dblock);
        this.data[dblock].freeBlock();
      }
      // then free inode
      this.ibitmap.free(inum);
      this.inodes[inum].free();
    } else {
      this.inodes[inum].refCnt--;
    }

    // remove from parent directory
    const parent = this.getParent(tfile);
    const pinum = this.nameToInum.get(parent)!;
    const pblock = this.inodes[pinum].addr;
    if (ftype === 'd') {
      this.inodes[pinum].refCnt--;
    }
    this.data[pblock].delDirEntry(tfile);

    // remove from files list
    const idx = this.files.indexOf(tfile);
    if (idx >= 0) this.files.splice(idx, 1);

    return `unlink("${tfile}");`;
  }

  createLink(target: string, newfile: string, parent: string): number {
    const parentInum = this.nameToInum.get(parent)!;
    const pblock = this.inodes[parentInum].addr;

    if (this.data[pblock].getFreeEntries() <= 0) return -1;
    if (this.data[pblock].dirEntryExists(newfile)) return -1;

    const tinum = this.nameToInum.get(target)!;
    this.inodes[tinum].refCnt++;

    const tmp = newfile.split('/');
    const ename = tmp[tmp.length - 1];
    this.data[pblock].addDirEntry(ename, tinum);
    return tinum;
  }

  createFile(parent: string, newfile: string, ftype: FileType): number {
    const parentInum = this.nameToInum.get(parent)!;
    const pblock = this.inodes[parentInum].addr;

    if (this.data[pblock].getFreeEntries() <= 0) return -1;

    const block = this.inodes[parentInum].addr;
    if (this.data[block].dirEntryExists(newfile)) return -1;

    const inum = this.ibitmap.alloc();
    if (inum === -1) return -1;

    let fblock = -1;
    let refCnt: number;
    if (ftype === 'd') {
      refCnt = 2;
      fblock = this.dbitmap.alloc();
      if (fblock === -1) {
        this.ibitmap.free(inum);
        this.inodes[inum].free();
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

  writeFile(tfile: string, data: string): string | null {
    const inum = this.nameToInum.get(tfile)!;
    if (this.inodes[inum].getSize() === 1) return null;

    const fblock = this.dbitmap.alloc();
    if (fblock === -1) return null;

    this.data[fblock].setType('f');
    this.data[fblock].addData(data);
    this.inodes[inum].addr = fblock;

    return `fd=open("${tfile}", O_WRONLY|O_APPEND); write(fd, buf, BLOCKSIZE); close(fd);`;
  }

  doDelete(rng: Random): string | null {
    if (this.files.length === 0) return null;
    const dfile = this.files[Math.floor(rng.random() * this.files.length)];
    return this.deleteFile(dfile);
  }

  doLink(rng: Random): string | null {
    if (this.files.length === 0) return null;
    const parent = this.dirs[Math.floor(rng.random() * this.dirs.length)];
    const nfile = this.makeName(rng);
    const target = this.files[Math.floor(rng.random() * this.files.length)];

    const fullName = parent === '/' ? '/' + nfile : parent + '/' + nfile;

    const inum = this.createLink(target, nfile, parent);
    if (inum >= 0) {
      this.files.push(fullName);
      this.nameToInum.set(fullName, inum);
      return `link("${target}", "${fullName}");`;
    }
    return null;
  }

  doCreate(rng: Random, ftype: FileType): string | null {
    const parent = this.dirs[Math.floor(rng.random() * this.dirs.length)];
    const nfile = this.makeName(rng);
    const tlist = ftype === 'd' ? this.dirs : this.files;

    const fullName = parent === '/' ? '/' + nfile : parent + '/' + nfile;

    const inum = this.createFile(parent, nfile, ftype);
    if (inum >= 0) {
      tlist.push(fullName);
      this.nameToInum.set(fullName, inum);
      const displayParent = parent === '/' ? '' : parent;
      if (ftype === 'd') {
        return `mkdir("${displayParent}/${nfile}");`;
      } else {
        return `creat("${displayParent}/${nfile}");`;
      }
    }
    return null;
  }

  doAppend(rng: Random): string | null {
    if (this.files.length === 0) return null;
    const afile = this.files[Math.floor(rng.random() * this.files.length)];
    const data = String.fromCharCode('a'.charCodeAt(0) + Math.floor(rng.random() * 26));
    return this.writeFile(afile, data);
  }

  makeName(rng: Random): string {
    const p = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'j', 'k', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];
    return p[Math.floor(rng.random() * p.length)];
  }
}

// --- Public API ---

export function simulate(params: VsfsParams): VsfsResult {
  const { seed, numInodes, numData, numRequests } = params;
  const rng = new Random(seed);
  const fs = new Fs(numInodes, numData);

  const initialState = fs.snapshot();
  const steps: VsfsStep[] = [];

  for (let i = 0; i < numRequests; i++) {
    let op: string | null = null;
    while (op === null) {
      const r = rng.random();
      if (r < 0.3) {
        op = fs.doAppend(rng);
      } else if (r < 0.5) {
        op = fs.doDelete(rng);
      } else if (r < 0.7) {
        op = fs.doLink(rng);
      } else {
        if (rng.random() < 0.75) {
          op = fs.doCreate(rng, 'f');
        } else {
          op = fs.doCreate(rng, 'd');
        }
      }

      if (fs.ibitmap.numFree() === 0) {
        throw new Error('File system out of inodes; increase numInodes.');
      }
      if (fs.dbitmap.numFree() === 0) {
        throw new Error('File system out of data blocks; increase numData.');
      }
    }

    steps.push({
      operation: op,
      stateAfter: fs.snapshot(),
    });
  }

  return {
    initialState,
    steps,
    files: [...fs.files],
    dirs: [...fs.dirs],
  };
}

// --- Formatting helpers ---

export function formatInodeBitmap(bmap: number[]): string {
  return bmap.join('');
}

export function formatDataBitmap(bmap: number[]): string {
  return bmap.join('');
}

export function formatInode(info: InodeInfo): string {
  if (info.ftype === 'free') return '[]';
  return `[${info.ftype} a:${info.addr} r:${info.refCnt}]`;
}

export function formatBlock(block: BlockInfo): string {
  if (block.ftype === 'free') return '[]';
  if (block.ftype === 'd') {
    const entries = block.dirList.map(d => `(${d.name},${d.inum})`).join(' ');
    return `[${entries}]`;
  }
  return `[${block.data}]`;
}
