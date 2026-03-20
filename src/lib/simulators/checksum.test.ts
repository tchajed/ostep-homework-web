import { describe, it, expect } from 'vitest';
import { simulate, toHex, toBin, generateValues } from './checksum';

describe('checksum', () => {
  describe('toHex', () => {
    it('pads single-digit hex values', () => {
      expect(toHex(0)).toBe('0x00');
      expect(toHex(15)).toBe('0x0f');
    });
    it('formats two-digit hex values', () => {
      expect(toHex(16)).toBe('0x10');
      expect(toHex(255)).toBe('0xff');
    });
  });

  describe('toBin', () => {
    it('pads to 8 bits', () => {
      expect(toBin(0)).toBe('0b00000000');
      expect(toBin(1)).toBe('0b00000001');
      expect(toBin(4)).toBe('0b00000100');
    });
    it('formats full byte', () => {
      expect(toBin(255)).toBe('0b11111111');
    });
  });

  describe('generateValues', () => {
    it('parses comma-separated data', () => {
      expect(generateValues({ seed: 0, dataSize: 4, data: '1,2,3,4' }))
        .toEqual([1, 2, 3, 4]);
    });
    it('trims whitespace', () => {
      expect(generateValues({ seed: 0, dataSize: 4, data: ' 1 , 2 , 3 , 4 ' }))
        .toEqual([1, 2, 3, 4]);
    });
    it('throws on invalid byte', () => {
      expect(() => generateValues({ seed: 0, dataSize: 4, data: '256' })).toThrow();
      expect(() => generateValues({ seed: 0, dataSize: 4, data: '-1' })).toThrow();
      expect(() => generateValues({ seed: 0, dataSize: 4, data: 'abc' })).toThrow();
    });
    it('generates correct number of random values', () => {
      const vals = generateValues({ seed: 0, dataSize: 6, data: '' });
      expect(vals).toHaveLength(6);
      vals.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      });
    });
    it('is deterministic with same seed', () => {
      const a = generateValues({ seed: 42, dataSize: 4, data: '' });
      const b = generateValues({ seed: 42, dataSize: 4, data: '' });
      expect(a).toEqual(b);
    });
    it('differs with different seeds', () => {
      const a = generateValues({ seed: 1, dataSize: 4, data: '' });
      const b = generateValues({ seed: 2, dataSize: 4, data: '' });
      expect(a).not.toEqual(b);
    });
  });

  describe('simulate with explicit data', () => {
    // Known test: data = [1, 2, 3, 4]
    // Python output: Add=10, Xor=4, Fletcher(a,b)=10,20
    it('computes correct checksums for [1,2,3,4]', () => {
      const result = simulate({ seed: 0, dataSize: 4, data: '1,2,3,4' });
      expect(result.values).toEqual([1, 2, 3, 4]);
      expect(result.add).toBe(10);
      expect(result.xor).toBe(4);
      expect(result.fletcherA).toBe(10);
      expect(result.fletcherB).toBe(20);
    });

    it('produces correct step-by-step trace for [1,2,3,4]', () => {
      const result = simulate({ seed: 0, dataSize: 4, data: '1,2,3,4' });
      expect(result.steps).toHaveLength(4);

      // After byte 1: add=1, xor=1, fA=1, fB=1
      expect(result.steps[0]).toEqual({
        index: 0, value: 1,
        addRunning: 1, xorRunning: 1, fletcherA: 1, fletcherB: 1,
      });
      // After byte 2: add=3, xor=3, fA=3, fB=4
      expect(result.steps[1]).toEqual({
        index: 1, value: 2,
        addRunning: 3, xorRunning: 3, fletcherA: 3, fletcherB: 4,
      });
      // After byte 3: add=6, xor=0, fA=6, fB=10
      expect(result.steps[2]).toEqual({
        index: 2, value: 3,
        addRunning: 6, xorRunning: 0, fletcherA: 6, fletcherB: 10,
      });
      // After byte 4: add=10, xor=4, fA=10, fB=20
      expect(result.steps[3]).toEqual({
        index: 3, value: 4,
        addRunning: 10, xorRunning: 4, fletcherA: 10, fletcherB: 20,
      });
    });

    it('handles add overflow (wraps mod 256)', () => {
      // 200 + 200 = 400, mod 256 = 144
      const result = simulate({ seed: 0, dataSize: 2, data: '200,200' });
      expect(result.add).toBe(144);
    });

    it('handles xor correctly', () => {
      // 0xFF ^ 0xFF = 0
      const result = simulate({ seed: 0, dataSize: 2, data: '255,255' });
      expect(result.xor).toBe(0);
    });

    it('handles fletcher mod 255 correctly', () => {
      // Single value 255: fA = 255 % 255 = 0, fB = 0 % 255 = 0
      const result = simulate({ seed: 0, dataSize: 1, data: '255' });
      expect(result.fletcherA).toBe(0);
      expect(result.fletcherB).toBe(0);
    });

    it('handles empty-ish single byte', () => {
      const result = simulate({ seed: 0, dataSize: 1, data: '0' });
      expect(result.add).toBe(0);
      expect(result.xor).toBe(0);
      expect(result.fletcherA).toBe(0);
      expect(result.fletcherB).toBe(0);
    });
  });

  describe('simulate with random seed', () => {
    it('is deterministic', () => {
      const a = simulate({ seed: 7, dataSize: 8, data: '' });
      const b = simulate({ seed: 7, dataSize: 8, data: '' });
      expect(a).toEqual(b);
    });

    it('produces values in byte range', () => {
      const result = simulate({ seed: 99, dataSize: 10, data: '' });
      result.values.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      });
    });
  });
});
