import { Random } from "../random";

// ---- Types ----

export interface Job {
  name: string;
  runTime: number;
  workingSetSize: number;
  affinity: number[]; // empty means any CPU
  timeLeft: number;
}

export interface CpuTickEntry {
  /** Job name running this tick, or null if idle */
  job: string | null;
  /** Time remaining for the job after this tick (only meaningful if job !== null) */
  timeLeft: number;
  /** Per-job cache state: 'w' if warm, ' ' if cold, indexed by job name order */
  cacheState: string[];
}

export interface SimulationResult {
  jobs: Job[];
  /** jobs[i].name list, preserving creation order */
  jobNames: string[];
  numCpus: number;
  /** Per-CPU queue assignment (only meaningful for per-cpu mode) */
  perCpuQueues: string[][];
  /** Central queue (only meaningful for centralized mode) */
  centralQueue: string[];
  perCpuQueuesMode: boolean;
  /** ticks[t][cpu] = CpuTickEntry */
  ticks: CpuTickEntry[][];
  finishedTime: number;
  /** Per-CPU stats */
  stats: { utilization: number; warmUtilization: number }[];
  timeSlice: number;
}

export interface SimulationOptions {
  seed: number;
  jobNum: number;
  maxRun: number;
  maxWset: number;
  jobList: string; // comma-separated "name:runtime:wset" or empty for random
  numCpus: number;
  timeSlice: number;
  perCpuQueues: boolean;
  peekInterval: number;
  cacheSize: number;
  cacheWarmupTime: number;
  cacheRateWarm: number;
  cacheRateCold: number;
  randomOrder: boolean;
  affinity: string; // comma-separated "name:cpu.cpu" or empty
}

export const defaultOptions: SimulationOptions = {
  seed: 0,
  jobNum: 3,
  maxRun: 100,
  maxWset: 200,
  jobList: "",
  numCpus: 2,
  timeSlice: 10,
  perCpuQueues: false,
  peekInterval: 30,
  cacheSize: 100,
  cacheWarmupTime: 10,
  cacheRateWarm: 2,
  cacheRateCold: 1,
  randomOrder: false,
  affinity: "",
};

// ---- Cache ----

class Cache {
  cpuId: number;
  jobs: Map<string, Job>;
  cacheSize: number;
  cacheRateCold: number;
  cacheRateWarm: number;
  cacheWarmupTime: number;

  /** Job names whose working sets are in the cache (front = most recently added) */
  cacheContents: string[] = [];
  /** Job names currently warming up */
  cacheWarming: string[] = [];
  /** Warmup counters */
  cacheWarmingCounter: Map<string, number> = new Map();

  constructor(
    cpuId: number,
    jobs: Map<string, Job>,
    cacheSize: number,
    cacheRateCold: number,
    cacheRateWarm: number,
    cacheWarmupTime: number
  ) {
    this.cpuId = cpuId;
    this.jobs = jobs;
    this.cacheSize = cacheSize;
    this.cacheRateCold = cacheRateCold;
    this.cacheRateWarm = cacheRateWarm;
    this.cacheWarmupTime = cacheWarmupTime;
  }

  newJob(jobName: string): void {
    if (
      !this.cacheContents.includes(jobName) &&
      !this.cacheWarming.includes(jobName)
    ) {
      if (this.cacheWarmupTime === 0) {
        this.cacheContents.unshift(jobName);
        this.adjustSize();
      } else {
        this.cacheWarming.push(jobName);
        this.cacheWarmingCounter.set(jobName, this.cacheWarmupTime);
      }
    }
  }

  totalWorkingSet(): number {
    let sum = 0;
    for (const name of this.cacheContents) {
      sum += this.jobs.get(name)!.workingSetSize;
    }
    return sum;
  }

  adjustSize(): void {
    let total = this.totalWorkingSet();
    while (total > this.cacheSize) {
      const lastIndex = this.cacheContents.length - 1;
      const jobGone = this.cacheContents[lastIndex];
      this.cacheContents.splice(lastIndex, 1);
      this.cacheWarming.push(jobGone);
      this.cacheWarmingCounter.set(jobGone, this.cacheWarmupTime);
      total -= this.jobs.get(jobGone)!.workingSetSize;
    }
  }

  getCacheState(jobName: string): string {
    return this.cacheContents.includes(jobName) ? "w" : " ";
  }

  getRate(jobName: string): number {
    return this.cacheContents.includes(jobName)
      ? this.cacheRateWarm
      : this.cacheRateCold;
  }

  updateWarming(jobName: string): void {
    if (this.cacheWarming.includes(jobName)) {
      const counter = this.cacheWarmingCounter.get(jobName)! - 1;
      this.cacheWarmingCounter.set(jobName, counter);
      if (counter <= 0) {
        this.cacheWarming.splice(this.cacheWarming.indexOf(jobName), 1);
        this.cacheContents.unshift(jobName);
        this.adjustSize();
      }
    }
  }
}

// ---- Simulator ----

const STATE_IDLE = 1;
const STATE_RUNNING = 2;

export function simulate(opts: SimulationOptions): SimulationResult {
  const rng = new Random(opts.seed);

  // --- Generate or parse jobs ---
  const jobs = new Map<string, Job>();
  const jobNames: string[] = [];

  let jobList = opts.jobList;
  if (jobList === "") {
    // Randomly generate jobs
    const parts: string[] = [];
    for (let j = 0; j < opts.jobNum; j++) {
      const runTime =
        Math.floor((rng.random() * opts.maxRun) / 10.0) * 10;
      const workingSet =
        Math.floor((rng.random() * opts.maxWset) / 10.0) * 10;
      parts.push(`${j}:${runTime}:${workingSet}`);
    }
    jobList = parts.join(",");
  }

  for (const entry of jobList.split(",")) {
    const tmp = entry.split(":");
    if (tmp.length !== 3) {
      throw new Error(
        `Bad job description [${entry}]: needs triple of name:runtime:working_set_size`
      );
    }
    const [name, rtStr, wsStr] = tmp;
    const runTime = parseInt(rtStr, 10);
    const workingSetSize = parseInt(wsStr, 10);
    if (jobNames.includes(name)) {
      throw new Error(`Repeated job name ${name}`);
    }
    jobs.set(name, {
      name,
      runTime,
      workingSetSize,
      affinity: [],
      timeLeft: runTime,
    });
    jobNames.push(name);
  }

  // --- Parse affinity ---
  if (opts.affinity !== "") {
    for (const entry of opts.affinity.split(",")) {
      const tmp = entry.split(":");
      if (tmp.length !== 2) {
        throw new Error(`Bad affinity spec: ${entry}`);
      }
      const [jname, cpuStr] = tmp;
      const job = jobs.get(jname);
      if (!job) {
        throw new Error(
          `Job name ${jname} in affinity list does not exist`
        );
      }
      for (const c of cpuStr.split(".")) {
        const cpuId = parseInt(c, 10);
        if (cpuId < 0 || cpuId >= opts.numCpus) {
          throw new Error(
            `Bad CPU ${cpuId} specified in affinity ${entry}`
          );
        }
        job.affinity.push(cpuId);
      }
    }
  }

  // --- Set up queues ---
  const perCpuSchedQueue: string[][] = [];
  let centralQueue: string[] = [];

  if (opts.perCpuQueues) {
    for (let cpu = 0; cpu < opts.numCpus; cpu++) {
      perCpuSchedQueue.push([]);
    }
    const jobsNotAssigned = [...jobNames];
    while (jobsNotAssigned.length > 0) {
      for (let cpu = 0; cpu < opts.numCpus; cpu++) {
        let assigned = false;
        for (const jname of jobsNotAssigned) {
          const job = jobs.get(jname)!;
          if (
            job.affinity.length === 0 ||
            job.affinity.includes(cpu)
          ) {
            perCpuSchedQueue[cpu].push(jname);
            jobsNotAssigned.splice(jobsNotAssigned.indexOf(jname), 1);
            assigned = true;
          }
          if (assigned) break;
        }
      }
    }
  } else {
    centralQueue = [...jobNames];
    for (let cpu = 0; cpu < opts.numCpus; cpu++) {
      perCpuSchedQueue.push(centralQueue); // all point to same array
    }
  }

  // --- State ---
  const schedState: number[] = new Array(opts.numCpus).fill(STATE_IDLE);
  const schedCurrent: (string | null)[] = new Array(opts.numCpus).fill(
    null
  );
  const statsRan: number[] = new Array(opts.numCpus).fill(0);
  const statsRanWarm: number[] = new Array(opts.numCpus).fill(0);

  const caches: Cache[] = [];
  for (let cpu = 0; cpu < opts.numCpus; cpu++) {
    caches.push(
      new Cache(
        cpu,
        jobs,
        opts.cacheSize,
        opts.cacheRateCold,
        opts.cacheRateWarm,
        opts.cacheWarmupTime
      )
    );
  }

  const numJobs = jobNames.length;
  let systemTime = 0;
  let jobsFinished = 0;

  const ticks: CpuTickEntry[][] = [];

  // Save initial queue state for result
  const initialPerCpuQueues = opts.perCpuQueues
    ? perCpuSchedQueue.map((q) => [...q])
    : [];

  // --- Helper functions ---

  function handleOneInterrupt(interrupt: boolean, cpu: number): void {
    if (interrupt && schedState[cpu] === STATE_RUNNING) {
      schedState[cpu] = STATE_IDLE;
      const jobName = schedCurrent[cpu]!;
      schedCurrent[cpu] = null;
      perCpuSchedQueue[cpu].push(jobName);
    }
  }

  function handleInterrupts(): boolean {
    let interrupt = false;
    if (systemTime % opts.timeSlice === 0 && systemTime > 0) {
      interrupt = true;
    }
    for (let cpu = 0; cpu < opts.numCpus; cpu++) {
      handleOneInterrupt(interrupt, cpu);
    }
    return interrupt;
  }

  function getJob(cpu: number, schedQueue: string[]): void {
    for (let i = 0; i < schedQueue.length; i++) {
      const jname = schedQueue[i];
      const job = jobs.get(jname)!;
      if (job.affinity.length === 0 || job.affinity.includes(cpu)) {
        schedQueue.splice(i, 1);
        schedState[cpu] = STATE_RUNNING;
        schedCurrent[cpu] = jname;
        caches[cpu].newJob(jname);
        return;
      }
    }
  }

  function assignJobs(): void {
    let cpuList: number[];
    if (opts.randomOrder) {
      cpuList = Array.from({ length: opts.numCpus }, (_, i) => i);
      rng.shuffle(cpuList);
    } else {
      cpuList = Array.from({ length: opts.numCpus }, (_, i) => i);
    }
    for (const cpu of cpuList) {
      if (schedState[cpu] === STATE_IDLE) {
        getJob(cpu, perCpuSchedQueue[cpu]);
      }
    }
  }

  function stealJobs(): void {
    if (!opts.perCpuQueues || opts.peekInterval <= 0) return;
    if (systemTime > 0 && systemTime % opts.peekInterval === 0) {
      for (let cpu = 0; cpu < opts.numCpus; cpu++) {
        if (perCpuSchedQueue[cpu].length === 0) {
          const otherCpuList: number[] = [];
          for (let c = 0; c < opts.numCpus; c++) {
            if (c !== cpu) otherCpuList.push(c);
          }
          const otherCpu = rng.choice(otherCpuList);

          for (const jname of perCpuSchedQueue[otherCpu]) {
            const job = jobs.get(jname)!;
            if (
              job.affinity.length === 0 ||
              job.affinity.includes(cpu)
            ) {
              perCpuSchedQueue[otherCpu].splice(
                perCpuSchedQueue[otherCpu].indexOf(jname),
                1
              );
              perCpuSchedQueue[cpu].push(jname);
              break;
            }
          }
        }
      }
    }
  }

  function runOneTick(cpu: number): {
    jobName: string;
    timeLeft: number;
  } {
    const jobName = schedCurrent[cpu]!;
    const job = jobs.get(jobName)!;

    const currentRate = caches[cpu].getRate(jobName);
    statsRan[cpu]++;
    if (currentRate > 1) {
      statsRanWarm[cpu]++;
    }
    let timeLeft = job.timeLeft - currentRate;
    if (timeLeft < 0) timeLeft = 0;
    job.timeLeft = timeLeft;

    caches[cpu].updateWarming(jobName);

    if (timeLeft <= 0) {
      schedState[cpu] = STATE_IDLE;
      schedCurrent[cpu] = null;
      jobsFinished++;
    }

    return { jobName, timeLeft };
  }

  // --- Main loop ---

  while (jobsFinished < numJobs) {
    const interrupt = handleInterrupts();
    stealJobs();
    assignJobs();

    // Run jobs and record tick
    const tickRow: CpuTickEntry[] = [];
    for (let cpu = 0; cpu < opts.numCpus; cpu++) {
      let entry: CpuTickEntry;
      if (schedState[cpu] === STATE_RUNNING) {
        const { jobName, timeLeft } = runOneTick(cpu);
        const cacheState = jobNames.map((jn) =>
          caches[cpu].getCacheState(jn)
        );
        entry = { job: jobName, timeLeft, cacheState };
      } else {
        const cacheState = jobNames.map((jn) =>
          caches[cpu].getCacheState(jn)
        );
        entry = { job: null, timeLeft: 0, cacheState };
      }
      tickRow.push(entry);
    }
    ticks.push(tickRow);

    systemTime++;
  }

  // --- Compute stats ---
  const stats = [];
  for (let cpu = 0; cpu < opts.numCpus; cpu++) {
    stats.push({
      utilization:
        (100.0 * statsRan[cpu]) / systemTime,
      warmUtilization:
        (100.0 * statsRanWarm[cpu]) / systemTime,
    });
  }

  return {
    jobs: jobNames.map((n) => jobs.get(n)!),
    jobNames,
    numCpus: opts.numCpus,
    perCpuQueues: initialPerCpuQueues,
    centralQueue: opts.perCpuQueues ? [] : [...jobNames],
    perCpuQueuesMode: opts.perCpuQueues,
    ticks,
    finishedTime: systemTime,
    stats,
    timeSlice: opts.timeSlice,
  };
}
