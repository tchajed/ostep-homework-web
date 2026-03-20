<script lang="ts">
  import {
    simulate,
    formatAction,
    renderTree,
    type ForkResult,
    type ForkParams,
    type ProcessNode,
    type TreeLine,
  } from '../lib/simulators/fork';

  let seed = $state(1);
  let forkPercentage = $state(0.7);
  let actions = $state(5);
  let actionList = $state('');
  let leafOnly = $state(false);
  let localReparent = $state(false);
  let showAnswers = $state(false);

  /** In "show tree" mode the actions are hidden and the user guesses them.
   *  In default mode the actions are shown and the user guesses the trees. */
  let showTreeMode = $state(false);

  let result: ForkResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    try {
      error = null;
      result = simulate({
        seed,
        forkPercentage,
        actions,
        actionList: actionList.trim(),
        leafOnly,
        localReparent,
      });
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  // Run on mount
  run();
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">Process API (fork)</h1>
  <p class="text-gray-400 text-sm">
    Simulate a process tree built by fork() and exit() calls.
    Each step either forks a new child from an existing process,
    or exits a process (reparenting orphans). Try to predict the
    resulting tree after each action.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    <label class="flex flex-col text-sm text-gray-400">
      Seed
      <input type="number" bind:value={seed} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Fork %
      <input type="number" bind:value={forkPercentage} min="0.01" max="1" step="0.05"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      # Actions
      <input type="number" bind:value={actions} min="0" max="50"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Action List
      <input type="text" bind:value={actionList} placeholder="e.g. a+b,b+c,b-"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
  </div>

  <div class="flex flex-wrap gap-4 items-center">
    <button
      onclick={run}
      class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium cursor-pointer"
    >
      Generate
    </button>
    <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
      <input type="checkbox" bind:checked={showAnswers}
        class="rounded bg-gray-800 border-gray-600" />
      Show Answers
    </label>
    <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
      <input type="checkbox" bind:checked={showTreeMode}
        class="rounded bg-gray-800 border-gray-600" />
      Show Tree (guess actions)
    </label>
    <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
      <input type="checkbox" bind:checked={leafOnly}
        class="rounded bg-gray-800 border-gray-600" />
      Leaf-only exit
    </label>
    <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
      <input type="checkbox" bind:checked={localReparent}
        class="rounded bg-gray-800 border-gray-600" />
      Local reparent
    </label>
  </div>

  {#if error}
    <div class="rounded bg-red-900/40 border border-red-700 p-3 text-red-300 text-sm">
      {error}
    </div>
  {/if}

  {#if result}
    <!-- Initial tree -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4">
      <h2 class="text-base font-semibold text-gray-200 mb-3">Initial Process Tree</h2>
      {@render treeVis(result.initialTree)}
    </div>

    <!-- Steps -->
    <div class="space-y-4">
      {#each result.steps as step, i}
        <div class="rounded bg-gray-900 border border-gray-800 p-4">
          <div class="flex items-baseline gap-3 mb-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wide">Step {i + 1}</span>
            {#if showTreeMode}
              <!-- Tree mode: show tree, hide action -->
              {#if showAnswers}
                <span class="font-mono text-sm {actionColor(step.action.kind)}">
                  Action: {formatAction(step.action)}
                </span>
              {:else}
                <span class="text-yellow-400/70 text-sm">Action?</span>
              {/if}
            {:else}
              <!-- Default mode: show action -->
              <span class="font-mono text-sm {actionColor(step.action.kind)}">
                Action: {formatAction(step.action)}
              </span>
            {/if}
          </div>

          {#if showTreeMode}
            {@render treeVis(step.tree)}
          {:else}
            {#if showAnswers}
              {@render treeVis(step.tree)}
            {:else}
              <span class="text-yellow-400/70 text-sm">Process Tree?</span>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

{#snippet treeVis(node: ProcessNode)}
  {@const lines = renderTree(node)}
  <pre class="font-mono text-sm leading-relaxed text-gray-200 overflow-x-auto">{#each lines as line, i}{#if i > 0}
{/if}<span class="text-gray-600">{line.prefix}</span><span class="text-green-400 font-semibold">{line.name}</span>{/each}</pre>
{/snippet}

<script lang="ts" module>
  function actionColor(kind: string): string {
    switch (kind) {
      case 'fork': return 'text-blue-400';
      case 'exit': return 'text-red-400';
      case 'exit_failed': return 'text-yellow-400';
      default: return 'text-gray-300';
    }
  }
</script>
