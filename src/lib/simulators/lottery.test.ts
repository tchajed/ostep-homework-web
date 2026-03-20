import { describe, it, expect } from 'vitest';
import { simulate, generateJobs, defaultParams, type LotteryParams } from './lottery';
import { Random } from '../random';

describe('lottery scheduler', () => {
  describe('generateJobs', () => {
    it('generates the correct number of random jobs', () => {
      const rng = new Random(0);
      const jobs = generateJobs(rng, { ...defaultParams });
      expect(jobs).toHaveLength(3);
      jobs.forEach((j, i) => {
        expect(j.id).toBe(i);
        expect(j.length).toBeGreaterThan(0);
        expect(j.tickets).toBeGreaterThan(0);
      });
    });

    it('parses jlist correctly', () => {
      const rng = new Random(0);
      const jobs = generateJobs(rng, { ...defaultParams, jlist: '10:100,20:50,5:200' });
      expect(jobs).toEqual([
        { id: 0, length: 10, tickets: 100 },
        { id: 1, length: 20, tickets: 50 },
        { id: 2, length: 5, tickets: 200 },
      ]);
    });

    it('generates deterministic jobs for the same seed', () => {
      const rng1 = new Random(42);
      const rng2 = new Random(42);
      const jobs1 = generateJobs(rng1, defaultParams);
      const jobs2 = generateJobs(rng2, defaultParams);
      expect(jobs1).toEqual(jobs2);
    });
  });

  describe('simulate', () => {
    it('all jobs complete', () => {
      const result = simulate(defaultParams);
      const totalRuntime = result.jobs.reduce((s, j) => s + j.length, 0);
      // The last step should have all jobs done or the simulation should have run
      const completions = result.steps.filter(s => s.completedJobId !== null);
      expect(completions).toHaveLength(result.jobs.length);
    });

    it('clock advances by quantum each step', () => {
      const params: LotteryParams = { ...defaultParams, quantum: 2 };
      const result = simulate(params);
      result.steps.forEach((step, i) => {
        expect(step.clock).toBe((i + 1) * params.quantum);
      });
    });

    it('total steps equals total runtime', () => {
      const result = simulate({ ...defaultParams, seed: 1 });
      const totalRuntime = result.jobs.reduce((s, j) => s + j.length, 0);
      expect(result.steps).toHaveLength(totalRuntime);
    });

    it('winning ticket is within total ticket range', () => {
      const result = simulate({ ...defaultParams, seed: 5 });
      for (const step of result.steps) {
        expect(step.winningTicket).toBeGreaterThanOrEqual(0);
        expect(step.winningTicket).toBeLessThan(step.totalTickets);
      }
    });

    it('completed jobs get their tickets removed', () => {
      const result = simulate({ ...defaultParams, seed: 1 });
      const completionSteps = result.steps.filter(s => s.completedJobId !== null);
      // After each completion, subsequent steps should have fewer total tickets
      for (let i = 1; i < completionSteps.length; i++) {
        expect(completionSteps[i].totalTickets).toBeLessThan(completionSteps[0].totalTickets);
      }
    });

    it('works with custom jlist', () => {
      const result = simulate({ ...defaultParams, jlist: '5:50,3:30' });
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[0].length).toBe(5);
      expect(result.jobs[1].length).toBe(3);
      expect(result.steps).toHaveLength(8); // 5 + 3
    });

    it('works with quantum > 1', () => {
      const result = simulate({ ...defaultParams, jlist: '10:100,20:100', quantum: 2 });
      expect(result.jobs).toHaveLength(2);
      // Total runtime = 30, quantum = 2, so 15 steps
      expect(result.steps).toHaveLength(15);
      expect(result.steps[result.steps.length - 1].clock).toBe(30);
    });

    it('deterministic for same seed', () => {
      const r1 = simulate({ ...defaultParams, seed: 99 });
      const r2 = simulate({ ...defaultParams, seed: 99 });
      expect(r1.jobs).toEqual(r2.jobs);
      expect(r1.steps).toEqual(r2.steps);
    });

    it('different seeds produce different results', () => {
      const r1 = simulate({ ...defaultParams, seed: 1 });
      const r2 = simulate({ ...defaultParams, seed: 2 });
      // Jobs should differ (different random generation)
      expect(r1.jobs).not.toEqual(r2.jobs);
    });

    it('random numbers match step count', () => {
      const result = simulate({ ...defaultParams, seed: 3 });
      expect(result.randomNumbers).toHaveLength(result.steps.length);
    });

    it('each job completes exactly once', () => {
      const result = simulate({ ...defaultParams, seed: 7, jobs: 5 });
      const completedIds = result.steps
        .filter(s => s.completedJobId !== null)
        .map(s => s.completedJobId);
      expect(completedIds).toHaveLength(5);
      expect(new Set(completedIds).size).toBe(5);
    });
  });

  /**
   * Cross-validation tests: expected values captured from the Python
   * lottery.py simulator (cpu-sched-lottery/lottery.py -s <seed> -c).
   */
  describe('matches Python output', () => {
    interface PyStep {
      randomValue: number;
      winningTicket: number;
      totalTickets: number;
      winnerId: number;
      completedJobId: number | null;
      clock: number;
    }

    interface PyExpected {
      params: LotteryParams;
      jobs: { id: number; length: number; tickets: number }[];
      steps: PyStep[];
    }

    function verifyAgainstPython(label: string, expected: PyExpected) {
      describe(label, () => {
        const result = simulate(expected.params);

        it('generates the same jobs', () => {
          expect(result.jobs).toEqual(expected.jobs);
        });

        it('has the same number of steps', () => {
          expect(result.steps.length).toBe(expected.steps.length);
        });

        it('matches every step', () => {
          for (let i = 0; i < expected.steps.length; i++) {
            const got = result.steps[i];
            const want = expected.steps[i];
            expect(got.randomValue, `step ${i} randomValue`).toBe(want.randomValue);
            expect(got.winningTicket, `step ${i} winningTicket`).toBe(want.winningTicket);
            expect(got.totalTickets, `step ${i} totalTickets`).toBe(want.totalTickets);
            expect(got.winnerId, `step ${i} winnerId`).toBe(want.winnerId);
            expect(got.completedJobId, `step ${i} completedJobId`).toBe(want.completedJobId);
            expect(got.clock, `step ${i} clock`).toBe(want.clock);
          }
        });
      });
    }

    // seed=0, default params
    verifyAgainstPython('seed=0 default', {
      params: { seed: 0, jobs: 3, jlist: '', maxlen: 10, maxticket: 100, quantum: 1 },
      jobs: [
        { id: 0, length: 8, tickets: 75 },
        { id: 1, length: 4, tickets: 25 },
        { id: 2, length: 5, tickets: 40 },
      ],
      steps: [
        { randomValue: 783799, winningTicket: 79, totalTickets: 140, winnerId: 1, completedJobId: null, clock: 1 },
        { randomValue: 303313, winningTicket: 73, totalTickets: 140, winnerId: 0, completedJobId: null, clock: 2 },
        { randomValue: 476597, winningTicket: 37, totalTickets: 140, winnerId: 0, completedJobId: null, clock: 3 },
        { randomValue: 583382, winningTicket: 2, totalTickets: 140, winnerId: 0, completedJobId: null, clock: 4 },
        { randomValue: 908113, winningTicket: 73, totalTickets: 140, winnerId: 0, completedJobId: null, clock: 5 },
        { randomValue: 504687, winningTicket: 127, totalTickets: 140, winnerId: 2, completedJobId: null, clock: 6 },
        { randomValue: 281838, winningTicket: 18, totalTickets: 140, winnerId: 0, completedJobId: null, clock: 7 },
        { randomValue: 755804, winningTicket: 84, totalTickets: 140, winnerId: 1, completedJobId: null, clock: 8 },
        { randomValue: 618369, winningTicket: 129, totalTickets: 140, winnerId: 2, completedJobId: null, clock: 9 },
        { randomValue: 250506, winningTicket: 46, totalTickets: 140, winnerId: 0, completedJobId: null, clock: 10 },
        { randomValue: 909747, winningTicket: 27, totalTickets: 140, winnerId: 0, completedJobId: null, clock: 11 },
        { randomValue: 982786, winningTicket: 126, totalTickets: 140, winnerId: 2, completedJobId: null, clock: 12 },
        { randomValue: 810218, winningTicket: 38, totalTickets: 140, winnerId: 0, completedJobId: 0, clock: 13 },
        { randomValue: 902166, winningTicket: 31, totalTickets: 65, winnerId: 2, completedJobId: null, clock: 14 },
        { randomValue: 310147, winningTicket: 32, totalTickets: 65, winnerId: 2, completedJobId: 2, clock: 15 },
        { randomValue: 729832, winningTicket: 7, totalTickets: 25, winnerId: 1, completedJobId: null, clock: 16 },
        { randomValue: 898839, winningTicket: 14, totalTickets: 25, winnerId: 1, completedJobId: 1, clock: 17 },
      ],
    });

    // seed=1, default params
    verifyAgainstPython('seed=1 default', {
      params: { seed: 1, jobs: 3, jlist: '', maxlen: 10, maxticket: 100, quantum: 1 },
      jobs: [
        { id: 0, length: 1, tickets: 84 },
        { id: 1, length: 7, tickets: 25 },
        { id: 2, length: 4, tickets: 44 },
      ],
      steps: [
        { randomValue: 651593, winningTicket: 119, totalTickets: 153, winnerId: 2, completedJobId: null, clock: 1 },
        { randomValue: 788724, winningTicket: 9, totalTickets: 153, winnerId: 0, completedJobId: 0, clock: 2 },
        { randomValue: 93859, winningTicket: 19, totalTickets: 69, winnerId: 1, completedJobId: null, clock: 3 },
        { randomValue: 28347, winningTicket: 57, totalTickets: 69, winnerId: 2, completedJobId: null, clock: 4 },
        { randomValue: 835765, winningTicket: 37, totalTickets: 69, winnerId: 2, completedJobId: null, clock: 5 },
        { randomValue: 432767, winningTicket: 68, totalTickets: 69, winnerId: 2, completedJobId: 2, clock: 6 },
        { randomValue: 762280, winningTicket: 5, totalTickets: 25, winnerId: 1, completedJobId: null, clock: 7 },
        { randomValue: 2106, winningTicket: 6, totalTickets: 25, winnerId: 1, completedJobId: null, clock: 8 },
        { randomValue: 445387, winningTicket: 12, totalTickets: 25, winnerId: 1, completedJobId: null, clock: 9 },
        { randomValue: 721540, winningTicket: 15, totalTickets: 25, winnerId: 1, completedJobId: null, clock: 10 },
        { randomValue: 228762, winningTicket: 12, totalTickets: 25, winnerId: 1, completedJobId: null, clock: 11 },
        { randomValue: 945271, winningTicket: 21, totalTickets: 25, winnerId: 1, completedJobId: 1, clock: 12 },
      ],
    });

    // seed=42, default params
    verifyAgainstPython('seed=42 default', {
      params: { seed: 42, jobs: 3, jlist: '', maxlen: 10, maxticket: 100, quantum: 1 },
      jobs: [
        { id: 0, length: 6, tickets: 2 },
        { id: 1, length: 2, tickets: 22 },
        { id: 2, length: 7, tickets: 67 },
      ],
      steps: [
        { randomValue: 892180, winningTicket: 16, totalTickets: 91, winnerId: 1, completedJobId: null, clock: 1 },
        { randomValue: 86938, winningTicket: 33, totalTickets: 91, winnerId: 2, completedJobId: null, clock: 2 },
        { randomValue: 421922, winningTicket: 46, totalTickets: 91, winnerId: 2, completedJobId: null, clock: 3 },
        { randomValue: 29797, winningTicket: 40, totalTickets: 91, winnerId: 2, completedJobId: null, clock: 4 },
        { randomValue: 218638, winningTicket: 56, totalTickets: 91, winnerId: 2, completedJobId: null, clock: 5 },
        { randomValue: 505355, winningTicket: 32, totalTickets: 91, winnerId: 2, completedJobId: null, clock: 6 },
        { randomValue: 26535, winningTicket: 54, totalTickets: 91, winnerId: 2, completedJobId: null, clock: 7 },
        { randomValue: 198837, winningTicket: 2, totalTickets: 91, winnerId: 1, completedJobId: 1, clock: 8 },
        { randomValue: 649885, winningTicket: 43, totalTickets: 69, winnerId: 2, completedJobId: 2, clock: 9 },
        { randomValue: 544942, winningTicket: 0, totalTickets: 2, winnerId: 0, completedJobId: null, clock: 10 },
        { randomValue: 220440, winningTicket: 0, totalTickets: 2, winnerId: 0, completedJobId: null, clock: 11 },
        { randomValue: 589266, winningTicket: 0, totalTickets: 2, winnerId: 0, completedJobId: null, clock: 12 },
        { randomValue: 809431, winningTicket: 1, totalTickets: 2, winnerId: 0, completedJobId: null, clock: 13 },
        { randomValue: 6498, winningTicket: 0, totalTickets: 2, winnerId: 0, completedJobId: null, clock: 14 },
        { randomValue: 805820, winningTicket: 0, totalTickets: 2, winnerId: 0, completedJobId: 0, clock: 15 },
      ],
    });

    // custom jlist "10:100,20:100", seed=0
    verifyAgainstPython('custom jlist 10:100,20:100 seed=0', {
      params: { seed: 0, jobs: 3, jlist: '10:100,20:100', maxlen: 10, maxticket: 100, quantum: 1 },
      jobs: [
        { id: 0, length: 10, tickets: 100 },
        { id: 1, length: 20, tickets: 100 },
      ],
      steps: [
        { randomValue: 844422, winningTicket: 22, totalTickets: 200, winnerId: 0, completedJobId: null, clock: 1 },
        { randomValue: 757955, winningTicket: 155, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 2 },
        { randomValue: 420572, winningTicket: 172, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 3 },
        { randomValue: 258917, winningTicket: 117, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 4 },
        { randomValue: 511275, winningTicket: 75, totalTickets: 200, winnerId: 0, completedJobId: null, clock: 5 },
        { randomValue: 404934, winningTicket: 134, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 6 },
        { randomValue: 783799, winningTicket: 199, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 7 },
        { randomValue: 303313, winningTicket: 113, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 8 },
        { randomValue: 476597, winningTicket: 197, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 9 },
        { randomValue: 583382, winningTicket: 182, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 10 },
        { randomValue: 908113, winningTicket: 113, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 11 },
        { randomValue: 504687, winningTicket: 87, totalTickets: 200, winnerId: 0, completedJobId: null, clock: 12 },
        { randomValue: 281838, winningTicket: 38, totalTickets: 200, winnerId: 0, completedJobId: null, clock: 13 },
        { randomValue: 755804, winningTicket: 4, totalTickets: 200, winnerId: 0, completedJobId: null, clock: 14 },
        { randomValue: 618369, winningTicket: 169, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 15 },
        { randomValue: 250506, winningTicket: 106, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 16 },
        { randomValue: 909747, winningTicket: 147, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 17 },
        { randomValue: 982786, winningTicket: 186, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 18 },
        { randomValue: 810218, winningTicket: 18, totalTickets: 200, winnerId: 0, completedJobId: null, clock: 19 },
        { randomValue: 902166, winningTicket: 166, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 20 },
        { randomValue: 310147, winningTicket: 147, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 21 },
        { randomValue: 729832, winningTicket: 32, totalTickets: 200, winnerId: 0, completedJobId: null, clock: 22 },
        { randomValue: 898839, winningTicket: 39, totalTickets: 200, winnerId: 0, completedJobId: null, clock: 23 },
        { randomValue: 683984, winningTicket: 184, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 24 },
        { randomValue: 472143, winningTicket: 143, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 25 },
        { randomValue: 100701, winningTicket: 101, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 26 },
        { randomValue: 434172, winningTicket: 172, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 27 },
        { randomValue: 610887, winningTicket: 87, totalTickets: 200, winnerId: 0, completedJobId: null, clock: 28 },
        { randomValue: 913011, winningTicket: 11, totalTickets: 200, winnerId: 0, completedJobId: 0, clock: 29 },
        { randomValue: 966607, winningTicket: 7, totalTickets: 100, winnerId: 1, completedJobId: 1, clock: 30 },
      ],
    });

    // seed=0, quantum=5
    verifyAgainstPython('seed=0 quantum=5', {
      params: { seed: 0, jobs: 3, jlist: '', maxlen: 10, maxticket: 100, quantum: 5 },
      jobs: [
        { id: 0, length: 8, tickets: 75 },
        { id: 1, length: 4, tickets: 25 },
        { id: 2, length: 5, tickets: 40 },
      ],
      steps: [
        { randomValue: 783799, winningTicket: 79, totalTickets: 140, winnerId: 1, completedJobId: 1, clock: 5 },
        { randomValue: 303313, winningTicket: 58, totalTickets: 115, winnerId: 0, completedJobId: null, clock: 10 },
        { randomValue: 476597, winningTicket: 37, totalTickets: 115, winnerId: 0, completedJobId: 0, clock: 15 },
        { randomValue: 583382, winningTicket: 22, totalTickets: 40, winnerId: 2, completedJobId: 2, clock: 20 },
      ],
    });

    // custom jlist "5:50,10:150,3:30", seed=7, quantum=2
    verifyAgainstPython('custom jlist seed=7 quantum=2', {
      params: { seed: 7, jobs: 3, jlist: '5:50,10:150,3:30', maxlen: 10, maxticket: 100, quantum: 2 },
      jobs: [
        { id: 0, length: 5, tickets: 50 },
        { id: 1, length: 10, tickets: 150 },
        { id: 2, length: 3, tickets: 30 },
      ],
      steps: [
        { randomValue: 323833, winningTicket: 223, totalTickets: 230, winnerId: 2, completedJobId: null, clock: 2 },
        { randomValue: 150849, winningTicket: 199, totalTickets: 230, winnerId: 1, completedJobId: null, clock: 4 },
        { randomValue: 650935, winningTicket: 35, totalTickets: 230, winnerId: 0, completedJobId: null, clock: 6 },
        { randomValue: 72436, winningTicket: 216, totalTickets: 230, winnerId: 2, completedJobId: 2, clock: 8 },
        { randomValue: 535882, winningTicket: 82, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 10 },
        { randomValue: 365689, winningTicket: 89, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 12 },
        { randomValue: 57998, winningTicket: 198, totalTickets: 200, winnerId: 1, completedJobId: null, clock: 14 },
        { randomValue: 507436, winningTicket: 36, totalTickets: 200, winnerId: 0, completedJobId: null, clock: 16 },
        { randomValue: 37495, winningTicket: 95, totalTickets: 200, winnerId: 1, completedJobId: 1, clock: 18 },
        { randomValue: 433646, winningTicket: 46, totalTickets: 50, winnerId: 0, completedJobId: 0, clock: 20 },
      ],
    });
  });
});
