import { Random } from '../random';

// ── Types ──────────────────────────────────────────────────────────

export type RegName = 'ax' | 'bx' | 'cx' | 'dx' | 'sp' | 'bp';
const REG_NAMES: readonly RegName[] = ['ax', 'bx', 'cx', 'dx', 'sp', 'bp'] as const;
const ALL_REG_NAMES: readonly string[] = ['zero', ...REG_NAMES] as const;

export type CondFlag = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';
const COND_FLAGS: readonly CondFlag[] = ['gte', 'gt', 'lte', 'lt', 'neq', 'eq'] as const;

type ArgType = 'TYPE_REGISTER' | 'TYPE_IMMEDIATE' | 'TYPE_MEMORY' | 'TYPE_LABEL';

interface MemArg {
  value: number;
  reg1: string;
  reg2: string;
}

/**
 * A compiled instruction: a closure that executes on the CPU and returns a
 * status code (0 = normal, -1 = halt, -2 = yield).
 */
type Instruction = (cpu: CpuState) => number;

// ── CPU state (pure data, no methods that do I/O) ──────────────────

export interface Registers {
  zero: number;
  ax: number;
  bx: number;
  cx: number;
  dx: number;
  sp: number;
  bp: number;
}

export interface Conditions {
  gt: boolean;
  gte: boolean;
  lt: boolean;
  lte: boolean;
  eq: boolean;
  neq: boolean;
}

export interface CpuState {
  pc: number;
  registers: Registers;
  conditions: Conditions;
  memory: Map<number, number>;
}

function freshRegisters(): Registers {
  return { zero: 0, ax: 0, bx: 0, cx: 0, dx: 0, sp: 0, bp: 0 };
}

function freshConditions(): Conditions {
  return { gt: false, gte: false, lt: false, lte: false, eq: false, neq: false };
}

function cloneRegisters(r: Registers): Registers {
  return { ...r };
}
function cloneConditions(c: Conditions): Conditions {
  return { ...c };
}

function getMem(state: CpuState, addr: number): number {
  return state.memory.get(addr) ?? 0;
}
function setMem(state: CpuState, addr: number, val: number): void {
  state.memory.set(addr, val);
}

// ── Argument parsing ───────────────────────────────────────────────

function parseArg(
  raw: string,
  vars: Map<string, number>,
): [value: string | number, type: ArgType] {
  const tmp = raw.replace(',', '').replace(/\s|\t/g, '');

  if (tmp[0] === '$') {
    const rest = tmp.slice(1);
    const value = parseInt(rest, 10);
    if (isNaN(value)) throw new Error(`value [${rest}] must be a digit`);
    return [value, 'TYPE_IMMEDIATE'];
  }
  if (tmp[0] === '%') {
    const name = tmp.slice(1);
    if (!ALL_REG_NAMES.includes(name)) throw new Error(`Register ${name} is not valid`);
    return [name, 'TYPE_REGISTER'];
  }
  if (tmp[0] === '(') {
    const reg = tmp.split('(')[1].split(')')[0].split('%')[1];
    return [`0,${reg},zero`, 'TYPE_MEMORY'];
  }
  if (tmp[0] === '.') {
    return [tmp, 'TYPE_LABEL'];
  }
  if (tmp[0].match(/[a-zA-Z]/) && !tmp[0].match(/[0-9]/)) {
    if (!vars.has(tmp)) throw new Error(`Variable ${tmp} is not declared`);
    return [`${vars.get(tmp)!},zero,zero`, 'TYPE_MEMORY'];
  }
  if (tmp[0].match(/[0-9]/) || tmp[0] === '-') {
    let s = tmp;
    let neg = 1;
    if (s[0] === '-') {
      s = s.slice(1);
      neg = -1;
    }
    const parts = s.split('(');
    if (parts.length === 1) {
      const value = neg * parseInt(s, 10);
      return [`${value},zero,zero`, 'TYPE_MEMORY'];
    }
    if (parts.length === 2) {
      const value = neg * parseInt(parts[0], 10);
      const inner = parts[1].split(')')[0].split(',');
      if (inner.length === 1) {
        const reg = inner[0].split('%')[1];
        return [`${value},${reg},zero`, 'TYPE_MEMORY'];
      }
      if (inner.length === 2) {
        const reg1 = inner[0].split('%')[1];
        const reg2 = inner[1].split('%')[1];
        return [`${value},${reg1},${reg2}`, 'TYPE_MEMORY'];
      }
    }
    throw new Error(`bad argument [${tmp}]`);
  }
  throw new Error(`bad argument [${raw}]`);
}

function parseMemArg(encoded: string): MemArg {
  const [v, r1, r2] = encoded.split(',');
  return { value: parseInt(v, 10), reg1: r1, reg2: r2 };
}

function memAddr(state: CpuState, m: MemArg): number {
  return (
    m.value +
    (state.registers as any)[m.reg1] +
    (state.registers as any)[m.reg2]
  );
}

// ── Instruction builders ───────────────────────────────────────────

function move_i_to_r(src: number, dst: string): Instruction {
  return (cpu) => { (cpu.registers as any)[dst] = src; return 0; };
}
function move_i_to_m(src: number, m: MemArg): Instruction {
  return (cpu) => { setMem(cpu, memAddr(cpu, m), src); return 0; };
}
function move_m_to_r(m: MemArg, dst: string): Instruction {
  return (cpu) => { (cpu.registers as any)[dst] = getMem(cpu, memAddr(cpu, m)); return 0; };
}
function move_r_to_m(src: string, m: MemArg): Instruction {
  return (cpu) => { setMem(cpu, memAddr(cpu, m), (cpu.registers as any)[src]); return 0; };
}
function move_r_to_r(src: string, dst: string): Instruction {
  return (cpu) => { (cpu.registers as any)[dst] = (cpu.registers as any)[src]; return 0; };
}
function add_i_to_r(src: number, dst: string): Instruction {
  return (cpu) => { (cpu.registers as any)[dst] += src; return 0; };
}
function add_r_to_r(src: string, dst: string): Instruction {
  return (cpu) => { (cpu.registers as any)[dst] += (cpu.registers as any)[src]; return 0; };
}
function sub_i_to_r(src: number, dst: string): Instruction {
  return (cpu) => { (cpu.registers as any)[dst] -= src; return 0; };
}
function sub_r_to_r(src: string, dst: string): Instruction {
  return (cpu) => { (cpu.registers as any)[dst] -= (cpu.registers as any)[src]; return 0; };
}
function atomic_exchange(src: string, m: MemArg): Instruction {
  return (cpu) => {
    const addr = memAddr(cpu, m);
    const old = getMem(cpu, addr);
    setMem(cpu, addr, (cpu.registers as any)[src]);
    (cpu.registers as any)[src] = old;
    return 0;
  };
}
function fetchadd(src: string, m: MemArg): Instruction {
  return (cpu) => {
    const addr = memAddr(cpu, m);
    const old = getMem(cpu, addr);
    setMem(cpu, addr, old + (cpu.registers as any)[src]);
    (cpu.registers as any)[src] = old;
    return 0;
  };
}
function test_all(cpu: CpuState, src: number, dst: number): number {
  cpu.conditions = freshConditions();
  if (dst > src) cpu.conditions.gt = true;
  if (dst >= src) cpu.conditions.gte = true;
  if (dst < src) cpu.conditions.lt = true;
  if (dst <= src) cpu.conditions.lte = true;
  if (dst === src) cpu.conditions.eq = true;
  if (dst !== src) cpu.conditions.neq = true;
  return 0;
}
function test_i_r(src: number, dst: string): Instruction {
  return (cpu) => test_all(cpu, src, (cpu.registers as any)[dst]);
}
function test_r_i(src: string, dst: number): Instruction {
  return (cpu) => test_all(cpu, (cpu.registers as any)[src], dst);
}
function test_r_r(src: string, dst: string): Instruction {
  return (cpu) => test_all(cpu, (cpu.registers as any)[src], (cpu.registers as any)[dst]);
}
function jump(targ: number): Instruction {
  return (cpu) => { cpu.pc = targ; return 0; };
}
function jump_cond(flag: CondFlag, targ: number): Instruction {
  return (cpu) => { if (cpu.conditions[flag]) cpu.pc = targ; return 0; };
}
function call_instr(targ: number): Instruction {
  return (cpu) => {
    cpu.registers.sp -= 4;
    setMem(cpu, cpu.registers.sp, cpu.pc);
    cpu.pc = targ;
    return 0;
  };
}
function ret_instr(): Instruction {
  return (cpu) => {
    cpu.pc = getMem(cpu, cpu.registers.sp);
    cpu.registers.sp += 4;
    return 0;
  };
}
function push_r(reg: string): Instruction {
  return (cpu) => {
    cpu.registers.sp -= 4;
    setMem(cpu, cpu.registers.sp, (cpu.registers as any)[reg]);
    return 0;
  };
}
function push_m(m: MemArg): Instruction {
  return (cpu) => {
    cpu.registers.sp -= 4;
    setMem(cpu, cpu.registers.sp, memAddr(cpu, m));
    return 0;
  };
}
function pop_instr(): Instruction {
  return (cpu) => { cpu.registers.sp += 4; return 0; };
}
function pop_r(dst: string): Instruction {
  return (cpu) => {
    (cpu.registers as any)[dst] = cpu.registers.sp;
    cpu.registers.sp += 4;
    return 0;
  };
}
function halt_instr(): Instruction {
  return () => -1;
}
function yield_instr(): Instruction {
  return () => -2;
}
function nop_instr(): Instruction {
  return () => 0;
}

// ── Program loading (assembly → compiled instructions) ─────────────

export interface CompiledProgram {
  instructions: Map<number, Instruction>;
  printable: Map<number, string>;
  vars: Map<string, number>;
  /** The first PC after the last instruction */
  endPC: number;
}

export function assemble(source: string, loadAddr: number = 1000): CompiledProgram {
  const lines = source.split('\n');
  const labels = new Map<string, number>();
  const vars = new Map<string, number>();
  const instructions = new Map<number, Instruction>();
  const printable = new Map<number, string>();

  let data = 100;

  // Pass 1: collect labels and vars
  let pc = loadAddr;
  for (const rawLine of lines) {
    const cline = rawLine.split('#')[0].trim();
    if (!cline) continue;
    const parts = cline.split(/\s+/);
    if (parts[0] === '.var') {
      if (vars.has(parts[1])) throw new Error(`Variable ${parts[1]} already declared`);
      vars.set(parts[1], data);
      data += 4;
      if (data >= loadAddr) throw new Error('Load address overrun by static data');
    } else if (parts[0][0] === '.') {
      labels.set(parts[0], pc);
    } else {
      pc++;
    }
  }

  // Pass 2: compile instructions
  pc = loadAddr;
  for (const rawLine of lines) {
    const cline = rawLine.split('#')[0].trim();
    if (!cline) continue;
    if (cline[0] === '.') continue; // labels and vars

    const parts = cline.split(/\s+(.+)/);
    const opcode = parts[0];
    const rest = parts[1] || '';

    printable.set(pc, cline);

    switch (opcode) {
      case 'mov': {
        const [arg1raw, arg2raw] = rest.split(',', 2).map(s => s.trim());
        // Re-split properly: split on first comma that's not inside parens
        const commaIdx = findTopLevelComma(rest);
        const a1 = rest.slice(0, commaIdx).trim();
        const a2 = rest.slice(commaIdx + 1).trim();
        const [src, stype] = parseArg(a1, vars);
        const [dst, dtype] = parseArg(a2, vars);
        if (stype === 'TYPE_IMMEDIATE' && dtype === 'TYPE_REGISTER') {
          instructions.set(pc, move_i_to_r(src as number, dst as string));
        } else if (stype === 'TYPE_MEMORY' && dtype === 'TYPE_REGISTER') {
          instructions.set(pc, move_m_to_r(parseMemArg(src as string), dst as string));
        } else if (stype === 'TYPE_REGISTER' && dtype === 'TYPE_MEMORY') {
          instructions.set(pc, move_r_to_m(src as string, parseMemArg(dst as string)));
        } else if (stype === 'TYPE_REGISTER' && dtype === 'TYPE_REGISTER') {
          instructions.set(pc, move_r_to_r(src as string, dst as string));
        } else if (stype === 'TYPE_IMMEDIATE' && dtype === 'TYPE_MEMORY') {
          instructions.set(pc, move_i_to_m(src as number, parseMemArg(dst as string)));
        } else {
          throw new Error(`bad mov: ${stype} -> ${dtype}`);
        }
        break;
      }
      case 'add': {
        const commaIdx = findTopLevelComma(rest);
        const a1 = rest.slice(0, commaIdx).trim();
        const a2 = rest.slice(commaIdx + 1).trim();
        const [src, stype] = parseArg(a1, vars);
        const [dst, dtype] = parseArg(a2, vars);
        if (stype === 'TYPE_IMMEDIATE' && dtype === 'TYPE_REGISTER') {
          instructions.set(pc, add_i_to_r(src as number, dst as string));
        } else if (stype === 'TYPE_REGISTER' && dtype === 'TYPE_REGISTER') {
          instructions.set(pc, add_r_to_r(src as string, dst as string));
        } else {
          throw new Error(`malformed add instruction`);
        }
        break;
      }
      case 'sub': {
        const commaIdx = findTopLevelComma(rest);
        const a1 = rest.slice(0, commaIdx).trim();
        const a2 = rest.slice(commaIdx + 1).trim();
        const [src, stype] = parseArg(a1, vars);
        const [dst, dtype] = parseArg(a2, vars);
        if (stype === 'TYPE_IMMEDIATE' && dtype === 'TYPE_REGISTER') {
          instructions.set(pc, sub_i_to_r(src as number, dst as string));
        } else if (stype === 'TYPE_REGISTER' && dtype === 'TYPE_REGISTER') {
          instructions.set(pc, sub_r_to_r(src as string, dst as string));
        } else {
          throw new Error(`malformed sub instruction`);
        }
        break;
      }
      case 'test': {
        const commaIdx = findTopLevelComma(rest);
        const a1 = rest.slice(0, commaIdx).trim();
        const a2 = rest.slice(commaIdx + 1).trim();
        const [src, stype] = parseArg(a1, vars);
        const [dst, dtype] = parseArg(a2, vars);
        if (stype === 'TYPE_IMMEDIATE' && dtype === 'TYPE_REGISTER') {
          instructions.set(pc, test_i_r(src as number, dst as string));
        } else if (stype === 'TYPE_REGISTER' && dtype === 'TYPE_REGISTER') {
          instructions.set(pc, test_r_r(src as string, dst as string));
        } else if (stype === 'TYPE_REGISTER' && dtype === 'TYPE_IMMEDIATE') {
          instructions.set(pc, test_r_i(src as string, dst as number));
        } else {
          throw new Error(`malformed test instruction`);
        }
        break;
      }
      case 'xchg': {
        const commaIdx = findTopLevelComma(rest);
        const a1 = rest.slice(0, commaIdx).trim();
        const a2 = rest.slice(commaIdx + 1).trim();
        const [src, stype] = parseArg(a1, vars);
        const [dst, dtype] = parseArg(a2, vars);
        if (stype === 'TYPE_REGISTER' && dtype === 'TYPE_MEMORY') {
          instructions.set(pc, atomic_exchange(src as string, parseMemArg(dst as string)));
        } else {
          throw new Error(`poorly specified atomic exchange`);
        }
        break;
      }
      case 'fetchadd': {
        const commaIdx = findTopLevelComma(rest);
        const a1 = rest.slice(0, commaIdx).trim();
        const a2 = rest.slice(commaIdx + 1).trim();
        const [src, stype] = parseArg(a1, vars);
        const [dst, dtype] = parseArg(a2, vars);
        if (stype === 'TYPE_REGISTER' && dtype === 'TYPE_MEMORY') {
          instructions.set(pc, fetchadd(src as string, parseMemArg(dst as string)));
        } else {
          throw new Error(`poorly specified fetchadd`);
        }
        break;
      }
      case 'j': {
        const [targ, ttype] = parseArg(rest.trim(), vars);
        if (ttype !== 'TYPE_LABEL') throw new Error(`bad jump target [${rest}]`);
        const addr = labels.get(targ as string);
        if (addr === undefined) throw new Error(`unknown label ${targ}`);
        instructions.set(pc, jump(addr));
        break;
      }
      case 'jne': {
        const [targ, ttype] = parseArg(rest.trim(), vars);
        if (ttype !== 'TYPE_LABEL') throw new Error(`bad jump target`);
        instructions.set(pc, jump_cond('neq', labels.get(targ as string)!));
        break;
      }
      case 'je': {
        const [targ, ttype] = parseArg(rest.trim(), vars);
        if (ttype !== 'TYPE_LABEL') throw new Error(`bad jump target`);
        instructions.set(pc, jump_cond('eq', labels.get(targ as string)!));
        break;
      }
      case 'jlt': {
        const [targ, ttype] = parseArg(rest.trim(), vars);
        if (ttype !== 'TYPE_LABEL') throw new Error(`bad jump target`);
        instructions.set(pc, jump_cond('lt', labels.get(targ as string)!));
        break;
      }
      case 'jlte': {
        const [targ, ttype] = parseArg(rest.trim(), vars);
        if (ttype !== 'TYPE_LABEL') throw new Error(`bad jump target`);
        instructions.set(pc, jump_cond('lte', labels.get(targ as string)!));
        break;
      }
      case 'jgt': {
        const [targ, ttype] = parseArg(rest.trim(), vars);
        if (ttype !== 'TYPE_LABEL') throw new Error(`bad jump target`);
        instructions.set(pc, jump_cond('gt', labels.get(targ as string)!));
        break;
      }
      case 'jgte': {
        const [targ, ttype] = parseArg(rest.trim(), vars);
        if (ttype !== 'TYPE_LABEL') throw new Error(`bad jump target`);
        instructions.set(pc, jump_cond('gte', labels.get(targ as string)!));
        break;
      }
      case 'call': {
        const [targ, ttype] = parseArg(rest.trim(), vars);
        if (ttype !== 'TYPE_LABEL') throw new Error(`Cannot call anything but a label`);
        instructions.set(pc, call_instr(labels.get(targ as string)!));
        break;
      }
      case 'ret': {
        instructions.set(pc, ret_instr());
        break;
      }
      case 'push': {
        const [src, stype] = parseArg(rest.trim(), vars);
        if (stype === 'TYPE_REGISTER') {
          instructions.set(pc, push_r(src as string));
        } else if (stype === 'TYPE_MEMORY') {
          instructions.set(pc, push_m(parseMemArg(src as string)));
        } else {
          throw new Error('Cannot push anything but registers or memory');
        }
        break;
      }
      case 'pop': {
        if (!rest.trim()) {
          instructions.set(pc, pop_instr());
        } else {
          const [dst, dtype] = parseArg(rest.trim(), vars);
          if (dtype !== 'TYPE_REGISTER') throw new Error('Can only pop into a register');
          instructions.set(pc, pop_r(dst as string));
        }
        break;
      }
      case 'nop': {
        instructions.set(pc, nop_instr());
        break;
      }
      case 'halt': {
        instructions.set(pc, halt_instr());
        break;
      }
      case 'yield': {
        instructions.set(pc, yield_instr());
        break;
      }
      default:
        throw new Error(`illegal opcode: ${opcode}`);
    }
    pc++;
  }

  return { instructions, printable, vars, endPC: pc };
}

/** Find the first comma not inside parentheses */
function findTopLevelComma(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) return i;
  }
  return -1;
}

// ── Thread / process model ─────────────────────────────────────────

interface ThreadState {
  tid: number;
  pc: number;
  registers: Registers;
  conditions: Conditions;
  done: boolean;
}

function createThread(
  tid: number,
  loadAddr: number,
  stackBottom: number,
  regInit: string,
): ThreadState {
  const registers = freshRegisters();
  const conditions = freshConditions();

  if (regInit) {
    for (const part of regInit.split(':')) {
      const [name, val] = part.split('=');
      if (!(name in registers)) throw new Error(`Invalid register: ${name}`);
      (registers as any)[name] = parseInt(val, 10);
    }
  }
  registers.sp = stackBottom;

  return { tid, pc: loadAddr, registers, conditions, done: false };
}

// ── Simulation params & output ─────────────────────────────────────

export interface X86Params {
  seed: number;
  program: string;
  numThreads: number;
  intFreq: number;
  intRand: boolean;
  argv: string; // comma-separated per-thread, colon-separated per-reg
  loadAddr: number;
  memSize: number; // KB
  memTrace: string; // comma-separated addrs or var names
  regTrace: string; // comma-separated reg names
  ccTrace: boolean;
}

export const defaultParams: X86Params = {
  seed: 0,
  program: `.main
mov 2000, %ax
add $1, %ax
mov %ax, 2000
halt`,
  numThreads: 2,
  intFreq: 50,
  intRand: false,
  argv: '',
  loadAddr: 1000,
  memSize: 128,
  memTrace: '2000',
  regTrace: 'ax,bx',
  ccTrace: false,
};

export interface TraceEntry {
  /** Which thread ran this step */
  tid: number;
  /** PC of the instruction that was executed */
  pc: number;
  /** Human-readable instruction text */
  instruction: string;
  /** Register snapshot after execution */
  registers: Registers;
  /** Condition code snapshot after execution */
  conditions: Conditions;
  /** Traced memory values after execution (addr -> value) */
  tracedMemory: Map<string, number>;
  /** Event type */
  event: 'instruction' | 'interrupt' | 'halt_switch';
}

export interface SimulationResult {
  trace: TraceEntry[];
  /** Initial traced values (before any instructions) */
  initialTrace: { registers: Registers; conditions: Conditions; tracedMemory: Map<string, number> };
  /** Number of instructions executed */
  instructionCount: number;
  /** The compiled program info */
  program: CompiledProgram;
  /** Memory trace keys (for header display) */
  memTraceKeys: string[];
  /** Register trace keys */
  regTraceKeys: string[];
  /** Final memory state (non-instruction addresses with non-zero values) */
  finalMemory: Map<number, number>;
}

export const EXAMPLE_PROGRAMS: { name: string; source: string }[] = [
  {
    name: 'Simple Race',
    source: `.main
mov 2000, %ax
add $1, %ax
mov %ax, 2000
halt`,
  },
  {
    name: 'Looping Race (no lock)',
    source: `# assumes %bx has loop count in it

.main
.top
# critical section
mov 2000, %ax  # get 'value' at address 2000
add $1, %ax    # increment it
mov %ax, 2000  # store it back

# see if we're still looping
sub  $1, %bx
test $0, %bx
jgt .top

halt`,
  },
  {
    name: 'Wait For Me',
    source: `.main
test $1, %ax     # ax should be 1 (signaller) or 0 (waiter)
je .signaller

.waiter
mov  2000, %cx
test $1, %cx
jne .waiter
halt

.signaller
mov  $1, 2000
halt`,
  },
  {
    name: 'Simple Loop',
    source: `.main
.top
sub  $1,%dx
test $0,%dx
jgte .top
halt`,
  },
];

function getTracedMemory(
  cpuState: CpuState,
  memTraceKeys: string[],
  vars: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const key of memTraceKeys) {
    if (key.match(/^\d+$/)) {
      result.set(key, getMem(cpuState, parseInt(key, 10)));
    } else {
      const addr = vars.get(key);
      if (addr !== undefined) {
        result.set(key, getMem(cpuState, addr));
      }
    }
  }
  return result;
}

export function simulate(params: X86Params): SimulationResult {
  const rng = new Random(params.seed);
  const compiled = assemble(params.program, params.loadAddr);

  // Parse trace lists
  const memTraceKeys = params.memTrace ? params.memTrace.split(',').map(s => s.trim()).filter(Boolean) : [];
  const regTraceKeys = params.regTrace ? params.regTrace.split(',').map(s => s.trim()).filter(Boolean) : [];

  // Initialize CPU state
  const cpuState: CpuState = {
    pc: 0,
    registers: freshRegisters(),
    conditions: freshConditions(),
    memory: new Map(),
  };

  // Initialize threads
  const argvParts = params.argv ? params.argv.split(',') : [''];
  const threads: ThreadState[] = [];
  let stack = params.memSize * 1000;
  for (let i = 0; i < params.numThreads; i++) {
    const arg = argvParts.length > 1 ? (argvParts[i] || '') : (argvParts[0] || '');
    threads.push(createThread(i, params.loadAddr, stack, arg));
    stack -= 1000;
  }

  // Process scheduling state
  let currThread = 0;

  function saveCurrent() {
    const t = threads[currThread];
    t.pc = cpuState.pc;
    t.registers = cloneRegisters(cpuState.registers);
    t.conditions = cloneConditions(cpuState.conditions);
  }

  function restoreCurrent() {
    const t = threads[currThread];
    cpuState.pc = t.pc;
    cpuState.registers = cloneRegisters(t.registers);
    cpuState.conditions = cloneConditions(t.conditions);
  }

  function nextThread() {
    for (let i = currThread + 1; i < threads.length; i++) {
      if (!threads[i].done) { currThread = i; return; }
    }
    for (let i = 0; i <= currThread; i++) {
      if (!threads[i].done) { currThread = i; return; }
    }
  }

  function setInterrupt(): number {
    if (!params.intRand) return params.intFreq;
    return Math.floor(rng.random() * params.intFreq) + 1;
  }

  // Restore first thread
  restoreCurrent();

  const trace: TraceEntry[] = [];
  let interrupt = setInterrupt();
  let icount = 0;
  const numActive = () => threads.filter(t => !t.done).length;

  // Capture initial trace
  const initialTrace = {
    registers: cloneRegisters(cpuState.registers),
    conditions: cloneConditions(cpuState.conditions),
    tracedMemory: getTracedMemory(cpuState, memTraceKeys, compiled.vars),
  };

  const MAX_STEPS = 100000; // safety limit

  while (icount < MAX_STEPS) {
    const tid = threads[currThread].tid;
    const prevPC = cpuState.pc;
    const instrFn = compiled.instructions.get(cpuState.pc);
    if (!instrFn) throw new Error(`No instruction at PC ${cpuState.pc}`);

    cpuState.pc += 1;
    const rc = instrFn(cpuState);

    const instrText = compiled.printable.get(prevPC) || '???';
    icount++;

    trace.push({
      tid,
      pc: prevPC,
      instruction: instrText,
      registers: cloneRegisters(cpuState.registers),
      conditions: cloneConditions(cpuState.conditions),
      tracedMemory: getTracedMemory(cpuState, memTraceKeys, compiled.vars),
      event: 'instruction',
    });

    // Handle halt
    if (rc === -1) {
      threads[currThread].done = true;
      if (numActive() === 0) break;
      nextThread();
      restoreCurrent();

      trace.push({
        tid: -1,
        pc: -1,
        instruction: 'Halt;Switch',
        registers: cloneRegisters(cpuState.registers),
        conditions: cloneConditions(cpuState.conditions),
        tracedMemory: getTracedMemory(cpuState, memTraceKeys, compiled.vars),
        event: 'halt_switch',
      });
    }

    // Timer interrupt or yield
    interrupt -= 1;
    if (interrupt === 0 || rc === -2) {
      interrupt = setInterrupt();
      if (numActive() > 0) {
        saveCurrent();
        nextThread();
        restoreCurrent();

        trace.push({
          tid: -1,
          pc: -1,
          instruction: 'Interrupt',
          registers: cloneRegisters(cpuState.registers),
          conditions: cloneConditions(cpuState.conditions),
          tracedMemory: getTracedMemory(cpuState, memTraceKeys, compiled.vars),
          event: 'interrupt',
        });
      }
    }
  }

  // Collect final non-instruction memory
  const finalMemory = new Map<number, number>();
  for (const [addr, val] of cpuState.memory.entries()) {
    if (!compiled.printable.has(addr) && val !== 0) {
      finalMemory.set(addr, val);
    }
  }

  return {
    trace,
    initialTrace,
    instructionCount: icount,
    program: compiled,
    memTraceKeys,
    regTraceKeys,
    finalMemory,
  };
}
