import { Random } from '../random';

// Process switch behavior
export const SCHED_SWITCH_ON_IO = 'SWITCH_ON_IO' as const;
export const SCHED_SWITCH_ON_END = 'SWITCH_ON_END' as const;
export type SwitchBehavior = typeof SCHED_SWITCH_ON_IO | typeof SCHED_SWITCH_ON_END;

// IO finished behavior
export const IO_RUN_LATER = 'IO_RUN_LATER' as const;
export const IO_RUN_IMMEDIATE = 'IO_RUN_IMMEDIATE' as const;
export type IODoneBehavior = typeof IO_RUN_LATER | typeof IO_RUN_IMMEDIATE;

// Process states
export const STATE_RUNNING = 'RUNNING' as const;
export const STATE_READY = 'READY' as const;
export const STATE_DONE = 'DONE' as const;
export const STATE_WAIT = 'BLOCKED' as const;
export type ProcessState =
  | typeof STATE_RUNNING
  | typeof STATE_READY
  | typeof STATE_DONE
  | typeof STATE_WAIT;

// Instruction types
export const DO_COMPUTE = 'cpu' as const;
export const DO_IO = 'io' as const;
export const DO_IO_DONE = 'io_done' as const;
export type Instruction = typeof DO_COMPUTE | typeof DO_IO | typeof DO_IO_DONE;

export interface ProcessInfo {
  pid: number;
  code: Instruction[];
  state: ProcessState;
}

/** A single row of the simulation trace */
export interface TraceRow {
  time: number;
  ioDone: boolean;
  /** For each process: what's displayed (e.g. "RUN:cpu", "BLOCKED", "READY", "DONE") */
  processStates: string[];
  cpuBusy: boolean;
  numIOs: number;
}

export interface SimulationResult {
  /** The initial process instruction lists (before execution, for the "question" view) */
  processes: { pid: number; instructions: Instruction[] }[];
  trace: TraceRow[];
  stats: {
    totalTime: number;
    cpuBusy: number;
    ioBusy: number;
  };
}

export interface SimulationOptions {
  seed: number;
  processList: string;
  program: string;
  ioLength: number;
  switchBehavior: SwitchBehavior;
  ioDoneBehavior: IODoneBehavior;
}

export const defaultOptions: SimulationOptions = {
  seed: 0,
  processList: '5:50,5:50',
  program: '',
  ioLength: 5,
  switchBehavior: SCHED_SWITCH_ON_IO,
  ioDoneBehavior: IO_RUN_LATER,
};

export class Scheduler {
  private procInfo: ProcessInfo[] = [];
  private switchBehavior: SwitchBehavior;
  private ioDoneBehavior: IODoneBehavior;
  private ioLength: number;
  private currProc: number = 0;
  private ioFinishTimes: number[][] = [];

  constructor(
    switchBehavior: SwitchBehavior,
    ioDoneBehavior: IODoneBehavior,
    ioLength: number,
  ) {
    this.switchBehavior = switchBehavior;
    this.ioDoneBehavior = ioDoneBehavior;
    this.ioLength = ioLength;
  }

  private newProcess(): number {
    const pid = this.procInfo.length;
    this.procInfo.push({
      pid,
      code: [],
      state: STATE_READY,
    });
    return pid;
  }

  /**
   * Load a program specified like "c7,i,c1,i"
   * c<N> = compute for N steps, i = issue IO
   */
  loadProgram(program: string): void {
    const pid = this.newProcess();
    for (const line of program.split(',')) {
      const opcode = line[0];
      if (opcode === 'c') {
        const num = parseInt(line.slice(1), 10);
        for (let i = 0; i < num; i++) {
          this.procInfo[pid].code.push(DO_COMPUTE);
        }
      } else if (opcode === 'i') {
        this.procInfo[pid].code.push(DO_IO);
        this.procInfo[pid].code.push(DO_IO_DONE);
      } else {
        throw new Error(`Bad opcode '${opcode}' (should be c or i)`);
      }
    }
  }

  /**
   * Load a random process: "X:Y" where X = number of instructions,
   * Y = percent chance each instruction is CPU (vs IO)
   */
  load(description: string, rng: Random): void {
    const pid = this.newProcess();
    const tmp = description.split(':');
    if (tmp.length !== 2) {
      throw new Error(
        `Bad description (${description}): Must be number <x:y>`,
      );
    }
    const numInstructions = parseInt(tmp[0], 10);
    const chanceCpu = parseFloat(tmp[1]) / 100.0;

    for (let i = 0; i < numInstructions; i++) {
      if (rng.random() < chanceCpu) {
        this.procInfo[pid].code.push(DO_COMPUTE);
      } else {
        this.procInfo[pid].code.push(DO_IO);
        this.procInfo[pid].code.push(DO_IO_DONE);
      }
    }
  }

  getNumProcesses(): number {
    return this.procInfo.length;
  }

  getProcessInstructions(pid: number): Instruction[] {
    return [...this.procInfo[pid].code];
  }

  private moveToReady(expected: ProcessState, pid?: number): void {
    const p = pid !== undefined ? pid : this.currProc;
    if (this.procInfo[p].state !== expected) {
      throw new Error(
        `Expected state ${expected} but got ${this.procInfo[p].state} for pid ${p}`,
      );
    }
    this.procInfo[p].state = STATE_READY;
  }

  private moveToWait(expected: ProcessState): void {
    if (this.procInfo[this.currProc].state !== expected) {
      throw new Error(
        `Expected state ${expected} but got ${this.procInfo[this.currProc].state}`,
      );
    }
    this.procInfo[this.currProc].state = STATE_WAIT;
  }

  private moveToRunning(expected: ProcessState): void {
    if (this.procInfo[this.currProc].state !== expected) {
      throw new Error(
        `Expected state ${expected} but got ${this.procInfo[this.currProc].state}`,
      );
    }
    this.procInfo[this.currProc].state = STATE_RUNNING;
  }

  private moveToDone(expected: ProcessState): void {
    if (this.procInfo[this.currProc].state !== expected) {
      throw new Error(
        `Expected state ${expected} but got ${this.procInfo[this.currProc].state}`,
      );
    }
    this.procInfo[this.currProc].state = STATE_DONE;
  }

  private nextProc(pid?: number): void {
    if (pid !== undefined) {
      this.currProc = pid;
      this.moveToRunning(STATE_READY);
      return;
    }
    // Search from curr_proc+1 to end, then from 0 to curr_proc
    for (let p = this.currProc + 1; p < this.procInfo.length; p++) {
      if (this.procInfo[p].state === STATE_READY) {
        this.currProc = p;
        this.moveToRunning(STATE_READY);
        return;
      }
    }
    for (let p = 0; p <= this.currProc; p++) {
      if (this.procInfo[p].state === STATE_READY) {
        this.currProc = p;
        this.moveToRunning(STATE_READY);
        return;
      }
    }
  }

  private getNumActive(): number {
    return this.procInfo.filter((p) => p.state !== STATE_DONE).length;
  }

  private getNumRunnable(): number {
    return this.procInfo.filter(
      (p) => p.state === STATE_READY || p.state === STATE_RUNNING,
    ).length;
  }

  private getIOsInFlight(currentTime: number): number {
    let count = 0;
    for (const times of this.ioFinishTimes) {
      for (const t of times) {
        if (t > currentTime) {
          count++;
        }
      }
    }
    return count;
  }

  private checkIfDone(): void {
    if (this.procInfo[this.currProc].code.length === 0) {
      if (this.procInfo[this.currProc].state === STATE_RUNNING) {
        this.moveToDone(STATE_RUNNING);
        this.nextProc();
      }
    }
  }

  run(): SimulationResult {
    const trace: TraceRow[] = [];

    if (this.procInfo.length === 0) {
      return {
        processes: [],
        trace: [],
        stats: { totalTime: 0, cpuBusy: 0, ioBusy: 0 },
      };
    }

    // Save initial instructions for display
    const processes = this.procInfo.map((p) => ({
      pid: p.pid,
      instructions: [...p.code],
    }));

    // Track outstanding IOs per process
    this.ioFinishTimes = this.procInfo.map(() => []);

    // Make first process active
    this.currProc = 0;
    this.moveToRunning(STATE_READY);

    let clockTick = 0;
    let ioBusy = 0;
    let cpuBusy = 0;

    while (this.getNumActive() > 0) {
      clockTick++;

      // Check for IO finish
      let ioDone = false;
      for (let pid = 0; pid < this.procInfo.length; pid++) {
        if (this.ioFinishTimes[pid].includes(clockTick)) {
          ioDone = true;
          this.moveToReady(STATE_WAIT, pid);
          if (this.ioDoneBehavior === IO_RUN_IMMEDIATE) {
            if (this.currProc !== pid) {
              if (this.procInfo[this.currProc].state === STATE_RUNNING) {
                this.moveToReady(STATE_RUNNING);
              }
            }
            this.nextProc(pid);
          } else {
            // IO_RUN_LATER
            if (
              this.switchBehavior === SCHED_SWITCH_ON_END &&
              this.getNumRunnable() > 1
            ) {
              this.nextProc(pid);
            }
            if (this.getNumRunnable() === 1) {
              this.nextProc(pid);
            }
          }
          this.checkIfDone();
        }
      }

      // Execute instruction if current process is running and has instructions
      let instructionToExecute: Instruction | '' = '';
      if (
        this.procInfo[this.currProc].state === STATE_RUNNING &&
        this.procInfo[this.currProc].code.length > 0
      ) {
        instructionToExecute = this.procInfo[this.currProc].code.shift()!;
        cpuBusy++;
      }

      // Build trace row
      const processStates: string[] = [];
      for (let pid = 0; pid < this.procInfo.length; pid++) {
        if (pid === this.currProc && instructionToExecute !== '') {
          processStates.push(`RUN:${instructionToExecute}`);
        } else {
          processStates.push(this.procInfo[pid].state);
        }
      }

      const numOutstanding = this.getIOsInFlight(clockTick);
      if (numOutstanding > 0) {
        ioBusy++;
      }

      trace.push({
        time: clockTick,
        ioDone,
        processStates,
        cpuBusy: instructionToExecute !== '',
        numIOs: numOutstanding,
      });

      // If this is an IO start, switch to waiting and schedule completion
      if (instructionToExecute === DO_IO) {
        this.moveToWait(STATE_RUNNING);
        this.ioFinishTimes[this.currProc].push(
          clockTick + this.ioLength + 1,
        );
        if (this.switchBehavior === SCHED_SWITCH_ON_IO) {
          this.nextProc();
        }
      }

      // Check if current process is done
      this.checkIfDone();
    }

    return {
      processes,
      trace,
      stats: {
        totalTime: clockTick,
        cpuBusy,
        ioBusy,
      },
    };
  }
}

/** Run a full simulation with the given options */
export function runSimulation(options: SimulationOptions): SimulationResult {
  const rng = new Random(options.seed);
  const sched = new Scheduler(
    options.switchBehavior,
    options.ioDoneBehavior,
    options.ioLength,
  );

  if (options.program) {
    for (const p of options.program.split(':')) {
      sched.loadProgram(p);
    }
  } else {
    for (const p of options.processList.split(',')) {
      sched.load(p, rng);
    }
  }

  return sched.run();
}
