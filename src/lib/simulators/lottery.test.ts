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
});
