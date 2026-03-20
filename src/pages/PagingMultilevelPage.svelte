<script lang="ts">
  import { simulate, toHex, type PagingMultilevelResult, type TranslationStep } from '../lib/simulators/paging-multilevel';

  let seed = $state(0);
  let allocated = $state(64);
  let numAddresses = $state(10);
  let showAnswers = $state(false);

  let result: PagingMultilevelResult = $derived(simulate({ seed, allocated, numAddresses }));

  /** Format a page of memory as hex string */
  function pageHex(memory: number[], pageNum: number, pageSize: number): string {
    const start = pageNum * pageSize;
    return memory.slice(start, start + pageSize).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function faultMessage(step: TranslationStep): string {
    if (step.fault === 'pde') return 'Fault (page directory entry not valid)';
    if (step.fault === 'pte') return 'Fault (page table entry not valid)';
    return '';
  }
</script>

<div class="max-w-5xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Paging: Multi-Level Translate</h1>
  <p class="text-gray-400 text-sm mb-6">
    Two-level page table address translation. 32KB virtual address space, 4KB physical memory, 32-byte pages.
    Virtual address: [PDE 5 bits][PTE 5 bits][Offset 5 bits].
  </p>

  <!-- Controls -->
  <div class="flex flex-wrap gap-4 mb-6 items-end">
    <label class="flex flex-col text-sm text-gray-300">
      Seed
      <input type="number" bind:value={seed} min={0}
        class="mt-1 w-24 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 focus:border-blue-500 focus:outline-none" />
    </label>
    <label class="flex flex-col text-sm text-gray-300">
      Allocated Pages
      <input type="number" bind:value={allocated} min={1} max={120}
        class="mt-1 w-24 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 focus:border-blue-500 focus:outline-none" />
    </label>
    <label class="flex flex-col text-sm text-gray-300">
      Num Addresses
      <input type="number" bind:value={numAddresses} min={1} max={50}
        class="mt-1 w-24 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 focus:border-blue-500 focus:outline-none" />
    </label>
    <button
      class="px-4 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer
        {showAnswers ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}"
      onclick={() => showAnswers = !showAnswers}
    >
      {showAnswers ? 'Hide Answers' : 'Show Answers'}
    </button>
  </div>

  <!-- PDBR -->
  <div class="mb-4 text-sm">
    <span class="text-gray-400">PDBR:</span>
    <span class="font-mono text-yellow-400">{result.pdbr}</span>
    <span class="text-gray-500">(decimal) — page directory is in page {result.pdbr}</span>
  </div>

  <!-- Memory dump -->
  <details class="mb-6">
    <summary class="cursor-pointer text-sm text-gray-400 hover:text-gray-200 select-none">
      Physical Memory Dump ({result.physPages} pages of {result.pageSize} bytes)
    </summary>
    <div class="mt-2 max-h-96 overflow-y-auto rounded bg-gray-900 border border-gray-800 p-3 font-mono text-xs leading-relaxed">
      {#each Array(result.physPages) as _, i}
        <div class="flex">
          <span class="text-gray-500 w-20 flex-shrink-0">page {String(i).padStart(3, ' ')}:</span>
          <span class="text-gray-300 break-all">{pageHex(result.memory, i, result.pageSize)}</span>
        </div>
      {/each}
    </div>
  </details>

  <!-- Translations -->
  <h2 class="text-lg font-semibold mb-3">Virtual Address Translations</h2>
  <div class="space-y-4">
    {#each result.translations as step, idx}
      <div class="rounded-lg bg-gray-900 border border-gray-800 p-4">
        <div class="font-mono text-sm mb-2">
          <span class="text-gray-400">VA {idx}:</span>
          <span class="text-blue-400 font-bold">{toHex(step.virtualAddr, 4)}</span>
          {#if !showAnswers}
            <span class="text-gray-500 ml-2">-- What is the physical address or fault?</span>
          {/if}
        </div>

        {#if showAnswers}
          <!-- PDE lookup -->
          <div class="ml-4 text-sm font-mono space-y-1">
            <div class="text-gray-300">
              <span class="text-gray-500">PDE index:</span>
              {toHex(step.pdeIndex)}
              <span class="text-gray-600">[decimal {step.pdeIndex}]</span>
              <span class="text-gray-500 ml-2">contents:</span>
              {toHex(step.pdeContents)}
              <span class="text-gray-600">(valid {step.pdeValid ? 1 : 0}, pfn {toHex(step.pdePfn)} [decimal {step.pdePfn}])</span>
            </div>

            {#if step.pdeValid && step.pteIndex !== undefined}
              <!-- PTE lookup -->
              <div class="ml-4 text-gray-300">
                <span class="text-gray-500">PTE index:</span>
                {toHex(step.pteIndex)}
                <span class="text-gray-600">[decimal {step.pteIndex}]</span>
                <span class="text-gray-500 ml-2">contents:</span>
                {toHex(step.pteContents!)}
                <span class="text-gray-600">(valid {step.pteValid ? 1 : 0}, pfn {toHex(step.ptePfn!)} [decimal {step.ptePfn}])</span>
              </div>
            {/if}

            <!-- Result -->
            <div class="ml-4 mt-1">
              {#if step.fault === 'none'}
                <span class="text-green-400">
                  Translates to Physical Address {toHex(step.physicalAddr!, 3)}
                  &rarr; Value: {toHex(step.value!)}
                </span>
              {:else}
                <span class="text-red-400">{faultMessage(step)}</span>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
