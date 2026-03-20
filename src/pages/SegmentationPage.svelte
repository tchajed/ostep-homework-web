<script lang="ts">
  import {
    runSegmentation,
    DEFAULT_CONFIG,
    type SegmentationConfig,
    type SegmentationResult,
  } from '../lib/simulators/segmentation';

  let seed = $state(DEFAULT_CONFIG.seed);
  let addressSpaceSize = $state(DEFAULT_CONFIG.addressSpaceSize);
  let physicalMemSize = $state(DEFAULT_CONFIG.physicalMemSize);
  let numAddresses = $state(DEFAULT_CONFIG.numAddresses);
  let base0 = $state(DEFAULT_CONFIG.base0);
  let len0 = $state(DEFAULT_CONFIG.len0);
  let base1 = $state(DEFAULT_CONFIG.base1);
  let len1 = $state(DEFAULT_CONFIG.len1);
  let showAnswers = $state(false);

  let result: SegmentationResult = $derived.by(() => {
    const config: SegmentationConfig = {
      seed,
      addressSpaceSize,
      physicalMemSize,
      numAddresses,
      base0,
      len0,
      base1,
      len1,
    };
    return runSegmentation(config);
  });

  function hex(n: number): string {
    return '0x' + n.toString(16).padStart(8, '0');
  }

  // Memory layout diagram helpers
  const DIAGRAM_HEIGHT = 320;

  function pxFromAddr(addr: number): number {
    return (addr / physicalMemSize) * DIAGRAM_HEIGHT;
  }

  // Pre-computed layout values for the diagram
  let s0Top = $derived(pxFromAddr(result.seg0.base));
  let s0Height = $derived(Math.max(pxFromAddr(result.seg0.limit), 2));
  let s1InternalBase = $derived(result.seg1.base - result.seg1.limit);
  let s1Top = $derived(pxFromAddr(s1InternalBase));
  let s1Height = $derived(Math.max(pxFromAddr(result.seg1.limit), 2));
  let vs0Width = $derived((result.seg0.limit / addressSpaceSize) * 100);
  let vs1Width = $derived((result.seg1.limit / addressSpaceSize) * 100);
</script>

<div class="max-w-5xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Segmentation</h1>
  <p class="text-gray-400 text-sm mb-6">
    Two-segment address translation: segment 0 grows positive (code/data), segment 1
    grows negative (stack). The top bit of the virtual address selects the segment.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <label class="flex flex-col gap-1 text-sm text-gray-300">
      Seed
      <input type="number" bind:value={seed} min={0}
        class="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col gap-1 text-sm text-gray-300">
      Addr Space Size
      <input type="number" bind:value={addressSpaceSize} min={4} step={1}
        class="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col gap-1 text-sm text-gray-300">
      Physical Mem Size
      <input type="number" bind:value={physicalMemSize} min={4} step={1}
        class="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col gap-1 text-sm text-gray-300">
      Num Addresses
      <input type="number" bind:value={numAddresses} min={1} max={50}
        class="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
  </div>

  <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
    <label class="flex flex-col gap-1 text-sm text-gray-300">
      Seg0 Base (-1 = random)
      <input type="number" bind:value={base0} min={-1}
        class="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col gap-1 text-sm text-gray-300">
      Seg0 Limit (-1 = random)
      <input type="number" bind:value={len0} min={-1}
        class="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col gap-1 text-sm text-gray-300">
      Seg1 Base (-1 = random)
      <input type="number" bind:value={base1} min={-1}
        class="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col gap-1 text-sm text-gray-300">
      Seg1 Limit (-1 = random)
      <input type="number" bind:value={len1} min={-1}
        class="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
  </div>

  <button
    class="mb-6 px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer"
    onclick={() => showAnswers = !showAnswers}
  >
    {showAnswers ? 'Hide Answers' : 'Show Answers'}
  </button>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- Left column: segment info + translations -->
    <div>
      <!-- Segment register info -->
      <h2 class="text-lg font-semibold mb-2">Segment Registers</h2>
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6 text-sm font-mono">
        <div class="mb-3">
          <div class="text-gray-400">Segment 0 (grows positive)</div>
          <div>Base: <span class="text-green-400">{hex(result.seg0.base)}</span> (decimal {result.seg0.base})</div>
          <div>Limit: <span class="text-green-400">{result.seg0.limit}</span></div>
        </div>
        <div>
          <div class="text-gray-400">Segment 1 (grows negative)</div>
          <div>Base: <span class="text-purple-400">{hex(result.seg1.base)}</span> (decimal {result.seg1.base})</div>
          <div>Limit: <span class="text-purple-400">{result.seg1.limit}</span></div>
        </div>
      </div>

      <!-- Translation table -->
      <h2 class="text-lg font-semibold mb-2">Virtual Address Trace</h2>
      <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-gray-400 text-left">
              <th class="px-3 py-2">#</th>
              <th class="px-3 py-2">Virtual Addr</th>
              <th class="px-3 py-2">Seg</th>
              <th class="px-3 py-2">Result</th>
            </tr>
          </thead>
          <tbody class="font-mono">
            {#each result.translations as t}
              <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td class="px-3 py-1.5 text-gray-500">{t.index}</td>
                <td class="px-3 py-1.5">{hex(t.virtualAddr)} <span class="text-gray-500">({t.virtualAddr})</span></td>
                <td class="px-3 py-1.5">
                  <span class={t.segment === 0 ? 'text-green-400' : 'text-purple-400'}>
                    SEG{t.segment}
                  </span>
                </td>
                <td class="px-3 py-1.5">
                  {#if showAnswers}
                    {#if t.valid}
                      <span class="text-emerald-400">VALID: {hex(t.physicalAddr!)} ({t.physicalAddr})</span>
                    {:else}
                      <span class="text-red-400">SEGMENTATION VIOLATION</span>
                    {/if}
                  {:else}
                    <span class="text-gray-500 italic">PA or violation?</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Right column: memory layout diagram -->
    <div>
      <h2 class="text-lg font-semibold mb-2">Physical Memory Layout</h2>
      <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div class="relative" style="height: {DIAGRAM_HEIGHT}px;">
          <!-- Physical memory background -->
          <div class="absolute inset-0 border border-gray-700 rounded bg-gray-800/30">
            <!-- Address labels -->
            <div class="absolute -left-1 -top-5 text-xs text-gray-500 font-mono">0</div>
            <div class="absolute -left-1 -bottom-5 text-xs text-gray-500 font-mono">{physicalMemSize}</div>
          </div>

          <!-- Segment 0 -->
          <div
            class="absolute left-0 right-0 bg-green-600/30 border border-green-500/50 rounded-sm"
            style="top: {s0Top}px; height: {s0Height}px;"
          >
            <span class="absolute left-2 top-0.5 text-xs text-green-300 whitespace-nowrap">
              Seg0 [{result.seg0.base}..{result.seg0.base + result.seg0.limit})
            </span>
          </div>

          <!-- Segment 1 -->
          <div
            class="absolute left-0 right-0 bg-purple-600/30 border border-purple-500/50 rounded-sm"
            style="top: {s1Top}px; height: {s1Height}px;"
          >
            <span class="absolute left-2 top-0.5 text-xs text-purple-300 whitespace-nowrap">
              Seg1 [{s1InternalBase}..{result.seg1.base})
            </span>
          </div>

          <!-- Show valid translation targets -->
          {#if showAnswers}
            {#each result.translations as t}
              {#if t.valid && t.physicalAddr !== null}
                <div
                  class="absolute w-2 h-2 rounded-full {t.segment === 0 ? 'bg-green-400' : 'bg-purple-400'}"
                  style="top: {pxFromAddr(t.physicalAddr) - 4}px; right: 8px;"
                  title="VA {t.virtualAddr} -> PA {t.physicalAddr}"
                ></div>
              {/if}
            {/each}
          {/if}
        </div>

        <!-- Virtual address space diagram -->
        <h3 class="text-sm font-semibold mt-8 mb-2 text-gray-400">Virtual Address Space</h3>
        <div class="relative" style="height: 80px;">
          <div class="absolute inset-0 border border-gray-700 rounded bg-gray-800/30">
            <div class="absolute -left-1 -top-5 text-xs text-gray-500 font-mono">0</div>
            <div class="absolute -left-1 -bottom-5 text-xs text-gray-500 font-mono">{addressSpaceSize}</div>
          </div>
          <!-- Seg0 valid region (low) -->
          <div
            class="absolute left-0 top-0 bottom-0 bg-green-600/30 border-r border-green-500/50"
            style="width: {vs0Width}%;"
          >
            <span class="absolute left-1 top-1 text-xs text-green-300">Seg0</span>
          </div>
          <!-- Seg1 valid region (high) -->
          <div
            class="absolute right-0 top-0 bottom-0 bg-purple-600/30 border-l border-purple-500/50"
            style="width: {vs1Width}%;"
          >
            <span class="absolute right-1 top-1 text-xs text-purple-300">Seg1</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
