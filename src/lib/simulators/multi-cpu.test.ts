import { describe, it, expect } from "vitest";
import { simulate, defaultOptions } from "./multi-cpu";
import type { SimulationOptions } from "./multi-cpu";

function opts(overrides: Partial<SimulationOptions> = {}): SimulationOptions {
  return { ...defaultOptions, ...overrides };
}

describe("multi-cpu simulator", () => {
  describe("explicit job list, centralized queue", () => {
    // Reproduce the Python output for:
    //   multi.py -L 0:10:160,1:70:50,2:40:80 -n 2 -q 10 -w 10 -M 100 -c -t -C -T
    // Jobs: 0(rt=10,ws=160), 1(rt=70,ws=50), 2(rt=40,ws=80)
    // Central queue: [0, 1, 2]
    // Expected finish time: 40

    const result = simulate(
      opts({
        jobList: "0:10:160,1:70:50,2:40:80",
        numCpus: 2,
        timeSlice: 10,
        cacheWarmupTime: 10,
        cacheSize: 100,
        cacheRateWarm: 2,
        cacheRateCold: 1,
      })
    );

    it("should parse jobs correctly", () => {
      expect(result.jobs.length).toBe(3);
      expect(result.jobs[0]).toMatchObject({
        name: "0",
        runTime: 10,
        workingSetSize: 160,
      });
      expect(result.jobs[1]).toMatchObject({
        name: "1",
        runTime: 70,
        workingSetSize: 50,
      });
      expect(result.jobs[2]).toMatchObject({
        name: "2",
        runTime: 40,
        workingSetSize: 80,
      });
    });

    it("should finish at time 40", () => {
      expect(result.finishedTime).toBe(40);
    });

    it("should have correct number of ticks", () => {
      expect(result.ticks.length).toBe(40);
    });

    it("CPU 0 should run job 0 for ticks 0-9", () => {
      for (let t = 0; t < 10; t++) {
        expect(result.ticks[t][0].job).toBe("0");
      }
    });

    it("CPU 1 should run job 1 for ticks 0-9", () => {
      for (let t = 0; t < 10; t++) {
        expect(result.ticks[t][1].job).toBe("1");
      }
    });

    it("CPU 0 should run job 2 for ticks 10-34", () => {
      for (let t = 10; t < 35; t++) {
        expect(result.ticks[t][0].job).toBe("2");
      }
    });

    it("CPU 0 should be idle for ticks 35-39", () => {
      for (let t = 35; t < 40; t++) {
        expect(result.ticks[t][0].job).toBeNull();
      }
    });

    it("CPU 1 should run job 1 continuously for ticks 10-39", () => {
      for (let t = 10; t < 40; t++) {
        expect(result.ticks[t][1].job).toBe("1");
      }
    });

    it("should compute correct time_left at tick 0 for job 0 (cold)", () => {
      // Job 0 starts with timeLeft=10, cold rate=1, so after tick 0: 10-1=9
      expect(result.ticks[0][0].timeLeft).toBe(9);
    });

    it("job 1 on CPU 1 should become warm at tick 9", () => {
      // After 10 ticks of warming (ticks 0-9), cache should be warm at tick 9
      // At tick 9, cacheState for job 1 on CPU 1 should be 'w'
      const jobIndex = 1; // job "1" is at index 1
      expect(result.ticks[9][1].cacheState[jobIndex]).toBe("w");
    });

    it("job 1 on CPU 1 should NOT be warm at tick 8", () => {
      const jobIndex = 1;
      expect(result.ticks[8][1].cacheState[jobIndex]).toBe(" ");
    });

    it("job 1 warm on CPU 1 means rate=2 at tick 10", () => {
      // At tick 10, job 1 is warm, so time_left should decrease by 2 from tick 9
      // tick 9: timeLeft=60, tick 10: timeLeft=58
      expect(result.ticks[9][1].timeLeft).toBe(60);
      expect(result.ticks[10][1].timeLeft).toBe(58);
    });

    it("should have correct per-CPU utilization stats", () => {
      // CPU 0: ran 35 out of 40 ticks = 87.50%
      expect(result.stats[0].utilization).toBeCloseTo(87.5, 1);
      // CPU 1: ran 40 out of 40 ticks = 100%
      expect(result.stats[1].utilization).toBeCloseTo(100.0, 1);
    });

    it("should have correct warm utilization stats", () => {
      // CPU 0: warm ticks = job 2 warm from tick 19 onward (ticks 19-34) = 15+1?
      // Let's check: job 2 on CPU 0 starts at tick 10, warmup=10, so warm at tick 19
      // ticks 19-34 = 16 ticks at warm rate? No wait: 19 is inclusive, 34 is inclusive = 16
      // But warm means rate > 1, so statsRanWarm incremented when rate > 1
      // ticks 19,20,...,34 = 16 ticks warm (but tick 19 is the first warm tick)
      // Actually re-check: at tick 19 the cache finishes warming, so ticks 20-34 are warm (15 ticks)
      // Let me check via the trace output: At tick 19, cache shows 'w' for job 2 on CPU 0
      // The Python trace shows tick 19: 2 [ 30] cache[  w] - so yes, warm at tick 19
      // Warm means the tick itself ran at warm rate. tick 19: timeLeft went from 31->30? No: 31->29 (rate 2)?
      // Python: tick 18: timeLeft=31, tick 19: timeLeft=30
      // Wait, that's rate 1. Hmm.
      // Actually looking at the code: updateWarming happens AFTER getRate check
      // So at tick 19, warming counter reaches 0, cache becomes warm, BUT the rate for this tick
      // was already determined before updateWarming. Let me re-read.
      // run_one_tick: get_rate -> subtract -> update_warming
      // So at tick 19, get_rate still returns cold (not yet warm), THEN update_warming makes it warm
      // That means warm ticks on CPU 0: ticks 20-34 = 15 ticks
      // 15/40 = 37.50%
      expect(result.stats[0].warmUtilization).toBeCloseTo(37.5, 1);
      // CPU 1: job 1 warm from tick 10 onward (warm at tick 9 via update_warming, so tick 10 gets warm rate)
      // Actually: tick 9 update_warming makes it warm. tick 10: get_rate returns warm.
      // warm ticks: 10-39 = 30 ticks. 30/40 = 75%
      expect(result.stats[1].warmUtilization).toBeCloseTo(75.0, 1);
    });
  });

  describe("single CPU, centralized queue", () => {
    // multi.py -L 0:10:160,1:70:50,2:40:80 -n 1 -q 10 -w 10 -M 100 -c
    const result = simulate(
      opts({
        jobList: "0:10:160,1:70:50,2:40:80",
        numCpus: 1,
        timeSlice: 10,
        cacheWarmupTime: 10,
        cacheSize: 100,
        cacheRateWarm: 2,
        cacheRateCold: 1,
      })
    );

    it("should finish at time 110", () => {
      expect(result.finishedTime).toBe(110);
    });

    it("should round-robin jobs after job 0 finishes", () => {
      // ticks 0-9: job 0
      // ticks 10-19: job 1
      // ticks 20-29: job 2
      // ticks 30-39: job 1
      // ...
      for (let t = 0; t < 10; t++) expect(result.ticks[t][0].job).toBe("0");
      for (let t = 10; t < 20; t++) expect(result.ticks[t][0].job).toBe("1");
      for (let t = 20; t < 30; t++) expect(result.ticks[t][0].job).toBe("2");
      for (let t = 30; t < 40; t++) expect(result.ticks[t][0].job).toBe("1");
    });

    it("CPU 0 utilization should be 100%", () => {
      expect(result.stats[0].utilization).toBeCloseTo(100.0, 1);
    });
  });

  describe("per-CPU queues", () => {
    const result = simulate(
      opts({
        jobList: "a:30:50,b:30:50,c:30:50,d:30:50",
        numCpus: 2,
        timeSlice: 10,
        perCpuQueues: true,
        peekInterval: 0, // disable stealing
        cacheWarmupTime: 10,
        cacheSize: 100,
        cacheRateWarm: 2,
        cacheRateCold: 1,
      })
    );

    it("should distribute jobs across CPU queues", () => {
      expect(result.perCpuQueuesMode).toBe(true);
      // Jobs distributed RR: CPU0 gets a,c; CPU1 gets b,d
      expect(result.perCpuQueues[0]).toEqual(["a", "c"]);
      expect(result.perCpuQueues[1]).toEqual(["b", "d"]);
    });

    it("CPU 0 should run job a first", () => {
      expect(result.ticks[0][0].job).toBe("a");
    });

    it("CPU 1 should run job b first", () => {
      expect(result.ticks[0][1].job).toBe("b");
    });
  });

  describe("affinity", () => {
    const result = simulate(
      opts({
        jobList: "a:20:50,b:20:50",
        numCpus: 2,
        timeSlice: 10,
        affinity: "a:0,b:1",
        cacheWarmupTime: 10,
        cacheSize: 100,
        cacheRateWarm: 2,
        cacheRateCold: 1,
      })
    );

    it("should respect affinity: a on CPU 0, b on CPU 1", () => {
      // With central queue [a, b], CPU 0 looks first and finds a (affinity 0), CPU 1 finds b (affinity 1)
      expect(result.ticks[0][0].job).toBe("a");
      expect(result.ticks[0][1].job).toBe("b");
    });

    it("after quantum, a still goes to CPU 0 due to affinity", () => {
      expect(result.ticks[10][0].job).toBe("a");
      expect(result.ticks[10][1].job).toBe("b");
    });
  });

  describe("cache warmup time 0 (instant warm)", () => {
    const result = simulate(
      opts({
        jobList: "a:10:50",
        numCpus: 1,
        timeSlice: 10,
        cacheWarmupTime: 0,
        cacheSize: 100,
        cacheRateWarm: 2,
        cacheRateCold: 1,
      })
    );

    it("should finish faster with instant warm cache", () => {
      // rate=2 from tick 0, so 10/2 = 5 ticks
      expect(result.finishedTime).toBe(5);
    });

    it("cache should be warm from tick 0", () => {
      expect(result.ticks[0][0].cacheState[0]).toBe("w");
    });
  });

  describe("cache eviction", () => {
    // Cache size 100, two jobs with ws=60 each. Only one fits.
    const result = simulate(
      opts({
        jobList: "a:30:60,b:30:60",
        numCpus: 1,
        timeSlice: 10,
        cacheWarmupTime: 5,
        cacheSize: 100,
        cacheRateWarm: 2,
        cacheRateCold: 1,
      })
    );

    it("when b warms up, a should be evicted (total 120 > 100)", () => {
      // a runs ticks 0-9, b runs ticks 10-19
      // a warms at tick 4 (warmup=5: ticks 0-4)
      // b starts on CPU at tick 10, warms at tick 14
      // At tick 14, b enters cache. Total ws = 60+60=120 > 100, so a is evicted.
      // At tick 15, b should be warm, a should not be
      expect(result.ticks[15][0].cacheState[0]).toBe(" "); // a evicted
      expect(result.ticks[15][0].cacheState[1]).toBe("w"); // b warm
    });
  });

  describe("error handling", () => {
    it("should throw on bad job description", () => {
      expect(() => simulate(opts({ jobList: "bad" }))).toThrow(
        "Bad job description"
      );
    });

    it("should throw on repeated job name", () => {
      expect(() =>
        simulate(opts({ jobList: "a:10:50,a:20:50" }))
      ).toThrow("Repeated job name");
    });

    it("should throw on bad affinity CPU", () => {
      expect(() =>
        simulate(
          opts({
            jobList: "a:10:50",
            numCpus: 2,
            affinity: "a:5",
          })
        )
      ).toThrow("Bad CPU");
    });
  });
});
