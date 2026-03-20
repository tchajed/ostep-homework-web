import { Random } from '../random';

// --- Name generator (a, b, ..., z, A, ..., Z, aa, ab, ...) ---

const BASE_NAMES = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

class NameGenerator {
  private currNames: string[];
  private currIndex: number;

  constructor() {
    this.currNames = [...BASE_NAMES];
    this.currIndex = 1; // 'a' is reserved for root
  }

  next(): string {
    if (this.currIndex >= this.currNames.length) {
      this.grow();
    }
    return this.currNames[this.currIndex++];
  }

  private grow(): void {
    const newNames: string[] = [];
    for (const b1 of this.currNames) {
      for (const b2 of BASE_NAMES) {
        newNames.push(b1 + b2);
      }
    }
    this.currNames = newNames;
    this.currIndex = 0;
  }
}

// --- Types ---

export interface ForkParams {
  seed: number;
  forkPercentage: number;  // 0..1, chance each action is a fork (vs exit)
  actions: number;
  actionList: string;      // manual action list, e.g. "a+b,b+c,b-"
  leafOnly: boolean;       // only leaf processes may exit
  localReparent: boolean;  // reparent orphans to exiting proc's parent (vs root)
}

export type Action =
  | { kind: 'fork'; parent: string; child: string }
  | { kind: 'exit'; process: string }
  | { kind: 'exit_failed'; process: string; reason: string };

export interface ProcessNode {
  name: string;
  children: ProcessNode[];
}

export interface Step {
  action: Action;
  tree: ProcessNode;  // tree snapshot after this action
}

export interface ForkResult {
  initialTree: ProcessNode;
  steps: Step[];
}

// --- Simulation ---

export function simulate(params: ForkParams): ForkResult {
  const { seed, forkPercentage, actions, actionList, leafOnly, localReparent } = params;

  if (forkPercentage <= 0.001) {
    throw new Error('fork percentage must be > 0.001');
  }

  const rng = new Random(seed);
  const nameGen = new NameGenerator();

  const ROOT = 'a';

  // State: process list, children map, parent map
  let processList: string[] = [ROOT];
  const childrenMap = new Map<string, string[]>();
  childrenMap.set(ROOT, []);
  const parentMap = new Map<string, string>();

  function buildTree(root: string): ProcessNode {
    const kids = childrenMap.get(root) ?? [];
    return { name: root, children: kids.map(c => buildTree(c)) };
  }

  function doFork(p: string, c: string): Action {
    processList.push(c);
    childrenMap.set(c, []);
    childrenMap.get(p)!.push(c);
    parentMap.set(c, p);
    return { kind: 'fork', parent: p, child: c };
  }

  function collectDescendants(p: string): string[] {
    const kids = childrenMap.get(p) ?? [];
    if (kids.length === 0) return [p];
    const result = [p];
    for (const c of kids) {
      result.push(...collectDescendants(c));
    }
    return result;
  }

  function doExit(p: string): Action {
    if (p === ROOT) {
      throw new Error('cannot exit root process');
    }

    if (leafOnly && (childrenMap.get(p)?.length ?? 0) > 0) {
      return { kind: 'exit_failed', process: p, reason: 'has children' };
    }

    const exitParent = parentMap.get(p)!;
    processList = processList.filter(x => x !== p);

    if (localReparent) {
      for (const orphan of childrenMap.get(p) ?? []) {
        parentMap.set(orphan, exitParent);
        childrenMap.get(exitParent)!.push(orphan);
      }
    } else {
      // reparent all descendants to root
      const descendants = collectDescendants(p);
      // remove p itself
      const orphans = descendants.filter(d => d !== p);
      for (const d of orphans) {
        childrenMap.set(d, []);
        parentMap.set(d, ROOT);
        childrenMap.get(ROOT)!.push(d);
      }
      // Now rebuild child lists for orphans properly — the above flattened them.
      // Actually the Python does the same: it resets ALL descendants' children to []
      // and parents to root. So nested structures under p are completely flattened.
    }

    // Remove p from its parent's children
    const parentKids = childrenMap.get(exitParent)!;
    const idx = parentKids.indexOf(p);
    if (idx !== -1) parentKids.splice(idx, 1);

    // Mark p as gone
    childrenMap.delete(p);
    parentMap.delete(p);

    return { kind: 'exit', process: p };
  }

  // Generate or parse action list
  let actionSpecs: string[];
  if (actionList.trim() !== '') {
    actionSpecs = actionList.split(',').map(s => s.trim());
  } else {
    actionSpecs = [];
    // Use a temp process list to generate actions (matching Python behavior)
    const tempProcessList = [ROOT];
    let count = 0;
    while (count < actions) {
      if (rng.random() < forkPercentage) {
        const forkChoice = rng.choice(tempProcessList);
        const newChild = nameGen.next();
        actionSpecs.push(`${forkChoice}+${newChild}`);
        tempProcessList.push(newChild);
      } else {
        const exitChoice = rng.choice(tempProcessList);
        if (exitChoice === ROOT) {
          continue;
        }
        const idx = tempProcessList.indexOf(exitChoice);
        tempProcessList.splice(idx, 1);
        actionSpecs.push(`${exitChoice}-`);
      }
      count++;
    }
  }

  const initialTree = buildTree(ROOT);
  const steps: Step[] = [];

  for (const spec of actionSpecs) {
    let action: Action;
    if (spec.includes('+')) {
      const [parent, child] = spec.split('+');
      if (!processList.includes(parent)) {
        throw new Error(`bad action: ${spec} (process ${parent} not found)`);
      }
      action = doFork(parent, child);
    } else if (spec.endsWith('-')) {
      const proc = spec.slice(0, -1);
      if (!processList.includes(proc)) {
        throw new Error(`bad action: ${spec} (process ${proc} not found)`);
      }
      action = doExit(proc);
    } else {
      throw new Error(`bad action format: ${spec}`);
    }
    steps.push({ action, tree: buildTree(ROOT) });
  }

  return { initialTree, steps };
}

/** Format an action as a human-readable string. */
export function formatAction(action: Action): string {
  switch (action.kind) {
    case 'fork':
      return `${action.parent} forks ${action.child}`;
    case 'exit':
      return `${action.process} EXITS`;
    case 'exit_failed':
      return `${action.process} EXITS (failed: ${action.reason})`;
  }
}

/**
 * Render a process tree as an array of lines using Unicode box-drawing characters.
 * Each line is { indent: string, name: string }.
 */
export interface TreeLine {
  prefix: string;
  name: string;
}

export function renderTree(node: ProcessNode, level: number = 0, pmask: Map<number, boolean> = new Map(), isLast: boolean = false): TreeLine[] {
  const lines: TreeLine[] = [];
  let prefix = '';

  if (level > 0) {
    for (let i = 0; i < level - 1; i++) {
      if (pmask.get(i)) {
        prefix += '\u2502   '; // │
      } else {
        prefix += '    ';
      }
    }
    if (pmask.get(level - 1)) {
      if (isLast) {
        prefix += '\u2514\u2500\u2500 '; // └──
      } else {
        prefix += '\u251c\u2500\u2500 '; // ├──
      }
    } else {
      prefix += ' \u2500\u2500 '; // ───
    }
  }

  lines.push({ prefix, name: node.name });

  // Clone pmask for mutation
  const nextMask = new Map(pmask);
  if (isLast) {
    nextMask.set(level - 1, false);
  }
  nextMask.set(level, true);

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const last = i === node.children.length - 1;
    lines.push(...renderTree(child, level + 1, nextMask, last));
  }

  return lines;
}

/** Render tree to a plain string (for testing / display). */
export function treeToString(node: ProcessNode): string {
  return renderTree(node).map(l => l.prefix + l.name).join('\n');
}
