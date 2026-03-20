import { describe, it, expect } from 'vitest';
import {
  simulate,
  generateCommands,
  defaultParams,
  pageStateChar,
  isPageLive,
  PageState,
  type SsdParams,
} from './ssd';
import { Random } from '../random';

describe('ssd simulator', () => {
  describe('generateCommands', () => {
    it('generates the requested number of commands', () => {
      const rng = new Random(0);
      const cmds = generateCommands(rng, { ...defaultParams, numCmds: 20 });
      expect(cmds).toHaveLength(20);
    });

    it('parses cmdList when provided', () => {
      const rng = new Random(0);
      const cmds = generateCommands(rng, {
        ...defaultParams,
        cmdList: 'w0:a,r0,t0',
      });
      expect(cmds).toEqual(['w0:a', 'r0', 't0']);
    });

    it('generates deterministic commands for the same seed', () => {
      const rng1 = new Random(42);
      const rng2 = new Random(42);
      const cmds1 = generateCommands(rng1, defaultParams);
      const cmds2 = generateCommands(rng2, defaultParams);
      expect(cmds1).toEqual(cmds2);
    });

    it('generates commands with correct prefixes', () => {
      const rng = new Random(1);
      const cmds = generateCommands(rng, defaultParams);
      for (const cmd of cmds) {
        expect(cmd).toMatch(/^[rwt]/);
      }
    });
  });

  describe('simulate - direct', () => {
    it('write then read returns written data', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w5:x,r5',
        ssdType: 'direct',
      });
      expect(result.cmds).toHaveLength(2);
      expect(result.cmds[0].result).toBe('success');
      expect(result.cmds[1].result).toBe('x');
    });

    it('read of uninitialized page fails', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'r0',
        ssdType: 'direct',
      });
      expect(result.cmds[0].result).toBe('fail: uninitialized read');
      expect(result.logicalReadFailSum).toBe(1);
    });

    it('overwrite preserves other pages in block', () => {
      // Pages 0 and 1 are in block 0 (10 pages per block)
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a,w1:b,w0:c,r0,r1',
        ssdType: 'direct',
      });
      expect(result.cmds[3].result).toBe('c');
      expect(result.cmds[4].result).toBe('b');
    });

    it('direct write erases block each time', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a,w0:b',
        ssdType: 'direct',
      });
      // Each write to direct erases the block
      expect(result.physicalEraseSum).toBe(2);
    });

    it('forward map points to same address in direct mode', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w5:x',
        ssdType: 'direct',
      });
      expect(result.finalSnapshot.forwardMap[5]).toBe(5);
    });
  });

  describe('simulate - log', () => {
    it('write then read returns written data', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w5:x,r5',
        ssdType: 'log',
      });
      expect(result.cmds[0].result).toBe('success');
      expect(result.cmds[1].result).toBe('x');
    });

    it('log writes sequentially to physical pages', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a,w1:b,w2:c',
        ssdType: 'log',
      });
      const fm = result.finalSnapshot.forwardMap;
      // Logical pages 0, 1, 2 should map to physical pages 0, 1, 2
      expect(fm[0]).toBe(0);
      expect(fm[1]).toBe(1);
      expect(fm[2]).toBe(2);
    });

    it('overwrite in log mode creates new physical mapping', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a,w0:b',
        ssdType: 'log',
      });
      const fm = result.finalSnapshot.forwardMap;
      // Second write should go to physical page 1
      expect(fm[0]).toBe(1);
    });

    it('trim then read fails', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w5:x,t5,r5',
        ssdType: 'log',
      });
      expect(result.cmds[1].result).toBe('success');
      expect(result.cmds[2].result).toBe('fail: uninitialized read');
    });
  });

  describe('simulate - ideal', () => {
    it('write then read returns written data', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w5:x,r5',
        ssdType: 'ideal',
      });
      expect(result.cmds[0].result).toBe('success');
      expect(result.cmds[1].result).toBe('x');
    });

    it('ideal write does not erase block', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a,w0:b',
        ssdType: 'ideal',
      });
      expect(result.physicalEraseSum).toBe(0);
    });

    it('forward map is identity for ideal', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w10:a,w20:b',
        ssdType: 'ideal',
      });
      expect(result.finalSnapshot.forwardMap[10]).toBe(10);
      expect(result.finalSnapshot.forwardMap[20]).toBe(20);
    });
  });

  describe('trim', () => {
    it('trim of unmapped address fails', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 't5',
        ssdType: 'direct',
      });
      expect(result.cmds[0].result).toBe('fail: uninitialized trim');
      expect(result.logicalTrimFailSum).toBe(1);
    });

    it('trim of out-of-range address fails', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 't999',
        ssdType: 'direct',
        numLogicalPages: 50,
      });
      expect(result.cmds[0].result).toBe('fail: illegal trim address');
    });
  });

  describe('stats', () => {
    it('counts logical operations correctly', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a,w1:b,r0,r1,t0',
        ssdType: 'log',
      });
      expect(result.logicalWriteSum).toBe(2);
      expect(result.logicalReadSum).toBe(2);
      expect(result.logicalTrimSum).toBe(1);
    });

    it('computes time correctly', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a',
        ssdType: 'log',
        eraseTime: 1000,
        programTime: 40,
        readTime: 10,
      });
      // log mode: 1 erase (of the first block) + 1 program
      expect(result.eraseTime).toBe(result.physicalEraseSum * 1000);
      expect(result.writeTime).toBe(result.physicalWriteSum * 40);
      expect(result.readTimeTotal).toBe(result.physicalReadSum * 10);
      expect(result.totalTime).toBe(
        result.eraseTime + result.writeTime + result.readTimeTotal,
      );
    });
  });

  describe('pageStateChar', () => {
    it('returns correct characters', () => {
      expect(pageStateChar(PageState.Invalid)).toBe('i');
      expect(pageStateChar(PageState.Erased)).toBe('E');
      expect(pageStateChar(PageState.Valid)).toBe('v');
    });
  });

  describe('isPageLive', () => {
    it('detects live pages', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a,w1:b',
        ssdType: 'log',
      });
      const snap = result.finalSnapshot;
      expect(isPageLive(snap, 0)).toBe(true);
      expect(isPageLive(snap, 1)).toBe(true);
      expect(isPageLive(snap, 2)).toBe(false);
    });

    it('overwritten pages are not live', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a,w0:b',
        ssdType: 'log',
      });
      const snap = result.finalSnapshot;
      // Physical page 0 has old data, page 1 has current
      expect(isPageLive(snap, 0)).toBe(false);
      expect(isPageLive(snap, 1)).toBe(true);
    });
  });

  describe('determinism', () => {
    it('same seed produces identical results', () => {
      const r1 = simulate({ ...defaultParams, seed: 42 });
      const r2 = simulate({ ...defaultParams, seed: 42 });
      expect(r1.cmds).toEqual(r2.cmds);
      expect(r1.finalSnapshot).toEqual(r2.finalSnapshot);
    });

    it('different seeds produce different results', () => {
      const r1 = simulate({ ...defaultParams, seed: 1 });
      const r2 = simulate({ ...defaultParams, seed: 2 });
      expect(r1.cmds).not.toEqual(r2.cmds);
    });
  });

  describe('garbage collection', () => {
    it('GC triggers when blocks in use reaches high water mark', () => {
      // Use small config: 4 blocks, 2 pages per block, high=3, low=2
      // Write enough unique logical pages to fill 3 blocks (6 pages)
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a,w1:b,w2:c,w3:d,w4:e,w5:f',
        ssdType: 'log',
        numBlocks: 4,
        pagesPerBlock: 2,
        numLogicalPages: 10,
        highWaterMark: 3,
        lowWaterMark: 2,
      });
      // Should have some GC events since we used 3 blocks
      // (GC triggers when blocks_in_use >= highWaterMark)
      // After 4 writes, 2 blocks are used. After 5th, 3rd block starts.
      // After 6th write, all 3 blocks full, then upkeep triggers GC.
      expect(result.gcEvents.length).toBeGreaterThan(0);
    });

    it('GC does not trigger below high water mark', () => {
      const result = simulate({
        ...defaultParams,
        cmdList: 'w0:a,w1:b',
        ssdType: 'log',
        numBlocks: 7,
        pagesPerBlock: 10,
        highWaterMark: 10,
        lowWaterMark: 8,
      });
      expect(result.gcEvents).toHaveLength(0);
    });
  });
});
