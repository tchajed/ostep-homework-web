import { Random } from "../random";

export type Policy = "FIFO" | "SJF" | "RR";

export interface Job {
  id: number;
  runtime: number;
}

export interface TraceEntry {
  time: number;
  jobId: number;
  ranFor: number;
  done: boolean;
  doneAt: number | null;
}

export interface JobStats {
  jobId: number;
  response: number;
  turnaround: number;
  wait: number;
}

export interface SchedulerResult {
  jobs: Job[];
  trace: TraceEntry[];
  stats: JobStats[];
  avgResponse: number;
  avgTurnaround: number;
  avgWait: number;
}

export interface SchedulerParams {
  seed: number;
  numJobs: number;
  maxLen: number;
  policy: Policy;
  quantum: number;
  jobList?: string; // comma-separated runtimes
}

export function generateJobs(
  seed: number,
  numJobs: number,
  maxLen: number
): Job[] {
  const rng = new Random(seed);
  const jobs: Job[] = [];
  for (let i = 0; i < numJobs; i++) {
    const runtime = Math.floor(maxLen * rng.random()) + 1;
    jobs.push({ id: i, runtime });
  }
  return jobs;
}

export function parseJobList(jlist: string): Job[] {
  return jlist
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s, i) => ({ id: i, runtime: parseFloat(s) }));
}

function solveFIFO(joblist: Job[]): SchedulerResult {
  const trace: TraceEntry[] = [];
  let thetime = 0;

  for (const job of joblist) {
    trace.push({
      time: thetime,
      jobId: job.id,
      ranFor: job.runtime,
      done: true,
      doneAt: thetime + job.runtime,
    });
    thetime += job.runtime;
  }

  const stats: JobStats[] = [];
  let t = 0;
  let turnaroundSum = 0;
  let waitSum = 0;
  let responseSum = 0;

  for (const job of joblist) {
    const response = t;
    const turnaround = t + job.runtime;
    const wait = t;
    stats.push({ jobId: job.id, response, turnaround, wait });
    responseSum += response;
    turnaroundSum += turnaround;
    waitSum += wait;
    t += job.runtime;
  }

  const count = joblist.length;
  return {
    jobs: joblist,
    trace,
    stats,
    avgResponse: responseSum / count,
    avgTurnaround: turnaroundSum / count,
    avgWait: waitSum / count,
  };
}

function solveRR(joblist: Job[], quantum: number): SchedulerResult {
  const trace: TraceEntry[] = [];
  const turnaround: Record<number, number> = {};
  const response: Record<number, number> = {};
  const lastran: Record<number, number> = {};
  const wait: Record<number, number> = {};

  let jobcount = joblist.length;
  for (let i = 0; i < jobcount; i++) {
    lastran[i] = 0;
    wait[i] = 0;
    turnaround[i] = 0;
    response[i] = -1;
  }

  const runlist: [number, number][] = joblist.map((j) => [j.id, j.runtime]);
  let thetime = 0;

  while (jobcount > 0) {
    const job = runlist.shift()!;
    const jobnum = job[0];
    let runtime = job[1];

    if (response[jobnum] === -1) {
      response[jobnum] = thetime;
    }
    const currwait = thetime - lastran[jobnum];
    wait[jobnum] += currwait;

    let ranfor: number;
    let done: boolean;
    if (runtime > quantum) {
      runtime -= quantum;
      ranfor = quantum;
      done = false;
      runlist.push([jobnum, runtime]);
    } else {
      ranfor = runtime;
      done = true;
      turnaround[jobnum] = thetime + ranfor;
      jobcount--;
    }

    trace.push({
      time: thetime,
      jobId: jobnum,
      ranFor: ranfor,
      done,
      doneAt: done ? thetime + ranfor : null,
    });

    thetime += ranfor;
    lastran[jobnum] = thetime;
  }

  const stats: JobStats[] = [];
  let turnaroundSum = 0;
  let waitSum = 0;
  let responseSum = 0;

  for (let i = 0; i < joblist.length; i++) {
    turnaroundSum += turnaround[i];
    responseSum += response[i];
    waitSum += wait[i];
    stats.push({
      jobId: i,
      response: response[i],
      turnaround: turnaround[i],
      wait: wait[i],
    });
  }

  const count = joblist.length;
  return {
    jobs: joblist,
    trace,
    stats,
    avgResponse: responseSum / count,
    avgTurnaround: turnaroundSum / count,
    avgWait: waitSum / count,
  };
}

export function simulate(params: SchedulerParams): SchedulerResult {
  let jobs: Job[];
  if (params.jobList && params.jobList.trim() !== "") {
    jobs = parseJobList(params.jobList);
  } else {
    jobs = generateJobs(params.seed, params.numJobs, params.maxLen);
  }

  const { policy, quantum } = params;

  if (policy === "SJF") {
    const sorted = [...jobs].sort((a, b) => a.runtime - b.runtime);
    return solveFIFO(sorted);
  }

  if (policy === "FIFO") {
    return solveFIFO(jobs);
  }

  if (policy === "RR") {
    return solveRR(jobs, quantum);
  }

  throw new Error(`Unknown policy: ${policy}`);
}
