<script lang="ts">
  import {
    simulate,
    formatInode,
    formatBlock,
    formatBitmap,
    defaultParams,
    type FsckResult,
    type FsckParams,
    type FsState,
    type InodeState,
    type BlockState,
  } from '../lib/simulators/fsck';

  let seed = $state(defaultParams.seed);
  let seedCorrupt = $state(defaultParams.seedCorrupt);
  let numInodes = $state(defaultParams.numInodes);
  let numData = $state(defaultParams.numData);
  let numRequests = $state(defaultParams.numRequests);
  let whichCorrupt = $state(defaultParams.whichCorrupt);
  let dontCorrupt = $state(defaultParams.dontCorrupt);
  let showAnswer = $state(false);

  let result: FsckResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    try {
      error = null;
      result = simulate({
        seed,
        seedCorrupt,
        numInodes,
        numData,
        numRequests,
        whichCorrupt,
        dontCorrupt,
      });
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  run();

  function inodeChanged(initial: InodeState, final: InodeState): boolean {
    return initial.ftype !== final.ftype || initial.addr !== final.addr || initial.refCnt !== final.refCnt;
  }

  function blockChanged(initial: BlockState, final: BlockState): boolean {
    if (initial.ftype !== final.ftype || initial.data !== final.data) return true;
    if (initial.dirList.length !== final.dirList.length) return true;
    for (let i = 0; i < initial.dirList.length; i++) {
      if (initial.dirList[i].name !== final.dirList[i].name || initial.dirList[i].inum !== final.dirList[i].inum) return true;
    }
    return false;
  }

  function bitmapChanged(a: number[], b: number[]): Set<number> {
    const changed = new Set<number>();
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) changed.add(i);
    }
    return changed;
  }

  const corruptionTypes: Record<number, string> = {
    0: 'Data bitmap',
    1: 'Inode bitmap',
    2: 'File inode refcnt',
    3: 'File inode orphan',
    4: 'File inode bad block ptr',
    5: 'File inode type switch',
    6: 'Dir entry bad inode ref',
    7: 'Dir entry name change',
    8: 'Dir inode refcnt',
    9: 'Dir inode orphan',
    10: 'Dir inode bad block ptr',
    11: 'Dir inode type switch',
  };
</script>

<div class="max-w-5xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">File System Checker (fsck)</h1>
  <p class="text-gray-400 text-sm">
    Generates a random file system, then introduces a single corruption.
    Given the corrupted state, can you identify what changed?
    Enable "Show Answer" to reveal the corruption details and the original (pre-corruption) state.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    <label class="flex flex-col text-sm text-gray-400">
      Seed
      <input type="number" bind:value={seed} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Corrupt Seed
      <input type="number" bind:value={seedCorrupt} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      # Inodes
      <input type="number" bind:value={numInodes} min="4" max="64"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      # Data Blocks
      <input type="number" bind:value={numData} min="4" max="64"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      # Requests
      <input type="number" bind:value={numRequests} min="1" max="100"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Corruption Type
      <select bind:value={whichCorrupt}
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full">
        <option value={-1}>Random</option>
        {#each Object.entries(corruptionTypes) as [val, label]}
          <option value={Number(val)}>{val}: {label}</option>
        {/each}
      </select>
    </label>
  </div>

  <div class="flex gap-3 items-center flex-wrap">
    <button
      onclick={run}
      class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium cursor-pointer"
    >
      Generate
    </button>
    <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
      <input type="checkbox" bind:checked={dontCorrupt}
        class="rounded bg-gray-800 border-gray-600" />
      No Corruption
    </label>
    <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
      <input type="checkbox" bind:checked={showAnswer}
        class="rounded bg-gray-800 border-gray-600" />
      Show Answer
    </label>
  </div>

  {#if error}
    <div class="rounded bg-red-900/40 border border-red-700 p-3 text-red-300 text-sm">
      {error}
    </div>
  {/if}

  {#if result}
    <!-- Corruption answer -->
    {#if showAnswer && result.corruption}
      <div class="rounded bg-yellow-900/30 border border-yellow-700 p-4 text-yellow-200 text-sm font-mono">
        <span class="font-sans font-semibold text-yellow-300">Corruption:</span> {result.corruption.description}
      </div>
    {/if}

    <!-- Show initial state when answer is revealed and there was corruption -->
    {#if showAnswer && result.corruption}
      <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-3">
        <h2 class="text-base font-semibold text-gray-200">Initial State (before corruption)</h2>
        {@render fsStateView(result.initialState, null)}
      </div>
    {/if}

    <!-- Final (possibly corrupted) state -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-3">
      <h2 class="text-base font-semibold text-gray-200">
        {#if dontCorrupt}
          File System State
        {:else}
          Final State (after corruption)
        {/if}
      </h2>
      {@render fsStateView(result.finalState, showAnswer && result.corruption ? result.initialState : null)}
    </div>

    <!-- File/directory summary -->
    {#if showAnswer || dontCorrupt}
      <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-2 text-sm">
        <h2 class="text-base font-semibold text-gray-200">Files & Directories</h2>
        <p class="font-mono text-gray-300">
          <span class="text-gray-500">Dirs:</span> {result.dirs.join(', ')}
        </p>
        <p class="font-mono text-gray-300">
          <span class="text-gray-500">Files:</span> {result.files.length > 0 ? result.files.join(', ') : '(none)'}
        </p>
      </div>
    {/if}

    <!-- Challenge prompt -->
    {#if !dontCorrupt && !showAnswer}
      <div class="rounded bg-gray-800 border border-gray-700 p-4 text-gray-300 text-sm">
        Can you figure out how the file system was corrupted? Toggle "Show Answer" to check.
      </div>
    {/if}
  {/if}
</div>

{#snippet fsStateView(state: FsState, compareState: FsState | null)}
  <!-- Inode Bitmap -->
  <div>
    <h3 class="text-sm font-semibold text-gray-400 mb-1">Inode Bitmap</h3>
    <div class="font-mono text-sm flex flex-wrap gap-0">
      {#each state.ibitmap as bit, i}
        {@const changed = compareState !== null && compareState.ibitmap[i] !== bit}
        <span class="w-5 text-center {changed ? 'bg-red-800/50 text-red-300 rounded' : bit ? 'text-green-400' : 'text-gray-600'}">
          {bit}
        </span>
      {/each}
    </div>
  </div>

  <!-- Inodes -->
  <div>
    <h3 class="text-sm font-semibold text-gray-400 mb-1">Inodes</h3>
    <div class="overflow-x-auto">
      <table class="text-xs font-mono">
        <thead>
          <tr class="text-gray-500">
            {#each state.inodes as _, i}
              <th class="px-1 text-center font-normal">{i}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            {#each state.inodes as inode, i}
              {@const changed = compareState !== null && inodeChanged(compareState.inodes[i], inode)}
              <td class="px-1 text-center whitespace-nowrap {changed ? 'bg-red-800/50 text-red-300 rounded' : inode.ftype === 'free' ? 'text-gray-600' : 'text-gray-300'}">
                {formatInode(inode)}
              </td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Data Bitmap -->
  <div>
    <h3 class="text-sm font-semibold text-gray-400 mb-1">Data Bitmap</h3>
    <div class="font-mono text-sm flex flex-wrap gap-0">
      {#each state.dbitmap as bit, i}
        {@const changed = compareState !== null && compareState.dbitmap[i] !== bit}
        <span class="w-5 text-center {changed ? 'bg-red-800/50 text-red-300 rounded' : bit ? 'text-green-400' : 'text-gray-600'}">
          {bit}
        </span>
      {/each}
    </div>
  </div>

  <!-- Data Blocks -->
  <div>
    <h3 class="text-sm font-semibold text-gray-400 mb-1">Data Blocks</h3>
    <div class="overflow-x-auto">
      <table class="text-xs font-mono">
        <thead>
          <tr class="text-gray-500">
            {#each state.data as _, i}
              <th class="px-1 text-center font-normal">{i}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            {#each state.data as block, i}
              {@const changed = compareState !== null && blockChanged(compareState.data[i], block)}
              <td class="px-1 text-center whitespace-nowrap {changed ? 'bg-red-800/50 text-red-300 rounded' : block.ftype === 'free' ? 'text-gray-600' : 'text-gray-300'}">
                {formatBlock(block)}
              </td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>
  </div>
{/snippet}
