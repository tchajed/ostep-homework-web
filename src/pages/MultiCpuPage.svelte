<script lang="ts">
  import { simulate, defaultOptions } from "../lib/simulators/multi-cpu";
  import type { SimulationOptions, SimulationResult } from "../lib/simulators/multi-cpu";

  let seed = $state(defaultOptions.seed);
  let jobNum = $state(defaultOptions.jobNum);
  let maxRun = $state(defaultOptions.maxRun);
  let maxWset = $state(defaultOptions.maxWset);
  let jobList = $state(defaultOptions.jobList);
  let numCpus = $state(defaultOptions.numCpus);
  let timeSlice = $state(defaultOptions.timeSlice);
  let perCpuQueues = $state(defaultOptions.perCpuQueues);
  let peekInterval = $state(defaultOptions.peekInterval);
  let cacheSize = $state(defaultOptions.cacheSize);
  let cacheWarmupTime = $state(defaultOptions.cacheWarmupTime);
  let cacheRateWarm = $state(defaultOptions.cacheRateWarm);
  let randomOrder = $state(defaultOptions.randomOrder);
  let affinity = $state(defaultOptions.affinity);

  let showSolution = $state(false);
  let showTimeLeft = $state(true);
  let showCache = $state(true);

  let result: SimulationResult | null = $state(null);
  let error: string | null = $state(null);

  function runSimulation() {
    try {
      error = null;
      result = simulate({
        seed,
        jobNum,
        maxRun,
        maxWset,
        jobList,
        numCpus,
        timeSlice,
        perCpuQueues,
        peekInterval,
        cacheSize,
        cacheWarmupTime,
        cacheRateWarm,
        cacheRateCold: 1,
        randomOrder,
        affinity,
      });
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  // Run on mount
  runSimulation();

  function isQuantumBoundary(tick: number): boolean {
    return tick > 0 && tick % timeSlice === 0;
  }
</script>

<div class="max-w-7xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Multi-CPU Scheduling</h1>
  <p class="text-gray-400 text-sm mb-6">
    Simulates multi-processor scheduling with per-CPU caches, configurable warmup, and centralized or per-CPU queues.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
    <!-- Random / Job generation -->
    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Jobs</h3>
      <label class="block mb-2">
        <span class="text-xs text-gray-400">Seed</span>
        <input type="number" bind:value={seed} min={0}
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block mb-2">
        <span class="text-xs text-gray-400">Job count (random)</span>
        <input type="number" bind:value={jobNum} min={1} max={10}
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block mb-2">
        <span class="text-xs text-gray-400">Max run time</span>
        <input type="number" bind:value={maxRun} min={10} step={10}
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block mb-2">
        <span class="text-xs text-gray-400">Max working set</span>
        <input type="number" bind:value={maxWset} min={10} step={10}
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Job list (name:runtime:wset,...)</span>
        <input type="text" bind:value={jobList} placeholder="e.g. a:10:100,b:20:50"
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none font-mono" />
      </label>
    </div>

    <!-- CPU / Scheduling -->
    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Scheduling</h3>
      <label class="block mb-2">
        <span class="text-xs text-gray-400">Num CPUs</span>
        <input type="number" bind:value={numCpus} min={1} max={8}
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block mb-2">
        <span class="text-xs text-gray-400">Time slice (quantum)</span>
        <input type="number" bind:value={timeSlice} min={1}
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="flex items-center gap-2 mb-2 cursor-pointer">
        <input type="checkbox" bind:checked={perCpuQueues}
          class="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
        <span class="text-xs text-gray-400">Per-CPU queues</span>
      </label>
      <label class="block mb-2">
        <span class="text-xs text-gray-400">Peek interval (steal)</span>
        <input type="number" bind:value={peekInterval} min={0}
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="flex items-center gap-2 mb-2 cursor-pointer">
        <input type="checkbox" bind:checked={randomOrder}
          class="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
        <span class="text-xs text-gray-400">Random CPU order</span>
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Affinity (name:cpu.cpu,...)</span>
        <input type="text" bind:value={affinity} placeholder="e.g. a:0,b:1"
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none font-mono" />
      </label>
    </div>

    <!-- Cache -->
    <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">Cache</h3>
      <label class="block mb-2">
        <span class="text-xs text-gray-400">Cache size</span>
        <input type="number" bind:value={cacheSize} min={0} step={10}
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block mb-2">
        <span class="text-xs text-gray-400">Warmup time</span>
        <input type="number" bind:value={cacheWarmupTime} min={0}
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block mb-3">
        <span class="text-xs text-gray-400">Warm rate</span>
        <input type="number" bind:value={cacheRateWarm} min={1}
          class="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>

      <h3 class="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wider">Display</h3>
      <label class="flex items-center gap-2 mb-1 cursor-pointer">
        <input type="checkbox" bind:checked={showTimeLeft}
          class="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
        <span class="text-xs text-gray-400">Show time left</span>
      </label>
      <label class="flex items-center gap-2 mb-1 cursor-pointer">
        <input type="checkbox" bind:checked={showCache}
          class="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
        <span class="text-xs text-gray-400">Show cache state</span>
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={showSolution}
          class="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
        <span class="text-xs text-gray-400">Show solution</span>
      </label>
    </div>
  </div>

  <button
    onclick={runSimulation}
    class="mb-6 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded transition-colors cursor-pointer"
  >
    Run Simulation
  </button>

  {#if error}
    <div class="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
      {error}
    </div>
  {/if}

  {#if result}
    <!-- Job info -->
    <div class="mb-4">
      <h2 class="text-lg font-semibold mb-2">Jobs</h2>
      <div class="overflow-x-auto">
        <table class="text-sm border-collapse">
          <thead>
            <tr class="text-gray-400 text-xs uppercase">
              <th class="px-3 py-1 text-left">Name</th>
              <th class="px-3 py-1 text-right">Run Time</th>
              <th class="px-3 py-1 text-right">Working Set</th>
              <th class="px-3 py-1 text-left">Affinity</th>
            </tr>
          </thead>
          <tbody>
            {#each result.jobs as job}
              <tr class="border-t border-gray-800">
                <td class="px-3 py-1 font-mono">{job.name}</td>
                <td class="px-3 py-1 text-right font-mono">{job.runTime}</td>
                <td class="px-3 py-1 text-right font-mono">{job.workingSetSize}</td>
                <td class="px-3 py-1 font-mono text-gray-400">{job.affinity.length > 0 ? job.affinity.join(', ') : 'any'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Queue info -->
    <div class="mb-4 text-sm">
      {#if result.perCpuQueuesMode}
        {#each result.perCpuQueues as queue, cpu}
          <span class="text-gray-400">CPU {cpu} queue:</span>
          <span class="font-mono ml-1">[{queue.join(', ')}]</span>
          {#if cpu < result.perCpuQueues.length - 1}<span class="mx-2 text-gray-600">|</span>{/if}
        {/each}
      {:else}
        <span class="text-gray-400">Central queue:</span>
        <span class="font-mono ml-1">[{result.centralQueue.join(', ')}]</span>
      {/if}
    </div>

    <!-- Execution trace -->
    <div class="mb-4">
      <h2 class="text-lg font-semibold mb-2">Execution Trace</h2>
      <div class="overflow-x-auto">
        <table class="text-xs font-mono border-collapse">
          <thead>
            <tr class="text-gray-500 uppercase">
              <th class="px-2 py-1 text-right">Tick</th>
              {#each Array(result.numCpus) as _, cpu}
                <th class="px-2 py-1 text-center border-l border-gray-800">CPU {cpu}</th>
                {#if showTimeLeft}
                  <th class="px-2 py-1 text-center">Left</th>
                {/if}
                {#if showCache}
                  <th class="px-2 py-1 text-center">Cache [{result.jobNames.join('')}]</th>
                {/if}
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each result.ticks as row, t}
              {#if isQuantumBoundary(t)}
                <tr>
                  <td colspan={1 + result.numCpus * (1 + (showTimeLeft ? 1 : 0) + (showCache ? 1 : 0))}
                    class="py-0">
                    <div class="border-t-2 border-gray-600"></div>
                  </td>
                </tr>
              {/if}
              <tr class="hover:bg-gray-800/50">
                <td class="px-2 py-0.5 text-right text-gray-500">{t}</td>
                {#each row as entry, cpu}
                  <td class="px-2 py-0.5 text-center border-l border-gray-800 {entry.job !== null ? '' : 'text-gray-600'}">
                    {#if showSolution}
                      {#if entry.job !== null}
                        <span class="text-green-400">{entry.job}</span>
                      {:else}
                        <span>-</span>
                      {/if}
                    {:else}
                      <span class="text-gray-600">?</span>
                    {/if}
                  </td>
                  {#if showTimeLeft}
                    <td class="px-2 py-0.5 text-center text-gray-400">
                      {#if showSolution}
                        {#if entry.job !== null}
                          {entry.timeLeft}
                        {:else}
                          &nbsp;
                        {/if}
                      {:else}
                        &nbsp;
                      {/if}
                    </td>
                  {/if}
                  {#if showCache}
                    <td class="px-2 py-0.5 text-center">
                      {#if showSolution}
                        {#each entry.cacheState as cs}
                          <span class="{cs === 'w' ? 'text-yellow-400' : 'text-gray-700'}">{cs === 'w' ? 'w' : '.'}</span>
                        {/each}
                      {:else}
                        {#each entry.cacheState as _}
                          <span class="text-gray-700">?</span>
                        {/each}
                      {/if}
                    </td>
                  {/if}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Stats -->
    {#if showSolution}
      <div class="mb-6">
        <h2 class="text-lg font-semibold mb-2">Statistics</h2>
        <p class="text-sm text-gray-300 mb-2">Finished time: <span class="font-mono text-white">{result.finishedTime}</span></p>
        <div class="overflow-x-auto">
          <table class="text-sm border-collapse">
            <thead>
              <tr class="text-gray-400 text-xs uppercase">
                <th class="px-3 py-1 text-left">CPU</th>
                <th class="px-3 py-1 text-right">Utilization</th>
                <th class="px-3 py-1 text-right">Warm</th>
              </tr>
            </thead>
            <tbody>
              {#each result.stats as stat, cpu}
                <tr class="border-t border-gray-800">
                  <td class="px-3 py-1">CPU {cpu}</td>
                  <td class="px-3 py-1 text-right font-mono">{stat.utilization.toFixed(2)}%</td>
                  <td class="px-3 py-1 text-right font-mono">{stat.warmUtilization.toFixed(2)}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>
