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

describe('fork simulator matches Python output', () => {
  it('seed 1, default params (fork=0.7, actions=5)', () => {
    const result = simulate({ ...defaults, seed: 1 });
    const actions = result.steps.map(s => formatAction(s.action));
    expect(actions).toEqual([
      'a forks b',
      'a forks c',
      'c forks d',
      'a forks e',
      'c EXITS',
    ]);
    const finalTree = treeToString(result.steps[result.steps.length - 1].tree);
    expect(finalTree).toBe('a\n\u251c\u2500\u2500 b\n\u251c\u2500\u2500 e\n\u2514\u2500\u2500 d');
  });

  it('seed 2, fork=0.5, actions=8', () => {
    const result = simulate({ ...defaults, seed: 2, forkPercentage: 0.5, actions: 8 });
    const actions = result.steps.map(s => formatAction(s.action));
    expect(actions).toEqual([
      'a forks b',
      'b EXITS',
      'a forks c',
      'c EXITS',
      'a forks d',
      'a forks e',
      'a forks f',
      'f forks g',
    ]);
    const finalTree = treeToString(result.steps[result.steps.length - 1].tree);
    expect(finalTree).toBe('a\n\u251c\u2500\u2500 d\n\u251c\u2500\u2500 e\n\u2514\u2500\u2500 f\n    \u2514\u2500\u2500 g');
  });

  it('seed 3, fork=0.9, actions=10', () => {
    const result = simulate({ ...defaults, seed: 3, forkPercentage: 0.9, actions: 10 });
    const actions = result.steps.map(s => formatAction(s.action));
    expect(actions).toEqual([
      'a forks b',
      'b forks c',
      'a forks d',
      'd forks e',
      'b forks f',
      'c EXITS',
      'd forks g',
      'a forks h',
      'h forks i',
      'g forks j',
    ]);
    const finalTree = treeToString(result.steps[result.steps.length - 1].tree);
    expect(finalTree).toBe(
      'a\n\u251c\u2500\u2500 b\n\u2502   \u2514\u2500\u2500 f\n\u251c\u2500\u2500 d\n\u2502   \u251c\u2500\u2500 e\n\u2502   \u2514\u2500\u2500 g\n\u2502       \u2514\u2500\u2500 j\n\u2514\u2500\u2500 h\n    \u2514\u2500\u2500 i'
    );
  });

  it('seed 5, fork=0.4, actions=6, leafOnly=true', () => {
    const result = simulate({ ...defaults, seed: 5, forkPercentage: 0.4, actions: 6, leafOnly: true });
    const actions = result.steps.map(s => formatAction(s.action));
    expect(actions).toEqual([
      'a forks b',
      'b EXITS',
      'a forks c',
      'c forks d',
      'd forks e',
      'a forks f',
    ]);
    const finalTree = treeToString(result.steps[result.steps.length - 1].tree);
    expect(finalTree).toBe(
      'a\n\u251c\u2500\u2500 c\n\u2502   \u2514\u2500\u2500 d\n\u2502       \u2514\u2500\u2500 e\n\u2514\u2500\u2500 f'
    );
  });

  it('explicit actions with root reparenting (a+b,b+c,c+d,b-)', () => {
    const result = simulate({ ...defaults, actionList: 'a+b,b+c,c+d,b-', localReparent: false });
    const actions = result.steps.map(s => formatAction(s.action));
    expect(actions).toEqual(['a forks b', 'b forks c', 'c forks d', 'b EXITS']);
    // Default reparenting flattens: c and d both become children of a
    const finalTree = treeToString(result.steps[result.steps.length - 1].tree);
    expect(finalTree).toBe('a\n\u251c\u2500\u2500 c\n\u2514\u2500\u2500 d');
  });

  it('explicit actions with local reparenting (a+b,b+c,c+d,b-)', () => {
    const result = simulate({ ...defaults, actionList: 'a+b,b+c,c+d,b-', localReparent: true });
    const actions = result.steps.map(s => formatAction(s.action));
    expect(actions).toEqual(['a forks b', 'b forks c', 'c forks d', 'b EXITS']);
    // Local reparenting: c goes to a (b's parent), keeping d as c's child
    const finalTree = treeToString(result.steps[result.steps.length - 1].tree);
    expect(finalTree).toBe('a\n\u2514\u2500\u2500 c\n    \u2514\u2500\u2500 d');
  });

  it('seed 7, fork=0.6, actions=7, localReparent=true', () => {
    const result = simulate({ ...defaults, seed: 7, forkPercentage: 0.6, actions: 7, localReparent: true });
    const actions = result.steps.map(s => formatAction(s.action));
    expect(actions).toEqual([
      'a forks b',
      'a forks c',
      'b forks d',
      'b forks e',
      'a forks f',
      'e forks g',
      'b forks h',
    ]);
    const finalTree = treeToString(result.steps[result.steps.length - 1].tree);
    expect(finalTree).toBe(
      'a\n\u251c\u2500\u2500 b\n\u2502   \u251c\u2500\u2500 d\n\u2502   \u251c\u2500\u2500 e\n\u2502   \u2502   \u2514\u2500\u2500 g\n\u2502   \u2514\u2500\u2500 h\n\u251c\u2500\u2500 c\n\u2514\u2500\u2500 f'
    );
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
