import { describe, it, expect } from 'vitest';
import { simulate, mapBlock, computeDiskLayout, defaultParams, type RaidParams } from './raid';

describe('RAID simulator', () => {
  describe('RAID-0 striping', () => {
    it('maps blocks round-robin across disks (chunkSize=1, 4 disks)', () => {
      const params: RaidParams = { ...defaultParams, level: 0, numDisks: 4, chunkSize: 1 };
      expect(mapBlock(0, params)).toEqual([{ disk: 0, offset: 0 }]);
      expect(mapBlock(1, params)).toEqual([{ disk: 1, offset: 0 }]);
      expect(mapBlock(2, params)).toEqual([{ disk: 2, offset: 0 }]);
      expect(mapBlock(3, params)).toEqual([{ disk: 3, offset: 0 }]);
      expect(mapBlock(4, params)).toEqual([{ disk: 0, offset: 1 }]);
      expect(mapBlock(7, params)).toEqual([{ disk: 3, offset: 1 }]);
    });

    it('handles larger chunk sizes', () => {
      const params: RaidParams = { ...defaultParams, level: 0, numDisks: 4, chunkSize: 2 };
      expect(mapBlock(0, params)).toEqual([{ disk: 0, offset: 0 }]);
      expect(mapBlock(1, params)).toEqual([{ disk: 0, offset: 1 }]);
      expect(mapBlock(2, params)).toEqual([{ disk: 1, offset: 0 }]);
      expect(mapBlock(3, params)).toEqual([{ disk: 1, offset: 1 }]);
      expect(mapBlock(8, params)).toEqual([{ disk: 0, offset: 2 }]);
    });

    it('read generates one physical op per block', () => {
      const result = simulate({ ...defaultParams, level: 0, seed: 0, numRequests: 5 });
      for (const req of result.requests) {
        expect(req.ops).toHaveLength(1);
        expect(req.ops[0].type).toBe('read');
      }
    });

    it('maps known addresses correctly', () => {
      // Manually verify: addr 8444, 4 disks, chunkSize 1
      // cnum = 8444, disk = 8444 % 4 = 0, offset = floor(8444/4) = 2111
      const params: RaidParams = { ...defaultParams, level: 0 };
      expect(mapBlock(8444, params)).toEqual([{ disk: 0, offset: 2111 }]);
      expect(mapBlock(4205, params)).toEqual([{ disk: 1, offset: 1051 }]);
      expect(mapBlock(2818, params)).toEqual([{ disk: 2, offset: 704 }]);
      expect(mapBlock(6183, params)).toEqual([{ disk: 3, offset: 1545 }]);
    });

    it('write generates one physical op per block in RAID-0', () => {
      const result = simulate({ ...defaultParams, level: 0, writeFrac: 100, numRequests: 3 });
      for (const req of result.requests) {
        expect(req.isWrite).toBe(true);
        expect(req.ops).toHaveLength(1);
        expect(req.ops[0].type).toBe('write');
      }
    });
  });

  describe('RAID-1 mirroring', () => {
    it('maps to two adjacent disks', () => {
      const params: RaidParams = { ...defaultParams, level: 1, numDisks: 4, chunkSize: 1 };
      const locs = mapBlock(0, params);
      expect(locs).toHaveLength(2);
      expect(locs[0].disk).toBe(0);
      expect(locs[1].disk).toBe(1);
      expect(locs[0].offset).toBe(locs[1].offset);
    });

    it('second pair goes to disks 2,3', () => {
      const params: RaidParams = { ...defaultParams, level: 1, numDisks: 4, chunkSize: 1 };
      const locs = mapBlock(1, params);
      expect(locs[0].disk).toBe(2);
      expect(locs[1].disk).toBe(3);
    });

    it('maps known addresses correctly', () => {
      const params: RaidParams = { ...defaultParams, level: 1 };
      // addr 8444: cnum=8444, halfDisks=2, disk=2*(8444%2)=0, off=floor(8444/2)=4222
      expect(mapBlock(8444, params)).toEqual([
        { disk: 0, offset: 4222 },
        { disk: 1, offset: 4222 },
      ]);
      // addr 4205: cnum=4205, disk=2*(4205%2)=2, off=floor(4205/2)=2102
      expect(mapBlock(4205, params)).toEqual([
        { disk: 2, offset: 2102 },
        { disk: 3, offset: 2102 },
      ]);
    });

    it('reads use even/odd offset balancing', () => {
      // Simulate reads: construct directly for known addr
      const params: RaidParams = { ...defaultParams, level: 1, workload: 'seq', numRequests: 4, writeFrac: 0 };
      const result = simulate(params);
      // addr 0: off=0 (even) -> disk 0
      expect(result.requests[0].ops[0].disk).toBe(0);
      // addr 1: maps to (2,3, off=0), even -> disk 2
      expect(result.requests[1].ops[0].disk).toBe(2);
      // addr 2: maps to (0,1, off=1), odd -> disk 1
      expect(result.requests[2].ops[0].disk).toBe(1);
      // addr 3: maps to (2,3, off=1), odd -> disk 3
      expect(result.requests[3].ops[0].disk).toBe(3);
    });

    it('writes go to both mirror disks', () => {
      const params: RaidParams = { ...defaultParams, level: 1, writeFrac: 100, workload: 'seq', numRequests: 1 };
      const result = simulate(params);
      expect(result.requests[0].isWrite).toBe(true);
      expect(result.requests[0].ops).toHaveLength(2);
      expect(result.requests[0].ops[0].type).toBe('write');
      expect(result.requests[0].ops[1].type).toBe('write');
      // Both at same offset, adjacent disks
      expect(result.requests[0].ops[0].offset).toBe(result.requests[0].ops[1].offset);
      expect(result.requests[0].ops[1].disk).toBe(result.requests[0].ops[0].disk + 1);
    });

    it('rejects odd number of disks', () => {
      expect(() => simulate({ ...defaultParams, level: 1, numDisks: 3 })).toThrow();
    });
  });

  describe('RAID-4 parity', () => {
    it('maps data to first N-1 disks', () => {
      const params: RaidParams = { ...defaultParams, level: 4, numDisks: 4, chunkSize: 1 };
      // 3 data disks, 1 parity
      expect(mapBlock(0, params)).toEqual([{ disk: 0, offset: 0 }]);
      expect(mapBlock(1, params)).toEqual([{ disk: 1, offset: 0 }]);
      expect(mapBlock(2, params)).toEqual([{ disk: 2, offset: 0 }]);
      expect(mapBlock(3, params)).toEqual([{ disk: 0, offset: 1 }]);
    });

    it('maps known address for RAID-4', () => {
      const params: RaidParams = { ...defaultParams, level: 4 };
      // addr 8444: cnum=8444, disk=8444%3=2, off=floor(8444/3)*1+0 = 2814
      expect(mapBlock(8444, params)).toEqual([{ disk: 2, offset: 2814 }]);
    });

    it('write uses subtractive parity for single block', () => {
      // Single-block write: read old data + old parity, write new data + new parity
      const params: RaidParams = {
        ...defaultParams,
        level: 4,
        writeFrac: 100,
        workload: 'seq',
        numRequests: 1,
      };
      const result = simulate(params);
      const ops = result.requests[0].ops;
      // For addr 0 -> disk 0, offset 0. Parity disk = 3.
      // Subtractive: read data(disk 0, off 0) + read parity(disk 3, off 0), write data + write parity
      expect(ops).toEqual([
        { type: 'read', disk: 0, offset: 0 },
        { type: 'read', disk: 3, offset: 0 },
        { type: 'write', disk: 0, offset: 0 },
        { type: 'write', disk: 3, offset: 0 },
      ]);
    });
  });

  describe('RAID-5 rotated parity', () => {
    it('maps known addresses correctly (LS, 4 disks)', () => {
      const params: RaidParams = { ...defaultParams, level: 5, raid5type: 'LS' };
      // Same data mapping as RAID-4 but with rotating parity
      expect(mapBlock(8444, params)).toEqual([{ disk: 0, offset: 2814 }]);
      expect(mapBlock(4205, params)).toEqual([{ disk: 1, offset: 1401 }]);
    });

    it('parity disk rotates across stripes (4 disks)', () => {
      const params: RaidParams = { ...defaultParams, level: 5, numDisks: 4 };
      const layout = computeDiskLayout(params, 4);
      const parityPositions = layout.map(row => row.findIndex(c => c.isParity));
      // With 4 disks LS: parity should be at positions 3, 2, 1, 0
      expect(parityPositions).toEqual([3, 2, 1, 0]);
    });

    it('parity disk rotates across stripes (5 disks)', () => {
      const params: RaidParams = { ...defaultParams, level: 5, numDisks: 5 };
      const layout = computeDiskLayout(params, 5);
      const parityPositions = layout.map(row => row.findIndex(c => c.isParity));
      // All different parity disk positions over 5 stripes
      expect(new Set(parityPositions).size).toBe(5);
    });

    it('write produces reads and writes with parity', () => {
      const params: RaidParams = {
        ...defaultParams,
        level: 5,
        writeFrac: 100,
        workload: 'seq',
        numRequests: 1,
      };
      const result = simulate(params);
      const ops = result.requests[0].ops;
      // Should have reads (for parity computation) and writes
      const reads = ops.filter(op => op.type === 'read');
      const writes = ops.filter(op => op.type === 'write');
      expect(reads.length).toBeGreaterThan(0);
      expect(writes.length).toBeGreaterThanOrEqual(2); // at least data + parity
    });
  });

  describe('disk layout computation', () => {
    it('RAID-0 layout has numDisks * chunkSize cells per row', () => {
      const layout = computeDiskLayout({ ...defaultParams, level: 0 }, 3);
      expect(layout).toHaveLength(3);
      expect(layout[0]).toHaveLength(4); // 4 disks * 1 chunk
    });

    it('RAID-0 blocks are sequential across row', () => {
      const layout = computeDiskLayout({ ...defaultParams, level: 0 }, 2);
      expect(layout[0].map(c => c.label)).toEqual(['0', '1', '2', '3']);
      expect(layout[1].map(c => c.label)).toEqual(['4', '5', '6', '7']);
    });

    it('RAID-1 layout shows mirrored pairs', () => {
      const layout = computeDiskLayout({ ...defaultParams, level: 1 }, 2);
      expect(layout[0]).toHaveLength(4);
      expect(layout[0][0].label).toBe(layout[0][1].label);
      expect(layout[0][2].label).toBe(layout[0][3].label);
    });

    it('RAID-4 layout has parity on last disk', () => {
      const layout = computeDiskLayout({ ...defaultParams, level: 4 }, 2);
      expect(layout[0][3].isParity).toBe(true);
      expect(layout[1][3].isParity).toBe(true);
    });

    it('RAID-5 layout has rotating parity', () => {
      const layout = computeDiskLayout({ ...defaultParams, level: 5 }, 4);
      const parityPositions = layout.map(row => row.findIndex(c => c.isParity));
      expect(new Set(parityPositions).size).toBeGreaterThan(1);
    });
  });

  describe('workload generation', () => {
    it('sequential workload produces contiguous addresses', () => {
      const result = simulate({ ...defaultParams, workload: 'seq', numRequests: 5 });
      for (let i = 0; i < 5; i++) {
        expect(result.requests[i].logicalAddr).toBe(i * defaultParams.reqSize);
      }
    });

    it('sequential with reqSize 4 increments by 4', () => {
      const result = simulate({ ...defaultParams, workload: 'seq', numRequests: 3, reqSize: 4 });
      expect(result.requests[0].logicalAddr).toBe(0);
      expect(result.requests[1].logicalAddr).toBe(4);
      expect(result.requests[2].logicalAddr).toBe(8);
    });

    it('writeFrac 100 makes all writes', () => {
      const result = simulate({ ...defaultParams, writeFrac: 100, numRequests: 5 });
      for (const req of result.requests) {
        expect(req.isWrite).toBe(true);
      }
    });

    it('writeFrac 0 makes all reads', () => {
      const result = simulate({ ...defaultParams, writeFrac: 0, numRequests: 5 });
      for (const req of result.requests) {
        expect(req.isWrite).toBe(false);
      }
    });

    it('deterministic for same seed', () => {
      const r1 = simulate({ ...defaultParams, seed: 42 });
      const r2 = simulate({ ...defaultParams, seed: 42 });
      expect(r1).toEqual(r2);
    });

    it('different seeds produce different results', () => {
      const r1 = simulate({ ...defaultParams, seed: 1 });
      const r2 = simulate({ ...defaultParams, seed: 2 });
      expect(r1.requests[0].logicalAddr).not.toBe(r2.requests[0].logicalAddr);
    });

    it('random workload addresses are within randRange', () => {
      const result = simulate({ ...defaultParams, workload: 'rand', randRange: 100, numRequests: 20 });
      for (const req of result.requests) {
        expect(req.logicalAddr).toBeGreaterThanOrEqual(0);
        expect(req.logicalAddr).toBeLessThan(100);
      }
    });
  });

  describe('multi-block requests', () => {
    it('RAID-0 multi-block read generates one op per block', () => {
      const result = simulate({
        ...defaultParams,
        level: 0,
        workload: 'seq',
        reqSize: 4,
        numRequests: 1,
      });
      // 4 blocks starting at 0: disk 0/off 0, disk 1/off 0, disk 2/off 0, disk 3/off 0
      expect(result.requests[0].ops).toHaveLength(4);
      expect(result.requests[0].ops).toEqual([
        { type: 'read', disk: 0, offset: 0 },
        { type: 'read', disk: 1, offset: 0 },
        { type: 'read', disk: 2, offset: 0 },
        { type: 'read', disk: 3, offset: 0 },
      ]);
    });

    it('RAID-1 multi-block write duplicates each block', () => {
      const result = simulate({
        ...defaultParams,
        level: 1,
        workload: 'seq',
        reqSize: 2,
        writeFrac: 100,
        numRequests: 1,
      });
      // 2 blocks: each written to 2 disks = 4 write ops
      expect(result.requests[0].ops).toHaveLength(4);
      expect(result.requests[0].ops.every(op => op.type === 'write')).toBe(true);
    });
  });
});
