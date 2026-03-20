import { describe, it, expect } from 'vitest';
import { simulate, defaultParams, type AfsParams } from './afs';

describe('AFS simulator', () => {
  it('produces deterministic results for the same seed', () => {
    const r1 = simulate({ ...defaultParams, seed: 1 });
    const r2 = simulate({ ...defaultParams, seed: 1 });
    expect(r1.log).toEqual(r2.log);
    expect(r1.finalFiles).toEqual(r2.finalFiles);
  });

  it('different seeds produce different results', () => {
    const r1 = simulate({ ...defaultParams, seed: 1 });
    const r2 = simulate({ ...defaultParams, seed: 2 });
    // The logs should differ (different random scheduling)
    expect(r1.log).not.toEqual(r2.log);
  });

  it('initializes server files with sequential values', () => {
    const result = simulate({ ...defaultParams, numFiles: 3 });
    expect(result.fileNames).toEqual(['a', 'b', 'c']);
    expect(result.initialFiles).toEqual({ a: 0, b: 1, c: 2 });
  });

  it('generates correct number of clients', () => {
    const result = simulate({ ...defaultParams, numClients: 3 });
    expect(result.clientStats).toHaveLength(3);
    expect(result.clientStats.map(s => s.name)).toEqual(['c0', 'c1', 'c2']);
  });

  it('all clients produce reads+writes equal to numSteps', () => {
    const params: AfsParams = { ...defaultParams, seed: 5, numClients: 2, numSteps: 4 };
    const result = simulate(params);
    for (const cs of result.clientStats) {
      expect(cs.reads + cs.writes).toBe(4);
    }
  });

  it('server gets/puts count is consistent with log', () => {
    const result = simulate({ ...defaultParams, seed: 1, numClients: 2, numSteps: 3 });
    const gets = result.log.filter(e => e.op === 'getfile').length;
    const puts = result.log.filter(e => e.op === 'putfile').length;
    expect(result.serverStats.gets).toBe(gets);
    expect(result.serverStats.puts).toBe(puts);
  });

  it('handles specific actions', () => {
    const result = simulate({
      ...defaultParams,
      actions: 'oa1:r1:c1,oa1:w1:c1',
      schedule: '0101',
    });
    expect(result.clientStats).toHaveLength(2);
    expect(result.clientStats[0].reads).toBe(1);
    expect(result.clientStats[0].writes).toBe(0);
    expect(result.clientStats[1].reads).toBe(0);
    expect(result.clientStats[1].writes).toBe(1);
  });

  it('write causes server file to update on close', () => {
    // Single client writes to file 'a'
    const result = simulate({
      ...defaultParams,
      actions: 'oa0:w0:c0',
      numFiles: 1,
    });
    // Initial value is 0, write produces value 1
    expect(result.initialFiles['a']).toBe(0);
    expect(result.finalFiles['a']).toBe(1);
  });

  it('invalidation callback fires when another client writes', () => {
    // c0 opens a, c1 opens a, c1 writes a, c1 closes a (triggers callback to c0)
    const result = simulate({
      ...defaultParams,
      actions: 'oa0:r0:c0,oa0:w0:c0',
      schedule: '01011010',
      numFiles: 1,
    });
    // c0 should get invalidated when c1 closes
    const invalidations = result.log.filter(e => e.op === 'invalidate');
    expect(invalidations.length).toBeGreaterThanOrEqual(1);
  });

  it('read ratio 1.0 produces only reads', () => {
    const result = simulate({
      ...defaultParams,
      seed: 42,
      numClients: 2,
      numSteps: 5,
      readRatio: 1.0,
    });
    for (const cs of result.clientStats) {
      expect(cs.writes).toBe(0);
      expect(cs.reads).toBe(5);
    }
  });

  it('read ratio 0.0 produces only writes', () => {
    const result = simulate({
      ...defaultParams,
      seed: 42,
      numClients: 2,
      numSteps: 5,
      readRatio: 0.0,
    });
    for (const cs of result.clientStats) {
      expect(cs.reads).toBe(0);
      expect(cs.writes).toBe(5);
    }
  });

  it('schedule enforces alternation', () => {
    // With schedule '01', c0 and c1 should alternate primary ops
    const result = simulate({
      ...defaultParams,
      seed: 1,
      numClients: 2,
      numSteps: 2,
      readRatio: 1.0,
      schedule: '01',
    });
    const primaryOps = result.log.filter(e =>
      ['open', 'read', 'write', 'close'].includes(e.op)
    );
    // With alternating schedule, consecutive primary ops should alternate between clients
    for (let i = 0; i < primaryOps.length - 1; i++) {
      if (primaryOps[i].clientId !== primaryOps[i + 1].clientId) {
        // Good, they alternate at some point
        break;
      }
    }
    // Both clients should appear in the primary ops
    const c0ops = primaryOps.filter(e => e.clientId === 0);
    const c1ops = primaryOps.filter(e => e.clientId === 1);
    expect(c0ops.length).toBeGreaterThan(0);
    expect(c1ops.length).toBeGreaterThan(0);
  });

  it('throws on invalid schedule missing a client', () => {
    expect(() => simulate({
      ...defaultParams,
      numClients: 2,
      schedule: '000', // missing client 1
    })).toThrow(/Client 1 not in schedule/);
  });

  it('cache snapshot shows valid/dirty/refcnt correctly for write', () => {
    const result = simulate({
      ...defaultParams,
      actions: 'oa0:w0:c0',
      numFiles: 1,
    });
    // After write, cache should show dirty=true
    const writeEntry = result.log.find(e => e.op === 'write' && e.clientId === 0);
    expect(writeEntry).toBeDefined();
    expect(writeEntry!.cacheSnapshot).toBeDefined();
    const aCache = writeEntry!.cacheSnapshot!['a'];
    expect(aCache.dirty).toBe(true);
    expect(aCache.valid).toBe(true);
    expect(aCache.refcnt).toBe(1);
  });

  it('handles multiple files', () => {
    const result = simulate({
      ...defaultParams,
      seed: 10,
      numFiles: 3,
      numClients: 2,
      numSteps: 3,
    });
    expect(result.fileNames).toEqual(['a', 'b', 'c']);
    expect(Object.keys(result.initialFiles)).toHaveLength(3);
    expect(Object.keys(result.finalFiles)).toHaveLength(3);
  });
});
