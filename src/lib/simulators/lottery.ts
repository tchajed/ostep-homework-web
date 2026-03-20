import { Random } from '../random';

export interface Job {
  id: number;
  length: number;
  tickets: number;
}

export interface JobState {
  id: number;
  timeLeft: number;
  tickets: number; // 0 when done
  done: boolean;
}

export interface StepResult {
  randomValue: number;
  winningTicket: number;
  totalTickets: number;
  winnerId: number;
  jobStates: JobState[]; // snapshot before decrement
  clock: number; // clock after this step
  completedJobId: number | null; // if a job finished this step
}

export interface LotteryParams {
  seed: number;
  jobs: number;
  jlist: string; // e.g. "10:100,20:100" or empty
  maxlen: number;
  maxticket: number;
  quantum: number;
}

export const defaultParams: LotteryParams = {
  seed: 0,
  jobs: 3,
  jlist: '',
  maxlen: 10,
  maxticket: 100,
  quantum: 1,
};

/** Generate the initial job list (consumes random numbers for random jobs). */
export function generateJobs(rng: Random, params: LotteryParams): Job[] {
  if (params.jlist !== '') {
    return params.jlist.split(',').map((entry, i) => {
      const [runtime, tickets] = entry.split(':').map(Number);
      return { id: i, length: runtime, tickets };
    });
  }

  const joblist: Job[] = [];
  for (let i = 0; i < params.jobs; i++) {
    let runtime = 0;
    while (runtime === 0) {
      runtime = Math.floor(params.maxlen * rng.random());
    }
    let tickets = 0;
    while (tickets === 0) {
      tickets = Math.floor(params.maxticket * rng.random());
    }
    joblist.push({ id: i, length: runtime, tickets });
  }
  return joblist;
}

/**
 * Generate the list of random numbers needed (without computing the solution).
 * This matches the Python simulator's non-solve mode.
 */
export function generateRandomNumbers(rng: Random, totalRuntime: number): number[] {
  const nums: number[] = [];
  for (let i = 0; i < totalRuntime; i++) {
    nums.push(Math.floor(rng.random() * 1000001));
  }
  return nums;
}

/**
 * Run the full lottery simulation, returning each step.
 */
export function simulate(params: LotteryParams): {
  jobs: Job[];
  steps: StepResult[];
  randomNumbers: number[];
} {
  const rng = new Random(params.seed);
  const jobs = generateJobs(rng, params);

  const totalRuntime = jobs.reduce((s, j) => s + j.length, 0);

  // State arrays (mutable during simulation)
  const timeLeft = jobs.map(j => j.length);
  const ticketsLeft = jobs.map(j => j.tickets);
  let tickTotal = jobs.reduce((s, j) => s + j.tickets, 0);
  let activeJobs = jobs.length;
  let clock = 0;

  const steps: StepResult[] = [];
  const randomNumbers: number[] = [];

  for (let i = 0; i < totalRuntime; i++) {
    if (activeJobs === 0) break;

    const r = Math.floor(rng.random() * 1000001);
    randomNumbers.push(r);
    const winner = r % tickTotal;

    // Find the winning job
    let current = 0;
    let winnerId = -1;
    for (const job of jobs) {
      current += ticketsLeft[job.id];
      if (current > winner) {
        winnerId = job.id;
        break;
      }
    }

    // Snapshot job states before decrement
    const jobStates: JobState[] = jobs.map(j => ({
      id: j.id,
      timeLeft: timeLeft[j.id],
      tickets: ticketsLeft[j.id],
      done: timeLeft[j.id] === 0,
    }));

    // Decrement time
    if (timeLeft[winnerId] >= params.quantum) {
      timeLeft[winnerId] -= params.quantum;
    } else {
      timeLeft[winnerId] = 0;
    }
    clock += params.quantum;

    let completedJobId: number | null = null;
    if (timeLeft[winnerId] === 0 && !jobStates[winnerId].done) {
      completedJobId = winnerId;
      tickTotal -= ticketsLeft[winnerId];
      ticketsLeft[winnerId] = 0;
      activeJobs--;
    }

    steps.push({
      randomValue: r,
      winningTicket: winner,
      totalTickets: jobStates.reduce((s, js) => s + js.tickets, 0),
      winnerId,
      jobStates,
      clock,
      completedJobId,
    });
  }

  return { jobs, steps, randomNumbers };
}
