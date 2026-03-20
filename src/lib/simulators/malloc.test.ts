import { describe, it, expect } from 'vitest';
import { Malloc, simulate, type SimulationParams, defaultParams } from './malloc';

describe('Malloc class', () => {
  it('allocates from a fresh heap', () => {
    const m = new Malloc(100, 1000, 0, 'BEST', 'ADDRSORT', false, -1);
    const result = m.malloc(10);
    expect(result.addr).toBe(1000);
    expect(result.searched).toBe(1);
    expect(m.getFreelist()).toEqual([{ addr: 1010, size: 90 }]);
  });

  it('returns -1 when allocation is too large', () => {
    const m = new Malloc(100, 1000, 0, 'BEST', 'ADDRSORT', false, -1);
    const result = m.malloc(200);
    expect(result.addr).toBe(-1);
  });

  it('exact fit removes free entry', () => {
    const m = new Malloc(10, 0, 0, 'BEST', 'ADDRSORT', false, -1);
    const result = m.malloc(10);
    expect(result.addr).toBe(0);
    expect(m.getFreelist()).toEqual([]);
  });

  it('free returns memory to the list', () => {
    const m = new Malloc(100, 1000, 0, 'BEST', 'ADDRSORT', false, -1);
    m.malloc(10);
    m.free(1000);
    // After free with ADDRSORT, we should have two sorted entries
    expect(m.getFreelist()).toEqual([
      { addr: 1000, size: 10 },
      { addr: 1010, size: 90 },
    ]);
  });

  it('free of unknown addr returns -1', () => {
    const m = new Malloc(100, 1000, 0, 'BEST', 'ADDRSORT', false, -1);
    expect(m.free(9999)).toBe(-1);
  });

  it('FIRST policy picks the first fit', () => {
    const m = new Malloc(100, 0, 0, 'FIRST', 'ADDRSORT', false, -1);
    // Allocate 20, 30, then free both, creating two entries [0,20] [50,50]
    m.malloc(20);  // 0..19
    m.malloc(30);  // 20..49
    m.free(0);     // frees [0, 20]
    // freelist: [0,20], [50,50]
    const result = m.malloc(15);
    expect(result.addr).toBe(0);
    expect(result.searched).toBe(1);
  });

  it('BEST policy picks the smallest fit', () => {
    const m = new Malloc(100, 0, 0, 'BEST', 'ADDRSORT', false, -1);
    m.malloc(20);  // 0..19
    m.malloc(30);  // 20..49
    m.free(0);     // frees [0, 20]
    // freelist: [0,20], [50,50]
    const result = m.malloc(15);
    expect(result.addr).toBe(0);
    expect(result.searched).toBe(2);
  });

  it('WORST policy picks the largest fit', () => {
    const m = new Malloc(100, 0, 0, 'WORST', 'ADDRSORT', false, -1);
    m.malloc(20);  // 0..19
    m.malloc(30);  // 20..49
    m.free(0);     // frees [0, 20]
    // freelist: [0,20], [50,50]
    const result = m.malloc(15);
    expect(result.addr).toBe(50);
    expect(result.searched).toBe(2);
  });

  it('coalesce merges adjacent free blocks', () => {
    const m = new Malloc(100, 1000, 0, 'BEST', 'ADDRSORT', true, -1);
    m.malloc(10);  // 1000..1009
    m.malloc(10);  // 1010..1019
    m.free(1000);  // freelist: [1000,10], [1020,80]
    m.free(1010);  // should coalesce into [1000,100]
    expect(m.getFreelist()).toEqual([{ addr: 1000, size: 100 }]);
  });

  it('coalesce does not merge non-adjacent blocks', () => {
    const m = new Malloc(100, 1000, 0, 'BEST', 'ADDRSORT', true, -1);
    m.malloc(10);  // 1000..1009
    m.malloc(10);  // 1010..1019
    m.malloc(10);  // 1020..1029
    m.free(1000);  // [1000,10], [1030,70]
    m.free(1020);  // [1000,10], [1020,10], [1030,70] -> coalesces to [1000,10], [1020,80]
    expect(m.getFreelist()).toEqual([
      { addr: 1000, size: 10 },
      { addr: 1020, size: 80 },
    ]);
  });

  it('header size is added to allocation', () => {
    const m = new Malloc(100, 0, 4, 'BEST', 'ADDRSORT', false, -1);
    m.malloc(10); // actually uses 14 bytes
    expect(m.getFreelist()).toEqual([{ addr: 14, size: 86 }]);
  });

  it('alignment rounds up allocation size', () => {
    const m = new Malloc(100, 0, 0, 'BEST', 'ADDRSORT', false, 8);
    m.malloc(5); // rounds up to 8
    expect(m.getFreelist()).toEqual([{ addr: 8, size: 92 }]);
  });

  it('alignment does not change already-aligned sizes', () => {
    const m = new Malloc(100, 0, 0, 'BEST', 'ADDRSORT', false, 8);
    m.malloc(16); // already aligned
    expect(m.getFreelist()).toEqual([{ addr: 16, size: 84 }]);
  });

  it('INSERT-FRONT order', () => {
    const m = new Malloc(100, 0, 0, 'BEST', 'INSERT-FRONT', false, -1);
    m.malloc(10);
    m.malloc(10);
    m.free(0);
    // freelist should be: [0,10] at front, then [20,80]
    const fl = m.getFreelist();
    expect(fl[0]).toEqual({ addr: 0, size: 10 });
    expect(fl[1]).toEqual({ addr: 20, size: 80 });
  });

  it('INSERT-BACK order', () => {
    const m = new Malloc(100, 0, 0, 'BEST', 'INSERT-BACK', false, -1);
    m.malloc(10);
    m.malloc(10);
    m.free(0);
    // freelist should be: [20,80] then [0,10] at back
    const fl = m.getFreelist();
    expect(fl[0]).toEqual({ addr: 20, size: 80 });
    expect(fl[1]).toEqual({ addr: 0, size: 10 });
  });

  it('SIZESORT+ order (ascending)', () => {
    const m = new Malloc(100, 0, 0, 'BEST', 'SIZESORT+', false, -1);
    m.malloc(10);
    m.malloc(20);
    m.free(0);
    // freelist: [30,70] then free [0,10] -> sorted by size ascending: [0,10], [30,70]
    const fl = m.getFreelist();
    expect(fl[0].size).toBeLessThanOrEqual(fl[1].size);
  });

  it('SIZESORT- order (descending)', () => {
    const m = new Malloc(100, 0, 0, 'BEST', 'SIZESORT-', false, -1);
    m.malloc(10);
    m.malloc(20);
    m.free(0);
    const fl = m.getFreelist();
    expect(fl[0].size).toBeGreaterThanOrEqual(fl[1].size);
  });

  it('dump produces expected format', () => {
    const m = new Malloc(100, 1000, 0, 'BEST', 'ADDRSORT', false, -1);
    expect(m.dump()).toBe('Free List [ Size 1 ]: [ addr:1000 sz:100 ]');
  });
});

describe('simulate with opsList', () => {
  it('handles simple alloc+free sequence', () => {
    const result = simulate({
      ...defaultParams,
      opsList: '+10,+20,-0,+5',
    });
    expect(result.steps).toHaveLength(4);
    expect(result.steps[0].op).toEqual({ type: 'alloc', ptrIndex: 0, size: 10 });
    expect(result.steps[0].result).toBe(1000);
    expect(result.steps[1].op).toEqual({ type: 'alloc', ptrIndex: 1, size: 20 });
    expect(result.steps[1].result).toBe(1010);
    expect(result.steps[2].op).toEqual({ type: 'free', ptrIndex: 0 });
    expect(result.steps[2].result).toBe(0);
    expect(result.steps[3].op).toEqual({ type: 'alloc', ptrIndex: 2, size: 5 });
    // BEST fit should pick the freed 10-byte block at 1000
    expect(result.steps[3].result).toBe(1000);
  });

  it('allocation failure returns -1', () => {
    const result = simulate({
      ...defaultParams,
      heapSize: 10,
      opsList: '+20',
    });
    expect(result.steps[0].result).toBe(-1);
  });

  it('skips invalid frees', () => {
    const result = simulate({
      ...defaultParams,
      opsList: '+10,-5',
    });
    // -5 references ptr[5] which doesn't exist, so it's skipped
    expect(result.steps).toHaveLength(1);
  });
});

describe('simulate with random ops', () => {
  it('generates the requested number of operations', () => {
    const result = simulate({
      ...defaultParams,
      seed: 0,
      numOps: 10,
    });
    expect(result.steps).toHaveLength(10);
  });

  it('is deterministic for the same seed', () => {
    const a = simulate({ ...defaultParams, seed: 42, numOps: 10 });
    const b = simulate({ ...defaultParams, seed: 42, numOps: 10 });
    expect(a.steps).toEqual(b.steps);
  });

  it('produces different results for different seeds', () => {
    const a = simulate({ ...defaultParams, seed: 1, numOps: 5 });
    const b = simulate({ ...defaultParams, seed: 2, numOps: 5 });
    // At least one step should differ
    const same = a.steps.every((s, i) => s.result === b.steps[i].result);
    expect(same).toBe(false);
  });

  it('coalesce keeps freelist compact', () => {
    const result = simulate({
      ...defaultParams,
      seed: 1,
      numOps: 20,
      coalesce: true,
    });
    // With coalesce, freelist should never have more entries than without
    const resultNoCoalesce = simulate({
      ...defaultParams,
      seed: 1,
      numOps: 20,
      coalesce: false,
    });
    const lastWithCoalesce = result.steps[result.steps.length - 1].freelistAfter.length;
    const lastWithout = resultNoCoalesce.steps[resultNoCoalesce.steps.length - 1].freelistAfter.length;
    expect(lastWithCoalesce).toBeLessThanOrEqual(lastWithout);
  });
});
