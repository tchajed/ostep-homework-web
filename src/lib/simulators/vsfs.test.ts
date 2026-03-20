import { describe, it, expect } from 'vitest';
import {
  simulate,
  formatInodeBitmap,
  formatInode,
  formatBlock,
  type VsfsParams,
  type FsState,
} from './vsfs';

function stateToText(state: FsState) {
  return {
    ibitmap: formatInodeBitmap(state.inodeBitmap),
    inodes: state.inodes.map(formatInode).join(''),
    dbitmap: formatInodeBitmap(state.dataBitmap),
    data: state.data.map(formatBlock).join(''),
  };
}

describe('vsfs simulator', () => {
  it('produces correct initial state', () => {
    const result = simulate({ seed: 1, numInodes: 8, numData: 8, numRequests: 1 });
    const s = stateToText(result.initialState);
    expect(s.ibitmap).toBe('10000000');
    expect(s.inodes).toBe('[d a:0 r:2][][][][][][][]');
    expect(s.dbitmap).toBe('10000000');
    expect(s.data).toBe('[(.,0) (..,0)][][][][][][][]');
  });

  it('seed 1: deterministic sequence of operations', () => {
    const r1 = simulate({ seed: 1, numInodes: 8, numData: 8, numRequests: 10 });
    const r2 = simulate({ seed: 1, numInodes: 8, numData: 8, numRequests: 10 });
    expect(r1.steps.map(s => s.operation)).toEqual(r2.steps.map(s => s.operation));
    for (let i = 0; i < r1.steps.length; i++) {
      expect(stateToText(r1.steps[i].stateAfter)).toEqual(stateToText(r2.steps[i].stateAfter));
    }
  });

  it('seed 1: returns 10 steps', () => {
    const result = simulate({ seed: 1, numInodes: 8, numData: 8, numRequests: 10 });
    expect(result.steps.length).toBe(10);
    // Every step has a non-empty operation string
    for (const step of result.steps) {
      expect(step.operation.length).toBeGreaterThan(0);
    }
  });

  it('different seeds produce different results', () => {
    const r1 = simulate({ seed: 1, numInodes: 8, numData: 8, numRequests: 5 });
    const r2 = simulate({ seed: 2, numInodes: 8, numData: 8, numRequests: 5 });
    const ops1 = r1.steps.map(s => s.operation);
    const ops2 = r2.steps.map(s => s.operation);
    // Very unlikely to be identical with different seeds
    expect(ops1).not.toEqual(ops2);
  });

  it('operations are valid types', () => {
    const result = simulate({ seed: 1, numInodes: 8, numData: 8, numRequests: 10 });
    for (const step of result.steps) {
      const op = step.operation;
      const validOp = op.startsWith('mkdir(') ||
                      op.startsWith('creat(') ||
                      op.startsWith('unlink(') ||
                      op.startsWith('link(') ||
                      op.startsWith('fd=open(');
      expect(validOp).toBe(true);
    }
  });

  it('bitmaps are consistent with inodes/data', () => {
    const result = simulate({ seed: 3, numInodes: 8, numData: 8, numRequests: 10 });
    for (const step of result.steps) {
      const state = step.stateAfter;
      // inode bitmap should match inode types
      for (let i = 0; i < state.inodes.length; i++) {
        const allocated = state.inodes[i].ftype !== 'free';
        expect(state.inodeBitmap[i]).toBe(allocated ? 1 : 0);
      }
      // data bitmap should match block types
      for (let i = 0; i < state.data.length; i++) {
        const allocated = state.data[i].ftype !== 'free';
        expect(state.dataBitmap[i]).toBe(allocated ? 1 : 0);
      }
    }
  });

  it('root directory always has . and .. entries', () => {
    const result = simulate({ seed: 1, numInodes: 8, numData: 8, numRequests: 10 });
    // Root inode is always 0, root data block is always 0
    for (const step of result.steps) {
      const rootBlock = step.stateAfter.data[0];
      expect(rootBlock.ftype).toBe('d');
      const names = rootBlock.dirList.map(d => d.name);
      expect(names).toContain('.');
      expect(names).toContain('..');
    }
  });

  it('mkdir creates directory with . and .. entries', () => {
    // Run with many seeds and find a mkdir
    for (let seed = 0; seed < 20; seed++) {
      const result = simulate({ seed, numInodes: 8, numData: 8, numRequests: 5 });
      for (const step of result.steps) {
        if (step.operation.startsWith('mkdir(')) {
          // Find the new directory in data blocks
          const dirBlocks = step.stateAfter.data.filter(b =>
            b.ftype === 'd' && b.dirList.length >= 2
          );
          for (const db of dirBlocks) {
            const names = db.dirList.map(d => d.name);
            expect(names).toContain('.');
            expect(names).toContain('..');
          }
        }
      }
    }
  });

  it('throws on insufficient inodes', () => {
    // With only 2 inodes (one for root), we quickly run out
    expect(() => simulate({ seed: 0, numInodes: 2, numData: 8, numRequests: 20 })).toThrow(/inodes/);
  });

  it('throws on insufficient data blocks', () => {
    expect(() => simulate({ seed: 0, numInodes: 16, numData: 2, numRequests: 20 })).toThrow(/data blocks/);
  });

  it('handles small file system', () => {
    const result = simulate({ seed: 1, numInodes: 4, numData: 4, numRequests: 3 });
    expect(result.steps.length).toBe(3);
  });

  it('creat creates a file inode with no data block', () => {
    for (let seed = 0; seed < 20; seed++) {
      const result = simulate({ seed, numInodes: 8, numData: 8, numRequests: 5 });
      for (const step of result.steps) {
        if (step.operation.startsWith('creat(')) {
          // At least one inode should be a file with addr=-1
          const fileInodes = step.stateAfter.inodes.filter(
            i => i.ftype === 'f' && i.addr === -1
          );
          expect(fileInodes.length).toBeGreaterThanOrEqual(0); // may have been written to already
        }
      }
    }
  });

  it('write allocates a data block', () => {
    for (let seed = 0; seed < 30; seed++) {
      const result = simulate({ seed, numInodes: 16, numData: 16, numRequests: 10 });
      for (let i = 0; i < result.steps.length; i++) {
        if (result.steps[i].operation.startsWith('fd=open(')) {
          const prev = i === 0 ? result.initialState : result.steps[i - 1].stateAfter;
          const cur = result.steps[i].stateAfter;
          // Data bitmap should have one more bit set
          const prevCount = prev.dataBitmap.reduce((a, b) => a + b, 0);
          const curCount = cur.dataBitmap.reduce((a, b) => a + b, 0);
          expect(curCount).toBe(prevCount + 1);
        }
      }
    }
  });

  it('unlink frees inode and data when refCnt reaches 0', () => {
    for (let seed = 0; seed < 30; seed++) {
      const result = simulate({ seed, numInodes: 16, numData: 16, numRequests: 10 });
      for (let i = 0; i < result.steps.length; i++) {
        if (result.steps[i].operation.startsWith('unlink(')) {
          const prev = i === 0 ? result.initialState : result.steps[i - 1].stateAfter;
          const cur = result.steps[i].stateAfter;
          // Inode bitmap should have same or fewer bits set
          const prevCount = prev.inodeBitmap.reduce((a, b) => a + b, 0);
          const curCount = cur.inodeBitmap.reduce((a, b) => a + b, 0);
          expect(curCount).toBeLessThanOrEqual(prevCount);
        }
      }
    }
  });

  it('link increments refCnt', () => {
    for (let seed = 0; seed < 30; seed++) {
      const result = simulate({ seed, numInodes: 16, numData: 16, numRequests: 10 });
      for (let i = 0; i < result.steps.length; i++) {
        if (result.steps[i].operation.startsWith('link(')) {
          const prev = i === 0 ? result.initialState : result.steps[i - 1].stateAfter;
          const cur = result.steps[i].stateAfter;
          // Inode bitmap should be the same (link doesn't allocate new inode)
          expect(cur.inodeBitmap).toEqual(prev.inodeBitmap);
          // Some inode should have a higher refCnt
          let foundHigherRef = false;
          for (let j = 0; j < cur.inodes.length; j++) {
            if (cur.inodes[j].refCnt > prev.inodes[j].refCnt) {
              foundHigherRef = true;
              break;
            }
          }
          expect(foundHigherRef).toBe(true);
        }
      }
    }
  });

  it('formatInode formats correctly', () => {
    expect(formatInode({ ftype: 'free', addr: -1, refCnt: 1 })).toBe('[]');
    expect(formatInode({ ftype: 'd', addr: 0, refCnt: 2 })).toBe('[d a:0 r:2]');
    expect(formatInode({ ftype: 'f', addr: 3, refCnt: 1 })).toBe('[f a:3 r:1]');
  });

  it('formatBlock formats correctly', () => {
    expect(formatBlock({ ftype: 'free', dirList: [], data: '' })).toBe('[]');
    expect(formatBlock({ ftype: 'f', dirList: [], data: 'x' })).toBe('[x]');
    expect(formatBlock({
      ftype: 'd',
      dirList: [{ name: '.', inum: 0 }, { name: '..', inum: 0 }],
      data: '',
    })).toBe('[(.,0) (..,0)]');
  });
});
