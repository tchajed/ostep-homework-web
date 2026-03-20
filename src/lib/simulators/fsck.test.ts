import { describe, it, expect } from 'vitest';
import {
  simulate,
  formatInode,
  formatBlock,
  formatBitmap,
  defaultParams,
  type FsckParams,
  type FsState,
} from './fsck';

function runWith(overrides: Partial<FsckParams> = {}) {
  return simulate({ ...defaultParams, ...overrides });
}

describe('fsck simulator', () => {
  it('is deterministic for the same seed', () => {
    const a = runWith({ seed: 42 });
    const b = runWith({ seed: 42 });
    expect(a).toEqual(b);
  });

  it('produces different results for different seeds', () => {
    const a = runWith({ seed: 1 });
    const b = runWith({ seed: 2 });
    expect(a.finalState).not.toEqual(b.finalState);
  });

  it('root inode is always present', () => {
    const result = runWith({ seed: 0, dontCorrupt: true });
    expect(result.finalState.ibitmap[0]).toBe(1);
    expect(result.finalState.inodes[0].ftype).toBe('d');
    expect(result.finalState.inodes[0].addr).toBe(0);
    expect(result.finalState.dbitmap[0]).toBe(1);
  });

  it('root directory always has . and .. entries', () => {
    const result = runWith({ seed: 5, dontCorrupt: true });
    const rootBlock = result.finalState.data[0];
    expect(rootBlock.ftype).toBe('d');
    expect(rootBlock.dirList.length).toBeGreaterThanOrEqual(2);
    expect(rootBlock.dirList[0]).toEqual({ name: '.', inum: 0 });
    expect(rootBlock.dirList[1]).toEqual({ name: '..', inum: 0 });
  });

  it('returns no corruption when dontCorrupt is true', () => {
    const result = runWith({ seed: 1, dontCorrupt: true });
    expect(result.corruption).toBeNull();
    expect(result.initialState).toEqual(result.finalState);
  });

  it('returns corruption info when corrupt', () => {
    const result = runWith({ seed: 1, dontCorrupt: false });
    expect(result.corruption).not.toBeNull();
    expect(result.corruption!.description.length).toBeGreaterThan(0);
  });

  it('initial and final states differ when corrupted', () => {
    const result = runWith({ seed: 1, dontCorrupt: false });
    expect(result.initialState).not.toEqual(result.finalState);
  });

  it('generates files and directories', () => {
    const result = runWith({ seed: 1, dontCorrupt: true });
    // With 15 requests, we should have some files or dirs
    expect(result.files.length + result.dirs.length).toBeGreaterThan(1);
    expect(result.dirs).toContain('/');
  });

  it('inode bitmap matches inode table', () => {
    for (let seed = 0; seed < 10; seed++) {
      const result = runWith({ seed, dontCorrupt: true });
      const state = result.finalState;
      for (let i = 0; i < state.inodes.length; i++) {
        if (state.inodes[i].ftype === 'free') {
          expect(state.ibitmap[i]).toBe(0);
        } else {
          expect(state.ibitmap[i]).toBe(1);
        }
      }
    }
  });

  it('data bitmap matches data blocks', () => {
    for (let seed = 0; seed < 10; seed++) {
      const result = runWith({ seed, dontCorrupt: true });
      const state = result.finalState;
      for (let i = 0; i < state.data.length; i++) {
        if (state.data[i].ftype === 'free') {
          expect(state.dbitmap[i]).toBe(0);
        } else {
          expect(state.dbitmap[i]).toBe(1);
        }
      }
    }
  });

  it('handles different numInodes and numData', () => {
    const result = runWith({ seed: 0, numInodes: 8, numData: 8, numRequests: 5 });
    expect(result.finalState.inodes).toHaveLength(8);
    expect(result.finalState.data).toHaveLength(8);
    expect(result.finalState.ibitmap).toHaveLength(8);
    expect(result.finalState.dbitmap).toHaveLength(8);
  });

  it('whichCorrupt selects specific corruption type', () => {
    // Type 0 = data bitmap corruption
    const result0 = runWith({ seed: 1, whichCorrupt: 0 });
    expect(result0.corruption!.description).toContain('DATA BITMAP');

    // Type 1 = inode bitmap corruption
    const result1 = runWith({ seed: 1, whichCorrupt: 1 });
    expect(result1.corruption!.description).toContain('INODE BITMAP');
  });

  it('all corruption types produce valid descriptions', () => {
    for (let w = 0; w < 12; w++) {
      const result = runWith({ seed: 3, whichCorrupt: w });
      expect(result.corruption).not.toBeNull();
      expect(result.corruption!.description.length).toBeGreaterThan(0);
    }
  });

  it('seedCorrupt affects corruption outcome', () => {
    const a = runWith({ seed: 1, seedCorrupt: 0 });
    const b = runWith({ seed: 1, seedCorrupt: 5 });
    // Same initial state, different corruption
    expect(a.initialState).toEqual(b.initialState);
    expect(a.finalState).not.toEqual(b.finalState);
  });
});

describe('format helpers', () => {
  it('formatInode for free inode', () => {
    expect(formatInode({ ftype: 'free', addr: -1, refCnt: 1 })).toBe('[]');
  });

  it('formatInode for file inode', () => {
    expect(formatInode({ ftype: 'f', addr: 5, refCnt: 2 })).toBe('[f a:5 r:2]');
  });

  it('formatInode for dir inode', () => {
    expect(formatInode({ ftype: 'd', addr: 0, refCnt: 3 })).toBe('[d a:0 r:3]');
  });

  it('formatBlock for free block', () => {
    expect(formatBlock({ ftype: 'free', dirList: [], data: '' })).toBe('[]');
  });

  it('formatBlock for file block', () => {
    expect(formatBlock({ ftype: 'f', dirList: [], data: 'x' })).toBe('[x]');
  });

  it('formatBlock for directory block', () => {
    expect(formatBlock({
      ftype: 'd',
      dirList: [{ name: '.', inum: 0 }, { name: '..', inum: 0 }],
      data: '',
    })).toBe('[(.,0) (..,0)]');
  });

  it('formatBitmap', () => {
    expect(formatBitmap([1, 0, 0, 1])).toBe('1001');
  });
});
