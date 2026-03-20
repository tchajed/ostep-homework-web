<script lang="ts">
  import {
    simulate, EXAMPLE_PROGRAMS, regName,
    type X86LocksResult, type TraceStep,
    ALL_CONDS,
  } from '../lib/simulators/x86-locks';

  let seed = $state(0);
  let numThreads = $state(2);
  let interruptFreq = $state(50);
  let interruptRandom = $state(false);
  let argvStr = $state('');
  let procSched = $state('');
  let memTraceStr = $state('');
  let regTraceStr = $state('');
  let ccTrace = $state(false);
  let showAnswers = $state(false);

  let selectedProgram = $state(0);
  let customProgram = $state('');
  let useCustom = $state(false);

  let result: X86LocksResult | null = $state(null);
  let error: string | null = $state(null);

  // Initialize with first example
  $effect(() => {
    if (!useCustom && EXAMPLE_PROGRAMS[selectedProgram]) {
      const prog = EXAMPLE_PROGRAMS[selectedProgram];
      if (prog.defaultArgs) {
        argvStr = prog.defaultArgs;
        numThreads = prog.defaultArgs.split(',').length;
      }
    }
  });

  function run() {
    try {
      error = null;
      const progSource = useCustom ? customProgram : EXAMPLE_PROGRAMS[selectedProgram].source;
      const memTrace = memTraceStr.trim() === '' ? [] : memTraceStr.split(',').map(s => s.trim());
      const regTrace = regTraceStr.trim() === '' ? [] : regTraceStr.split(',').map(s => s.trim());
      const argv = argvStr.trim() === '' ? [''] : argvStr.split(',').map(s => s.trim());

      result = simulate({
        seed,
        numThreads,
        program: progSource,
        interruptFreq,
        interruptRandom,
        argv,
        procSched,
        loadAddr: 1000,
        memSize: 128,
        memTrace,
        regTrace,
        ccTrace,
      });
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  run();

  const condLabels = ['>=', '>', '<=', '<', '!=', '=='];
</script>

<div class="max-w-6xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">Locks (x86 Simulator)</h1>
  <p class="text-gray-400 text-sm">
    Simulate a simplified x86-like processor running multiple threads with shared memory.
    Explore race conditions and how locks (test-and-set, ticket locks, etc.) provide
    mutual exclusion. Choose a built-in program or write your own assembly.
  </p>

  <!-- Program selection -->
  <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-3">
    <h2 class="text-base font-semibold text-gray-200">Program</h2>
    <div class="flex flex-wrap gap-3 items-center">
      <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
        <input type="radio" bind:group={useCustom} value={false}
          class="accent-blue-500" />
        Example
      </label>
      <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
        <input type="radio" bind:group={useCustom} value={true}
          class="accent-blue-500" />
        Custom
      </label>
      {#if !useCustom}
        <select bind:value={selectedProgram}
          class="rounded bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-gray-100">
          {#each EXAMPLE_PROGRAMS as prog, i}
            <option value={i}>{prog.name}</option>
          {/each}
        </select>
      {/if}
    </div>

    {#if useCustom}
      <textarea
        bind:value={customProgram}
        rows="12"
        placeholder="Enter x86-like assembly..."
        class="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm font-mono text-gray-100 resize-y"
      ></textarea>
    {:else}
      <pre class="rounded bg-gray-800 p-3 text-sm font-mono text-gray-300 overflow-x-auto max-h-60 overflow-y-auto">{EXAMPLE_PROGRAMS[selectedProgram].source}</pre>
    {/if}
  </div>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
    <label class="flex flex-col text-sm text-gray-400">
      Seed
      <input type="number" bind:value={seed} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Threads
      <input type="number" bind:value={numThreads} min="1" max="8"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Interrupt Freq
      <input type="number" bind:value={interruptFreq} min="1"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Argv (per thread)
      <input type="text" bind:value={argvStr} placeholder="bx=2,bx=2"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Mem Trace
      <input type="text" bind:value={memTraceStr} placeholder="count,mutex"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Reg Trace
      <input type="text" bind:value={regTraceStr} placeholder="ax,bx"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Schedule
      <input type="text" bind:value={procSched} placeholder="auto"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <div class="flex flex-col gap-2 justify-end text-sm text-gray-400">
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={interruptRandom}
          class="rounded bg-gray-800 border-gray-600" />
        Random Interrupts
      </label>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" bind:checked={ccTrace}
          class="rounded bg-gray-800 border-gray-600" />
        Show CC
      </label>
    </div>
  </div>

  <div class="flex gap-3 items-center">
    <button
      onclick={run}
      class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium cursor-pointer"
    >
      Run
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
    <!-- Execution trace -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4">
      <h2 class="text-base font-semibold text-gray-200 mb-3">
        Execution Trace
        <span class="text-sm font-normal text-gray-500 ml-2">{result.instructionCount} instructions</span>
      </h2>

      <div class="overflow-x-auto">
        <table class="w-full text-xs font-mono">
          <thead>
            <tr class="text-gray-500 text-left border-b border-gray-800">
              {#if result.memTraceAddrs.length > 0}
                {#each result.memTraceAddrs as addr, i}
                  {@const name = Object.entries(result.vars).find(([,v]) => v === addr)?.[0]}
                  <th class="py-1 px-2 text-center">{name ?? addr}</th>
                {/each}
              {/if}
              {#if result.regTraceNums.length > 0}
                {#each result.regTraceNums as r}
                  <th class="py-1 px-2 text-center">{regName(r)}</th>
                {/each}
              {/if}
              {#if ccTrace}
                {#each condLabels as lbl}
                  <th class="py-1 px-1 text-center">{lbl}</th>
                {/each}
              {/if}
              {#each Array(numThreads) as _, i}
                <th class="py-1 px-2 text-center min-w-[180px]">Thread {i}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each result.steps as step}
              <tr class="border-b border-gray-800/30
                {step.event === 'interrupt' ? 'bg-yellow-900/10' : ''}
                {step.event === 'halt-switch' ? 'bg-red-900/10' : ''}
                hover:bg-gray-800/30">
                <!-- Traced memory -->
                {#if result.memTraceAddrs.length > 0}
                  {#each step.tracedMem as val}
                    <td class="py-0.5 px-2 text-center text-gray-300">
                      {showAnswers ? val : '?'}
                    </td>
                  {/each}
                {/if}
                <!-- Traced registers -->
                {#if result.regTraceNums.length > 0}
                  {#each step.tracedRegs as val}
                    <td class="py-0.5 px-2 text-center text-gray-300">
                      {showAnswers ? val : '?'}
                    </td>
                  {/each}
                {/if}
                <!-- Condition codes -->
                {#if ccTrace}
                  {#each step.tracedCC as val}
                    <td class="py-0.5 px-1 text-center text-gray-400">
                      {showAnswers ? (val ? '1' : '0') : '?'}
                    </td>
                  {/each}
                {/if}
                <!-- Per-thread columns -->
                {#each Array(numThreads) as _, tid}
                  <td class="py-0.5 px-2 text-center">
                    {#if step.event === 'instruction' && step.threadId === tid}
                      <span class="text-green-400">{step.pc} {step.instruction}</span>
                    {:else if step.event === 'interrupt'}
                      <span class="text-yellow-500">------ Interrupt ------</span>
                    {:else if step.event === 'halt-switch'}
                      <span class="text-red-400">----- Halt;Switch -----</span>
                    {:else}
                      <span></span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Final memory -->
    {#if result.finalMemory.length > 0}
      <div class="rounded bg-gray-900 border border-gray-800 p-4">
        <h2 class="text-base font-semibold text-gray-200 mb-3">Final Memory</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm font-mono">
          {#each result.finalMemory as { addr, value }}
            {@const name = Object.entries(result.vars).find(([,v]) => v === addr)?.[0]}
            <div class="rounded bg-gray-800 px-3 py-1.5">
              <span class="text-gray-500">{name ? `${name} (m[${addr}])` : `m[${addr}]`}:</span>
              <span class="text-gray-100 ml-1">
                {showAnswers ? value : '?'}
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Variables -->
    {#if Object.keys(result.vars).length > 0}
      <div class="rounded bg-gray-900 border border-gray-800 p-4">
        <h2 class="text-base font-semibold text-gray-200 mb-3">Variables</h2>
        <div class="flex flex-wrap gap-3 text-sm font-mono">
          {#each Object.entries(result.vars) as [name, addr]}
            <div class="rounded bg-gray-800 px-3 py-1.5">
              <span class="text-gray-500">{name}</span>
              <span class="text-gray-400 ml-1">@ {addr}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
