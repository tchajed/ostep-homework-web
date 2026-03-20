<script lang="ts">
  import {
    simulate,
    defaultParams,
    formatInodeBitmap,
    formatInode,
    formatBlock,
    type VsfsParams,
    type VsfsResult,
    type FsState,
  } from '../lib/simulators/vsfs';

  let seed = $state(defaultParams.seed);
  let numInodes = $state(defaultParams.numInodes);
  let numData = $state(defaultParams.numData);
  let numRequests = $state(defaultParams.numRequests);
  let showSolution = $state(false);

  let result: VsfsResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    error = null;
    try {
      result = simulate({ seed, numInodes, numData, numRequests });
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  function stateRows(state: FsState) {
    return [
      { label: 'inode bitmap', value: formatInodeBitmap(state.inodeBitmap) },
      { label: 'inodes', value: state.inodes.map(formatInode).join('') },
      { label: 'data bitmap', value: formatInodeBitmap(state.dataBitmap) },
      { label: 'data', value: state.data.map(formatBlock).join('') },
    ];
  }
</script>

<div class="max-w-5xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">File System Implementation (vsfs)</h1>
  <p class="text-gray-400 text-sm mb-6">
    Simulate a very simple file system (VSFS) with inodes, data blocks, bitmaps, and directory entries.
    Operations include creat, mkdir, unlink, link, and write.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
    <label class="block">
      <span class="text-xs text-gray-400">Seed</span>
      <input
        type="number"
        bind:value={seed}
        min="0"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm
               text-gray-100 focus:border-blue-500 focus:outline-none"
      />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Num Inodes</span>
      <input
        type="number"
        bind:value={numInodes}
        min="2"
        max="64"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm
               text-gray-100 focus:border-blue-500 focus:outline-none"
      />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Num Data Blocks</span>
      <input
        type="number"
        bind:value={numData}
        min="2"
        max="64"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm
               text-gray-100 focus:border-blue-500 focus:outline-none"
      />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Num Requests</span>
      <input
        type="number"
        bind:value={numRequests}
        min="1"
        max="100"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm
               text-gray-100 focus:border-blue-500 focus:outline-none"
      />
    </label>
  </div>

  <div class="flex gap-3 mb-6">
    <button
      onclick={run}
      class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500
             transition-colors cursor-pointer"
    >
      Run
    </button>
    <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
      <input type="checkbox" bind:checked={showSolution} class="accent-blue-500" />
      Show solution
    </label>
  </div>

  {#if error}
    <div class="rounded bg-red-900/40 border border-red-700 px-4 py-2 text-sm text-red-300 mb-6">
      {error}
    </div>
  {/if}

  {#if result}
    <!-- Initial State -->
    <div class="mb-6">
      <h2 class="text-lg font-semibold text-gray-200 mb-2">Initial State</h2>
      <div class="overflow-x-auto rounded bg-gray-900 border border-gray-800 p-3">
        <table class="text-sm font-mono">
          <tbody>
            {#each stateRows(result.initialState) as row}
              <tr>
                <td class="pr-3 text-gray-500 whitespace-nowrap align-top">{row.label}</td>
                <td class="text-gray-200 whitespace-nowrap">{row.value}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Steps -->
    {#each result.steps as step, i}
      <div class="mb-6">
        <h3 class="text-sm font-semibold text-gray-300 mb-1">Step {i + 1}</h3>

        {#if showSolution}
          <div class="mb-2 rounded bg-gray-900 border border-gray-800 px-3 py-2">
            <code class="text-sm text-emerald-400">{step.operation}</code>
          </div>
          <div class="overflow-x-auto rounded bg-gray-900 border border-gray-800 p-3">
            <table class="text-sm font-mono">
              <tbody>
                {#each stateRows(step.stateAfter) as row}
                  <tr>
                    <td class="pr-3 text-gray-500 whitespace-nowrap align-top">{row.label}</td>
                    <td class="text-gray-200 whitespace-nowrap">{row.value}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <div class="rounded bg-gray-900 border border-gray-800 px-3 py-2 text-sm text-gray-400 italic">
            Which operation took place? What is the resulting state?
          </div>
        {/if}
      </div>
    {/each}

    <!-- Summary -->
    {#if showSolution}
      <div class="mb-6">
        <h2 class="text-lg font-semibold text-gray-200 mb-2">Summary</h2>
        <div class="rounded bg-gray-900 border border-gray-800 p-3 text-sm">
          <p class="text-gray-400">
            <span class="text-gray-500">Files:</span>
            <span class="text-gray-200 font-mono">{result.files.length > 0 ? result.files.join(', ') : '(none)'}</span>
          </p>
          <p class="text-gray-400 mt-1">
            <span class="text-gray-500">Directories:</span>
            <span class="text-gray-200 font-mono">{result.dirs.join(', ')}</span>
          </p>
        </div>
      </div>
    {/if}
  {/if}
</div>
