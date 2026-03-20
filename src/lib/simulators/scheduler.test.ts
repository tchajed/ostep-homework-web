import { describe, it, expect } from "vitest";
import { simulate, parseJobList, type SchedulerParams } from "./scheduler";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

describe("parseJobList", () => {
  it("parses comma-separated runtimes", () => {
    const jobs = parseJobList("5,10,3");
    expect(jobs).toEqual([
      { id: 0, runtime: 5 },
      { id: 1, runtime: 10 },
      { id: 2, runtime: 3 },
    ]);
  });

  it("handles whitespace", () => {
    const jobs = parseJobList(" 5 , 10 , 3 ");
    expect(jobs).toEqual([
      { id: 0, runtime: 5 },
      { id: 1, runtime: 10 },
      { id: 2, runtime: 3 },
    ]);
  });
});

describe("FIFO scheduling", () => {
  it("runs jobs in order with correct stats", () => {
    const params: SchedulerParams = {
      seed: 0,
      numJobs: 3,
      maxLen: 10,
      policy: "FIFO",
      quantum: 1,
      jobList: "2,9,8",
    };
    const result = simulate(params);

    // Execution trace
    expect(result.trace).toHaveLength(3);
    expect(result.trace[0]).toMatchObject({
      time: 0,
      jobId: 0,
      ranFor: 2,
      done: true,
      doneAt: 2,
    });
    expect(result.trace[1]).toMatchObject({
      time: 2,
      jobId: 1,
      ranFor: 9,
      done: true,
      doneAt: 11,
    });
    expect(result.trace[2]).toMatchObject({
      time: 11,
      jobId: 2,
      ranFor: 8,
      done: true,
      doneAt: 19,
    });

    // Per-job stats (matching Python output for seed=1 FIFO)
    expect(result.stats).toEqual([
      { jobId: 0, response: 0, turnaround: 2, wait: 0 },
      { jobId: 1, response: 2, turnaround: 11, wait: 2 },
      { jobId: 2, response: 11, turnaround: 19, wait: 11 },
    ]);

    expect(round2(result.avgResponse)).toBe(4.33);
    expect(round2(result.avgTurnaround)).toBe(10.67);
    expect(round2(result.avgWait)).toBe(4.33);
  });
});

describe("SJF scheduling", () => {
  it("sorts jobs by runtime then runs FIFO", () => {
    const params: SchedulerParams = {
      seed: 0,
      numJobs: 3,
      maxLen: 10,
      policy: "SJF",
      quantum: 1,
      jobList: "5,10,3",
    };
    const result = simulate(params);

    // SJF sorts: job2(3), job0(5), job1(10)
    expect(result.trace[0]).toMatchObject({ jobId: 2, ranFor: 3, time: 0 });
    expect(result.trace[1]).toMatchObject({ jobId: 0, ranFor: 5, time: 3 });
    expect(result.trace[2]).toMatchObject({ jobId: 1, ranFor: 10, time: 8 });

    expect(round2(result.avgResponse)).toBe(3.67);
    expect(round2(result.avgTurnaround)).toBe(9.67);
    expect(round2(result.avgWait)).toBe(3.67);
  });

  it("matches Python output for jobs 2,9,8", () => {
    const result = simulate({
      seed: 0,
      numJobs: 3,
      maxLen: 10,
      policy: "SJF",
      quantum: 1,
      jobList: "2,9,8",
    });

    // SJF sorts: job0(2), job2(8), job1(9)
    expect(result.trace[0]).toMatchObject({ jobId: 0, ranFor: 2, time: 0 });
    expect(result.trace[1]).toMatchObject({ jobId: 2, ranFor: 8, time: 2 });
    expect(result.trace[2]).toMatchObject({ jobId: 1, ranFor: 9, time: 10 });

    expect(round2(result.avgResponse)).toBe(4);
    expect(round2(result.avgTurnaround)).toBe(10.33);
    expect(round2(result.avgWait)).toBe(4);
  });
});

describe("RR scheduling", () => {
  it("matches Python output for jobs 2,9,8 with quantum 2", () => {
    const params: SchedulerParams = {
      seed: 0,
      numJobs: 3,
      maxLen: 10,
      policy: "RR",
      quantum: 2,
      jobList: "2,9,8",
    };
    const result = simulate(params);

    // Trace should match Python:
    // time 0: job 0 for 2 (DONE at 2)
    // time 2: job 1 for 2
    // time 4: job 2 for 2
    // time 6: job 1 for 2
    // time 8: job 2 for 2
    // time 10: job 1 for 2
    // time 12: job 2 for 2
    // time 14: job 1 for 2
    // time 16: job 2 for 2 (DONE at 18)
    // time 18: job 1 for 1 (DONE at 19)
    expect(result.trace).toHaveLength(10);
    expect(result.trace[0]).toMatchObject({
      time: 0,
      jobId: 0,
      ranFor: 2,
      done: true,
      doneAt: 2,
    });
    expect(result.trace[1]).toMatchObject({
      time: 2,
      jobId: 1,
      ranFor: 2,
      done: false,
    });
    expect(result.trace[8]).toMatchObject({
      time: 16,
      jobId: 2,
      ranFor: 2,
      done: true,
      doneAt: 18,
    });
    expect(result.trace[9]).toMatchObject({
      time: 18,
      jobId: 1,
      ranFor: 1,
      done: true,
      doneAt: 19,
    });

    // Per-job stats
    expect(result.stats[0]).toEqual({
      jobId: 0,
      response: 0,
      turnaround: 2,
      wait: 0,
    });
    expect(result.stats[1]).toEqual({
      jobId: 1,
      response: 2,
      turnaround: 19,
      wait: 10,
    });
    expect(result.stats[2]).toEqual({
      jobId: 2,
      response: 4,
      turnaround: 18,
      wait: 10,
    });

    expect(round2(result.avgResponse)).toBe(2);
    expect(round2(result.avgTurnaround)).toBe(13);
    expect(round2(result.avgWait)).toBe(6.67);
  });

  it("handles quantum=1", () => {
    const result = simulate({
      seed: 0,
      numJobs: 2,
      maxLen: 10,
      policy: "RR",
      quantum: 1,
      jobList: "3,2",
    });

    // RR with q=1: j0(1), j1(1), j0(1), j1(1,DONE@4), j0(1,DONE@5)
    expect(result.trace).toHaveLength(5);
    expect(result.trace[0]).toMatchObject({
      time: 0,
      jobId: 0,
      ranFor: 1,
      done: false,
    });
    expect(result.trace[1]).toMatchObject({
      time: 1,
      jobId: 1,
      ranFor: 1,
      done: false,
    });
    expect(result.trace[3]).toMatchObject({
      time: 3,
      jobId: 1,
      ranFor: 1,
      done: true,
      doneAt: 4,
    });
    expect(result.trace[4]).toMatchObject({
      time: 4,
      jobId: 0,
      ranFor: 1,
      done: true,
      doneAt: 5,
    });
  });
});

describe("generateJobs via seed", () => {
  it("generates deterministic jobs from seed", () => {
    const r1 = simulate({
      seed: 42,
      numJobs: 3,
      maxLen: 10,
      policy: "FIFO",
      quantum: 1,
    });
    const r2 = simulate({
      seed: 42,
      numJobs: 3,
      maxLen: 10,
      policy: "FIFO",
      quantum: 1,
    });
    expect(r1.jobs).toEqual(r2.jobs);
    expect(r1.trace).toEqual(r2.trace);
    expect(r1.stats).toEqual(r2.stats);
  });

  it("different seeds give different jobs", () => {
    const r1 = simulate({
      seed: 1,
      numJobs: 3,
      maxLen: 10,
      policy: "FIFO",
      quantum: 1,
    });
    const r2 = simulate({
      seed: 2,
      numJobs: 3,
      maxLen: 10,
      policy: "FIFO",
      quantum: 1,
    });
    // Very unlikely to be the same
    const same = r1.jobs.every(
      (j, i) => j.runtime === r2.jobs[i].runtime
    );
    expect(same).toBe(false);
  });
});

describe("edge cases", () => {
  it("single job FIFO", () => {
    const result = simulate({
      seed: 0,
      numJobs: 1,
      maxLen: 10,
      policy: "FIFO",
      quantum: 1,
      jobList: "5",
    });
    expect(result.trace).toHaveLength(1);
    expect(result.stats[0]).toEqual({
      jobId: 0,
      response: 0,
      turnaround: 5,
      wait: 0,
    });
  });

  it("single job RR", () => {
    const result = simulate({
      seed: 0,
      numJobs: 1,
      maxLen: 10,
      policy: "RR",
      quantum: 2,
      jobList: "5",
    });
    // 3 slices: 2+2+1
    expect(result.trace).toHaveLength(3);
    expect(result.stats[0]).toEqual({
      jobId: 0,
      response: 0,
      turnaround: 5,
      wait: 0,
    });
  });

  it("job fits exactly in quantum", () => {
    const result = simulate({
      seed: 0,
      numJobs: 1,
      maxLen: 10,
      policy: "RR",
      quantum: 5,
      jobList: "5",
    });
    expect(result.trace).toHaveLength(1);
    expect(result.trace[0]).toMatchObject({ done: true, doneAt: 5 });
  });
});
