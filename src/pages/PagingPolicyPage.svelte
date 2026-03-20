<script lang="ts">
  import {
    simulate,
    defaultParams,
    type Policy,
    type PagingPolicyParams,
    type AccessResult,
  } from '../lib/simulators/paging-policy';

  const policies: Policy[] = ['FIFO', 'LRU', 'OPT', 'CLOCK', 'RAND'];

  let policy = $state<Policy>(defaultParams().policy);
  let cacheSize = $state(defaultParams().cacheSize);
  let seed = $state(defaultParams().seed);
  let numAddrs = $state(defaultParams().numAddrs);
  let maxPage = $state(defaultParams().maxPage);
  let clockBits = $state(defaultParams().clockBits);
  let addressInput = $state('');
  let showSolution = $state(false);

  let currentStep = $state(0);
  let stepping = $state(false);

  let params = $derived<PagingPolicyParams>({
    policy,
    cacheSize,
    seed,
    numAddrs,
    maxPage,
    clockBits,
    addresses: addressInput.trim()
      ? addressInput.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
      : null,
  });

  let result = $derived(simulate(params));

  function resetStepping() {
    currentStep = 0;
    stepping = false;
  }

  function startStepping() {
    stepping = true;
    currentStep = 0;
    showSolution = false;
  }

  function nextStep() {
    if (currentStep < result.accesses.length) {
      currentStep++;
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
    }
  }

  // Reset stepping when params change
  $effect(() => {
    void params;
    resetStepping();
  });

  function policyLabel(p: Policy): { left: string; right: string } {
    switch (p) {
      case 'FIFO': return { left: 'FirstIn', right: 'LastIn' };
      case 'LRU': return { left: 'LRU', right: 'MRU' };
      default: return { left: 'Left', right: 'Right' };
    }
  }
</script>

<div class="max-w-5xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Page Replacement Policy Simulator</h1>
  <p class="text-gray-400 mb-6 text-sm">
    Simulates page replacement policies (FIFO, LRU, OPT, CLOCK, RAND) for a page cache of configurable size.
  </p>

  <!-- Parameters -->
  <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
    <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Parameters</h2>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <label class="block">
        <span class="text-xs text-gray-400">Policy</span>
        <select bind:value={policy}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none">
          {#each policies as p}
            <option value={p}>{p}</option>
          {/each}
        </select>
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Cache Size</span>
        <input type="number" bind:value={cacheSize} min={1} max={20}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Seed</span>
        <input type="number" bind:value={seed} min={0}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Num Addresses</span>
        <input type="number" bind:value={numAddrs} min={1} max={50}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Max Page</span>
        <input type="number" bind:value={maxPage} min={1} max={100}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      {#if policy === 'CLOCK'}
        <label class="block">
          <span class="text-xs text-gray-400">Clock Bits</span>
          <input type="number" bind:value={clockBits} min={1} max={8}
            class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
        </label>
      {/if}
    </div>
    <label class="block mt-3">
      <span class="text-xs text-gray-400">Address List (comma-separated, leave empty for random)</span>
      <input type="text" bind:value={addressInput} placeholder="e.g. 1,2,3,4,1,2,5,1,2,3"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
    </label>
  </div>

  <!-- Controls -->
  <div class="flex gap-3 mb-6 flex-wrap">
    <button
      onclick={() => { showSolution = true; stepping = false; }}
      class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors cursor-pointer"
    >
      Show Solution
    </button>
    <button
      onclick={startStepping}
      class="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium text-gray-200 transition-colors cursor-pointer"
    >
      Step Through
    </button>
    {#if stepping}
      <button onclick={prevStep} disabled={currentStep === 0}
        class="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
        Prev
      </button>
      <button onclick={nextStep} disabled={currentStep >= result.accesses.length}
        class="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
        Next
      </button>
      <span class="text-sm text-gray-400 self-center">
        Step {currentStep} / {result.accesses.length}
      </span>
    {/if}
    {#if showSolution || stepping}
      <button
        onclick={() => { showSolution = false; stepping = false; currentStep = 0; }}
        class="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-400 transition-colors cursor-pointer"
      >
        Hide
      </button>
    {/if}
  </div>

  <!-- Question mode (no solution) -->
  {#if !showSolution && !stepping}
    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
      <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
        Page Accesses
      </h2>
      <p class="text-xs text-gray-500 mb-3">
        Assuming a replacement policy of {policy}, and a cache of size {cacheSize} pages,
        figure out whether each of the following page references hit or miss in the page cache.
      </p>
      <div class="font-mono text-sm text-gray-300 space-y-0.5 max-h-64 overflow-y-auto">
        {#each result.addressList as addr}
          <div>Access: {addr} &nbsp; Hit/Miss? &nbsp; State of Memory?</div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Solution / Step-through -->
  {#if showSolution || stepping}
    {@const labels = policyLabel(policy)}
    {@const visibleAccesses = showSolution ? result.accesses : result.accesses.slice(0, currentStep)}

    <!-- Trace table -->
    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6 overflow-x-auto">
      <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Trace</h2>
      <table class="w-full text-sm font-mono">
        <thead>
          <tr class="text-gray-500 text-xs">
            <th class="text-left px-2 py-1">#</th>
            <th class="text-left px-2 py-1">Access</th>
            <th class="text-left px-2 py-1">Result</th>
            <th class="text-left px-2 py-1">{labels.left}</th>
            <th class="text-center px-2 py-1">Cache</th>
            <th class="text-right px-2 py-1">{labels.right}</th>
            <th class="text-left px-2 py-1">Evicted</th>
            <th class="text-right px-2 py-1">Hits</th>
            <th class="text-right px-2 py-1">Misses</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleAccesses as access, i}
            <tr class="border-t border-gray-800 {access.hit ? '' : 'bg-red-400/5'}">
              <td class="px-2 py-1 text-gray-500">{i + 1}</td>
              <td class="px-2 py-1 text-gray-100 font-bold">{access.page}</td>
              <td class="px-2 py-1 {access.hit ? 'text-green-400' : 'text-red-400'} font-bold">
                {access.hit ? 'HIT' : 'MISS'}
              </td>
              <td class="px-2 py-1 text-gray-600">-&gt;</td>
              <td class="px-2 py-1 text-center">
                <span class="inline-flex gap-1">
                  {#each access.memory as page}
                    <span class="inline-block w-7 text-center rounded px-1 py-0.5
                      {page === access.page
                        ? (access.hit ? 'bg-green-400/20 text-green-300' : 'bg-blue-400/20 text-blue-300')
                        : 'bg-gray-800 text-gray-300'}">
                      {page}
                    </span>
                  {/each}
                  {#each Array(cacheSize - access.memory.length) as _}
                    <span class="inline-block w-7 text-center rounded px-1 py-0.5 bg-gray-800/50 text-gray-600">-</span>
                  {/each}
                </span>
              </td>
              <td class="px-2 py-1 text-gray-600 text-right">&lt;-</td>
              <td class="px-2 py-1 {access.victim === -1 ? 'text-gray-600' : 'text-yellow-400'}">
                {access.victim === -1 ? '-' : access.victim}
              </td>
              <td class="px-2 py-1 text-right text-gray-400">{access.hits}</td>
              <td class="px-2 py-1 text-right text-gray-400">{access.misses}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Summary -->
    {#if showSolution || currentStep === result.accesses.length}
      <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
        <h2 class="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Summary</h2>
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <div class="text-2xl font-bold text-green-400">{result.hits}</div>
            <div class="text-xs text-gray-500 uppercase">Hits</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-red-400">{result.misses}</div>
            <div class="text-xs text-gray-500 uppercase">Misses</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-blue-400">{result.hitRate.toFixed(2)}%</div>
            <div class="text-xs text-gray-500 uppercase">Hit Rate</div>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
