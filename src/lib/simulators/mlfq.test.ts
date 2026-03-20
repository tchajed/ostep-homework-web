import { describe, it, expect } from "vitest";
import { simulateMlfq, defaultConfig, type MlfqConfig } from "./mlfq";

function cfg(overrides: Partial<MlfqConfig>): MlfqConfig {
  return { ...defaultConfig, ...overrides };
}

describe("simulateMlfq", () => {
  it("two CPU-only jobs with 2 queues, q=5, round-robin and demotion", () => {
    // mlfq.py -l 0,10,0:0,10,0 -n 2 -q 5 -c
    const result = simulateMlfq(
      cfg({ jlist: "0,10,0:0,10,0", numQueues: 2, quantum: 5 })
    );

    expect(result.jobs).toHaveLength(2);
    expect(result.stats[0].turnaround).toBe(15);
    expect(result.stats[1].turnaround).toBe(20);
    expect(result.stats[0].response).toBe(0);
    expect(result.stats[1].response).toBe(5);
    expect(result.avgResponse).toBeCloseTo(2.5);
    expect(result.avgTurnaround).toBeCloseTo(17.5);

    // After quantum expires at queue 1, both jobs should demote to queue 0
    const runEvents = result.trace.filter((e) => e.type === "RUN");
    // First 5 ticks: job 0 at priority 1
    for (let i = 0; i < 5; i++) {
      expect(runEvents[i].jobId).toBe(0);
      expect(runEvents[i].priority).toBe(1);
    }
    // Next 5 ticks: job 1 at priority 1
    for (let i = 5; i < 10; i++) {
      expect(runEvents[i].jobId).toBe(1);
      expect(runEvents[i].priority).toBe(1);
    }
    // Remaining at priority 0
    for (let i = 10; i < runEvents.length; i++) {
      expect(runEvents[i].priority).toBe(0);
    }
  });

  it("single job with IO, 2 queues", () => {
    // mlfq.py -l 0,20,5 -n 2 -q 10 -c
    const result = simulateMlfq(
      cfg({ jlist: "0,20,5", numQueues: 2, quantum: 10 })
    );

    expect(result.stats[0].turnaround).toBe(35);
    expect(result.stats[0].response).toBe(0);

    // Should see IO_START events
    const ioStarts = result.trace.filter((e) => e.type === "IO_START");
    expect(ioStarts.length).toBeGreaterThan(0);

    // Should see IDLE events while waiting for IO
    const idles = result.trace.filter((e) => e.type === "IDLE");
    expect(idles.length).toBeGreaterThan(0);
  });

  it("single job with allotment=2, demotion through 3 queues", () => {
    // mlfq.py -l 0,30,0 -n 3 -q 5 -a 2 -c
    const result = simulateMlfq(
      cfg({ jlist: "0,30,0", numQueues: 3, quantum: 5, allotment: 2 })
    );

    expect(result.stats[0].turnaround).toBe(30);
    expect(result.stats[0].response).toBe(0);

    const runEvents = result.trace.filter((e) => e.type === "RUN");
    // First 10 ticks at priority 2 (2 allotments * 5 quantum)
    for (let i = 0; i < 10; i++) {
      expect(runEvents[i].priority).toBe(2);
    }
    // Next 10 ticks at priority 1
    for (let i = 10; i < 20; i++) {
      expect(runEvents[i].priority).toBe(1);
    }
    // Last 10 ticks at priority 0
    for (let i = 20; i < 30; i++) {
      expect(runEvents[i].priority).toBe(0);
    }
  });

  it("boost moves jobs back to highest queue", () => {
    // mlfq.py -l 0,20,0:0,20,0 -n 2 -q 5 -B 15 -c
    const result = simulateMlfq(
      cfg({ jlist: "0,20,0:0,20,0", numQueues: 2, quantum: 5, boost: 15 })
    );

    expect(result.stats[0].turnaround).toBe(35);
    expect(result.stats[1].turnaround).toBe(40);

    // Should have BOOST events
    const boosts = result.trace.filter((e) => e.type === "BOOST");
    expect(boosts.length).toBe(2);
    expect(boosts[0].time).toBe(15);
    expect(boosts[1].time).toBe(30);

    // After boost at t=15, job 1 should be back at priority 1
    const runEvents = result.trace.filter((e) => e.type === "RUN");
    const runAtT15 = runEvents.find((e) => e.time === 15);
    expect(runAtT15!.priority).toBe(1);
  });

  it("handles JOB BEGINS events correctly", () => {
    const result = simulateMlfq(cfg({ jlist: "0,5,0" }));
    const begins = result.trace.filter((e) => e.type === "JOB_BEGINS");
    expect(begins.length).toBe(1);
    expect(begins[0].time).toBe(0);
    expect(begins[0].jobId).toBe(0);
  });

  it("handles delayed job start times", () => {
    const result = simulateMlfq(cfg({ jlist: "0,5,0:3,5,0", numQueues: 2, quantum: 10 }));
    const begins = result.trace.filter((e) => e.type === "JOB_BEGINS");
    expect(begins.length).toBe(2);
    expect(begins[0].time).toBe(0);
    expect(begins[1].time).toBe(3);
    // Job 0 should finish at time 5, job 1 starts at 3 but runs after job 0 finishes its slice
    expect(result.stats[0].turnaround).toBe(5);
  });

  it("quantumList overrides numQueues and quantum", () => {
    // -Q 5,10 means 2 queues: highest has quantum 5, lowest has quantum 10
    const result = simulateMlfq(
      cfg({ jlist: "0,20,0", quantumList: [5, 10] })
    );
    expect(result.numQueues).toBe(2);
    expect(result.quantumPerQueue[1]).toBe(5); // highest priority
    expect(result.quantumPerQueue[0]).toBe(10); // lowest priority

    const runEvents = result.trace.filter((e) => e.type === "RUN");
    // First 5 runs at priority 1 (quantum 5)
    for (let i = 0; i < 5; i++) {
      expect(runEvents[i].priority).toBe(1);
    }
    // Next 10 at priority 0 (quantum 10)
    for (let i = 5; i < 15; i++) {
      expect(runEvents[i].priority).toBe(0);
    }
  });

  it("computes correct finished events", () => {
    const result = simulateMlfq(cfg({ jlist: "0,3,0" }));
    const finished = result.trace.filter((e) => e.type === "FINISHED");
    expect(finished.length).toBe(1);
    expect(finished[0].time).toBe(3);
    expect(finished[0].jobId).toBe(0);
  });

  it("throws on mismatched allotmentList length", () => {
    expect(() =>
      simulateMlfq(
        cfg({ jlist: "0,5,0", quantumList: [5, 10], allotmentList: [1] })
      )
    ).toThrow("number of allotments");
  });
});
