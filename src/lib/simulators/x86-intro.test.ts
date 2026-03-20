import { describe, it, expect } from 'vitest';
import { assemble, simulate, defaultParams, type X86Params } from './x86-intro';

describe('x86-intro assembler', () => {
  it('assembles a simple program', () => {
    const prog = assemble(`.main
mov $1, %ax
halt`, 1000);
    expect(prog.instructions.size).toBe(2);
    expect(prog.printable.get(1000)).toBe('mov $1, %ax');
    expect(prog.printable.get(1001)).toBe('halt');
  });

  it('resolves labels correctly', () => {
    const prog = assemble(`.main
.top
sub $1, %ax
test $0, %ax
jgt .top
halt`, 1000);
    // .main and .top both point to PC 1000 (first instruction)
    // sub @ 1000, test @ 1001, jgt @ 1002, halt @ 1003
    expect(prog.instructions.size).toBe(4);
    expect(prog.printable.get(1000)).toBe('sub $1, %ax');
  });

  it('handles .var declarations', () => {
    const prog = assemble(`.var x
.main
mov x, %ax
halt`, 1000);
    expect(prog.vars.get('x')).toBe(100);
    expect(prog.instructions.size).toBe(2);
  });

  it('handles comments and blank lines', () => {
    const prog = assemble(`
# this is a comment
.main
mov $5, %bx  # inline comment

halt
`, 1000);
    expect(prog.instructions.size).toBe(2);
  });

  it('throws on unknown opcode', () => {
    expect(() => assemble(`.main\nfoo %ax`, 1000)).toThrow('illegal opcode');
  });
});

describe('x86-intro simulator', () => {
  it('runs simple increment to completion', () => {
    const result = simulate({
      ...defaultParams,
      program: `.main
mov $0, %ax
add $1, %ax
halt`,
      numThreads: 1,
      intFreq: 100,
      memTrace: '',
      regTrace: 'ax',
    });
    // Should have 3 instruction entries
    const instrs = result.trace.filter(t => t.event === 'instruction');
    expect(instrs).toHaveLength(3);
    // After add, ax should be 1
    expect(instrs[1].registers.ax).toBe(1);
    expect(result.instructionCount).toBe(3);
  });

  it('handles two threads with context switching', () => {
    const result = simulate({
      ...defaultParams,
      program: `.main
mov 2000, %ax
add $1, %ax
mov %ax, 2000
halt`,
      numThreads: 2,
      intFreq: 3,
      memTrace: '2000',
      regTrace: 'ax',
    });
    // Both threads should complete: look for halt_switch and final halt
    const halts = result.trace.filter(
      t => t.event === 'instruction' && t.instruction === 'halt',
    );
    expect(halts).toHaveLength(2);
  });

  it('simple race produces correct value with no interleaving', () => {
    // With intFreq > program length, no interrupts mid-thread
    const result = simulate({
      ...defaultParams,
      program: `.main
mov 2000, %ax
add $1, %ax
mov %ax, 2000
halt`,
      numThreads: 2,
      intFreq: 100,
      memTrace: '2000',
    });
    // Each thread runs to completion without interrupt
    // Thread 0: reads 0, writes 1. Thread 1: reads 1, writes 2.
    const lastInstr = result.trace.filter(t => t.event === 'instruction').at(-1)!;
    expect(lastInstr.tracedMemory.get('2000')).toBe(2);
  });

  it('simple race with interleaving at every 3 instructions', () => {
    const result = simulate({
      ...defaultParams,
      program: `.main
mov 2000, %ax
add $1, %ax
mov %ax, 2000
halt`,
      numThreads: 2,
      intFreq: 3,
      memTrace: '2000',
    });
    // With interrupt every 3 instructions:
    // T0: mov(0->ax), add(1), mov(ax->2000=1) -> interrupt
    // T1: mov(1->ax), add(2), mov(ax->2000=2) -> interrupt
    // T0: halt -> switch
    // T1: halt
    // Final value should be 2
    const lastInstr = result.trace.filter(t => t.event === 'instruction').at(-1)!;
    expect(lastInstr.tracedMemory.get('2000')).toBe(2);
  });

  it('race condition: interleaving produces value 1 instead of 2', () => {
    // Interrupt after 2 instructions so thread 0 reads but hasn't written back
    const result = simulate({
      ...defaultParams,
      program: `.main
mov 2000, %ax
add $1, %ax
mov %ax, 2000
halt`,
      numThreads: 2,
      intFreq: 2,
      memTrace: '2000',
    });
    // T0: mov(0->ax), add(1) -> interrupt (hasn't written yet)
    // T1: mov(0->ax, still 0!), add(1) -> interrupt
    // T0: mov(ax=1->2000), halt -> switch
    // T1: mov(ax=1->2000), halt
    // Final: 1 (lost update!)
    const lastInstr = result.trace.filter(t => t.event === 'instruction').at(-1)!;
    expect(lastInstr.tracedMemory.get('2000')).toBe(1);
  });

  it('argv sets per-thread registers', () => {
    const result = simulate({
      ...defaultParams,
      program: `.main
halt`,
      numThreads: 2,
      argv: 'ax=5,ax=10',
      intFreq: 100,
      regTrace: 'ax',
    });
    // Thread 0 starts with ax=5
    const t0instr = result.trace.filter(t => t.event === 'instruction' && t.tid === 0);
    // ax should be 5 (set before running)
    expect(t0instr[0].registers.ax).toBe(5);
  });

  it('looping program decrements correctly', () => {
    const result = simulate({
      ...defaultParams,
      program: `.main
.top
sub $1, %dx
test $0, %dx
jgte .top
halt`,
      numThreads: 1,
      argv: 'dx=3',
      intFreq: 100,
      regTrace: 'dx',
    });
    // dx starts at 3, loops: 3->2->1->0->-1, then exits
    const instrs = result.trace.filter(t => t.event === 'instruction');
    const lastInstr = instrs.at(-1)!;
    expect(lastInstr.registers.dx).toBe(-1);
  });

  it('deterministic for same seed', () => {
    const params: X86Params = {
      ...defaultParams,
      seed: 42,
      intRand: true,
      intFreq: 5,
    };
    const r1 = simulate(params);
    const r2 = simulate(params);
    expect(r1.trace.length).toBe(r2.trace.length);
    for (let i = 0; i < r1.trace.length; i++) {
      expect(r1.trace[i].tid).toBe(r2.trace[i].tid);
      expect(r1.trace[i].pc).toBe(r2.trace[i].pc);
      expect(r1.trace[i].registers).toEqual(r2.trace[i].registers);
    }
  });

  it('xchg instruction works for spinlock pattern', () => {
    const result = simulate({
      ...defaultParams,
      program: `.main
mov $1, %ax
xchg %ax, 2000
halt`,
      numThreads: 1,
      intFreq: 100,
      memTrace: '2000',
      regTrace: 'ax',
    });
    const instrs = result.trace.filter(t => t.event === 'instruction');
    // After xchg: ax should have old mem[2000] (0), mem[2000] should be 1
    expect(instrs[1].registers.ax).toBe(0); // old value from memory
    expect(instrs[1].tracedMemory.get('2000')).toBe(1); // new value written
  });

  it('call and ret work correctly', () => {
    const result = simulate({
      ...defaultParams,
      program: `.main
call .func
halt
.func
mov $42, %ax
ret`,
      numThreads: 1,
      intFreq: 100,
      regTrace: 'ax',
    });
    const instrs = result.trace.filter(t => t.event === 'instruction');
    // call -> mov $42 -> ret -> halt
    expect(instrs).toHaveLength(4);
    expect(instrs[1].registers.ax).toBe(42);
  });

  it('fetchadd instruction works', () => {
    const result = simulate({
      ...defaultParams,
      program: `.main
mov $1, %ax
fetchadd %ax, 2000
halt`,
      numThreads: 1,
      intFreq: 100,
      memTrace: '2000',
      regTrace: 'ax',
    });
    const instrs = result.trace.filter(t => t.event === 'instruction');
    // fetchadd: old = mem[2000] (0), mem[2000] = 0 + 1 = 1, ax = old = 0
    expect(instrs[1].registers.ax).toBe(0);
    expect(instrs[1].tracedMemory.get('2000')).toBe(1);
  });

  it('variable-based memory access works', () => {
    const result = simulate({
      ...defaultParams,
      program: `.var counter
.main
mov counter, %ax
add $1, %ax
mov %ax, counter
halt`,
      numThreads: 1,
      intFreq: 100,
      memTrace: 'counter',
      regTrace: 'ax',
    });
    const instrs = result.trace.filter(t => t.event === 'instruction');
    expect(instrs[2].tracedMemory.get('counter')).toBe(1);
  });
});
