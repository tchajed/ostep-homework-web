<script lang="ts">
  import {
    simulate,
    defaultParams,
    EXAMPLE_PROGRAMS,
    type X86Params,
    type SimulationResult,
  } from '../lib/simulators/x86-intro';

  let seed = $state(defaultParams.seed);
  let program = $state(defaultParams.program);
  let numThreads = $state(defaultParams.numThreads);
  let intFreq = $state(defaultParams.intFreq);
  let intRand = $state(defaultParams.intRand);
  let argv = $state(defaultParams.argv);
  let memTrace = $state(defaultParams.memTrace);
  let regTrace = $state(defaultParams.regTrace);
  let ccTrace = $state(defaultParams.ccTrace);

  let showSolution = $state(false);
  let currentStep = $state(0);
  let stepping = $state(false);
  let errorMsg = $state('');

  let params = $derived<X86Params>({
    seed, program, numThreads, intFreq, intRand, argv,
    loadAddr: 1000, memSize: 128, memTrace, regTrace, ccTrace,
  });

  let result: SimulationResult | null = $derived.by(() => {
    try {
      const r = simulate(params);
      errorMsg = '';
      return r;
    } catch (e: any) {
      errorMsg = e.message || String(e);
      return null;
    }
  });

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
    if (result && currentStep < result.trace.length) {
      currentStep++;
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
    }
  }

  $effect(() => {
    void params;
    resetStepping();
  });

  function loadExample(source: string) {
    program = source;
  }

  const threadColors = [
    'text-blue-400',
    'text-green-400',
    'text-yellow-400',
    'text-pink-400',
    'text-purple-400',
    'text-cyan-400',
    'text-orange-400',
    'text-red-400',
  ];

  function threadColor(tid: number): string {
    if (tid < 0) return 'text-gray-500';
    return threadColors[tid % threadColors.length];
  }

  function formatRegVal(val: number | undefined, show: boolean): string {
    if (!show) return '?';
    return String(val ?? 0);
  }

  function formatMemVal(val: number | undefined, show: boolean): string {
    if (!show) return '?';
    return String(val ?? 0);
  }
</script>

<div class="max-w-6xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Threads Intro (x86 Simulator)</h1>
  <p class="text-gray-400 mb-6 text-sm">
    Simulates a simplified x86 processor running multiple threads with configurable interrupt frequency.
    Observe race conditions and concurrency bugs by tracing register and memory state.
  </p>

  <!-- Example Programs -->
  <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
    <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Example Programs</h2>
    <div class="flex flex-wrap gap-2">
      {#each EXAMPLE_PROGRAMS as ex}
        <button
          onclick={() => loadExample(ex.source)}
          class="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 border border-gray-700 transition-colors cursor-pointer"
        >
          {ex.name}
        </button>
      {/each}
    </div>
  </div>

  <!-- Parameters -->
  <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
    <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Parameters</h2>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      <label class="block">
        <span class="text-xs text-gray-400">Seed</span>
        <input type="number" bind:value={seed} min={0}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Threads</span>
        <input type="number" bind:value={numThreads} min={1} max={8}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Interrupt Freq</span>
        <input type="number" bind:value={intFreq} min={1}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="flex items-end gap-2 pb-1.5">
        <input type="checkbox" bind:checked={intRand}
          class="rounded bg-gray-800 border-gray-700" />
        <span class="text-xs text-gray-400">Random Interrupts</span>
      </label>
      <label class="block col-span-2">
        <span class="text-xs text-gray-400">Per-thread argv (e.g. ax=1:bx=2,cx=3)</span>
        <input type="text" bind:value={argv} placeholder="ax=1,ax=2"
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
      </label>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <label class="block">
        <span class="text-xs text-gray-400">Memory Trace (addrs/vars, comma-sep)</span>
        <input type="text" bind:value={memTrace} placeholder="2000,2004"
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Register Trace (comma-sep)</span>
        <input type="text" bind:value={regTrace} placeholder="ax,bx,cx"
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="flex items-end gap-2 pb-1.5">
        <input type="checkbox" bind:checked={ccTrace}
          class="rounded bg-gray-800 border-gray-700" />
        <span class="text-xs text-gray-400">Trace Condition Codes</span>
      </label>
    </div>
  </div>

  <!-- Program Editor -->
  <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
    <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Assembly Program</h2>
    <textarea
      bind:value={program}
      rows={10}
      class="block w-full rounded bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-gray-100 font-mono focus:border-blue-500 focus:outline-none resize-y"
      spellcheck="false"
    ></textarea>
  </div>

  {#if errorMsg}
    <div class="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6 text-red-300 text-sm font-mono">
      Error: {errorMsg}
    </div>
  {/if}

  <!-- Controls -->
  <div class="flex gap-3 mb-6 flex-wrap">
    <button
      onclick={() => { showSolution = true; stepping = false; }}
      disabled={!result}
      class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Show Solution
    </button>
    <button
      onclick={startStepping}
      disabled={!result}
      class="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium text-gray-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Step Through
    </button>
    {#if stepping && result}
      <button onclick={prevStep} disabled={currentStep === 0}
        class="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
        Prev
      </button>
      <button onclick={nextStep} disabled={currentStep >= result.trace.length}
        class="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
        Next
      </button>
      <span class="text-sm text-gray-400 self-center">
        Step {currentStep} / {result.trace.length}
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

  <!-- Trace output -->
  {#if result && (showSolution || stepping)}
    {@const visibleTrace = showSolution ? result.trace : result.trace.slice(0, currentStep)}
    {@const showValues = showSolution || stepping}
    {@const memKeys = result.memTraceKeys}
    {@const regKeys = result.regTraceKeys}

    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6 overflow-x-auto">
      <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Execution Trace</h2>

      <table class="w-full text-sm font-mono">
        <thead>
          <tr class="text-gray-500 text-xs border-b border-gray-800">
            {#each memKeys as key}
              <th class="text-right px-2 py-1">{key}</th>
            {/each}
            {#if memKeys.length > 0}
              <th class="px-1"></th>
            {/if}
            {#each regKeys as reg}
              <th class="text-right px-2 py-1">{reg}</th>
            {/each}
            {#if regKeys.length > 0}
              <th class="px-1"></th>
            {/if}
            {#if ccTrace}
              <th class="text-center px-1 py-1">&gt;=</th>
              <th class="text-center px-1 py-1">&gt;</th>
              <th class="text-center px-1 py-1">&lt;=</th>
              <th class="text-center px-1 py-1">&lt;</th>
              <th class="text-center px-1 py-1">!=</th>
              <th class="text-center px-1 py-1">==</th>
            {/if}
            {#each Array(numThreads) as _, i}
              <th class="text-center px-3 py-1 {threadColor(i)}">Thread {i}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <!-- Initial state row -->
          <tr class="border-b border-gray-800/50">
            {#each memKeys as key}
              <td class="text-right px-2 py-0.5 text-gray-300">
                {formatMemVal(result.initialTrace.tracedMemory.get(key), showValues)}
              </td>
            {/each}
            {#if memKeys.length > 0}<td class="px-1"></td>{/if}
            {#each regKeys as reg}
              <td class="text-right px-2 py-0.5 text-gray-300">
                {formatRegVal((result.initialTrace.registers as any)[reg], showValues)}
              </td>
            {/each}
            {#if regKeys.length > 0}<td class="px-1"></td>{/if}
            {#if ccTrace}
              <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? '0' : '?'}</td>
              <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? '0' : '?'}</td>
              <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? '0' : '?'}</td>
              <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? '0' : '?'}</td>
              <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? '0' : '?'}</td>
              <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? '0' : '?'}</td>
            {/if}
            {#each Array(numThreads) as _}
              <td></td>
            {/each}
          </tr>

          {#each visibleTrace as entry}
            <tr class="border-b border-gray-800/50 {entry.event !== 'instruction' ? 'bg-gray-800/30' : ''}">
              <!-- Memory trace values -->
              {#each memKeys as key}
                <td class="text-right px-2 py-0.5 text-gray-300">
                  {formatMemVal(entry.tracedMemory.get(key), showValues)}
                </td>
              {/each}
              {#if memKeys.length > 0}<td class="px-1"></td>{/if}

              <!-- Register trace values -->
              {#each regKeys as reg}
                <td class="text-right px-2 py-0.5 text-gray-300">
                  {formatRegVal((entry.registers as any)[reg], showValues)}
                </td>
              {/each}
              {#if regKeys.length > 0}<td class="px-1"></td>{/if}

              <!-- Condition codes -->
              {#if ccTrace}
                <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? (entry.conditions.gte ? '1' : '0') : '?'}</td>
                <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? (entry.conditions.gt ? '1' : '0') : '?'}</td>
                <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? (entry.conditions.lte ? '1' : '0') : '?'}</td>
                <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? (entry.conditions.lt ? '1' : '0') : '?'}</td>
                <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? (entry.conditions.neq ? '1' : '0') : '?'}</td>
                <td class="text-center px-1 py-0.5 text-gray-500">{showValues ? (entry.conditions.eq ? '1' : '0') : '?'}</td>
              {/if}

              <!-- Thread columns -->
              {#if entry.event === 'instruction'}
                {#each Array(numThreads) as _, i}
                  <td class="text-center px-2 py-0.5 {threadColor(entry.tid)} {i === entry.tid ? '' : 'text-transparent'}">
                    {#if i === entry.tid}
                      {entry.pc} {entry.instruction}
                    {/if}
                  </td>
                {/each}
              {:else}
                {#each Array(numThreads) as _, i}
                  <td class="text-center px-2 py-0.5 text-gray-500 text-xs">
                    {#if entry.event === 'interrupt'}
                      --Interrupt--
                    {:else}
                      --Halt;Switch--
                    {/if}
                  </td>
                {/each}
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <!-- Summary -->
    {#if showSolution || (stepping && result && currentStep === result.trace.length)}
      <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
        <h2 class="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Summary</h2>
        <div class="text-sm text-gray-300 space-y-1 font-mono">
          <div>Instructions executed: {result.instructionCount}</div>
          {#if result.finalMemory.size > 0}
            <div class="mt-2 text-gray-400">Final memory (non-zero, non-instruction):</div>
            {#each [...result.finalMemory.entries()].sort((a, b) => a[0] - b[0]) as [addr, val]}
              <div class="text-gray-300">  m[{addr}] = {val}</div>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  {/if}

  <!-- Question mode (no solution) -->
  {#if result && !showSolution && !stepping}
    {@const memKeys = result.memTraceKeys}
    {@const regKeys = result.regTraceKeys}
    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6 overflow-x-auto">
      <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
        Execution Trace (fill in the values)
      </h2>

      <table class="w-full text-sm font-mono">
        <thead>
          <tr class="text-gray-500 text-xs border-b border-gray-800">
            {#each memKeys as key}
              <th class="text-right px-2 py-1">{key}</th>
            {/each}
            {#if memKeys.length > 0}
              <th class="px-1"></th>
            {/if}
            {#each regKeys as reg}
              <th class="text-right px-2 py-1">{reg}</th>
            {/each}
            {#if regKeys.length > 0}
              <th class="px-1"></th>
            {/if}
            {#if ccTrace}
              <th class="text-center px-1 py-1">&gt;=</th>
              <th class="text-center px-1 py-1">&gt;</th>
              <th class="text-center px-1 py-1">&lt;=</th>
              <th class="text-center px-1 py-1">&lt;</th>
              <th class="text-center px-1 py-1">!=</th>
              <th class="text-center px-1 py-1">==</th>
            {/if}
            {#each Array(numThreads) as _, i}
              <th class="text-center px-3 py-1 {threadColor(i)}">Thread {i}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <!-- Initial row -->
          <tr class="border-b border-gray-800/50">
            {#each memKeys as _}<td class="text-right px-2 py-0.5 text-gray-500">?</td>{/each}
            {#if memKeys.length > 0}<td class="px-1"></td>{/if}
            {#each regKeys as _}<td class="text-right px-2 py-0.5 text-gray-500">?</td>{/each}
            {#if regKeys.length > 0}<td class="px-1"></td>{/if}
            {#if ccTrace}
              {#each Array(6) as _}<td class="text-center px-1 py-0.5 text-gray-500">?</td>{/each}
            {/if}
            {#each Array(numThreads) as _}<td></td>{/each}
          </tr>

          {#each result.trace as entry}
            <tr class="border-b border-gray-800/50 {entry.event !== 'instruction' ? 'bg-gray-800/30' : ''}">
              {#each memKeys as _}<td class="text-right px-2 py-0.5 text-gray-500">?</td>{/each}
              {#if memKeys.length > 0}<td class="px-1"></td>{/if}
              {#each regKeys as _}<td class="text-right px-2 py-0.5 text-gray-500">?</td>{/each}
              {#if regKeys.length > 0}<td class="px-1"></td>{/if}
              {#if ccTrace}
                {#each Array(6) as _}<td class="text-center px-1 py-0.5 text-gray-500">?</td>{/each}
              {/if}

              {#if entry.event === 'instruction'}
                {#each Array(numThreads) as _, i}
                  <td class="text-center px-2 py-0.5 {threadColor(entry.tid)} {i === entry.tid ? '' : 'text-transparent'}">
                    {#if i === entry.tid}
                      {entry.pc} {entry.instruction}
                    {/if}
                  </td>
                {/each}
              {:else}
                {#each Array(numThreads) as _, i}
                  <td class="text-center px-2 py-0.5 text-gray-500 text-xs">
                    {#if entry.event === 'interrupt'}
                      --Interrupt--
                    {:else}
                      --Halt;Switch--
                    {/if}
                  </td>
                {/each}
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
