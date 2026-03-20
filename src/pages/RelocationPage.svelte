<script lang="ts">
  import { simulate, toHex, type RelocationResult } from '../lib/simulators/relocation';

  let seed = $state(1);
  let asize = $state(1024);
  let psize = $state(16384);
  let numAddresses = $state(5);
  let baseInput = $state(-1);
  let limitInput = $state(-1);
  let showAnswers = $state(false);

  let result: RelocationResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    try {
      error = null;
      result = simulate({
        seed,
        asize,
        psize,
        numAddresses,
        base: baseInput >= 0 ? baseInput : undefined,
        limit: limitInput >= 0 ? limitInput : undefined,
      });
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  // Run on mount
  run();

  // Derived layout values for the memory diagram
  let diagramHeight = $derived(200);
  let baseRatio = $derived(result ? result.base / result.psize : 0);
  let limitRatio = $derived(result ? result.limit / result.psize : 0);
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">Base & Bounds (Relocation)</h1>
  <p class="text-gray-400 text-sm">
    Simulate address translation with a base-and-bounds (dynamic relocation) scheme.
    Virtual addresses below the limit are translated by adding the base register;
    addresses at or above the limit cause a segmentation violation.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
    <label class="flex flex-col text-sm text-gray-400">
      Seed
      <input type="number" bind:value={seed} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Addr Space
      <input type="number" bind:value={asize} min="1" step="1"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Phys Mem
      <input type="number" bind:value={psize} min="2" step="1"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      # Addresses
      <input type="number" bind:value={numAddresses} min="1" max="100"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Base (-1=auto)
      <input type="number" bind:value={baseInput} min="-1"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Limit (-1=auto)
      <input type="number" bind:value={limitInput} min="-1"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
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
    <!-- Register info -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-1 text-sm font-mono">
      <h2 class="text-base font-semibold text-gray-200 mb-2 font-sans">Base-and-Bounds Registers</h2>
      <p><span class="text-gray-500">Base  :</span> {toHex(result.base)} <span class="text-gray-500">(decimal {result.base})</span></p>
      <p><span class="text-gray-500">Limit :</span> {result.limit}</p>
      <p><span class="text-gray-500">Addr Space Size :</span> {result.asize}</p>
      <p><span class="text-gray-500">Phys Mem Size   :</span> {result.psize}</p>
    </div>

    <!-- Physical memory diagram -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4">
      <h2 class="text-base font-semibold text-gray-200 mb-3">Physical Memory Layout</h2>
      <div class="relative w-full rounded overflow-hidden" style="height: {diagramHeight}px; background: #1e293b;">
        <!-- Allocated segment -->
        <div
          class="absolute left-0 bg-blue-700/40 border-l-4 border-blue-500"
          style="top: {baseRatio * 100}%; height: {limitRatio * 100}%; width: 100%;"
        >
          <span class="absolute top-0 left-2 text-xs text-blue-300">
            base = {result.base}
          </span>
          {#if limitRatio * diagramHeight > 24}
            <span class="absolute bottom-0 left-2 text-xs text-blue-300">
              base + limit = {result.base + result.limit}
            </span>
          {/if}
        </div>
        <!-- Labels at edges -->
        <span class="absolute top-0 right-2 text-xs text-gray-500">0</span>
        <span class="absolute bottom-0 right-2 text-xs text-gray-500">{result.psize}</span>
      </div>
    </div>

    <!-- Address trace -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4">
      <h2 class="text-base font-semibold text-gray-200 mb-3">Virtual Address Trace</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm font-mono">
          <thead>
            <tr class="text-gray-500 text-left border-b border-gray-800">
              <th class="py-1 pr-4">#</th>
              <th class="py-1 pr-4">Virtual Address</th>
              <th class="py-1">Result</th>
            </tr>
          </thead>
          <tbody>
            {#each result.addresses as addr}
              <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td class="py-1.5 pr-4 text-gray-500">VA {addr.index}</td>
                <td class="py-1.5 pr-4">
                  {toHex(addr.virtualAddr)}
                  <span class="text-gray-500">(decimal: {addr.virtualAddr.toString().padStart(4, '\u00A0')})</span>
                </td>
                <td class="py-1.5">
                  {#if showAnswers}
                    {#if addr.valid}
                      <span class="text-green-400">
                        VALID: {toHex(addr.physicalAddr!)}
                        <span class="text-gray-500">(decimal: {addr.physicalAddr})</span>
                      </span>
                    {:else}
                      <span class="text-red-400">SEGMENTATION VIOLATION</span>
                    {/if}
                  {:else}
                    <span class="text-yellow-400/70">PA or segmentation violation?</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>
