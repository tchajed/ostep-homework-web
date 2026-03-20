import { describe, it, expect } from 'vitest';
import { simulate, formatAction, treeToString, type ForkParams, type ProcessNode } from './fork';

const defaults: ForkParams = {
  seed: 0,
  forkPercentage: 0.7,
  actions: 5,
  actionList: '',
  leafOnly: false,
  localReparent: false,
};

describe('fork simulator', () => {
  it('starts with just root process "a"', () => {
    const result = simulate({ ...defaults, actions: 0, actionList: '' });
    expect(result.initialTree).toEqual({ name: 'a', children: [] });
    expect(result.steps).toHaveLength(0);
  });

  it('handles explicit fork action list', () => {
    const result = simulate({ ...defaults, actionList: 'a+b,a+c,b+d' });
    expect(result.steps).toHaveLength(3);

    expect(formatAction(result.steps[0].action)).toBe('a forks b');
    expect(formatAction(result.steps[1].action)).toBe('a forks c');
    expect(formatAction(result.steps[2].action)).toBe('b forks d');

    // Final tree: a -> [b -> [d], c]
    const finalTree = result.steps[2].tree;
    expect(finalTree.name).toBe('a');
    expect(finalTree.children.map(c => c.name)).toEqual(['b', 'c']);
    expect(finalTree.children[0].children.map(c => c.name)).toEqual(['d']);
  });

  it('handles explicit exit action', () => {
    const result = simulate({ ...defaults, actionList: 'a+b,a+c,b-' });
    expect(result.steps).toHaveLength(3);
    expect(formatAction(result.steps[2].action)).toBe('b EXITS');

    const finalTree = result.steps[2].tree;
    expect(finalTree.children.map(c => c.name)).toEqual(['c']);
  });

  it('reparents orphans to root by default', () => {
    // a+b, b+c, b+d, b-  =>  c and d should go to root
    const result = simulate({
      ...defaults,
      actionList: 'a+b,b+c,b+d,b-',
      localReparent: false,
    });
    const finalTree = result.steps[3].tree;
    expect(finalTree.name).toBe('a');
    // c and d reparented to root (flattened)
    expect(finalTree.children.map(c => c.name)).toEqual(['c', 'd']);
  });

  it('reparents orphans to local parent when localReparent is true', () => {
    // a+b, b+c, b+d, b-  =>  c and d should go to a (b's parent)
    const result = simulate({
      ...defaults,
      actionList: 'a+b,b+c,b+d,b-',
      localReparent: true,
    });
    const finalTree = result.steps[3].tree;
    expect(finalTree.name).toBe('a');
    expect(finalTree.children.map(c => c.name)).toEqual(['c', 'd']);
  });

  it('leaf-only prevents exit of processes with children', () => {
    const result = simulate({
      ...defaults,
      actionList: 'a+b,b+c,b-',
      leafOnly: true,
    });
    expect(result.steps[2].action.kind).toBe('exit_failed');
    expect(formatAction(result.steps[2].action)).toBe('b EXITS (failed: has children)');

    // Tree unchanged: a -> b -> c
    const finalTree = result.steps[2].tree;
    expect(finalTree.children[0].name).toBe('b');
    expect(finalTree.children[0].children[0].name).toBe('c');
  });

  it('generates deterministic actions from seed', () => {
    const r1 = simulate({ ...defaults, seed: 42, actions: 5 });
    const r2 = simulate({ ...defaults, seed: 42, actions: 5 });
    expect(r1.steps.length).toBe(r2.steps.length);
    for (let i = 0; i < r1.steps.length; i++) {
      expect(formatAction(r1.steps[i].action)).toBe(formatAction(r2.steps[i].action));
    }
  });

  it('different seeds produce different results', () => {
    const r1 = simulate({ ...defaults, seed: 1, actions: 5 });
    const r2 = simulate({ ...defaults, seed: 2, actions: 5 });
    const a1 = r1.steps.map(s => formatAction(s.action)).join(',');
    const a2 = r2.steps.map(s => formatAction(s.action)).join(',');
    expect(a1).not.toBe(a2);
  });

  it('throws for invalid fork percentage', () => {
    expect(() => simulate({ ...defaults, forkPercentage: 0 })).toThrow();
  });

  it('throws for bad action referencing non-existent process', () => {
    expect(() => simulate({ ...defaults, actionList: 'z+b' })).toThrow();
  });
});

describe('treeToString', () => {
  it('renders single root', () => {
    const tree: ProcessNode = { name: 'a', children: [] };
    expect(treeToString(tree)).toBe('a');
  });

  it('renders tree with children', () => {
    const tree: ProcessNode = {
      name: 'a',
      children: [
        { name: 'b', children: [{ name: 'e', children: [] }] },
        { name: 'c', children: [] },
      ],
    };
    const lines = treeToString(tree);
    expect(lines).toContain('a');
    expect(lines).toContain('b');
    expect(lines).toContain('c');
    expect(lines).toContain('e');
    // Check tree drawing characters are present
    expect(lines).toContain('\u251c'); // ├
    expect(lines).toContain('\u2514'); // └
  });
});

describe('formatAction', () => {
  it('formats fork', () => {
    expect(formatAction({ kind: 'fork', parent: 'a', child: 'b' })).toBe('a forks b');
  });

  it('formats exit', () => {
    expect(formatAction({ kind: 'exit', process: 'b' })).toBe('b EXITS');
  });

  it('formats failed exit', () => {
    expect(formatAction({ kind: 'exit_failed', process: 'b', reason: 'has children' }))
      .toBe('b EXITS (failed: has children)');
  });
});
