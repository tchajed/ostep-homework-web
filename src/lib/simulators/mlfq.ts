import { Random } from "../random";

/** Configuration for the MLFQ simulator */
export interface MlfqConfig {
  seed: number;
  numQueues: number;
  /** Quantum per queue level (index 0 = lowest priority). If empty, uses `quantum` for all. */
  quantumList: number[];
  /** Allotment per queue level (index 0 = lowest priority). If empty, uses `allotment` for all. */
  allotmentList: number[];
  /** Default quantum if quantumList is empty */
  quantum: number;
  /** Default allotment if allotmentList is empty */
  allotment: number;
  numJobs: number;
  maxlen: number;
  maxio: number;
  boost: number;
  ioTime: number;
  stay: boolean;
  iobump: boolean;
  /** Job list as "startTime,runTime,ioFreq:..." or empty for random */
  jlist: string;
}

export const defaultConfig: MlfqConfig = {
  seed: 0,
  numQueues: 3,
  quantumList: [],
  allotmentList: [],
  quantum: 10,
  allotment: 1,
  numJobs: 3,
  maxlen: 100,
  maxio: 10,
  boost: 0,
  ioTime: 5,
  stay: false,
  iobump: false,
  jlist: "",
};

export interface JobSpec {
  jobId: number;
  startTime: number;
  runTime: number;
  ioFreq: number;
}

export interface JobResult {
  jobId: number;
  startTime: number;
  runTime: number;
  ioFreq: number;
  response: number;
  turnaround: number;
  endTime: number;
  firstRun: number;
}

export type TraceEventType =
  | "JOB_BEGINS"
  | "RUN"
  | "IO_START"
  | "IO_DONE"
  | "FINISHED"
  | "IDLE"
  | "BOOST";

export interface TraceEvent {
  time: number;
  type: TraceEventType;
  jobId: number; // -1 for IDLE/BOOST
  priority: number; // queue level, -1 if N/A
  ticksLeft: number;
  allotLeft: number;
  timeLeft: number;
  runTime: number;
}

export interface MlfqResult {
  jobs: JobSpec[];
  trace: TraceEvent[];
  stats: JobResult[];
  avgResponse: number;
  avgTurnaround: number;
  /** The resolved quantum per queue (index 0 = lowest priority) */
  quantumPerQueue: number[];
  /** The resolved allotment per queue (index 0 = lowest priority) */
  allotmentPerQueue: number[];
  numQueues: number;
}

interface JobState {
  currPri: number;
  ticksLeft: number;
  allotLeft: number;
  startTime: number;
  runTime: number;
  timeLeft: number;
  ioFreq: number;
  doingIO: boolean;
  firstRun: number;
  endTime: number;
}

export function simulateMlfq(config: MlfqConfig): MlfqResult {
  const rng = new Random(config.seed);

  // Determine number of queues and quantum/allotment per level
  let numQueues = config.numQueues;
  const quantum: Record<number, number> = {};
  const allotment: Record<number, number> = {};

  if (config.quantumList.length > 0) {
    numQueues = config.quantumList.length;
    let qc = numQueues - 1;
    for (let i = 0; i < numQueues; i++) {
      quantum[qc] = config.quantumList[i];
      qc--;
    }
  } else {
    for (let i = 0; i < numQueues; i++) {
      quantum[i] = config.quantum;
    }
  }

  if (config.allotmentList.length > 0) {
    if (numQueues !== config.allotmentList.length) {
      throw new Error(
        "number of allotments specified must match number of quantums"
      );
    }
    let qc = numQueues - 1;
    for (let i = 0; i < numQueues; i++) {
      allotment[qc] = config.allotmentList[i];
      qc--;
    }
  } else {
    for (let i = 0; i < numQueues; i++) {
      allotment[i] = config.allotment;
    }
  }

  const hiQueue = numQueues - 1;
  const ioTime = config.ioTime;

  // Events scheduled for future times (IO completions & job arrivals)
  const ioDone: Record<number, Array<[number, string]>> = {};

  // Job state
  const jobs: JobState[] = [];
  const jobSpecs: JobSpec[] = [];

  if (config.jlist !== "") {
    const allJobs = config.jlist.split(":");
    for (const j of allJobs) {
      const jobInfo = j.split(",");
      if (jobInfo.length !== 3) {
        throw new Error(
          "Badly formatted job string. Should be x1,y1,z1:x2,y2,z2:..."
        );
      }
      const startTime = parseInt(jobInfo[0]);
      const runTime = parseInt(jobInfo[1]);
      const ioFreq = parseInt(jobInfo[2]);
      const jobId = jobs.length;
      jobs.push({
        currPri: hiQueue,
        ticksLeft: quantum[hiQueue],
        allotLeft: allotment[hiQueue],
        startTime,
        runTime,
        timeLeft: runTime,
        ioFreq,
        doingIO: false,
        firstRun: -1,
        endTime: -1,
      });
      jobSpecs.push({ jobId, startTime, runTime, ioFreq });
      if (!(startTime in ioDone)) ioDone[startTime] = [];
      ioDone[startTime].push([jobId, "JOB BEGINS"]);
    }
  } else {
    for (let j = 0; j < config.numJobs; j++) {
      const startTime = 0;
      const runTime = Math.floor(rng.random() * (config.maxlen - 1) + 1);
      const ioFreq = Math.floor(rng.random() * (config.maxio - 1) + 1);
      const jobId = jobs.length;
      jobs.push({
        currPri: hiQueue,
        ticksLeft: quantum[hiQueue],
        allotLeft: allotment[hiQueue],
        startTime,
        runTime,
        timeLeft: runTime,
        ioFreq,
        doingIO: false,
        firstRun: -1,
        endTime: -1,
      });
      jobSpecs.push({ jobId, startTime, runTime, ioFreq });
      if (!(startTime in ioDone)) ioDone[startTime] = [];
      ioDone[startTime].push([jobId, "JOB BEGINS"]);
    }
  }

  const numJobs = jobs.length;

  // Initialize queues
  const queue: number[][] = [];
  for (let q = 0; q < numQueues; q++) {
    queue.push([]);
  }

  let currTime = 0;
  let finishedJobs = 0;
  const trace: TraceEvent[] = [];

  function findQueue(): number {
    let q = hiQueue;
    while (q > 0) {
      if (queue[q].length > 0) return q;
      q--;
    }
    if (queue[0].length > 0) return 0;
    return -1;
  }

  while (finishedJobs < numJobs) {
    // Check for priority boost
    if (config.boost > 0 && currTime !== 0) {
      if (currTime % config.boost === 0) {
        trace.push({
          time: currTime,
          type: "BOOST",
          jobId: -1,
          priority: -1,
          ticksLeft: 0,
          allotLeft: 0,
          timeLeft: 0,
          runTime: 0,
        });
        // Move all jobs from lower queues to hiQueue
        for (let q = 0; q < numQueues - 1; q++) {
          for (const j of queue[q]) {
            if (!jobs[j].doingIO) {
              queue[hiQueue].push(j);
            }
          }
          queue[q] = [];
        }
        // Reset priorities for all unfinished jobs
        for (let j = 0; j < numJobs; j++) {
          if (jobs[j].timeLeft > 0) {
            jobs[j].currPri = hiQueue;
            jobs[j].ticksLeft = quantum[hiQueue];
            jobs[j].allotLeft = allotment[hiQueue];
          }
        }
      }
    }

    // Check for IO completions and job arrivals
    if (currTime in ioDone) {
      for (const [j, type] of ioDone[currTime]) {
        const q = jobs[j].currPri;
        jobs[j].doingIO = false;
        const eventType: TraceEventType =
          type === "JOB BEGINS" ? "JOB_BEGINS" : "IO_DONE";
        trace.push({
          time: currTime,
          type: eventType,
          jobId: j,
          priority: q,
          ticksLeft: jobs[j].ticksLeft,
          allotLeft: jobs[j].allotLeft,
          timeLeft: jobs[j].timeLeft,
          runTime: jobs[j].runTime,
        });
        if (!config.iobump || type === "JOB BEGINS") {
          queue[q].push(j);
        } else {
          queue[q].unshift(j);
        }
      }
    }

    // Find highest priority job
    const currQueue = findQueue();
    if (currQueue === -1) {
      trace.push({
        time: currTime,
        type: "IDLE",
        jobId: -1,
        priority: -1,
        ticksLeft: 0,
        allotLeft: 0,
        timeLeft: 0,
        runTime: 0,
      });
      currTime++;
      continue;
    }

    const currJob = queue[currQueue][0];
    jobs[currJob].timeLeft--;
    jobs[currJob].ticksLeft--;

    if (jobs[currJob].firstRun === -1) {
      jobs[currJob].firstRun = currTime;
    }

    const runTime = jobs[currJob].runTime;
    const ioFreq = jobs[currJob].ioFreq;
    const ticksLeft = jobs[currJob].ticksLeft;
    const allotLeft = jobs[currJob].allotLeft;
    const timeLeft = jobs[currJob].timeLeft;

    trace.push({
      time: currTime,
      type: "RUN",
      jobId: currJob,
      priority: currQueue,
      ticksLeft,
      allotLeft,
      timeLeft,
      runTime,
    });

    currTime++;

    // Check for job ending
    if (timeLeft === 0) {
      trace.push({
        time: currTime,
        type: "FINISHED",
        jobId: currJob,
        priority: currQueue,
        ticksLeft,
        allotLeft,
        timeLeft: 0,
        runTime,
      });
      finishedJobs++;
      jobs[currJob].endTime = currTime;
      queue[currQueue].shift();
      continue;
    }

    // Check for IO
    let issuedIO = false;
    if (ioFreq > 0 && (runTime - timeLeft) % ioFreq === 0) {
      trace.push({
        time: currTime,
        type: "IO_START",
        jobId: currJob,
        priority: currQueue,
        ticksLeft,
        allotLeft,
        timeLeft,
        runTime,
      });
      issuedIO = true;
      queue[currQueue].shift();
      jobs[currJob].doingIO = true;
      if (config.stay) {
        jobs[currJob].ticksLeft = quantum[currQueue];
        jobs[currJob].allotLeft = allotment[currQueue];
      }
      const futureTime = currTime + ioTime;
      if (!(futureTime in ioDone)) ioDone[futureTime] = [];
      ioDone[futureTime].push([currJob, "IO_DONE"]);
    }

    // Check for quantum ending
    if (ticksLeft === 0) {
      let desched = -1;
      if (!issuedIO) {
        desched = queue[currQueue].shift()!;
      }

      jobs[currJob].allotLeft = jobs[currJob].allotLeft - 1;

      if (jobs[currJob].allotLeft === 0) {
        if (currQueue > 0) {
          jobs[currJob].currPri = currQueue - 1;
          jobs[currJob].ticksLeft = quantum[currQueue - 1];
          jobs[currJob].allotLeft = allotment[currQueue - 1];
          if (!issuedIO) {
            queue[currQueue - 1].push(currJob);
          }
        } else {
          jobs[currJob].ticksLeft = quantum[currQueue];
          jobs[currJob].allotLeft = allotment[currQueue];
          if (!issuedIO) {
            queue[currQueue].push(currJob);
          }
        }
      } else {
        jobs[currJob].ticksLeft = quantum[currQueue];
        if (!issuedIO) {
          queue[currQueue].push(currJob);
        }
      }
    }
  }

  // Compute statistics
  const stats: JobResult[] = [];
  let responseSum = 0;
  let turnaroundSum = 0;
  for (let i = 0; i < numJobs; i++) {
    const response = jobs[i].firstRun - jobs[i].startTime;
    const turnaround = jobs[i].endTime - jobs[i].startTime;
    stats.push({
      jobId: i,
      startTime: jobs[i].startTime,
      runTime: jobs[i].runTime,
      ioFreq: jobs[i].ioFreq,
      response,
      turnaround,
      endTime: jobs[i].endTime,
      firstRun: jobs[i].firstRun,
    });
    responseSum += response;
    turnaroundSum += turnaround;
  }

  const quantumPerQueue: number[] = [];
  const allotmentPerQueue: number[] = [];
  for (let i = 0; i < numQueues; i++) {
    quantumPerQueue.push(quantum[i]);
    allotmentPerQueue.push(allotment[i]);
  }

  return {
    jobs: jobSpecs,
    trace,
    stats,
    avgResponse: responseSum / numJobs,
    avgTurnaround: turnaroundSum / numJobs,
    quantumPerQueue,
    allotmentPerQueue,
    numQueues,
  };
}
