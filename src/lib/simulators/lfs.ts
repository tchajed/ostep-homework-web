import { Random } from '../random';

// Fixed address
const ADDR_CHECKPOINT_BLOCK = 0;

// Constants
export const NUM_IMAP_PTRS_IN_CR = 16;
export const NUM_INODES_PER_IMAP_CHUNK = 16;
export const NUM_INODE_PTRS = 8;
export const NUM_INODES = NUM_IMAP_PTRS_IN_CR * NUM_INODES_PER_IMAP_CHUNK;

// Block types
export type BlockType =
  | 'type_cp'
  | 'type_data_dir'
  | 'type_data'
  | 'type_inode'
  | 'type_imap';

// Inode types
export type InodeType = 'dir' | 'reg';

// Root inode is well-known per Unix conventions
const ROOT_INODE = 0;

// Allocation policies
export type AllocPolicy = 'sequential' | 'random';

// Block definitions
export interface CheckpointBlock {
  block_type: 'type_cp';
  entries: number[]; // length NUM_IMAP_PTRS_IN_CR
}

export interface DirDataBlock {
  block_type: 'type_data_dir';
  entries: [string, number][]; // [name, inum] pairs, length 8
}

export interface DataBlock {
  block_type: 'type_data';
  contents: string;
}

export interface InodeBlock {
  block_type: 'type_inode';
  type: InodeType;
  size: number;
  refs: number;
  pointers: number[]; // length NUM_INODE_PTRS
}

export interface ImapBlock {
  block_type: 'type_imap';
  entries: number[]; // length NUM_INODES_PER_IMAP_CHUNK
}

export type Block = CheckpointBlock | DirDataBlock | DataBlock | InodeBlock | ImapBlock;

// Command types for the UI
export type Command =
  | { op: 'create'; path: string }
  | { op: 'mkdir'; path: string }
  | { op: 'write'; path: string; offset: number; numBlks: number }
  | { op: 'delete'; path: string }
  | { op: 'link'; src: string; dst: string }
  | { op: 'sync' };

export interface CommandResult {
  command: Command;
  rc: number;
  errors: string[];
  diskBefore: number; // disk length before command
  diskAfter: number;  // disk length after command
}

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class LFS {
  disk: Block[] = [];
  cr: number[];
  inodeMap: number[];
  private noForceCheckpoints: boolean;
  private useDiskCr: boolean;
  private inodePolicy: AllocPolicy;
  private errorList: string[] = [];
  private rng: Random;

  constructor(
    useDiskCr = false,
    noForceCheckpoints = false,
    inodePolicy: AllocPolicy = 'sequential',
    rng?: Random,
  ) {
    this.useDiskCr = useDiskCr;
    this.noForceCheckpoints = noForceCheckpoints;
    this.inodePolicy = inodePolicy;
    this.rng = rng ?? new Random(0);

    // Checkpoint region (first block)
    this.cr = [3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1];

    // Create first checkpoint region
    this.log({ block_type: 'type_cp', entries: [...this.cr] });

    // Init root dir data
    this.log(this.makeNewDirBlock(ROOT_INODE, ROOT_INODE));

    // Root inode
    const rootInode = this.makeInode('dir', 1, 2);
    rootInode.pointers[0] = 1;
    const rootInodeAddress = this.log(rootInode);

    // Init inode map
    this.inodeMap = new Array(NUM_INODES).fill(-1);
    this.inodeMap[ROOT_INODE] = rootInodeAddress;

    // Imap piece
    this.log(this.makeImapChunk(ROOT_INODE));
  }

  private makeDataBlock(data: string): DataBlock {
    return { block_type: 'type_data', contents: data };
  }

  private makeInode(itype: InodeType, size: number, refs: number): InodeBlock {
    return {
      block_type: 'type_inode',
      type: itype,
      size,
      refs,
      pointers: [-1, -1, -1, -1, -1, -1, -1, -1],
    };
  }

  private makeNewDirBlock(parentInum: number, currentInum: number): DirDataBlock {
    const dirblock = this.makeEmptyDirBlock();
    dirblock.entries[0] = ['.', currentInum];
    dirblock.entries[1] = ['..', parentInum];
    return dirblock;
  }

  private makeEmptyDirBlock(): DirDataBlock {
    return {
      block_type: 'type_data_dir',
      entries: [
        ['-', -1], ['-', -1], ['-', -1], ['-', -1],
        ['-', -1], ['-', -1], ['-', -1], ['-', -1],
      ],
    };
  }

  private makeImapChunk(cnum: number): ImapBlock {
    const entries: number[] = [];
    const start = cnum * NUM_INODES_PER_IMAP_CHUNK;
    for (let i = start; i < start + NUM_INODES_PER_IMAP_CHUNK; i++) {
      entries.push(this.inodeMap[i]);
    }
    return { block_type: 'type_imap', entries };
  }

  private makeRandomBlocks(num: number): string[] {
    const contents: string[] = [];
    for (let i = 0; i < num; i++) {
      const L = String.fromCharCode(97 + Math.floor(this.rng.random() * 26));
      contents.push((L + i).repeat(16));
    }
    return contents;
  }

  private inumToChunk(inum: number): number {
    return Math.floor(inum / NUM_INODES_PER_IMAP_CHUNK);
  }

  determineLiveness(): boolean[] {
    const live = new Array(this.disk.length).fill(false);

    // Checkpoint region
    live[0] = true;

    // Mark latest imap pieces as live
    for (const ptr of this.cr) {
      if (ptr !== -1) live[ptr] = true;
    }

    // Go through inode map, find live inodes
    const inodes: number[] = [];
    for (let i = 0; i < this.inodeMap.length; i++) {
      if (this.inodeMap[i] === -1) continue;
      live[this.inodeMap[i]] = true;
      inodes.push(i);
    }

    // Go through live inodes and find blocks each points to
    for (const i of inodes) {
      const inode = this.disk[this.inodeMap[i]] as InodeBlock;
      for (const ptr of inode.pointers) {
        if (ptr !== -1) live[ptr] = true;
      }
    }

    return live;
  }

  private errorLog(s: string): void {
    this.errorList.push(s);
  }

  private errorClear(): void {
    this.errorList = [];
  }

  getErrors(): string[] {
    return [...this.errorList];
  }

  private log(block: Block): number {
    const addr = this.disk.length;
    this.disk.push(deepCopy(block));
    return addr;
  }

  private allocateInode(): number {
    if (this.inodePolicy === 'sequential') {
      for (let i = 0; i < this.inodeMap.length; i++) {
        if (this.inodeMap[i] === -1) {
          this.inodeMap[i] = 1; // temporary placeholder
          return i;
        }
      }
    } else {
      // random
      let spaceExists = false;
      for (let i = 0; i < this.inodeMap.length; i++) {
        if (this.inodeMap[i] === -1) {
          spaceExists = true;
          break;
        }
      }
      if (!spaceExists) return -1;
      while (true) {
        const index = Math.floor(this.rng.random() * this.inodeMap.length);
        if (this.inodeMap[index] === -1) {
          this.inodeMap[index] = 1;
          return index;
        }
      }
    }
    return -1;
  }

  private freeInode(inum: number): void {
    this.inodeMap[inum] = -1;
  }

  private remap(inodeNumber: number, inodeAddress: number): void {
    this.inodeMap[inodeNumber] = inodeAddress;
  }

  private crSync(): number {
    this.disk[ADDR_CHECKPOINT_BLOCK] = deepCopy({
      block_type: 'type_cp' as const,
      entries: [...this.cr],
    });
    return 0;
  }

  private getInodeFromInumber(inodeNumber: number): InodeBlock {
    const imapEntryIndex = Math.floor(inodeNumber / NUM_INODES_PER_IMAP_CHUNK);
    const imapEntryOffset = inodeNumber % NUM_INODES_PER_IMAP_CHUNK;

    let inodeAddress: number;
    if (this.useDiskCr) {
      const checkpointBlock = this.disk[ADDR_CHECKPOINT_BLOCK] as CheckpointBlock;
      const imapBlockAddress = checkpointBlock.entries[imapEntryIndex];
      const imapBlock = this.disk[imapBlockAddress] as ImapBlock;
      inodeAddress = imapBlock.entries[imapEntryOffset];
    } else {
      inodeAddress = this.inodeMap[inodeNumber];
    }

    return this.disk[inodeAddress] as InodeBlock;
  }

  private lookup(parentInodeNumber: number, name: string): [number, InodeBlock] {
    const parentInode = this.getInodeFromInumber(parentInodeNumber);
    for (const address of parentInode.pointers) {
      if (address === -1) continue;
      const dirBlock = this.disk[address] as DirDataBlock;
      for (const [entryName, entryInodeNumber] of dirBlock.entries) {
        if (entryName === name) {
          return [entryInodeNumber, parentInode];
        }
      }
    }
    return [-1, parentInode];
  }

  private walkPath(path: string): [number, string, number, InodeBlock | null] {
    const splitPath = path.split('/');
    if (splitPath[0] !== '') {
      this.errorLog('path malformed: must start with /');
      return [-1, '', -1, null];
    }

    let parentInodeNumber = ROOT_INODE;
    for (let i = 1; i < splitPath.length - 1; i++) {
      const [inodeNumber, inode] = this.lookup(parentInodeNumber, splitPath[i]);
      if (inodeNumber === -1) {
        this.errorLog(`directory ${splitPath[i]} not found`);
        return [-1, '', -1, null];
      }
      if (inode.type !== 'dir') {
        this.errorLog(`invalid element of path [${splitPath[i]}] (not a dir)`);
        return [-1, '', -1, null];
      }
      parentInodeNumber = inodeNumber;
    }

    const fileName = splitPath[splitPath.length - 1];
    const [inodeNumber, parentInode] = this.lookup(parentInodeNumber, fileName);
    return [inodeNumber, fileName, parentInodeNumber, parentInode];
  }

  private updateImap(inumList: number[]): void {
    const chunkList: number[] = [];
    for (const inum of inumList) {
      const cnum = this.inumToChunk(inum);
      if (!chunkList.includes(cnum)) {
        chunkList.push(cnum);
        this.log(this.makeImapChunk(cnum));
        this.cr[cnum] = this.disk.length - 1;
      }
    }
  }

  private readDirBlock(inode: InodeBlock, index: number): DirDataBlock {
    return this.disk[inode.pointers[index]] as DirDataBlock;
  }

  private findMatchingDirSlot(name: string, inode: InodeBlock): [number, number] {
    for (let inodeIndex = 0; inodeIndex < inode.size; inodeIndex++) {
      const dirBlock = this.readDirBlock(inode, inodeIndex);
      for (let slotIndex = 0; slotIndex < dirBlock.entries.length; slotIndex++) {
        if (dirBlock.entries[slotIndex][0] === name) {
          return [inodeIndex, slotIndex];
        }
      }
    }
    return [-1, -1];
  }

  private addDirEntry(
    parentInode: InodeBlock,
    fileName: string,
    inodeNumber: number,
  ): [number, number, DirDataBlock | null] {
    const [inodeIndex, dirblockIndex] = this.findMatchingDirSlot('-', parentInode);

    if (inodeIndex !== -1) {
      const newDirBlock = deepCopy(this.readDirBlock(parentInode, inodeIndex));
      newDirBlock.entries[dirblockIndex] = [fileName, inodeNumber];
      return [inodeIndex, parentInode.size, newDirBlock];
    } else {
      if (parentInode.size !== NUM_INODE_PTRS) {
        const indexToUpdate = parentInode.size;
        const newDirBlock = this.makeEmptyDirBlock();
        newDirBlock.entries[0] = [fileName, inodeNumber];
        return [indexToUpdate, indexToUpdate + 1, newDirBlock];
      }
      return [-1, -1, null];
    }
  }

  private fileCreate(path: string, isFile: boolean): number {
    const [inodeNumber, fileName, parentInodeNumber, parentInode] = this.walkPath(path);
    if (inodeNumber !== -1) {
      this.errorLog('create failed: file already exists');
      return -1;
    }
    if (parentInodeNumber === -1) {
      this.errorLog(`create failed: walkpath returned error [${path}]`);
      return -1;
    }

    const newInodeNumber = this.allocateInode();
    if (newInodeNumber === -1) {
      this.errorLog('create failed: no more inodes available');
      return -1;
    }

    const [indexToUpdate, parentSize, newDirBlock] = this.addDirEntry(
      parentInode!,
      fileName,
      newInodeNumber,
    );
    if (indexToUpdate === -1) {
      this.errorLog(`error: directory is full (path ${path})`);
      this.freeInode(newInodeNumber);
      return -1;
    }

    // Log directory data block
    const newDirBlockAddress = this.log(newDirBlock!);

    // New version of directory inode
    const newParentInode = deepCopy(parentInode!);
    newParentInode.size = parentSize;
    if (!isFile) {
      newParentInode.refs += 1;
    }
    newParentInode.pointers[indexToUpdate] = newDirBlockAddress;

    // If directory, create empty dir block
    let newDirblockAddress = -1;
    if (!isFile) {
      this.log(this.makeNewDirBlock(parentInodeNumber, newInodeNumber));
      newDirblockAddress = this.disk.length - 1;
    }

    // Create the new inode
    let newInode: InodeBlock;
    if (isFile) {
      newInode = this.makeInode('reg', 0, 1);
    } else {
      newInode = this.makeInode('dir', 1, 2);
      newInode.pointers[0] = newDirblockAddress;
    }

    const newParentInodeAddress = this.log(newParentInode);
    const newInodeAddress = this.log(newInode);

    this.remap(parentInodeNumber, newParentInodeAddress);
    this.remap(newInodeNumber, newInodeAddress);

    this.updateImap([parentInodeNumber, newInodeNumber]);

    if (!this.noForceCheckpoints) {
      this.crSync();
    }
    return 0;
  }

  createFile(path: string): number {
    this.errorClear();
    return this.fileCreate(path, true);
  }

  createDir(path: string): number {
    this.errorClear();
    return this.fileCreate(path, false);
  }

  fileLink(srcPath: string, dstPath: string): number {
    this.errorClear();

    const [srcInodeNumber] = this.walkPath(srcPath);
    if (srcInodeNumber === -1) {
      this.errorLog(`link failed, src [${srcPath}] not found`);
      return -1;
    }

    const srcInode = this.getInodeFromInumber(srcInodeNumber);
    if (srcInode.type !== 'reg') {
      this.errorLog(`link failed: cannot link to non-regular file [${srcPath}]`);
      return -1;
    }

    const [dstInodeNumber, dstFileName, dstParentInodeNumber, dstParentInode] =
      this.walkPath(dstPath);
    if (dstInodeNumber !== -1) {
      this.errorLog(`link failed, dst [${dstPath}] exists`);
      return -1;
    }

    const [dstIndexToUpdate, dstParentSize, newDirBlock] = this.addDirEntry(
      dstParentInode!,
      dstFileName,
      srcInodeNumber,
    );
    if (dstIndexToUpdate === -1) {
      this.errorLog(`error: directory is full [path ${dstPath}]`);
      return -1;
    }

    const newDirBlockAddress = this.log(newDirBlock!);

    const newDstParentInode = deepCopy(dstParentInode!);
    newDstParentInode.size = dstParentSize;
    newDstParentInode.pointers[dstIndexToUpdate] = newDirBlockAddress;
    const newDstParentInodeAddress = this.log(newDstParentInode);

    const newSrcInode = deepCopy(srcInode);
    newSrcInode.refs += 1;
    const newSrcInodeAddress = this.log(newSrcInode);

    this.remap(dstParentInodeNumber, newDstParentInodeAddress);
    this.remap(srcInodeNumber, newSrcInodeAddress);

    this.updateImap([dstParentInodeNumber, srcInodeNumber]);

    if (!this.noForceCheckpoints) {
      this.crSync();
    }
    return 0;
  }

  fileWrite(path: string, offset: number, numBlks: number): number {
    this.errorClear();

    const contents = this.makeRandomBlocks(numBlks);

    const [inodeNumber, , , ] = this.walkPath(path);
    if (inodeNumber === -1) {
      this.errorLog(`write failed: file not found [path ${path}]`);
      return -1;
    }

    const inode = this.getInodeFromInumber(inodeNumber);
    if (inode.type !== 'reg') {
      this.errorLog(`write failed: cannot write to non-regular file ${path}`);
      return -1;
    }

    if (offset < 0 || offset >= NUM_INODE_PTRS) {
      this.errorLog(`write failed: bad offset ${offset}`);
      return -1;
    }

    // Create potential write list
    let currentLogPtr = this.disk.length;
    let currentOffset = offset;
    const potentialWrites: [number, number][] = [];
    while (currentOffset < NUM_INODE_PTRS && currentOffset < offset + contents.length) {
      potentialWrites.push([currentOffset, currentLogPtr]);
      currentOffset++;
      currentLogPtr++;
    }

    // Write data blocks
    for (let i = 0; i < potentialWrites.length; i++) {
      this.log(this.makeDataBlock(contents[i]));
    }

    // Write new version of inode
    const newInode = deepCopy(inode);
    newInode.size = Math.max(currentOffset, inode.size);
    for (const [newOffset, newAddr] of potentialWrites) {
      newInode.pointers[newOffset] = newAddr;
    }
    const newInodeAddress = this.log(newInode);

    // Write new chunk of imap
    this.remap(inodeNumber, newInodeAddress);
    this.log(this.makeImapChunk(this.inumToChunk(inodeNumber)));
    this.cr[this.inumToChunk(inodeNumber)] = this.disk.length - 1;

    if (!this.noForceCheckpoints) {
      this.crSync();
    }

    return currentOffset - offset;
  }

  fileDelete(path: string): number {
    this.errorClear();

    const [inodeNumber, fileName, parentInodeNumber, parentInode] = this.walkPath(path);
    if (inodeNumber === -1) {
      this.errorLog(`delete failed: file not found [${path}]`);
      return -1;
    }

    const inode = this.getInodeFromInumber(inodeNumber);
    if (inode.type !== 'reg') {
      this.errorLog(`delete failed: cannot delete non-regular file [${path}]`);
      return -1;
    }

    if (inode.refs === 1) {
      this.freeInode(inodeNumber);
    }

    // Find entry in directory data block and zero it
    const [inodeIndex, dirblockIndex] = this.findMatchingDirSlot(fileName, parentInode!);
    const newDirBlock = deepCopy(this.readDirBlock(parentInode!, inodeIndex));
    newDirBlock.entries[dirblockIndex] = ['-', -1];

    const dirAddr = this.log(newDirBlock);

    const newParentInode = deepCopy(parentInode!);
    newParentInode.pointers[inodeIndex] = dirAddr;
    const newParentInodeAddr = this.log(newParentInode);
    this.remap(parentInodeNumber, newParentInodeAddr);

    // If not last link, decrease ref count
    if (inode.refs > 1) {
      const newInode = deepCopy(inode);
      newInode.refs -= 1;
      const newInodeAddr = this.log(newInode);
      this.remap(inodeNumber, newInodeAddr);
    }

    this.updateImap([inodeNumber, parentInodeNumber]);

    if (!this.noForceCheckpoints) {
      this.crSync();
    }
    return 0;
  }

  sync(): number {
    this.errorClear();
    return this.crSync();
  }
}

// --- Command generation helpers ---

function pickRandom<T>(rng: Random, list: T[]): T | null {
  if (list.length === 0) return null;
  const index = Math.floor(rng.random() * list.length);
  return list[index];
}

function makeRandomFileName(rng: Random, parentDir: string): string {
  const L1 = String.fromCharCode(97 + Math.floor(rng.random() * 26));
  const L2 = String.fromCharCode(97 + Math.floor(rng.random() * 26));
  const N1 = String(Math.floor(rng.random() * 10));
  if (parentDir === '/') return '/' + L1 + L2 + N1;
  return parentDir + '/' + L1 + L2 + N1;
}

export interface Percentages {
  c: [number, number];
  w: [number, number];
  d: [number, number];
  r: [number, number];
  l: [number, number];
  s: [number, number];
}

export function parsePercentages(input: string): Percentages {
  const tmp = input.split(',');
  let csum = 0;
  for (const p of tmp) {
    const value = parseInt(p.slice(1), 10);
    if (value < 0) throw new Error('percentages must be positive or zero');
    csum += value;
  }
  if (csum !== 100) throw new Error('percentages do not add to 100');

  const cmdList = ['c', 'w', 'd', 'r', 'l', 's'] as const;
  const pArray: Record<string, [number, number]> = {};
  for (const c of cmdList) {
    pArray[c] = [0, 0];
  }

  csum = 0;
  for (const p of tmp) {
    const cmd = p[0];
    if (!cmdList.includes(cmd as any)) throw new Error(`bad command: ${cmd}`);
    const value = parseInt(p.slice(1), 10);
    pArray[cmd] = [csum, csum + value];
    csum += value;
  }

  for (const key of cmdList) {
    pArray[key] = [pArray[key][0] / 100.0, pArray[key][1] / 100.0];
  }

  return pArray as unknown as Percentages;
}

export function generateCommands(
  rng: Random,
  numCommands: number,
  percents: Percentages,
): Command[] {
  const commands: Command[] = [];
  const existingFiles: string[] = [];
  const existingDirs: string[] = ['/'];

  while (commands.length < numCommands) {
    const chances = rng.random();
    let command: Command | null = null;

    if (chances >= percents.c[0] && chances < percents.c[1]) {
      const pdir = pickRandom(rng, existingDirs);
      if (!pdir) continue;
      const nfile = makeRandomFileName(rng, pdir);
      command = { op: 'create', path: nfile };
      existingFiles.push(nfile);
    } else if (chances >= percents.w[0] && chances < percents.w[1]) {
      const pfile = pickRandom(rng, existingFiles);
      if (!pfile) continue;
      const woff = Math.floor(rng.random() * 8);
      const wlen = Math.floor(rng.random() * 8);
      command = { op: 'write', path: pfile, offset: woff, numBlks: wlen };
    } else if (chances >= percents.d[0] && chances < percents.d[1]) {
      const pdir = pickRandom(rng, existingDirs);
      if (!pdir) continue;
      const ndir = makeRandomFileName(rng, pdir);
      command = { op: 'mkdir', path: ndir };
      existingDirs.push(ndir);
    } else if (chances >= percents.r[0] && chances < percents.r[1]) {
      if (existingFiles.length === 0) continue;
      const index = Math.floor(rng.random() * existingFiles.length);
      command = { op: 'delete', path: existingFiles[index] };
      existingFiles.splice(index, 1);
    } else if (chances >= percents.l[0] && chances < percents.l[1]) {
      if (existingFiles.length === 0) continue;
      const index = Math.floor(rng.random() * existingFiles.length);
      const pdir = pickRandom(rng, existingDirs);
      if (!pdir) continue;
      const nfile = makeRandomFileName(rng, pdir);
      command = { op: 'link', src: existingFiles[index], dst: nfile };
      existingFiles.push(nfile);
    } else if (chances >= percents.s[0] && chances < percents.s[1]) {
      command = { op: 'sync' };
    } else {
      continue;
    }

    if (command) {
      commands.push(command);
    }
  }
  return commands;
}

export function parseCommandList(input: string): Command[] {
  if (!input.trim()) return [];
  const commands: Command[] = [];
  const parts = input.split(':');
  for (const part of parts) {
    const args = part.split(',');
    switch (args[0]) {
      case 'c':
        commands.push({ op: 'create', path: args[1] });
        break;
      case 'd':
        commands.push({ op: 'mkdir', path: args[1] });
        break;
      case 'r':
        commands.push({ op: 'delete', path: args[1] });
        break;
      case 'w':
        commands.push({
          op: 'write',
          path: args[1],
          offset: parseInt(args[2], 10),
          numBlks: parseInt(args[3], 10),
        });
        break;
      case 'l':
        commands.push({ op: 'link', src: args[1], dst: args[2] });
        break;
      case 's':
        commands.push({ op: 'sync' });
        break;
    }
  }
  return commands;
}

export function executeCommand(lfs: LFS, cmd: Command): number {
  switch (cmd.op) {
    case 'create':
      return lfs.createFile(cmd.path);
    case 'mkdir':
      return lfs.createDir(cmd.path);
    case 'write':
      return lfs.fileWrite(cmd.path, cmd.offset, cmd.numBlks);
    case 'delete':
      return lfs.fileDelete(cmd.path);
    case 'link':
      return lfs.fileLink(cmd.src, cmd.dst);
    case 'sync':
      return lfs.sync();
  }
}

export function formatCommand(cmd: Command): string {
  switch (cmd.op) {
    case 'create':
      return `create file ${cmd.path}`;
    case 'mkdir':
      return `create dir  ${cmd.path}`;
    case 'write':
      return `write file  ${cmd.path} offset=${cmd.offset} size=${cmd.numBlks}`;
    case 'delete':
      return `delete file ${cmd.path}`;
    case 'link':
      return `link file   ${cmd.src} ${cmd.dst}`;
    case 'sync':
      return 'sync';
  }
}

export function formatBlock(block: Block): string {
  switch (block.block_type) {
    case 'type_cp': {
      const entries = block.entries.map(e => (e !== -1 ? String(e) : '--'));
      return `checkpoint: ${entries.join(' ')}`;
    }
    case 'type_data_dir': {
      const entries = block.entries.map(e =>
        e[1] !== -1 ? `[${e[0]},${e[1]}]` : '--',
      );
      return entries.join(' ');
    }
    case 'type_data':
      return block.contents;
    case 'type_inode': {
      const ptrs = block.pointers.map(p => (p !== -1 ? String(p) : '--'));
      return `type:${block.type} size:${block.size} refs:${block.refs} ptrs: ${ptrs.join(' ')}`;
    }
    case 'type_imap': {
      const entries = block.entries.map(e => (e !== -1 ? String(e) : '--'));
      return `chunk(imap): ${entries.join(' ')}`;
    }
  }
}

/** Run the full simulation: create LFS, generate commands, execute them, return results. */
export interface SimulationResult {
  initialDisk: Block[];
  commandResults: CommandResult[];
  finalDisk: Block[];
  finalLiveness: boolean[];
  lfs: LFS;
}

export function runSimulation(params: {
  seed: number;
  numCommands: number;
  percentages: string;
  inodePolicy: AllocPolicy;
  useDiskCr: boolean;
  noForceCheckpoints: boolean;
  commandList: string;
}): SimulationResult {
  const rng = new Random(params.seed);

  const percents = parsePercentages(params.percentages);

  let commands: Command[];
  if (params.commandList.trim()) {
    commands = parseCommandList(params.commandList);
  } else {
    commands = generateCommands(rng, params.numCommands, percents);
  }

  const lfs = new LFS(params.useDiskCr, params.noForceCheckpoints, params.inodePolicy, rng);
  const initialDisk = deepCopy(lfs.disk);

  const commandResults: CommandResult[] = [];
  for (const cmd of commands) {
    const diskBefore = lfs.disk.length;
    const rc = executeCommand(lfs, cmd);
    commandResults.push({
      command: cmd,
      rc,
      errors: lfs.getErrors(),
      diskBefore,
      diskAfter: lfs.disk.length,
    });
  }

  const finalLiveness = lfs.determineLiveness();

  return {
    initialDisk,
    commandResults,
    finalDisk: lfs.disk,
    finalLiveness,
    lfs,
  };
}
