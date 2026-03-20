<script lang="ts">
  import {
    simulate,
    defaultParams,
    type SimulationResult,
    type SimulationParams,
    type Policy,
    type ListOrder,
    type FreeEntry,
  } from '../lib/simulators/malloc';

  let seed = $state(defaultParams.seed);
  let heapSize = $state(defaultParams.heapSize);
  let baseAddr = $state(defaultParams.baseAddr);
  let headerSize = $state(defaultParams.headerSize);
  let alignment = $state(defaultParams.alignment);
  let policy: Policy = $state(defaultParams.policy);
  let listOrder: ListOrder = $state(defaultParams.listOrder);
  let coalesce = $state(defaultParams.coalesce);
  let numOps = $state(defaultParams.numOps);
  let opsRange = $state(defaultParams.opsRange);
  let percentAlloc = $state(defaultParams.percentAlloc);
  let opsList = $state(defaultParams.opsList);
  let showAnswers = $state(false);

  let result: SimulationResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    try {
      error = null;
      result = simulate({
        seed,
        heapSize,
        baseAddr,
        headerSize,
        alignment,
        policy,
        listOrder,
        coalesce,
        numOps,
        opsRange,
        percentAlloc,
        opsList,
      });
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  run();

  function formatOp(step: SimulationResult['steps'][number]): string {
    if (step.op.type === 'alloc') {
      return `ptr[${step.op.ptrIndex}] = Alloc(${step.op.size})`;
    } else {
      return `Free(ptr[${step.op.ptrIndex}])`;
    }
  }

  function formatResult(step: SimulationResult['steps'][number]): string {
    if (step.op.type === 'alloc') {
      return `returned ${step.result} (searched ${step.searched} elements)`;
    } else {
      return `returned ${step.result}`;
    }
  }

  function formatFreelist(fl: FreeEntry[]): string {
    const entries = fl.map(e => `[ addr:${e.addr} sz:${e.size} ]`).join('');
    return `Free List [ Size ${fl.length} ]: ${entries}`;
  }

  /** Compute memory block segments for visual display. Returns allocated + free blocks sorted by address. */
  function computeBlocks(fl: FreeEntry[]): Array<{ addr: number; size: number; free: boolean }> {
    if (!result) return [];
    const base = result.params.baseAddr;
    const total = result.params.heapSize;
    const end = base + total;

    // Sort free entries by address
    const sorted = [...fl].sort((a, b) => a.addr - b.addr);
    const blocks: Array<{ addr: number; size: number; free: boolean }> = [];

    let cursor = base;
    for (const entry of sorted) {
      if (entry.addr > cursor) {
        blocks.push({ addr: cursor, size: entry.addr - cursor, free: false });
      }
      blocks.push({ addr: entry.addr, size: entry.size, free: true });
      cursor = entry.addr + entry.size;
    }
    if (cursor < end) {
      blocks.push({ addr: cursor, size: end - cursor, free: false });
    }
    return blocks;
  }
</script>

<div class="max-w-5xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">Free-Space Management</h1>
  <p class="text-gray-400 text-sm">
    Simulate a simple memory allocator with configurable search policies (first fit, best fit, worst fit),
    free list ordering, and optional coalescing. Watch how fragmentation develops over time.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    <label class="flex flex-col text-sm text-gray-400">
      Seed
      <input type="number" bind:value={seed} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Heap Size
      <input type="number" bind:value={heapSize} min="1"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Base Addr
      <input type="number" bind:value={baseAddr} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Header Size
      <input type="number" bind:value={headerSize} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Alignment (-1=none)
      <input type="number" bind:value={alignment} min="-1"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Policy
      <select bind:value={policy}
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full">
        <option value="BEST">BEST</option>
        <option value="FIRST">FIRST</option>
        <option value="WORST">WORST</option>
      </select>
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      List Order
      <select bind:value={listOrder}
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full">
        <option value="ADDRSORT">ADDRSORT</option>
        <option value="SIZESORT+">SIZESORT+</option>
        <option value="SIZESORT-">SIZESORT-</option>
        <option value="INSERT-FRONT">INSERT-FRONT</option>
        <option value="INSERT-BACK">INSERT-BACK</option>
      </select>
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      # Ops
      <input type="number" bind:value={numOps} min="1" max="100"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Max Alloc Size
      <input type="number" bind:value={opsRange} min="1"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      % Alloc
      <input type="number" bind:value={percentAlloc} min="1" max="100"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400 col-span-2">
      Ops List (e.g. +10,+20,-0,+5)
      <input type="text" bind:value={opsList} placeholder="leave empty for random"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
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
      <input type="checkbox" bind:checked={coalesce}
        class="rounded bg-gray-800 border-gray-600" />
      Coalesce
    </label>
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
    <!-- Initial state -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-2">
      <h2 class="text-base font-semibold text-gray-200">Initial State</h2>
      <p class="text-sm font-mono text-gray-300">{formatFreelist(result.initialFreelist)}</p>
      <div class="flex h-6 rounded overflow-hidden border border-gray-700">
        {#each computeBlocks(result.initialFreelist) as block}
          <div
            class="flex items-center justify-center text-xs truncate {block.free ? 'bg-green-800/60 text-green-300' : 'bg-red-800/40 text-red-300'}"
            style="width: {(block.size / heapSize) * 100}%"
            title="{block.free ? 'Free' : 'Allocated'}: addr={block.addr} size={block.size}"
          >
            {#if block.size / heapSize > 0.08}{block.size}{/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Operations -->
    <div class="space-y-3">
      {#each result.steps as step, i}
        <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-2">
          <div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span class="text-xs text-gray-500 font-mono">Op {i + 1}</span>
            <span class="text-sm font-mono font-medium {step.op.type === 'alloc' ? 'text-blue-300' : 'text-orange-300'}">
              {formatOp(step)}
            </span>
            {#if showAnswers}
              <span class="text-sm font-mono text-gray-400">
                {formatResult(step)}
              </span>
              {#if step.op.type === 'alloc' && step.result === -1}
                <span class="text-xs text-red-400 font-semibold">FAILED</span>
              {/if}
            {:else}
              <span class="text-sm text-yellow-400/70">returned ?</span>
            {/if}
          </div>

          {#if showAnswers}
            <p class="text-xs font-mono text-gray-500">{formatFreelist(step.freelistAfter)}</p>
            <!-- Visual memory bar -->
            <div class="flex h-5 rounded overflow-hidden border border-gray-700">
              {#each computeBlocks(step.freelistAfter) as block}
                <div
                  class="flex items-center justify-center text-xs truncate {block.free ? 'bg-green-800/60 text-green-300' : 'bg-red-800/40 text-red-300'}"
                  style="width: {(block.size / heapSize) * 100}%"
                  title="{block.free ? 'Free' : 'Allocated'}: addr={block.addr} size={block.size}"
                >
                  {#if block.size / heapSize > 0.08}{block.size}{/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-xs text-yellow-400/70">List?</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
