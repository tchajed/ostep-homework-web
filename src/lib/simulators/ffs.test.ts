import { describe, it, expect } from 'vitest';
import { simulate, parseCommands, defaultParams, bitmapChar, isFree, type FfsParams, type FileOp } from './ffs';

function run(commands: string, params?: Partial<FfsParams>) {
  const ops = parseCommands(commands);
  return simulate({ ...defaultParams, ...params }, ops);
}

describe('FFS simulator', () => {
  describe('parseCommands', () => {
    it('parses file, dir, and delete commands', () => {
      const ops = parseCommands('dir /a\nfile /a/b 3\ndelete /a/b');
      expect(ops).toEqual([
        { kind: 'mkdir', path: '/a' },
        { kind: 'create', path: '/a/b', size: 3 },
        { kind: 'delete', path: '/a/b' },
      ]);
    });

    it('skips blank lines', () => {
      const ops = parseCommands('\ndir /a\n\nfile /a/b 1\n');
      expect(ops).toHaveLength(2);
    });

    it('throws on unknown command', () => {
      expect(() => parseCommands('foo /bar')).toThrow('Unknown command: foo');
    });
  });

  describe('example 1: two dirs with files', () => {
    const commands = `dir /a
dir /b
file /a/c 2
file /a/d 2
file /a/e 2
file /b/f 2`;

    it('produces correct free counts', () => {
      const state = run(commands);
      expect(state.totalDataFree).toBe(289);
      expect(state.totalInodesFree).toBe(93);
    });

    it('places dir inodes in separate groups', () => {
      const state = run(commands);
      // Root in group 0, /a in group 1 (most free), /b in group 2
      // /a's inode number = 10, /b's = 20
      expect(state.nameToInode.get('/a')).toBe(10);
      expect(state.nameToInode.get('/b')).toBe(20);
    });

    it('places file inodes near parent', () => {
      const state = run(commands);
      // /a/c, /a/d, /a/e should be in group 1 (same as /a)
      expect(state.nameToInode.get('/a/c')).toBe(11);
      expect(state.nameToInode.get('/a/d')).toBe(12);
      expect(state.nameToInode.get('/a/e')).toBe(13);
      // /b/f in group 2 (same as /b)
      expect(state.nameToInode.get('/b/f')).toBe(21);
    });

    it('allocates correct block addresses', () => {
      const state = run(commands);
      const entries = state.symbolEntries;
      const findBlocks = (name: string) =>
        entries.find(e => e.filename === name)!.blockAddresses;

      expect(findBlocks('/')).toEqual([0]);
      expect(findBlocks('/a')).toEqual([30]);
      expect(findBlocks('/a/c')).toEqual([31, 32]);
      expect(findBlocks('/a/d')).toEqual([33, 34]);
      expect(findBlocks('/a/e')).toEqual([35, 36]);
      expect(findBlocks('/b')).toEqual([60]);
      expect(findBlocks('/b/f')).toEqual([61, 62]);
    });

    it('assigns correct symbols', () => {
      const state = run(commands);
      const findSymbol = (name: string) =>
        state.symbolEntries.find(e => e.filename === name)!.symbol;

      expect(findSymbol('/')).toBe('/');
      expect(findSymbol('/a')).toBe('a');
      expect(findSymbol('/b')).toBe('b');
      expect(findSymbol('/a/c')).toBe('c');
      expect(findSymbol('/a/d')).toBe('d');
      expect(findSymbol('/a/e')).toBe('e');
      expect(findSymbol('/b/f')).toBe('f');
    });

    it('all operations succeed', () => {
      const state = run(commands);
      expect(state.opResults).toHaveLength(6);
      for (const r of state.opResults) {
        expect(r.success).toBe(true);
      }
    });
  });

  describe('example 2: large file', () => {
    it('spreads large file across groups', () => {
      const state = run('file /a 30');
      // With large_file_exception=30, file gets 30 blocks in group 0 then spills
      // Actually: inode in group 0, data starts at block 1 in group 0
      // Root uses block 0, so /a gets blocks 1-29 in group 0 (29 blocks) then block 30 in group 1
      const blocks = state.symbolEntries.find(e => e.filename === '/a')!.blockAddresses;
      expect(blocks).toHaveLength(30);
      // Blocks 1-29 are in group 0, block 30 is in group 1
      expect(blocks[0]).toBe(1);
      expect(blocks[28]).toBe(29);
      expect(blocks[29]).toBe(30); // group 1, index 0
    });
  });

  describe('large file exception', () => {
    it('spills to next group when exception triggers', () => {
      const state = run('file /a 40');
      const blocks = state.symbolEntries.find(e => e.filename === '/a')!.blockAddresses;
      expect(blocks).toHaveLength(40);
      // First 29 in group 0 (1-29), then 10 in group 1 (30-39), then 1 in group 2
      expect(blocks[28]).toBe(29); // last in group 0
      expect(blocks[29]).toBe(30); // first in group 1
      expect(blocks[39]).toBe(40); // group 1 block 10
      expect(state.totalDataFree).toBe(259);
    });
  });

  describe('spread inodes', () => {
    it('spreads file inodes across groups', () => {
      const commands = `dir /a
dir /b
file /a/c 2
file /a/d 2
file /a/e 2
file /b/f 2`;
      const state = run(commands, { spreadInodes: true });
      // With spread inodes, each inode goes to the group with most free inodes
      expect(state.nameToInode.get('/a')).toBe(10); // group 1
      expect(state.nameToInode.get('/b')).toBe(20); // group 2
      expect(state.nameToInode.get('/a/c')).toBe(30); // group 3
      expect(state.nameToInode.get('/a/d')).toBe(40); // group 4
      expect(state.nameToInode.get('/a/e')).toBe(50); // group 5
      expect(state.nameToInode.get('/b/f')).toBe(60); // group 6
    });
  });

  describe('fragmented allocation', () => {
    const commands = `file /a 1
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
file /i 8`;

    it('fills gaps with default contig policy', () => {
      const state = run(commands);
      const blocks = state.symbolEntries.find(e => e.filename === '/i')!.blockAddresses;
      // With contig=1, /i fills gaps: 1,3,5,7 then continues at 9,10,11,12
      expect(blocks).toEqual([1, 3, 5, 7, 9, 10, 11, 12]);
    });

    it('skips gaps with contig=2', () => {
      const state = run(commands, { contigAllocationPolicy: 2 });
      const blocks = state.symbolEntries.find(e => e.filename === '/i')!.blockAddresses;
      // With contig=2, single gaps are skipped
      expect(blocks).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    });
  });

  describe('delete', () => {
    it('frees inode and data', () => {
      const state1 = run('file /a 5');
      expect(state1.totalDataFree).toBe(294);
      expect(state1.totalInodesFree).toBe(98);

      const state2 = run('file /a 5\ndelete /a');
      expect(state2.totalDataFree).toBe(299);
      expect(state2.totalInodesFree).toBe(99);
    });

    it('reports failure for missing file', () => {
      const state = run('delete /nonexistent');
      expect(state.opResults[0].success).toBe(false);
    });

    it('cannot delete directories', () => {
      const state = run('dir /a\ndelete /a');
      expect(state.opResults[1].success).toBe(false);
      expect(state.opResults[1].message).toContain('cannot delete directories');
    });
  });

  describe('error handling', () => {
    it('fails to create duplicate file', () => {
      const state = run('file /a 1\nfile /a 1');
      expect(state.opResults[0].success).toBe(true);
      expect(state.opResults[1].success).toBe(false);
    });

    it('fails when parent does not exist', () => {
      const state = run('file /x/y 1');
      expect(state.opResults[0].success).toBe(false);
    });
  });

  describe('spans', () => {
    it('computes file spans', () => {
      const state = run(`dir /a
dir /b
file /a/c 2
file /a/d 2
file /a/e 2
file /b/f 2`);
      // From Python reference:
      // /a/c filespan: 11, /a/d: 12, /a/e: 13, /b/f: 11
      const cSpan = state.fileSpans.find(s => s.path === '/a/c');
      expect(cSpan).toBeDefined();
      expect(cSpan!.span).toBe(11);

      const fSpan = state.fileSpans.find(s => s.path === '/b/f');
      expect(fSpan!.span).toBe(11);

      expect(state.fileSpanAvg).toBeCloseTo(11.75);
    });
  });

  describe('bitmapChar', () => {
    it('returns - for free', () => {
      expect(bitmapChar('__FREE__', new Map())).toBe('-');
    });

    it('returns symbol for inode', () => {
      const map = new Map([[5, 'x']]);
      expect(bitmapChar(5, map)).toBe('x');
    });
  });

  describe('isFree', () => {
    it('identifies free entries', () => {
      expect(isFree('__FREE__')).toBe(true);
      expect(isFree(0)).toBe(false);
    });
  });

  describe('deterministic', () => {
    it('produces same result for same inputs', () => {
      const commands = 'dir /a\nfile /a/b 3';
      const s1 = run(commands);
      const s2 = run(commands);
      expect(s1.symbolEntries).toEqual(s2.symbolEntries);
      expect(s1.totalDataFree).toBe(s2.totalDataFree);
    });
  });
});
