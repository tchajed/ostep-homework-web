<script lang="ts">
  import { simulate, defaultParams, type AfsParams, type AfsResult, type LogEntry, type CacheEntry } from '../lib/simulators/afs';

  let seed = $state(defaultParams.seed);
  let numClients = $state(defaultParams.numClients);
  let numSteps = $state(defaultParams.numSteps);
  let numFiles = $state(defaultParams.numFiles);
  let readRatio = $state(defaultParams.readRatio);
  let schedule = $state(defaultParams.schedule);
  let actions = $state(defaultParams.actions);
  let showAnswers = $state(false);

  let result: AfsResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    try {
      error = null;
      result = simulate({ seed, numClients, numSteps, numFiles, readRatio, schedule, actions });
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  // Run on mount
  run();

  const clientColors = [
    'text-blue-400',
    'text-green-400',
    'text-yellow-400',
    'text-pink-400',
    'text-purple-400',
    'text-cyan-400',
    'text-orange-400',
    'text-red-400',
  ];

  function clientColor(id: number): string {
    return clientColors[id % clientColors.length];
  }

  function formatOp(entry: LogEntry, showValues: boolean): string {
    switch (entry.op) {
      case 'open':
        return `open:${entry.fileName} [fd:${entry.fd}]`;
      case 'read':
        if (showValues) {
          return `read:${entry.fd} -> ${entry.newValue}`;
        }
        return `read:${entry.fd} -> ?`;
      case 'write':
        if (showValues) {
          return `write:${entry.fd} ${entry.oldValue} -> ${entry.newValue}`;
        }
        return `write:${entry.fd} ? -> ${entry.newValue}`;
      case 'close':
        return `close:${entry.fd}`;
      case 'invalidate':
        return `invalidate ${entry.fileName}`;
      case 'callback':
        return `callback: c:c${entry.clientId} file:${entry.fileName}`;
      case 'getfile':
        return `getfile:${entry.fileName} [${entry.newValue}]`;
      case 'putfile':
        return `putfile:${entry.fileName} [${entry.newValue}]`;
      default:
        return '';
    }
  }

  function formatCacheEntry(fname: string, e: CacheEntry): string {
    return `${fname}:${e.data} (v=${e.valid ? 1 : 0},d=${e.dirty ? 1 : 0},r=${e.refcnt})`;
  }

  function isServerOp(entry: LogEntry): boolean {
    return entry.op === 'getfile' || entry.op === 'putfile' || entry.op === 'callback';
  }
</script>

<div class="max-w-6xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">AFS (Andrew File System) Simulator</h1>
  <p class="text-gray-400 text-sm">
    Simulates AFS whole-file caching with server callbacks.
    Clients open, read/write, and close files. On open, the file is fetched from the server
    if not cached. On close, dirty files are flushed, and the server invalidates other clients'
    cached copies via callbacks.
  </p>

  <!-- Controls -->
  <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
    <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Parameters</h2>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <label class="block">
        <span class="text-xs text-gray-400">Seed</span>
        <input type="number" bind:value={seed} min={0}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Clients</span>
        <input type="number" bind:value={numClients} min={1} max={8}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Steps/Client</span>
        <input type="number" bind:value={numSteps} min={1} max={20}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Files</span>
        <input type="number" bind:value={numFiles} min={1} max={26}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Read Ratio</span>
        <input type="number" bind:value={readRatio} min={0} max={1} step={0.1}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Schedule</span>
        <input type="text" bind:value={schedule} placeholder="e.g. 0101"
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
      </label>
    </div>
    <div class="mt-3">
      <label class="block">
        <span class="text-xs text-gray-400">Actions (e.g. oa1:r1:c1,oa1:w1:c1)</span>
        <input type="text" bind:value={actions} placeholder="leave empty for random"
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
      </label>
    </div>
  </div>

  <div class="flex gap-3 items-center">
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
  </div>

  {#if error}
    <div class="rounded bg-red-900/40 border border-red-700 p-3 text-red-300 text-sm">
      {error}
    </div>
  {/if}

  {#if result}
    <!-- Initial file state -->
    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h2 class="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Initial Server Files</h2>
      <div class="font-mono text-sm text-gray-300 space-y-0.5">
        {#each result.fileNames as fname}
          <div>file:{fname} contains:{result.initialFiles[fname]}</div>
        {/each}
      </div>
    </div>

    <!-- Operation Log -->
    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Operation Log</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm font-mono">
          <thead>
            <tr class="text-gray-500 text-left border-b border-gray-800">
              <th class="py-1 pr-4 w-32">Server</th>
              {#each Array(result.params.numClients) as _, i}
                <th class="py-1 pr-4 {clientColor(i)}">c{i}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each result.log as entry}
              {#if isServerOp(entry)}
                <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td class="py-1 pr-4 text-gray-400">{formatOp(entry, showAnswers)}</td>
                  {#each Array(result.params.numClients) as _, i}
                    <td class="py-1 pr-4"></td>
                  {/each}
                </tr>
              {:else}
                <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td class="py-1 pr-4"></td>
                  {#each Array(result.params.numClients) as _, i}
                    <td class="py-1 pr-4 {clientColor(i)}">
                      {#if entry.clientId === i}
                        <div>{formatOp(entry, showAnswers)}</div>
                        {#if showAnswers && entry.cacheSnapshot}
                          <div class="text-xs text-gray-500">
                            {#each Object.entries(entry.cacheSnapshot) as [fname, ce]}
                              <span class="mr-2">[{formatCacheEntry(fname, ce)}]</span>
                            {/each}
                            {#if Object.keys(entry.cacheSnapshot).length === 0}
                              <span class="italic">cache empty</span>
                            {/if}
                          </div>
                        {/if}
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Final file state -->
    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
      <h2 class="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Final Server Files</h2>
      <div class="font-mono text-sm text-gray-300 space-y-0.5">
        {#each result.fileNames as fname}
          {#if showAnswers}
            <div>file:{fname} contains:{result.finalFiles[fname]}</div>
          {:else}
            <div>file:{fname} contains:?</div>
          {/if}
        {/each}
      </div>
    </div>

    <!-- Stats -->
    {#if showAnswers}
      <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
        <h2 class="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Statistics</h2>
        <div class="font-mono text-sm text-gray-300 space-y-1">
          <div>Server -- Gets:{result.serverStats.gets} Puts:{result.serverStats.puts}</div>
          {#each result.clientStats as cs, i}
            <div class={clientColor(i)}>
              {cs.name} -- Reads:{cs.reads} Writes:{cs.writes} | Cache -- Hits:{cs.cacheHits} Misses:{cs.cacheMisses} Invalidates:{cs.invalidations}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
