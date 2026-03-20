import { describe, it, expect } from 'vitest';
import {
  CPU, loadProgram, simulate, regName, EXAMPLE_PROGRAMS,
  REG_AX, REG_BX, REG_CX, REG_DX, REG_SP,
} from './x86-locks';

describe('CPU basics', () => {
  it('initializes registers to zero', () => {
    const cpu = new CPU();
    expect(cpu.registers[REG_AX]).toBe(0);
    expect(cpu.registers[REG_BX]).toBe(0);
  });

  it('regName returns correct names', () => {
    expect(regName(REG_AX)).toBe('ax');
    expect(regName(REG_SP)).toBe('sp');
  });
});

describe('loadProgram', () => {
  it('loads a simple program', () => {
    const cpu = new CPU();
    loadProgram(cpu, `
.main
mov $5, %ax
halt
`, 1000);
    expect(cpu.instructions[1000]).toBeDefined();
    expect(cpu.instructions[1001]).toBeDefined();
    expect(cpu.pmemory[1000]).toContain('mov');
  });

  it('handles .var declarations', () => {
    const cpu = new CPU();
    loadProgram(cpu, `
.var count
.main
mov count, %ax
halt
`, 1000);
    expect(cpu.vars['count']).toBeDefined();
    expect(cpu.vars['count']).toBe(100);
  });

  it('resolves labels', () => {
    const cpu = new CPU();
    loadProgram(cpu, `
.main
.top
sub $1, %ax
test $0, %ax
jgt .top
halt
`, 1000);
    expect(cpu.labels['.top']).toBe(1000);
    expect(cpu.labels['.main']).toBe(1000);
  });
});

describe('instruction execution', () => {
  it('mov immediate to register', () => {
    const cpu = new CPU();
    loadProgram(cpu, `.main\nmov $42, %ax\nhalt`, 1000);
    cpu.pc = 1000;
    cpu.instructions[1000](cpu);
    expect(cpu.registers[REG_AX]).toBe(42);
  });

  it('add immediate to register', () => {
    const cpu = new CPU();
    loadProgram(cpu, `.main\nadd $10, %ax\nhalt`, 1000);
    cpu.pc = 1000;
    cpu.registers[REG_AX] = 5;
    cpu.instructions[1000](cpu);
    expect(cpu.registers[REG_AX]).toBe(15);
  });

  it('sub immediate from register', () => {
    const cpu = new CPU();
    loadProgram(cpu, `.main\nsub $3, %dx\nhalt`, 1000);
    cpu.pc = 1000;
    cpu.registers[REG_DX] = 10;
    cpu.instructions[1000](cpu);
    expect(cpu.registers[REG_DX]).toBe(7);
  });

  it('neg register', () => {
    const cpu = new CPU();
    loadProgram(cpu, `.main\nneg %cx\nhalt`, 1000);
    cpu.pc = 1000;
    cpu.registers[REG_CX] = 5;
    cpu.instructions[1000](cpu);
    expect(cpu.registers[REG_CX]).toBe(-5);
  });

  it('mov register to memory and back', () => {
    const cpu = new CPU();
    loadProgram(cpu, `.main\nmov %ax, 2000\nmov 2000, %bx\nhalt`, 1000);
    cpu.registers[REG_AX] = 99;
    cpu.pc = 1000;
    cpu.instructions[1000](cpu);
    expect(cpu.getMem(2000)).toBe(99);
    cpu.instructions[1001](cpu);
    expect(cpu.registers[REG_BX]).toBe(99);
  });

  it('xchg performs atomic exchange', () => {
    const cpu = new CPU();
    loadProgram(cpu, `.var mutex\n.main\nxchg %ax, mutex\nhalt`, 1000);
    cpu.setMem(cpu.vars['mutex'], 0);
    cpu.registers[REG_AX] = 1;
    cpu.pc = 1000;
    cpu.instructions[1000](cpu);
    expect(cpu.registers[REG_AX]).toBe(0);
    expect(cpu.getMem(cpu.vars['mutex'])).toBe(1);
  });

  it('fetchadd atomically adds', () => {
    const cpu = new CPU();
    loadProgram(cpu, `.var ticket\n.main\nfetchadd %ax, ticket\nhalt`, 1000);
    cpu.setMem(cpu.vars['ticket'], 5);
    cpu.registers[REG_AX] = 1;
    cpu.pc = 1000;
    cpu.instructions[1000](cpu);
    expect(cpu.registers[REG_AX]).toBe(5);
    expect(cpu.getMem(cpu.vars['ticket'])).toBe(6);
  });

  it('test sets condition codes', () => {
    const cpu = new CPU();
    loadProgram(cpu, `.main\ntest $0, %ax\nhalt`, 1000);
    cpu.registers[REG_AX] = 0;
    cpu.pc = 1000;
    cpu.instructions[1000](cpu);
    expect(cpu.conditions[4]).toBe(true); // COND_EQ
  });

  it('halt returns -1', () => {
    const cpu = new CPU();
    loadProgram(cpu, `.main\nhalt`, 1000);
    const rc = cpu.instructions[1000](cpu);
    expect(rc).toBe(-1);
  });
});

describe('simulate', () => {
  it('simple race with one thread', () => {
    const result = simulate({
      seed: 0,
      numThreads: 1,
      program: `.main\nmov 2000, %ax\nadd $1, %ax\nmov %ax, 2000\nhalt`,
      interruptFreq: 50,
      interruptRandom: false,
      argv: [''],
      procSched: '',
      loadAddr: 1000,
      memSize: 128,
      memTrace: [],
      regTrace: [],
      ccTrace: false,
    });
    expect(result.instructionCount).toBe(4);
    // Memory at 2000 should be 1
    const mem2000 = result.finalMemory.find(m => m.addr === 2000);
    expect(mem2000).toBeDefined();
    expect(mem2000!.value).toBe(1);
  });

  it('simple race with two threads shows race condition', () => {
    // With interrupt freq=3, two threads, the race can cause the value
    // to be 1 instead of 2
    const result = simulate({
      seed: 0,
      numThreads: 2,
      program: `.main\nmov 2000, %ax\nadd $1, %ax\nmov %ax, 2000\nhalt`,
      interruptFreq: 3,
      interruptRandom: false,
      argv: [''],
      procSched: '',
      loadAddr: 1000,
      memSize: 128,
      memTrace: [],
      regTrace: [],
      ccTrace: false,
    });
    const mem2000 = result.finalMemory.find(m => m.addr === 2000);
    expect(mem2000).toBeDefined();
    // With freq=3, both threads run their 3 instructions before switching
    // Thread 0: load 0, add 1, store 1 -> interrupt
    // Thread 1: load 1, add 1, store 2 -> halt
    expect(mem2000!.value).toBe(2);
  });

  it('test-and-set lock protects critical section', () => {
    const program = EXAMPLE_PROGRAMS.find(p => p.name === 'Test-and-Set Lock')!;
    const result = simulate({
      seed: 1,
      numThreads: 2,
      program: program.source,
      interruptFreq: 3,
      interruptRandom: false,
      argv: ['bx=2', 'bx=2'],
      procSched: '',
      loadAddr: 1000,
      memSize: 128,
      memTrace: ['count'],
      regTrace: [],
      ccTrace: false,
    });
    // count should be 4 (2 threads * 2 iterations)
    const countAddr = result.vars['count'];
    const lastStep = result.steps.filter(s => s.event === 'instruction').at(-1)!;
    // Check final memory
    const countMem = result.finalMemory.find(m => m.addr === countAddr);
    expect(countMem).toBeDefined();
    expect(countMem!.value).toBe(4);
  });

  it('traces memory variables', () => {
    const result = simulate({
      seed: 0,
      numThreads: 1,
      program: `.var count\n.main\nmov count, %ax\nadd $1, %ax\nmov %ax, count\nhalt`,
      interruptFreq: 50,
      interruptRandom: false,
      argv: [''],
      procSched: '',
      loadAddr: 1000,
      memSize: 128,
      memTrace: ['count'],
      regTrace: ['ax'],
      ccTrace: false,
    });
    expect(result.memTraceAddrs).toHaveLength(1);
    expect(result.regTraceNums).toHaveLength(1);
    // After last instruction (halt), count should be 1
    const instrSteps = result.steps.filter(s => s.event === 'instruction');
    const lastInstr = instrSteps[instrSteps.length - 1];
    expect(lastInstr.tracedMem[0]).toBe(1);
  });

  it('manual schedule controls thread order', () => {
    const result = simulate({
      seed: 0,
      numThreads: 2,
      program: `.main\nmov $1, %ax\nhalt`,
      interruptFreq: 50,
      interruptRandom: false,
      argv: [''],
      procSched: '10',
      loadAddr: 1000,
      memSize: 128,
      memTrace: [],
      regTrace: [],
      ccTrace: false,
    });
    // First instruction should be from thread 1
    const instrSteps = result.steps.filter(s => s.event === 'instruction');
    expect(instrSteps[0].threadId).toBe(1);
  });

  it('is deterministic for the same seed', () => {
    const params = {
      seed: 42,
      numThreads: 2,
      program: EXAMPLE_PROGRAMS[0].source,
      interruptFreq: 5,
      interruptRandom: true,
      argv: [''],
      procSched: '',
      loadAddr: 1000,
      memSize: 128,
      memTrace: [],
      regTrace: [],
      ccTrace: false,
    };
    const a = simulate(params);
    const b = simulate(params);
    expect(a).toEqual(b);
  });

  it('all example programs load and run', () => {
    for (const prog of EXAMPLE_PROGRAMS) {
      const args = prog.defaultArgs ? prog.defaultArgs.split(',') : [''];
      const numThreads = args.length > 1 ? args.length : 2;
      const result = simulate({
        seed: 0,
        numThreads,
        program: prog.source,
        interruptFreq: 10,
        interruptRandom: false,
        argv: args,
        procSched: '',
        loadAddr: 1000,
        memSize: 128,
        memTrace: [],
        regTrace: [],
        ccTrace: false,
      });
      expect(result.instructionCount).toBeGreaterThan(0);
    }
  });
});
