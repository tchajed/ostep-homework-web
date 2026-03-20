import { describe, it, expect } from "vitest";
import {
  simulate,
  defaultParams,
  type PagingPolicyParams,
} from "./paging-policy";

/** Helper: run simulation with explicit address list */
function run(
  policy: PagingPolicyParams["policy"],
  addresses: number[],
  cacheSize = 3,
  clockBits = 2
) {
  return simulate({
    ...defaultParams(),
    policy,
    addresses,
    cacheSize,
    clockBits,
  });
}

// Classic Belady's anomaly sequence
const belady = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3];

describe("FIFO", () => {
  it("matches Python output for belady sequence", () => {
    const result = run("FIFO", belady);
    expect(result.hits).toBe(2);
    expect(result.misses).toBe(8);
    expect(result.hitRate).toBeCloseTo(20.0);

    // Check specific memory states
    expect(result.accesses[0].memory).toEqual([1]);
    expect(result.accesses[2].memory).toEqual([1, 2, 3]);
    expect(result.accesses[3].memory).toEqual([2, 3, 4]); // evict 1
    expect(result.accesses[3].victim).toBe(1);
    expect(result.accesses[5].hit).toBe(false); // access 2 is a miss
    expect(result.accesses[5].victim).toBe(3);
    expect(result.accesses[7].hit).toBe(true); // access 1 is a hit
  });

  it("no evictions when cache is large enough", () => {
    const result = run("FIFO", [1, 2, 3, 1, 2, 3], 3);
    expect(result.hits).toBe(3);
    expect(result.misses).toBe(3);
    expect(result.accesses.every((a) => a.victim === -1)).toBe(true);
  });

  it("works with cache size 1", () => {
    const result = run("FIFO", [1, 1, 2, 2, 1], 1);
    expect(result.hits).toBe(2);
    expect(result.misses).toBe(3);
  });
});

describe("LRU", () => {
  it("matches Python output for belady sequence", () => {
    const result = run("LRU", belady);
    expect(result.hits).toBe(2);
    expect(result.misses).toBe(8);
    expect(result.hitRate).toBeCloseTo(20.0);

    // LRU moves accessed page to MRU position on hit
    // Access 7 (1): hit, memory reordered
    expect(result.accesses[7].hit).toBe(true);
    expect(result.accesses[7].memory).toEqual([2, 5, 1]);

    // Access 8 (2): hit, memory reordered
    expect(result.accesses[8].hit).toBe(true);
    expect(result.accesses[8].memory).toEqual([5, 1, 2]);

    // Access 9 (3): miss, evict 5 (LRU)
    expect(result.accesses[9].hit).toBe(false);
    expect(result.accesses[9].victim).toBe(5);
    expect(result.accesses[9].memory).toEqual([1, 2, 3]);
  });

  it("evicts least recently used on miss", () => {
    // Access 1,2,3 then re-access 1, then access 4
    // After re-accessing 1, LRU order is 2,3,1 so 2 is evicted
    const result = run("LRU", [1, 2, 3, 1, 4]);
    expect(result.accesses[3].hit).toBe(true);
    expect(result.accesses[4].victim).toBe(2);
    expect(result.accesses[4].memory).toEqual([3, 1, 4]);
  });
});

describe("OPT", () => {
  it("matches Python output for belady sequence", () => {
    const result = run("OPT", belady);
    expect(result.hits).toBe(4);
    expect(result.misses).toBe(6);
    expect(result.hitRate).toBeCloseTo(40.0);

    // Access 3 (4): miss, evict 3 (not referenced again soon)
    expect(result.accesses[3].victim).toBe(3);
    expect(result.accesses[3].memory).toEqual([1, 2, 4]);

    // Accesses 4 and 5 (1,2) are hits
    expect(result.accesses[4].hit).toBe(true);
    expect(result.accesses[5].hit).toBe(true);

    // Access 6 (5): miss, evict 4 (never referenced again)
    expect(result.accesses[6].victim).toBe(4);
  });

  it("evicts page used furthest in the future", () => {
    // Pages 1,2,3 in cache. Next accesses: 4, then 2, then 1
    // Should evict 3 (never used again)
    const result = run("OPT", [1, 2, 3, 4, 2, 1]);
    expect(result.accesses[3].victim).toBe(3);
  });
});

describe("CLOCK", () => {
  it("matches Python output for belady sequence", () => {
    const result = run("CLOCK", belady);
    expect(result.hits).toBe(3);
    expect(result.misses).toBe(7);
    expect(result.hitRate).toBeCloseTo(30.0, 1);
  });

  it("basic behavior: initially all ref bits are 1", () => {
    // With clock, all pages start with ref=1
    // When evicting, random scan decrements before evicting
    const result = run("CLOCK", [1, 2, 3, 4], 3);
    expect(result.misses).toBe(4);
    // Some page was evicted on the 4th access
    expect(result.accesses[3].victim).not.toBe(-1);
  });
});

describe("RAND", () => {
  it("produces deterministic results with same seed", () => {
    const params = {
      ...defaultParams(),
      policy: "RAND" as const,
      addresses: [1, 2, 3, 4, 5, 6],
      cacheSize: 2,
    };
    const r1 = simulate(params);
    const r2 = simulate(params);
    expect(r1.hits).toBe(r2.hits);
    expect(r1.misses).toBe(r2.misses);
    for (let i = 0; i < r1.accesses.length; i++) {
      expect(r1.accesses[i].memory).toEqual(r2.accesses[i].memory);
      expect(r1.accesses[i].victim).toBe(r2.accesses[i].victim);
    }
  });
});

describe("edge cases", () => {
  it("empty address list", () => {
    const result = run("FIFO", []);
    expect(result.hits).toBe(0);
    expect(result.misses).toBe(0);
    expect(result.hitRate).toBe(0);
    expect(result.accesses).toEqual([]);
  });

  it("single page repeated", () => {
    const result = run("FIFO", [5, 5, 5, 5, 5], 1);
    expect(result.hits).toBe(4);
    expect(result.misses).toBe(1);
    expect(result.hitRate).toBeCloseTo(80.0);
  });

  it("all different pages with small cache", () => {
    const result = run("FIFO", [0, 1, 2, 3, 4], 2);
    expect(result.hits).toBe(0);
    expect(result.misses).toBe(5);
  });

  it("random address generation is deterministic", () => {
    const params = {
      ...defaultParams(),
      seed: 42,
      addresses: null,
      numAddrs: 5,
    };
    const r1 = simulate(params);
    const r2 = simulate(params);
    expect(r1.addressList).toEqual(r2.addressList);
    expect(r1.hits).toBe(r2.hits);
  });
});
