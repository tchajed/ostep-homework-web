import { describe, it, expect } from 'vitest';
import {
  Scheduler,
  runSimulation,
  SCHED_SWITCH_ON_IO,
  SCHED_SWITCH_ON_END,
  IO_RUN_LATER,
  IO_RUN_IMMEDIATE,
  DO_COMPUTE,
  DO_IO,
  DO_IO_DONE,
  defaultOptions,
} from './process-run';

describe('Scheduler with explicit programs', () => {
  it('runs a single all-CPU process', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_IO, IO_RUN_LATER, 5);
    sched.loadProgram('c3');
    const result = sched.run();

    expect(result.stats.totalTime).toBe(3);
    expect(result.stats.cpuBusy).toBe(3);
    expect(result.stats.ioBusy).toBe(0);
    expect(result.trace.length).toBe(3);
    expect(result.trace.every((r) => r.processStates[0] === 'RUN:cpu')).toBe(true);
  });

  it('runs a single IO process', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_IO, IO_RUN_LATER, 5);
    sched.loadProgram('i');
    const result = sched.run();

    // IO instruction, then 5 ticks blocked, then io_done
    expect(result.stats.totalTime).toBe(7);
    expect(result.trace[0].processStates[0]).toBe('RUN:io');
    expect(result.trace[1].processStates[0]).toBe('BLOCKED');
    expect(result.trace[5].processStates[0]).toBe('BLOCKED');
    expect(result.trace[6].processStates[0]).toBe('RUN:io_done');
    expect(result.trace[6].ioDone).toBe(true);
  });

  it('runs c3,i,c2 program (matches Python output)', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_IO, IO_RUN_LATER, 5);
    sched.loadProgram('c3,i,c2');
    const result = sched.run();

    expect(result.stats.totalTime).toBe(12);
    expect(result.stats.cpuBusy).toBe(7);
    expect(result.stats.ioBusy).toBe(5);

    // time 1-3: RUN:cpu
    expect(result.trace[0].processStates[0]).toBe('RUN:cpu');
    expect(result.trace[1].processStates[0]).toBe('RUN:cpu');
    expect(result.trace[2].processStates[0]).toBe('RUN:cpu');
    // time 4: RUN:io
    expect(result.trace[3].processStates[0]).toBe('RUN:io');
    // time 5-9: BLOCKED
    for (let i = 4; i <= 8; i++) {
      expect(result.trace[i].processStates[0]).toBe('BLOCKED');
    }
    // time 10: RUN:io_done (with ioDone marker)
    expect(result.trace[9].processStates[0]).toBe('RUN:io_done');
    expect(result.trace[9].ioDone).toBe(true);
    // time 11-12: RUN:cpu
    expect(result.trace[10].processStates[0]).toBe('RUN:cpu');
    expect(result.trace[11].processStates[0]).toBe('RUN:cpu');
  });

  it('runs two all-CPU processes', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_IO, IO_RUN_LATER, 5);
    sched.loadProgram('c5');
    sched.loadProgram('c5');
    const result = sched.run();

    // With SWITCH_ON_IO, first process runs to completion, then second
    expect(result.stats.totalTime).toBe(10);
    expect(result.stats.cpuBusy).toBe(10);
    for (let i = 0; i < 5; i++) {
      expect(result.trace[i].processStates[0]).toBe('RUN:cpu');
      expect(result.trace[i].processStates[1]).toBe('READY');
    }
    for (let i = 5; i < 10; i++) {
      expect(result.trace[i].processStates[0]).toBe('DONE');
      expect(result.trace[i].processStates[1]).toBe('RUN:cpu');
    }
  });
});

describe('Scheduler switching behavior', () => {
  it('SWITCH_ON_IO switches to next process on IO', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_IO, IO_RUN_LATER, 5);
    sched.loadProgram('i');
    sched.loadProgram('c3');
    const result = sched.run();

    // Process 0 does IO, switches to process 1 which runs CPU
    expect(result.trace[0].processStates[0]).toBe('RUN:io');
    expect(result.trace[0].processStates[1]).toBe('READY');
    // Process 1 should run next
    expect(result.trace[1].processStates[1]).toBe('RUN:cpu');
    expect(result.trace[1].processStates[0]).toBe('BLOCKED');
  });

  it('SWITCH_ON_END does not switch on IO', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_END, IO_RUN_LATER, 5);
    sched.loadProgram('i');
    sched.loadProgram('c3');
    const result = sched.run();

    // Process 0 does IO but doesn't switch - process 0 stays current (blocked)
    expect(result.trace[0].processStates[0]).toBe('RUN:io');
    // Process 0 is blocked, process 1 stays READY (no switch)
    expect(result.trace[1].processStates[0]).toBe('BLOCKED');
    expect(result.trace[1].processStates[1]).toBe('READY');
  });
});

describe('IO done behavior', () => {
  it('IO_RUN_IMMEDIATE preempts current process', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_IO, IO_RUN_IMMEDIATE, 2);
    sched.loadProgram('i');
    sched.loadProgram('c5');
    const result = sched.run();

    // Process 0 does IO (tick 1), switches to process 1
    expect(result.trace[0].processStates[0]).toBe('RUN:io');
    // Process 1 runs for 2 ticks
    expect(result.trace[1].processStates[1]).toBe('RUN:cpu');
    expect(result.trace[2].processStates[1]).toBe('RUN:cpu');
    // Tick 4: IO completes (2+1=3 -> finish at tick 4), process 0 runs immediately
    expect(result.trace[3].ioDone).toBe(true);
    expect(result.trace[3].processStates[0]).toBe('RUN:io_done');
  });

  it('IO_RUN_LATER does not preempt', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_IO, IO_RUN_LATER, 2);
    sched.loadProgram('i');
    sched.loadProgram('c5');
    const result = sched.run();

    // Process 0 does IO (tick 1), switches to process 1
    expect(result.trace[0].processStates[0]).toBe('RUN:io');
    // Process 1 keeps running
    expect(result.trace[1].processStates[1]).toBe('RUN:cpu');
    expect(result.trace[2].processStates[1]).toBe('RUN:cpu');
    // Tick 4: IO completes, but process 1 keeps running (RUN_LATER)
    expect(result.trace[3].ioDone).toBe(true);
    expect(result.trace[3].processStates[1]).toBe('RUN:cpu');
  });
});

describe('IO length', () => {
  it('respects custom IO length', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_IO, IO_RUN_LATER, 2);
    sched.loadProgram('i');
    const result = sched.run();

    // IO at tick 1, blocked for ticks 2-3 (length=2), io_done at tick 4
    expect(result.stats.totalTime).toBe(4);
    expect(result.trace[0].processStates[0]).toBe('RUN:io');
    expect(result.trace[1].processStates[0]).toBe('BLOCKED');
    expect(result.trace[2].processStates[0]).toBe('BLOCKED');
    expect(result.trace[3].processStates[0]).toBe('RUN:io_done');
  });
});

describe('runSimulation with process list', () => {
  it('generates processes from process list with seed', () => {
    const result = runSimulation({
      ...defaultOptions,
      seed: 0,
      processList: '3:100,3:100',
    });

    // 100% CPU chance means all CPU instructions
    expect(result.stats.totalTime).toBe(6);
    expect(result.stats.cpuBusy).toBe(6);
    expect(result.stats.ioBusy).toBe(0);
  });

  it('generates IO-heavy processes with 0% CPU chance', () => {
    const result = runSimulation({
      ...defaultOptions,
      seed: 0,
      processList: '3:0',
    });

    // 0% CPU chance: all 3 instructions are IO
    // Each IO expands to [io, io_done], so 3 IOs total
    expect(result.processes[0].instructions.filter((i) => i === DO_IO).length).toBe(3);
    expect(result.processes[0].instructions.filter((i) => i === DO_IO_DONE).length).toBe(3);
  });

  it('uses seed for deterministic output', () => {
    const r1 = runSimulation({ ...defaultOptions, seed: 42, processList: '5:50' });
    const r2 = runSimulation({ ...defaultOptions, seed: 42, processList: '5:50' });
    expect(r1.trace).toEqual(r2.trace);
    expect(r1.stats).toEqual(r2.stats);
  });

  it('different seeds produce different results', () => {
    const r1 = runSimulation({ ...defaultOptions, seed: 1, processList: '10:50,10:50' });
    const r2 = runSimulation({ ...defaultOptions, seed: 100, processList: '10:50,10:50' });
    // Very unlikely to be identical with different seeds and enough instructions
    expect(
      r1.stats.totalTime !== r2.stats.totalTime ||
      r1.stats.cpuBusy !== r2.stats.cpuBusy,
    ).toBe(true);
  });
});

describe('runSimulation with explicit program', () => {
  it('uses program option over process list', () => {
    const result = runSimulation({
      ...defaultOptions,
      program: 'c3,i,c2',
    });

    expect(result.stats.totalTime).toBe(12);
    expect(result.stats.cpuBusy).toBe(7);
    expect(result.stats.ioBusy).toBe(5);
  });

  it('handles multiple programs separated by colon', () => {
    const result = runSimulation({
      ...defaultOptions,
      program: 'c3:c3',
    });

    expect(result.stats.totalTime).toBe(6);
    expect(result.processes.length).toBe(2);
  });
});

describe('edge cases', () => {
  it('handles empty scheduler', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_IO, IO_RUN_LATER, 5);
    const result = sched.run();
    expect(result.trace.length).toBe(0);
    expect(result.stats.totalTime).toBe(0);
  });

  it('process instructions snapshot is independent of execution', () => {
    const result = runSimulation({
      ...defaultOptions,
      program: 'c3',
    });
    // The processes array should show original instructions
    expect(result.processes[0].instructions).toEqual([
      DO_COMPUTE,
      DO_COMPUTE,
      DO_COMPUTE,
    ]);
  });

  it('tracks IO count in trace rows', () => {
    const sched = new Scheduler(SCHED_SWITCH_ON_IO, IO_RUN_LATER, 3);
    sched.loadProgram('i');
    sched.loadProgram('i');
    const result = sched.run();

    // At some point both processes have IO in flight
    const maxIOs = Math.max(...result.trace.map((r) => r.numIOs));
    expect(maxIOs).toBeGreaterThanOrEqual(1);
  });
});
