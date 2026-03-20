/**
 * Seeded pseudo-random number generator.
 * Uses a linear congruential generator - not cryptographic,
 * but deterministic and good enough for educational simulations.
 */
export class Random {
  private state: number;

  constructor(seed: number = 0) {
    this.state = seed;
  }

  /** Returns a float in [0, 1) */
  random(): number {
    // LCG parameters (Numerical Recipes)
    this.state = (this.state * 1664525 + 1013904223) & 0xffffffff;
    return (this.state >>> 0) / 0x100000000;
  }

  /** Returns an integer in [lo, hi] inclusive */
  randint(lo: number, hi: number): number {
    return lo + Math.floor(this.random() * (hi - lo + 1));
  }

  /** Pick a random element from an array */
  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.random() * arr.length)];
  }

  /** Shuffle array in place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
