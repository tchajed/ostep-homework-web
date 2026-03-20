<script lang="ts">
  import {
    simulate,
    toHex,
    toBin,
    defaultParams,
    type ChecksumParams,
    type ChecksumResult,
  } from '../lib/simulators/checksum';

  let seed = $state(defaultParams.seed);
  let dataSize = $state(defaultParams.dataSize);
  let dataInput = $state(defaultParams.data);
  let showSolution = $state(false);
  let revealedSteps = $state(0);
  let error = $state('');

  let params: ChecksumParams = $derived({
    seed,
    dataSize,
    data: dataInput,
  });

  let result: ChecksumResult | null = $derived.by(() => {
    try {
      error = '';
      return simulate(params);
    } catch (e: any) {
      error = e.message;
      return null;
    }
  });

  function revealAll() {
    showSolution = true;
    if (result) revealedSteps = result.steps.length;
  }

  function revealNext() {
    if (result && revealedSteps < result.steps.length) {
      revealedSteps++;
    }
    if (result && revealedSteps === result.steps.length) {
      showSolution = true;
    }
  }

  function reset() {
    showSolution = false;
    revealedSteps = 0;
  }
</script>

<div class="max-w-4xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Data Integrity: Checksums</h1>
  <p class="text-gray-400 text-sm mb-6">
    Explore how additive, XOR, and Fletcher checksums are computed byte-by-byte.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Seed</span>
      <input
        type="number"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm
               focus:outline-none focus:border-blue-500"
        bind:value={seed}
        onchange={reset}
        min="0"
      />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Data size (bytes)</span>
      <input
        type="number"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm
               focus:outline-none focus:border-blue-500"
        bind:value={dataSize}
        onchange={reset}
        min="1"
        max="64"
      />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Data (comma-separated, or blank for random)</span>
      <input
        type="text"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm
               focus:outline-none focus:border-blue-500"
        bind:value={dataInput}
        onchange={reset}
        placeholder="e.g. 1,2,3,4"
      />
    </label>
  </div>

  {#if error}
    <div class="mb-4 rounded bg-red-900/40 border border-red-700 p-3 text-sm text-red-300">
      {error}
    </div>
  {/if}

  {#if result}
    <!-- Data display -->
    <div class="mb-6 overflow-x-auto">
      <table class="text-sm font-mono">
        <thead>
          <tr class="text-gray-500 text-xs uppercase">
            <th class="pr-4 text-left">Format</th>
            {#each result.values as _, i}
              <th class="px-2 text-right">Byte {i}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="pr-4 text-gray-400">Decimal</td>
            {#each result.values as v}
              <td class="px-2 text-right">{v}</td>
            {/each}
          </tr>
          <tr>
            <td class="pr-4 text-gray-400">Hex</td>
            {#each result.values as v}
              <td class="px-2 text-right">{toHex(v)}</td>
            {/each}
          </tr>
          <tr>
            <td class="pr-4 text-gray-400">Binary</td>
            {#each result.values as v}
              <td class="px-2 text-right">{toBin(v)}</td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Step-by-step trace -->
    {#if revealedSteps > 0}
      <h2 class="text-lg font-semibold mb-2">Step-by-step computation</h2>
      <div class="mb-6 overflow-x-auto">
        <table class="text-sm font-mono w-full">
          <thead>
            <tr class="text-gray-500 text-xs uppercase border-b border-gray-800">
              <th class="px-2 py-1 text-left">Step</th>
              <th class="px-2 py-1 text-right">Byte</th>
              <th class="px-2 py-1 text-right">Add</th>
              <th class="px-2 py-1 text-right">XOR</th>
              <th class="px-2 py-1 text-right">Fletcher a</th>
              <th class="px-2 py-1 text-right">Fletcher b</th>
            </tr>
          </thead>
          <tbody>
            {#each result.steps.slice(0, revealedSteps) as step}
              <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td class="px-2 py-1 text-gray-400">{step.index}</td>
                <td class="px-2 py-1 text-right">{step.value} <span class="text-gray-500">({toHex(step.value)})</span></td>
                <td class="px-2 py-1 text-right">{step.addRunning}</td>
                <td class="px-2 py-1 text-right">{step.xorRunning}</td>
                <td class="px-2 py-1 text-right">{step.fletcherA}</td>
                <td class="px-2 py-1 text-right">{step.fletcherB}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <!-- Buttons -->
    <div class="flex gap-3 mb-6">
      {#if !showSolution}
        <button
          class="rounded bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium transition-colors cursor-pointer"
          onclick={revealNext}
        >
          {revealedSteps === 0 ? 'Show step-by-step' : 'Next step'}
        </button>
        <button
          class="rounded bg-gray-700 hover:bg-gray-600 px-4 py-2 text-sm font-medium transition-colors cursor-pointer"
          onclick={revealAll}
        >
          Show solution
        </button>
      {:else}
        <button
          class="rounded bg-gray-700 hover:bg-gray-600 px-4 py-2 text-sm font-medium transition-colors cursor-pointer"
          onclick={reset}
        >
          Hide solution
        </button>
      {/if}
    </div>

    <!-- Final checksums -->
    {#if showSolution}
      <h2 class="text-lg font-semibold mb-2">Checksums</h2>
      <div class="rounded-lg bg-gray-900 border border-gray-800 p-4 font-mono text-sm space-y-2">
        <div class="flex gap-6">
          <span class="text-gray-400 w-28">Add:</span>
          <span>{result.add}</span>
          <span class="text-gray-500">{toBin(result.add)}</span>
        </div>
        <div class="flex gap-6">
          <span class="text-gray-400 w-28">XOR:</span>
          <span>{result.xor}</span>
          <span class="text-gray-500">{toBin(result.xor)}</span>
        </div>
        <div class="flex gap-6">
          <span class="text-gray-400 w-28">Fletcher (a, b):</span>
          <span>{result.fletcherA}, {result.fletcherB}</span>
          <span class="text-gray-500">{toBin(result.fletcherA)}, {toBin(result.fletcherB)}</span>
        </div>
      </div>
    {:else}
      <h2 class="text-lg font-semibold mb-2">Checksums</h2>
      <div class="rounded-lg bg-gray-900 border border-gray-800 p-4 font-mono text-sm space-y-2 text-gray-500">
        <div>Add:      ?</div>
        <div>XOR:      ?</div>
        <div>Fletcher: ?</div>
      </div>
    {/if}
  {/if}
</div>
