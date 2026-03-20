import { Random } from '../random';

// ── Register and condition constants ──────────────────────────────────────

export const REG_ZERO = 0;
export const REG_AX = 1;
export const REG_BX = 2;
export const REG_CX = 3;
export const REG_DX = 4;
export const REG_EX = 5;
export const REG_FX = 6;
export const REG_SP = 7;
export const REG_BP = 8;

export const ALL_REGS = [REG_ZERO, REG_AX, REG_BX, REG_CX, REG_DX, REG_EX, REG_FX, REG_SP, REG_BP] as const;

export const COND_GT = 0;
export const COND_GTE = 1;
export const COND_LT = 2;
export const COND_LTE = 3;
export const COND_EQ = 4;
export const COND_NEQ = 5;

export const ALL_CONDS = [COND_GTE, COND_GT, COND_LTE, COND_LT, COND_NEQ, COND_EQ] as const;

const REG_NAME_MAP: Record<string, number> = {
  zero: REG_ZERO,
  ax: REG_AX,
  bx: REG_BX,
  cx: REG_CX,
  dx: REG_DX,
  ex: REG_EX,
  fx: REG_FX,
  sp: REG_SP,
  bp: REG_BP,
};

const REG_NUM_TO_NAME: Record<number, string> = {};
for (const [name, num] of Object.entries(REG_NAME_MAP)) {
  REG_NUM_TO_NAME[num] = name;
}

export function regName(num: number): string {
  return REG_NUM_TO_NAME[num] ?? '??';
}

// ── Instruction types ─────────────────────────────────────────────────────

type ArgType = 'TYPE_IMMEDIATE' | 'TYPE_REGISTER' | 'TYPE_MEMORY' | 'TYPE_LABEL';

/** Parsed memory operand: value + regs[reg1] + scale * regs[reg2] */
interface MemArg {
  value: number;
  reg1: number;
  reg2: number;
  scale: number;
}

/**
 * Each instruction is a function that operates on a CPU and returns:
 *   0  = normal
 *  -1  = halt
 *  -2  = yield
 */
type Instruction = (cpu: CPU) => number;

// ── CPU class ─────────────────────────────────────────────────────────────

export class CPU {
  pc = 0;
  registers: Record<number, number> = {};
  conditions: Record<number, boolean> = {};
  memory: Record<number, number> = {};

  /** Compiled instructions keyed by address */
  instructions: Record<number, Instruction> = {};
  /** Printable source for each instruction address */
  pmemory: Record<number, string> = {};

  /** Named variables -> memory address */
  vars: Record<string, number> = {};
  /** Label name -> PC address */
  labels: Record<string, number> = {};

  constructor() {
    this.initRegisters();
    this.initConditions();
  }

  initRegisters(): void {
    for (const r of ALL_REGS) this.registers[r] = 0;
  }

  initConditions(): void {
    for (const c of ALL_CONDS) this.conditions[c] = false;
  }

  // ── Memory helpers ────────────────────────────────────────────────

  memAddr(m: MemArg): number {
    return m.value + this.registers[m.reg1] + m.scale * this.registers[m.reg2];
  }

  getMem(addr: number): number {
    return this.memory[addr] ?? 0;
  }

  setMem(addr: number, val: number): void {
    this.memory[addr] = val;
  }

  // ── Instruction implementations ───────────────────────────────────

  // MOV family
  static moveItoR(src: number, dst: number): Instruction {
    return (cpu) => { cpu.registers[dst] = src; return 0; };
  }
  static moveItoM(src: number, m: MemArg): Instruction {
    return (cpu) => { cpu.setMem(cpu.memAddr(m), src); return 0; };
  }
  static moveMtoR(m: MemArg, dst: number): Instruction {
    return (cpu) => { cpu.registers[dst] = cpu.getMem(cpu.memAddr(m)); return 0; };
  }
  static moveRtoM(src: number, m: MemArg): Instruction {
    return (cpu) => { cpu.setMem(cpu.memAddr(m), cpu.registers[src]); return 0; };
  }
  static moveRtoR(src: number, dst: number): Instruction {
    return (cpu) => { cpu.registers[dst] = cpu.registers[src]; return 0; };
  }

  // LEA
  static leaMtoR(m: MemArg, dst: number): Instruction {
    return (cpu) => { cpu.registers[dst] = cpu.memAddr(m); return 0; };
  }

  // Arithmetic
  static addItoR(src: number, dst: number): Instruction {
    return (cpu) => { cpu.registers[dst] += src; return 0; };
  }
  static addRtoR(src: number, dst: number): Instruction {
    return (cpu) => { cpu.registers[dst] += cpu.registers[src]; return 0; };
  }
  static subItoR(src: number, dst: number): Instruction {
    return (cpu) => { cpu.registers[dst] -= src; return 0; };
  }
  static subRtoR(src: number, dst: number): Instruction {
    return (cpu) => { cpu.registers[dst] -= cpu.registers[src]; return 0; };
  }
  static mulItoR(src: number, dst: number): Instruction {
    return (cpu) => { cpu.registers[dst] *= src; return 0; };
  }
  static mulRtoR(src: number, dst: number): Instruction {
    return (cpu) => { cpu.registers[dst] *= cpu.registers[src]; return 0; };
  }
  static negR(reg: number): Instruction {
    return (cpu) => { cpu.registers[reg] = -cpu.registers[reg]; return 0; };
  }

  // Atomic operations
  static atomicExchange(src: number, m: MemArg): Instruction {
    return (cpu) => {
      const addr = cpu.memAddr(m);
      const old = cpu.getMem(addr);
      cpu.setMem(addr, cpu.registers[src]);
      cpu.registers[src] = old;
      return 0;
    };
  }
  static fetchAdd(src: number, m: MemArg): Instruction {
    return (cpu) => {
      const addr = cpu.memAddr(m);
      const old = cpu.getMem(addr);
      cpu.setMem(addr, old + cpu.registers[src]);
      cpu.registers[src] = old;
      return 0;
    };
  }

  // Test (sets condition codes)
  private testAll(src: number, dst: number): void {
    this.initConditions();
    this.conditions[COND_GT] = dst > src;
    this.conditions[COND_GTE] = dst >= src;
    this.conditions[COND_LT] = dst < src;
    this.conditions[COND_LTE] = dst <= src;
    this.conditions[COND_EQ] = dst === src;
    this.conditions[COND_NEQ] = dst !== src;
  }

  static testIR(src: number, dst: number): Instruction {
    return (cpu) => { cpu.testAll(src, cpu.registers[dst]); return 0; };
  }
  static testRI(src: number, dst: number): Instruction {
    return (cpu) => { cpu.testAll(cpu.registers[src], dst); return 0; };
  }
  static testRR(src: number, dst: number): Instruction {
    return (cpu) => { cpu.testAll(cpu.registers[src], cpu.registers[dst]); return 0; };
  }

  // Jumps
  static jump(targ: number): Instruction {
    return (cpu) => { cpu.pc = targ; return 0; };
  }
  static jumpNotEqual(targ: number): Instruction {
    return (cpu) => { if (cpu.conditions[COND_NEQ]) cpu.pc = targ; return 0; };
  }
  static jumpEqual(targ: number): Instruction {
    return (cpu) => { if (cpu.conditions[COND_EQ]) cpu.pc = targ; return 0; };
  }
  static jumpLessThan(targ: number): Instruction {
    return (cpu) => { if (cpu.conditions[COND_LT]) cpu.pc = targ; return 0; };
  }
  static jumpLessThanOrEqual(targ: number): Instruction {
    return (cpu) => { if (cpu.conditions[COND_LTE]) cpu.pc = targ; return 0; };
  }
  static jumpGreaterThan(targ: number): Instruction {
    return (cpu) => { if (cpu.conditions[COND_GT]) cpu.pc = targ; return 0; };
  }
  static jumpGreaterThanOrEqual(targ: number): Instruction {
    return (cpu) => { if (cpu.conditions[COND_GTE]) cpu.pc = targ; return 0; };
  }

  // Call / Ret
  static call(targ: number): Instruction {
    return (cpu) => {
      cpu.registers[REG_SP] -= 4;
      cpu.setMem(cpu.registers[REG_SP], cpu.pc);
      cpu.pc = targ;
      return 0;
    };
  }
  static ret(): Instruction {
    return (cpu) => {
      cpu.pc = cpu.getMem(cpu.registers[REG_SP]);
      cpu.registers[REG_SP] += 4;
      return 0;
    };
  }

  // Stack
  static pushR(reg: number): Instruction {
    return (cpu) => {
      cpu.registers[REG_SP] -= 4;
      cpu.setMem(cpu.registers[REG_SP], cpu.registers[reg]);
      return 0;
    };
  }
  static pushM(m: MemArg): Instruction {
    return (cpu) => {
      cpu.registers[REG_SP] -= 4;
      cpu.setMem(cpu.registers[REG_SP], cpu.memAddr(m));
      return 0;
    };
  }
  static pop(): Instruction {
    return (cpu) => { cpu.registers[REG_SP] += 4; return 0; };
  }
  static popR(dst: number): Instruction {
    return (cpu) => {
      cpu.registers[dst] = cpu.getMem(cpu.registers[REG_SP]);
      cpu.registers[REG_SP] += 4;
      return 0;
    };
  }

  // Halt / yield / nop
  static halt(): Instruction { return () => -1; }
  static iyield(): Instruction { return () => -2; }
  static nop(): Instruction { return () => 0; }
}

// ── Assembler / loader ────────────────────────────────────────────────────

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function registerTranslate(name: string): number {
  assert(name in REG_NAME_MAP, `Register ${name} is not valid`);
  return REG_NAME_MAP[name];
}

function getRegName(r: string): string {
  const t = r.trim();
  if (t === '') return 'zero';
  assert(t[0] === '%', `Expecting register name, got [${r}]`);
  return t.split('%')[1].trim();
}

type ParsedArg =
  | { type: 'TYPE_IMMEDIATE'; value: number }
  | { type: 'TYPE_REGISTER'; value: number }
  | { type: 'TYPE_MEMORY'; mem: MemArg }
  | { type: 'TYPE_LABEL'; label: string };

function removeCommas(inargs: string): string {
  let inparen = false;
  let out = '';
  for (const ch of inargs) {
    if (ch === '(') inparen = true;
    if (ch === ')') inparen = false;
    if (inparen && ch === ',') {
      out += '__BREAK__';
    } else {
      out += ch;
    }
  }
  return out;
}

function getarg(arg: string, vars: Record<string, number>): ParsedArg {
  const tmp = arg.replace(',', ' ').replace(/\s\t/, '');

  if (tmp[0] === '$') {
    // Immediate
    let valStr = tmp.slice(1);
    let neg = 1;
    if (valStr[0] === '-') { valStr = valStr.slice(1); neg = -1; }
    assert(/^\d+$/.test(valStr), `value [${valStr}] must be a digit`);
    return { type: 'TYPE_IMMEDIATE', value: neg * parseInt(valStr, 10) };
  }
  if (tmp[0] === '%') {
    return { type: 'TYPE_REGISTER', value: registerTranslate(tmp.split('%')[1]) };
  }
  if (tmp[0] === '.') {
    return { type: 'TYPE_LABEL', label: tmp };
  }
  if (tmp[0].match(/[a-zA-Z]/) && !tmp[0].match(/\d/)) {
    // variable name
    assert(tmp in vars, `Variable ${tmp} is not declared`);
    return { type: 'TYPE_MEMORY', mem: { value: vars[tmp], reg1: REG_ZERO, reg2: REG_ZERO, scale: 1 } };
  }
  if (tmp[0].match(/\d/) || tmp[0] === '-' || tmp[0] === '(') {
    let s = tmp;
    let neg = 1;
    if (s[0] === '-') { s = s.slice(1); neg = -1; }
    const parts = s.split('(');
    if (parts.length === 1) {
      const value = neg * parseInt(s, 10);
      return { type: 'TYPE_MEMORY', mem: { value, reg1: REG_ZERO, reg2: REG_ZERO, scale: 1 } };
    }
    if (parts.length === 2) {
      let value = 0;
      if (s[0] !== '(') {
        assert(/^\d+$/.test(parts[0].trim()), `First number should be a digit [${parts[0]}]`);
        value = neg * parseInt(parts[0], 10);
      }
      const inner = parts[1].split(')')[0].split('__BREAK__');
      if (inner.length === 1) {
        return { type: 'TYPE_MEMORY', mem: { value, reg1: registerTranslate(getRegName(inner[0])), reg2: REG_ZERO, scale: 1 } };
      }
      if (inner.length === 2) {
        return { type: 'TYPE_MEMORY', mem: { value, reg1: registerTranslate(getRegName(inner[0])), reg2: registerTranslate(getRegName(inner[1])), scale: 1 } };
      }
      if (inner.length === 3) {
        return { type: 'TYPE_MEMORY', mem: { value, reg1: registerTranslate(getRegName(inner[0])), reg2: registerTranslate(getRegName(inner[1])), scale: parseInt(inner[2], 10) } };
      }
    }
  }
  throw new Error(`bad argument [${arg}]`);
}

/** Load and assemble an x86-like program from source text. */
export function loadProgram(cpu: CPU, source: string, loadaddr: number = 1000): void {
  const lines = source.split('\n');

  // First pass: collect labels and variables
  let pc = loadaddr;
  let data = 100;

  for (const rawLine of lines) {
    const cline = rawLine.split('#')[0].trimEnd();
    const tokens = cline.trim().split(/\s+/);
    if (tokens.length === 0 || tokens[0] === '') continue;

    if (tokens[0] === '.var') {
      assert(tokens.length === 2 || tokens.length === 3, `.var needs 1 or 2 args`);
      cpu.vars[tokens[1]] = data;
      const mul = tokens.length === 3 ? parseInt(tokens[2], 10) : 1;
      data += 4 * mul;
      assert(data < loadaddr, 'Load address overrun by static data');
    } else if (tokens[0][0] === '.') {
      assert(tokens.length === 1, `Label must be alone on line`);
      cpu.labels[tokens[0]] = pc;
    } else {
      pc += 1;
    }
  }

  // Second pass: assemble instructions
  pc = loadaddr;
  for (const rawLine of lines) {
    const cline = rawLine.split('#')[0].trimEnd();
    const tokens = cline.trim().split(/\s+/);
    if (tokens.length === 0 || tokens[0] === '') continue;

    // Skip .var and labels on second pass
    if (tokens[0] === '.var' || tokens[0][0] === '.') continue;

    // Split into opcode and rest-of-line
    const firstSplit = cline.trim().split(/\s+(.+)/);
    const opcode = firstSplit[0];
    const restRaw = firstSplit[1] ?? '';

    cpu.pmemory[pc] = cline.trim();

    const inst = assembleInstruction(opcode, restRaw, cpu.vars, cpu.labels);
    cpu.instructions[pc] = inst;
    pc += 1;
  }
}

function assembleInstruction(
  opcode: string,
  rest: string,
  vars: Record<string, number>,
  labels: Record<string, number>,
): Instruction {
  const parseArg = (s: string) => getarg(s, vars);

  function parseTwoArgs(raw: string): [ParsedArg, ParsedArg] {
    const cleaned = removeCommas(raw);
    const parts = cleaned.split(',');
    assert(parts.length === 2, `${opcode}: needs two comma-separated args [${raw}]`);
    return [parseArg(parts[0].trim()), parseArg(parts[1].trim())];
  }

  function resolveLabel(raw: string): number {
    const arg = parseArg(raw.trim());
    assert(arg.type === 'TYPE_LABEL', `bad jump target [${raw}]`);
    assert(arg.label in labels, `Undefined label ${arg.label}`);
    return labels[arg.label];
  }

  switch (opcode) {
    case 'mov': {
      const [src, dst] = parseTwoArgs(rest);
      if (src.type === 'TYPE_IMMEDIATE' && dst.type === 'TYPE_REGISTER')
        return CPU.moveItoR(src.value, dst.value);
      if (src.type === 'TYPE_MEMORY' && dst.type === 'TYPE_REGISTER')
        return CPU.moveMtoR(src.mem, dst.value);
      if (src.type === 'TYPE_REGISTER' && dst.type === 'TYPE_MEMORY')
        return CPU.moveRtoM(src.value, dst.mem);
      if (src.type === 'TYPE_REGISTER' && dst.type === 'TYPE_REGISTER')
        return CPU.moveRtoR(src.value, dst.value);
      if (src.type === 'TYPE_IMMEDIATE' && dst.type === 'TYPE_MEMORY')
        return CPU.moveItoM(src.value, dst.mem);
      throw new Error(`bad mov: ${rest}`);
    }
    case 'lea': {
      const [src, dst] = parseTwoArgs(rest);
      assert(src.type === 'TYPE_MEMORY' && dst.type === 'TYPE_REGISTER', 'lea: memory src, register dst');
      return CPU.leaMtoR(src.mem, dst.value);
    }
    case 'neg': {
      const arg = parseArg(rest.trim());
      assert(arg.type === 'TYPE_REGISTER', 'neg: register only');
      return CPU.negR(arg.value);
    }
    case 'add': {
      const [src, dst] = parseTwoArgs(rest);
      if (src.type === 'TYPE_IMMEDIATE' && dst.type === 'TYPE_REGISTER')
        return CPU.addItoR(src.value, dst.value);
      if (src.type === 'TYPE_REGISTER' && dst.type === 'TYPE_REGISTER')
        return CPU.addRtoR(src.value, dst.value);
      throw new Error(`bad add: ${rest}`);
    }
    case 'sub': {
      const [src, dst] = parseTwoArgs(rest);
      if (src.type === 'TYPE_IMMEDIATE' && dst.type === 'TYPE_REGISTER')
        return CPU.subItoR(src.value, dst.value);
      if (src.type === 'TYPE_REGISTER' && dst.type === 'TYPE_REGISTER')
        return CPU.subRtoR(src.value, dst.value);
      throw new Error(`bad sub: ${rest}`);
    }
    case 'mul': {
      const [src, dst] = parseTwoArgs(rest);
      if (src.type === 'TYPE_IMMEDIATE' && dst.type === 'TYPE_REGISTER')
        return CPU.mulItoR(src.value, dst.value);
      if (src.type === 'TYPE_REGISTER' && dst.type === 'TYPE_REGISTER')
        return CPU.mulRtoR(src.value, dst.value);
      throw new Error(`bad mul: ${rest}`);
    }
    case 'xchg': {
      const [src, dst] = parseTwoArgs(rest);
      assert(src.type === 'TYPE_REGISTER' && dst.type === 'TYPE_MEMORY', 'xchg: register, memory');
      return CPU.atomicExchange(src.value, dst.mem);
    }
    case 'fetchadd': {
      const [src, dst] = parseTwoArgs(rest);
      assert(src.type === 'TYPE_REGISTER' && dst.type === 'TYPE_MEMORY', 'fetchadd: register, memory');
      return CPU.fetchAdd(src.value, dst.mem);
    }
    case 'test': {
      const [src, dst] = parseTwoArgs(rest);
      if (src.type === 'TYPE_IMMEDIATE' && dst.type === 'TYPE_REGISTER')
        return CPU.testIR(src.value, dst.value);
      if (src.type === 'TYPE_REGISTER' && dst.type === 'TYPE_REGISTER')
        return CPU.testRR(src.value, dst.value);
      if (src.type === 'TYPE_REGISTER' && dst.type === 'TYPE_IMMEDIATE')
        return CPU.testRI(src.value, dst.value);
      throw new Error(`bad test: ${rest}`);
    }
    case 'j': return CPU.jump(resolveLabel(rest));
    case 'jne': return CPU.jumpNotEqual(resolveLabel(rest));
    case 'je': return CPU.jumpEqual(resolveLabel(rest));
    case 'jlt': return CPU.jumpLessThan(resolveLabel(rest));
    case 'jlte': return CPU.jumpLessThanOrEqual(resolveLabel(rest));
    case 'jgt': return CPU.jumpGreaterThan(resolveLabel(rest));
    case 'jgte': return CPU.jumpGreaterThanOrEqual(resolveLabel(rest));
    case 'call': return CPU.call(resolveLabel(rest));
    case 'ret': return CPU.ret();
    case 'push': {
      const arg = parseArg(rest.trim());
      if (arg.type === 'TYPE_REGISTER') return CPU.pushR(arg.value);
      if (arg.type === 'TYPE_MEMORY') return CPU.pushM(arg.mem);
      throw new Error(`push: register or memory only`);
    }
    case 'pop': {
      if (rest.trim() === '') return CPU.pop();
      const arg = parseArg(rest.trim());
      assert(arg.type === 'TYPE_REGISTER', 'pop: register only');
      return CPU.popR(arg.value);
    }
    case 'nop': return CPU.nop();
    case 'halt': return CPU.halt();
    case 'yield': return CPU.iyield();
    default:
      throw new Error(`illegal opcode: ${opcode}`);
  }
}

// ── Thread / process state ────────────────────────────────────────────────

interface ThreadState {
  tid: number;
  pc: number;
  regs: Record<number, number>;
  cc: Record<number, boolean>;
  done: boolean;
}

function createThread(tid: number, pc: number, stackBottom: number, regInit: string): ThreadState {
  const regs: Record<number, number> = {};
  for (const r of ALL_REGS) regs[r] = 0;

  if (regInit !== '') {
    for (const item of regInit.split(':')) {
      const [name, val] = item.split('=');
      regs[registerTranslate(name)] = parseInt(val, 10);
    }
  }

  regs[REG_SP] = stackBottom;

  const cc: Record<number, boolean> = {};
  for (const c of ALL_CONDS) cc[c] = false;

  return { tid, pc, regs, cc, done: false };
}

function saveThread(cpu: CPU, thread: ThreadState): void {
  thread.pc = cpu.pc;
  for (const r of ALL_REGS) thread.regs[r] = cpu.registers[r];
  for (const c of ALL_CONDS) thread.cc[c] = cpu.conditions[c];
}

function restoreThread(cpu: CPU, thread: ThreadState): void {
  cpu.pc = thread.pc;
  for (const r of ALL_REGS) cpu.registers[r] = thread.regs[r];
  for (const c of ALL_CONDS) cpu.conditions[c] = thread.cc[c];
}

// ── Simulation parameters and result types ────────────────────────────────

export interface X86LocksParams {
  seed: number;
  numThreads: number;
  program: string;
  interruptFreq: number;
  interruptRandom: boolean;
  /** Per-thread register init. E.g. ["bx=2","bx=2"] or [""] for defaults. */
  argv: string[];
  /** Manual schedule string, e.g. "010011" or empty for automatic. */
  procSched: string;
  loadAddr: number;
  memSize: number; // in KB
  /** Memory addresses or variable names to trace. */
  memTrace: string[];
  /** Register names to trace, e.g. ["ax","bx"]. */
  regTrace: string[];
  /** Whether to show condition codes. */
  ccTrace: boolean;
}

export interface TraceStep {
  /** Which thread executed */
  threadId: number;
  /** PC before execution */
  pc: number;
  /** The assembly source line */
  instruction: string;
  /** Snapshot of traced memory values */
  tracedMem: number[];
  /** Snapshot of traced register values */
  tracedRegs: number[];
  /** Snapshot of condition codes (if ccTrace) */
  tracedCC: boolean[];
  /** Event type */
  event: 'instruction' | 'halt-switch' | 'interrupt';
}

export interface X86LocksResult {
  steps: TraceStep[];
  /** Total instruction count */
  instructionCount: number;
  /** Final memory dump: addresses with non-zero values (excluding instruction space) */
  finalMemory: { addr: number; value: number }[];
  /** Variable map for display */
  vars: Record<string, number>;
  /** Resolved memTrace addresses */
  memTraceAddrs: number[];
  /** Resolved regTrace register numbers */
  regTraceNums: number[];
}

// ── Main simulation ───────────────────────────────────────────────────────

export function simulate(params: X86LocksParams): X86LocksResult {
  const {
    seed, numThreads, program, interruptFreq, interruptRandom,
    argv, procSched, loadAddr, memSize, memTrace, regTrace, ccTrace,
  } = params;

  assert(interruptFreq > 0, 'Interrupt frequency must be greater than 0');
  assert(program.trim() !== '', 'Program must not be empty');

  const rng = new Random(seed);
  const cpu = new CPU();

  // Load program
  loadProgram(cpu, program, loadAddr);

  // Resolve traced memory addresses
  const memTraceAddrs: number[] = [];
  for (const m of memTrace) {
    if (/^\d+$/.test(m)) {
      memTraceAddrs.push(parseInt(m, 10));
    } else {
      assert(m in cpu.vars, `Traced variable ${m} not declared`);
      memTraceAddrs.push(cpu.vars[m]);
    }
  }

  // Resolve traced registers
  const regTraceNums: number[] = [];
  for (const r of regTrace) {
    assert(r in REG_NAME_MAP, `Register ${r} cannot be traced`);
    regTraceNums.push(REG_NAME_MAP[r]);
  }

  // Create threads
  const threads: ThreadState[] = [];
  let stack = memSize * 1000;
  for (let t = 0; t < numThreads; t++) {
    const arg = argv.length > 1 ? (argv[t] ?? '') : (argv[0] ?? '');
    threads.push(createThread(t, loadAddr, stack, arg));
    stack -= 1000;
  }

  // Build scheduling order
  let schedule: number[];
  let manual = false;
  if (procSched !== '') {
    manual = true;
    schedule = procSched.split('').map(ch => {
      const p = parseInt(ch, 10);
      assert(p >= 0 && p < numThreads, `Bad schedule: thread ${p} does not exist`);
      return p;
    });
    // Validate all threads appear
    const present = new Set(schedule);
    for (let i = 0; i < numThreads; i++) {
      assert(present.has(i), `Bad schedule: does not include thread ${i}`);
    }
  } else {
    schedule = [];
    for (let i = 0; i < numThreads; i++) schedule.push(i);
  }

  let schedIdx = 0;
  const getCurrentThread = (): ThreadState => threads[schedule[schedIdx % schedule.length]];

  const nextThread = (): void => {
    while (true) {
      schedIdx++;
      const t = threads[schedule[schedIdx % schedule.length]];
      if (!t.done) return;
    }
  };

  // Restore first thread
  restoreThread(cpu, getCurrentThread());

  function setInterrupt(): number {
    if (!interruptRandom) return interruptFreq;
    return Math.floor(rng.random() * interruptFreq) + 1;
  }

  if (manual) {
    // In manual mode, interrupt every instruction
  }
  let interrupt = manual ? 1 : setInterrupt();

  const steps: TraceStep[] = [];
  let icount = 0;
  const maxSteps = 100000; // safety limit

  function snapshot(): { mem: number[]; regs: number[]; cc: boolean[] } {
    const mem = memTraceAddrs.map(a => cpu.getMem(a));
    const regs = regTraceNums.map(r => cpu.registers[r]);
    const cc = ccTrace ? ALL_CONDS.map(c => cpu.conditions[c]) : [];
    return { mem, regs, cc };
  }

  while (icount < maxSteps) {
    const tid = getCurrentThread().tid;
    const prevPC = cpu.pc;
    const inst = cpu.instructions[prevPC];
    assert(inst !== undefined, `No instruction at PC=${prevPC}`);
    cpu.pc += 1;

    // Execute
    const rc = inst(cpu);

    const snap = snapshot();
    steps.push({
      threadId: tid,
      pc: prevPC,
      instruction: cpu.pmemory[prevPC] ?? '???',
      tracedMem: snap.mem,
      tracedRegs: snap.regs,
      tracedCC: snap.cc,
      event: 'instruction',
    });
    icount++;

    // Halt
    if (rc === -1) {
      getCurrentThread().done = true;
      const numDone = threads.filter(t => t.done).length;
      if (numDone === numThreads) break;
      nextThread();
      restoreThread(cpu, getCurrentThread());

      const snapH = snapshot();
      steps.push({
        threadId: -1,
        pc: -1,
        instruction: '----- Halt;Switch -----',
        tracedMem: snapH.mem,
        tracedRegs: snapH.regs,
        tracedCC: snapH.cc,
        event: 'halt-switch',
      });
    }

    // Interrupt handling
    interrupt--;
    if (interrupt === 0 || rc === -2) {
      interrupt = manual ? 1 : setInterrupt();
      const currThread = getCurrentThread();
      saveThread(cpu, currThread);
      const prevTid = currThread.tid;
      nextThread();
      restoreThread(cpu, getCurrentThread());
      const nextTid = getCurrentThread().tid;

      if (!manual || prevTid !== nextTid) {
        const snapI = snapshot();
        steps.push({
          threadId: -1,
          pc: -1,
          instruction: '------ Interrupt ------',
          tracedMem: snapI.mem,
          tracedRegs: snapI.regs,
          tracedCC: snapI.cc,
          event: 'interrupt',
        });
      }
    }
  }

  // Final memory dump
  const finalMemory: { addr: number; value: number }[] = [];
  const allAddrs = Object.keys(cpu.memory).map(Number).sort((a, b) => a - b);
  for (const addr of allAddrs) {
    if (!(addr in cpu.pmemory) && cpu.memory[addr] !== 0) {
      finalMemory.push({ addr, value: cpu.memory[addr] });
    }
  }

  return {
    steps,
    instructionCount: icount,
    finalMemory,
    vars: { ...cpu.vars },
    memTraceAddrs,
    regTraceNums,
  };
}

// ── Built-in example programs ─────────────────────────────────────────────

export const EXAMPLE_PROGRAMS: { name: string; source: string; defaultArgs?: string }[] = [
  {
    name: 'Simple Race',
    source: `.main
mov 2000, %ax   # get the value at the address
add $1, %ax     # increment it
mov %ax, 2000   # store it back
halt`,
  },
  {
    name: 'Loop',
    source: `.main
.top
sub  $1,%dx
test $0,%dx
jgt .top
halt`,
    defaultArgs: 'dx=3',
  },
  {
    name: 'Flag Lock',
    source: `.var flag
.var count

.main
.top

.acquire
mov  flag, %ax      # get flag
test $0, %ax        # if we get 0 back: lock is free!
jne  .acquire       # if not, try again
mov  $1, flag       # store 1 into flag

# critical section
mov  count, %ax     # get the value at the address
add  $1, %ax        # increment it
mov  %ax, count     # store it back

# release lock
mov  $0, flag       # clear the flag now

# see if we're still looping
sub  $1, %bx
test $0, %bx
jgt .top

halt`,
    defaultArgs: 'bx=2',
  },
  {
    name: 'Test-and-Set Lock',
    source: `.var mutex
.var count

.main
.top

.acquire
mov  $1, %ax
xchg %ax, mutex     # atomic swap of 1 and mutex
test $0, %ax        # if we get 0 back: lock is free!
jne  .acquire       # if not, try again

# critical section
mov  count, %ax     # get the value at the address
add  $1, %ax        # increment it
mov  %ax, count     # store it back

# release lock
mov  $0, mutex

# see if we're still looping
sub  $1, %bx
test $0, %bx
jgt .top

halt`,
    defaultArgs: 'bx=2',
  },
  {
    name: 'Ticket Lock',
    source: `.var ticket
.var turn
.var count

.main
.top

.acquire
mov $1, %ax
fetchadd %ax, ticket  # grab a ticket
.tryagain
mov turn, %cx         # check if it's your turn
test %cx, %ax
jne .tryagain

# critical section
mov  count, %ax       # get the value at the address
add  $1, %ax          # increment it
mov  %ax, count       # store it back

# release lock
mov $1, %ax
fetchadd %ax, turn

# see if we're still looping
sub  $1, %bx
test $0, %bx
jgt .top

halt`,
    defaultArgs: 'bx=2',
  },
  {
    name: 'Yield Lock',
    source: `.var mutex
.var count

.main
.top

.acquire
mov  $1, %ax
xchg %ax, mutex     # atomic swap of 1 and mutex
test $0, %ax        # if we get 0 back: lock is free!
je .acquire_done
yield               # if not, yield and try again
j .acquire
.acquire_done

# critical section
mov  count, %ax     # get the value at the address
add  $1, %ax        # increment it
mov  %ax, count     # store it back

# release lock
mov  $0, mutex

# see if we're still looping
sub  $1, %bx
test $0, %bx
jgt .top

halt`,
    defaultArgs: 'bx=2',
  },
  {
    name: 'Peterson\'s Algorithm',
    source: `# array of 2 integers (each size 4 bytes)
# load address of flag into fx register
# access flag[] with 0(%fx,%index,4)
# where %index is a register holding 0 or 1
# index reg contains 0 -> flag[0], if 1->flag[1]
.var flag   2

# global turn variable
.var turn

# global count
.var count

.main

# put address of flag into fx
lea flag, %fx

# assume thread ID is in bx (0 or 1, scale by 4 to get proper flag address)
mov %bx, %cx   # bx: self, now copies to cx
neg %cx        # cx: - self
add $1, %cx    # cx: 1 - self

.acquire
mov $1, 0(%fx,%bx,4)    # flag[self] = 1
mov %cx, turn           # turn       = 1 - self

.spin1
mov 0(%fx,%cx,4), %ax   # flag[1-self]
test $1, %ax
jne .fini               # if flag[1-self] != 1, skip past loop to .fini

.spin2                  # just labeled for fun, not needed
mov turn, %ax
test %cx, %ax           # compare 'turn' and '1 - self'
je .spin1               # if turn==1-self, go back and start spin again

# fall out of spin
.fini

# do critical section now
mov count, %ax
add $1, %ax
mov %ax, count

.release
mov $0, 0(%fx,%bx,4)    # flag[self] = 0

# end case: make sure it's other's turn
mov %cx, turn           # turn       = 1 - self
halt`,
    defaultArgs: 'bx=0,bx=1',
  },
];
