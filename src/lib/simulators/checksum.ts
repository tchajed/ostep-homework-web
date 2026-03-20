import { Random } from '../random';

export interface ChecksumParams {
  seed: number;
  dataSize: number;
  data: string; // comma-separated values, or empty for random
}

export const defaultParams: ChecksumParams = {
  seed: 0,
  dataSize: 4,
  data: '',
};

export interface ChecksumStep {
  index: number;
  value: number;
  addRunning: number;
  xorRunning: number;
  fletcherA: number;
  fletcherB: number;
}

export interface ChecksumResult {
  values: number[];
  steps: ChecksumStep[];
  add: number;
  xor: number;
  fletcherA: number;
  fletcherB: number;
}

/** Format a byte as 0x-prefixed hex with two digits. */
export function toHex(v: number): string {
  return '0x' + v.toString(16).padStart(2, '0');
}

/** Format a byte as 0b-prefixed binary with 8 digits. */
export function toBin(v: number): string {
  return '0b' + v.toString(2).padStart(8, '0');
}

/** Generate the data values from params. */
export function generateValues(params: ChecksumParams): number[] {
  if (params.data !== '') {
    return params.data.split(',').map(s => {
      const n = parseInt(s.trim(), 10);
      if (isNaN(n) || n < 0 || n > 255) {
        throw new Error(`Invalid byte value: ${s.trim()}`);
      }
      return n;
    });
  }
  const rng = new Random(params.seed);
  const values: number[] = [];
  for (let i = 0; i < params.dataSize; i++) {
    values.push(Math.floor(rng.random() * 256));
  }
  return values;
}

/** Compute checksums with step-by-step trace. */
export function simulate(params: ChecksumParams): ChecksumResult {
  const values = generateValues(params);

  let add = 0;
  let xor = 0;
  let fletcherA = 0;
  let fletcherB = 0;
  const steps: ChecksumStep[] = [];

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    add = (add + value) % 256;
    xor = xor ^ value;
    fletcherA = (fletcherA + value) % 255;
    fletcherB = (fletcherB + fletcherA) % 255;

    steps.push({
      index: i,
      value,
      addRunning: add,
      xorRunning: xor,
      fletcherA,
      fletcherB,
    });
  }

  return { values, steps, add, xor, fletcherA, fletcherB };
}
