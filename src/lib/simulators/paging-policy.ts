import { Random } from "../random";

export type Policy = "FIFO" | "LRU" | "OPT" | "CLOCK" | "RAND";

export interface PagingPolicyParams {
  /** Page replacement policy */
  policy: Policy;
  /** Number of page frames in cache */
  cacheSize: number;
  /** Explicit list of page accesses, or null to generate randomly */
  addresses: number[] | null;
  /** Number of random addresses to generate (if addresses is null) */
  numAddrs: number;
  /** Max page number for random generation (exclusive upper bound: pages 0..maxPage-1) */
  maxPage: number;
  /** Random seed */
  seed: number;
  /** Number of clock bits for CLOCK policy */
  clockBits: number;
}

export interface AccessResult {
  /** The page accessed */
  page: number;
  /** Whether it was a hit */
  hit: boolean;
  /** The evicted page, or -1 if none */
  victim: number;
  /** State of memory after this access (copy) */
  memory: number[];
  /** Cumulative hits so far */
  hits: number;
  /** Cumulative misses so far */
  misses: number;
}

export interface SimulationResult {
  /** The address list used */
  addressList: number[];
  /** Per-access results */
  accesses: AccessResult[];
  /** Total hits */
  hits: number;
  /** Total misses */
  misses: number;
  /** Hit rate as percentage */
  hitRate: number;
}

export function defaultParams(): PagingPolicyParams {
  return {
    policy: "FIFO",
    cacheSize: 3,
    addresses: null,
    numAddrs: 10,
    maxPage: 10,
    seed: 0,
    clockBits: 2,
  };
}

export function generateAddresses(
  seed: number,
  numAddrs: number,
  maxPage: number
): number[] {
  const rng = new Random(seed);
  const addrs: number[] = [];
  for (let i = 0; i < numAddrs; i++) {
    addrs.push(Math.floor(maxPage * rng.random()));
  }
  return addrs;
}

export function simulate(params: PagingPolicyParams): SimulationResult {
  const {
    policy,
    cacheSize,
    addresses,
    numAddrs,
    maxPage,
    seed,
    clockBits,
  } = params;

  const addrList =
    addresses !== null
      ? [...addresses]
      : generateAddresses(seed, numAddrs, maxPage);

  // For CLOCK and RAND we need a separate RNG for eviction decisions.
  // The Python code uses the same RNG for both address generation and eviction.
  // We replicate that by creating one RNG and using it for address generation first,
  // then continuing with eviction. But since generateAddresses creates its own RNG,
  // we need a fresh one that has been advanced past address generation.
  const rng = new Random(seed);
  if (addresses === null) {
    // Advance past the address generation calls
    for (let i = 0; i < numAddrs; i++) {
      rng.random();
    }
  }

  const memory: number[] = [];
  const ref: Map<number, number> = new Map();
  let hits = 0;
  let misses = 0;
  let count = 0;
  const accesses: AccessResult[] = [];

  for (let addrIndex = 0; addrIndex < addrList.length; addrIndex++) {
    const n = addrList[addrIndex];
    const idx = memory.indexOf(n);
    let victim = -1;

    if (idx !== -1) {
      // Hit
      hits++;
      if (policy === "LRU") {
        memory.splice(memory.indexOf(n), 1);
        memory.push(n);
      }
    } else {
      // Miss
      misses++;

      if (count === cacheSize) {
        // Must evict
        if (policy === "FIFO" || policy === "LRU") {
          victim = memory.shift()!;
        } else if (policy === "RAND") {
          const ri = Math.floor(rng.random() * count);
          victim = memory.splice(ri, 1)[0];
        } else if (policy === "CLOCK") {
          // Random clock: pick random pages, decrement ref bit or evict
          while (victim === -1) {
            const ri = Math.floor(rng.random() * count);
            const page = memory[ri];
            const refVal = ref.get(page) ?? 0;
            if (refVal >= 1) {
              ref.set(page, refVal - 1);
            } else {
              victim = page;
              memory.splice(ri, 1);
              break;
            }
          }
          ref.delete(victim);
        } else if (policy === "OPT") {
          let maxReplace = -1;
          let replaceIdx = -1;
          for (let pageIndex = 0; pageIndex < count; pageIndex++) {
            const page = memory[pageIndex];
            let whenReferenced = addrList.length; // default: never again
            for (
              let futureIdx = addrIndex + 1;
              futureIdx < addrList.length;
              futureIdx++
            ) {
              if (addrList[futureIdx] === page) {
                whenReferenced = futureIdx;
                break;
              }
            }
            if (whenReferenced >= maxReplace) {
              replaceIdx = pageIndex;
              maxReplace = whenReferenced;
            }
          }
          victim = memory.splice(replaceIdx, 1)[0];
        }
      } else {
        count++;
      }

      memory.push(n);
    }

    // Update reference bit (for CLOCK)
    const curRef = ref.get(n) ?? 0;
    if (curRef === 0) {
      ref.set(n, 1);
    } else {
      ref.set(n, Math.min(curRef + 1, clockBits));
    }

    accesses.push({
      page: n,
      hit: idx !== -1,
      victim,
      memory: [...memory],
      hits,
      misses,
    });
  }

  const total = hits + misses;
  return {
    addressList: addrList,
    accesses,
    hits,
    misses,
    hitRate: total > 0 ? (100 * hits) / total : 0,
  };
}
