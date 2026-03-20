/**
 * Seeded pseudo-random number generator matching Python's `random` module.
 * Implements the Mersenne Twister (MT19937) algorithm with the same seeding
 * procedure as CPython, so that `new Random(seed).random()` produces the
 * same sequence as `random.seed(seed); random.random()` in Python.
 */
export class Random {
  private mt: number[] = new Array(624);
  private mti: number = 625;

  constructor(seed: number = 0) {
    this.seedPython(seed);
  }

  /** Seed matching Python's random.seed(n) for non-negative integers */
  private seedPython(n: number): void {
    // Python's random.seed(int) converts the int to a key array for init_by_array.
    // For non-negative ints, it converts to little-endian 32-bit words.
    n = Math.abs(Math.floor(n));
    const key: number[] = [];
    if (n === 0) {
      key.push(0);
    } else {
      while (n > 0) {
        key.push(n & 0xffffffff);
        // For seeds that fit in 32 bits this is just one iteration
        n = Math.floor(n / 0x100000000);
      }
    }
    this.initByArray(key);
  }

  /** Initialize the generator with a seed (init_genrand) */
  private initGenrand(s: number): void {
    this.mt[0] = s >>> 0;
    for (this.mti = 1; this.mti < 624; this.mti++) {
      const prev = this.mt[this.mti - 1];
      this.mt[this.mti] =
        (Math.imul(1812433253, prev ^ (prev >>> 30)) + this.mti) >>> 0;
    }
  }

  /** Initialize by an array (init_by_array in MT reference code, used by Python) */
  private initByArray(initKey: number[]): void {
    const N = 624;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    let k = Math.max(N, initKey.length);

    for (; k > 0; k--) {
      // non-linear
      this.mt[i] =
        ((Math.imul(this.mt[i] ^ Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1664525), 1) +
          initKey[j] +
          j) >>>
          0);
      i++;
      j++;
      if (i >= N) {
        this.mt[0] = this.mt[N - 1];
        i = 1;
      }
      if (j >= initKey.length) j = 0;
    }
    for (k = N - 1; k > 0; k--) {
      this.mt[i] =
        ((Math.imul(this.mt[i] ^ Math.imul(this.mt[i - 1] ^ (this.mt[i - 1] >>> 30), 1566083941), 1) -
          i) >>>
          0);
      i++;
      if (i >= N) {
        this.mt[0] = this.mt[N - 1];
        i = 1;
      }
    }
    this.mt[0] = 0x80000000; // MSB is 1; assuring non-zero initial array
  }

  /** Generate next 32-bit random number */
  private genrandInt32(): number {
    const N = 624;
    const M = 397;
    const MATRIX_A = 0x9908b0df;
    const UPPER_MASK = 0x80000000;
    const LOWER_MASK = 0x7fffffff;
    const mag01 = [0, MATRIX_A];

    let y: number;

    if (this.mti >= N) {
      let kk: number;

      for (kk = 0; kk < N - M; kk++) {
        y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK);
        this.mt[kk] = (this.mt[kk + M] ^ (y >>> 1) ^ mag01[y & 1]) >>> 0;
      }
      for (; kk < N - 1; kk++) {
        y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK);
        this.mt[kk] =
          (this.mt[kk + (M - N)] ^ (y >>> 1) ^ mag01[y & 1]) >>> 0;
      }
      y = (this.mt[N - 1] & UPPER_MASK) | (this.mt[0] & LOWER_MASK);
      this.mt[N - 1] = (this.mt[M - 1] ^ (y >>> 1) ^ mag01[y & 1]) >>> 0;

      this.mti = 0;
    }

    y = this.mt[this.mti++];

    // Tempering
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;

    return y >>> 0;
  }

  /**
   * Returns a float in [0, 1) matching Python's random.random().
   * Python uses 53 bits of precision: (a*2^26 + b) / 2^53
   */
  random(): number {
    const a = this.genrandInt32() >>> 5; // 27 bits
    const b = this.genrandInt32() >>> 6; // 26 bits
    return (a * 67108864.0 + b) / 9007199254740992.0;
  }

  /**
   * Returns a random integer in [0, n) matching CPython's random._randbelow().
   * Uses getrandbits with rejection sampling, exactly as CPython does.
   * Python's getrandbits(k) takes the UPPER k bits of a 32-bit MT word.
   *
   * NOTE: Most OSTEP simulators define their own random_randint/random_choice
   * helpers that use random.random() instead of _randbelow. Only a few
   * simulators (e.g., multi.py) use Python's native random.choice/random.shuffle
   * which internally call _randbelow. Use randint/choice/shuffle for the
   * former, and nativeChoice/nativeShuffle for the latter.
   */
  randbelow(n: number): number {
    if (n <= 0) return 0;
    // Python: k = n.bit_length()
    let k = 0;
    let tmp = n;
    while (tmp > 0) {
      k++;
      tmp >>>= 1;
    }
    // Rejection sampling: generate k-bit random via upper bits, reject if >= n
    const shift = 32 - k;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const r = this.genrandInt32() >>> shift;
      if (r < n) return r;
    }
  }

  /**
   * Returns an integer in [lo, hi] inclusive.
   * Matches the OSTEP custom random_randint(lo, hi) = int(lo + random() * (hi - lo + 1)).
   */
  randint(lo: number, hi: number): number {
    return lo + Math.floor(this.random() * (hi - lo + 1));
  }

  /**
   * Pick a random element from an array.
   * Matches the OSTEP custom random_choice(L) = L[random_randint(0, len(L)-1)].
   */
  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.random() * arr.length)];
  }

  /**
   * Pick a random element from an array using CPython's native random.choice.
   * Uses _randbelow internally (getrandbits-based), which consumes different
   * MT values than random.random()-based selection.
   */
  nativeChoice<T>(arr: T[]): T {
    return arr[this.randbelow(arr.length)];
  }

  /** Shuffle array in place (Fisher-Yates), using random.random()-based selection. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Shuffle array in place matching CPython's native random.shuffle.
   * Uses _randbelow internally.
   */
  nativeShuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
