<script lang="ts">
  import {
    runSimulation,
    defaultOptions,
    SCHED_SWITCH_ON_IO,
    SCHED_SWITCH_ON_END,
    IO_RUN_LATER,
    IO_RUN_IMMEDIATE,
    type SimulationOptions,
    type SimulationResult,
    type SwitchBehavior,
    type IODoneBehavior,
  } from '../lib/simulators/process-run';

  let seed = $state(defaultOptions.seed);
  let processList = $state(defaultOptions.processList);
  let program = $state(defaultOptions.program);
  let ioLength = $state(defaultOptions.ioLength);
  let switchBehavior: SwitchBehavior = $state(defaultOptions.switchBehavior);
  let ioDoneBehavior: IODoneBehavior = $state(defaultOptions.ioDoneBehavior);

  let result: SimulationResult | null = $state(null);
  let showSolution = $state(false);
  let errorMsg = $state('');

  function simulate() {
    errorMsg = '';
    try {
      const options: SimulationOptions = {
        seed,
        processList,
        program,
        ioLength,
        switchBehavior,
        ioDoneBehavior,
      };
      result = runSimulation(options);
      showSolution = false;
    } catch (e: any) {
      errorMsg = e.message || 'Simulation error';
      result = null;
    }
  }

  // Run on initial load
  simulate();

  function stateColor(state: string): string {
    if (state.startsWith('RUN:')) return 'text-green-400';
    if (state === 'BLOCKED') return 'text-red-400';
    if (state === 'READY') return 'text-yellow-400';
    if (state === 'DONE') return 'text-gray-600';
    return 'text-gray-400';
  }

  function cpuPercent(r: SimulationResult): string {
    if (r.stats.totalTime === 0) return '0.00';
    return ((100.0 * r.stats.cpuBusy) / r.stats.totalTime).toFixed(2);
  }

  function ioPercent(r: SimulationResult): string {
    if (r.stats.totalTime === 0) return '0.00';
    return ((100.0 * r.stats.ioBusy) / r.stats.totalTime).toFixed(2);
  }
</script>

<div class="max-w-5xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Process Execution Simulator</h1>
  <p class="text-gray-400 text-sm mb-6">
    Simulates the execution of processes with CPU and IO operations, based on
    <code class="text-gray-300">cpu-intro/process-run.py</code>.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
    <label class="block">
      <span class="text-sm text-gray-400">Seed</span>
      <input
        type="number"
        bind:value={seed}
        class="mt-1 block w-full rounded bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-sm text-gray-400">Process List (X:Y,...)</span>
      <input
        type="text"
        bind:value={processList}
        placeholder="5:50,5:50"
        class="mt-1 block w-full rounded bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-sm text-gray-400">Program (c3,i,c2:c5)</span>
      <input
        type="text"
        bind:value={program}
        placeholder="Leave empty to use process list"
        class="mt-1 block w-full rounded bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 placeholder:text-gray-600 focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-sm text-gray-400">IO Length</span>
      <input
        type="number"
        bind:value={ioLength}
        min="0"
        class="mt-1 block w-full rounded bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-sm text-gray-400">Process Switch Behavior</span>
      <select
        bind:value={switchBehavior}
        class="mt-1 block w-full rounded bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      >
        <option value={SCHED_SWITCH_ON_IO}>Switch on IO</option>
        <option value={SCHED_SWITCH_ON_END}>Switch on End</option>
      </select>
    </label>

    <label class="block">
      <span class="text-sm text-gray-400">IO Done Behavior</span>
      <select
        bind:value={ioDoneBehavior}
        class="mt-1 block w-full rounded bg-gray-900 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
      >
        <option value={IO_RUN_LATER}>Run Later</option>
        <option value={IO_RUN_IMMEDIATE}>Run Immediate</option>
      </select>
    </label>
  </div>

  <div class="flex items-center gap-4 mb-6">
    <button
      onclick={simulate}
      class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer"
    >
      Run
    </button>

    {#if result}
      <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          bind:checked={showSolution}
          class="rounded bg-gray-900 border-gray-700"
        />
        Show solution
      </label>
    {/if}
  </div>

  {#if errorMsg}
    <div class="mb-4 p-3 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">
      {errorMsg}
    </div>
  {/if}

  {#if result}
    <!-- Process instructions (the "question") -->
    <div class="mb-6">
      <h2 class="text-lg font-semibold mb-2">Process Instructions</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {#each result.processes as proc}
          <div class="rounded bg-gray-900 border border-gray-800 p-3">
            <h3 class="text-sm font-medium text-gray-300 mb-1">Process {proc.pid}</h3>
            <div class="text-xs font-mono space-y-0.5">
              {#each proc.instructions as inst}
                <div class="{inst === 'io_done' ? 'text-gray-600' : inst === 'io' ? 'text-red-400' : 'text-green-400'}">
                  {inst}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <div class="mt-3 text-sm text-gray-400">
        <p>
          System will switch when
          {#if switchBehavior === SCHED_SWITCH_ON_IO}
            the current process is <span class="text-gray-200">FINISHED</span> or <span class="text-gray-200">ISSUES AN IO</span>
          {:else}
            the current process is <span class="text-gray-200">FINISHED</span>
          {/if}
        </p>
        <p>
          After IOs, the process issuing the IO will
          {#if ioDoneBehavior === IO_RUN_IMMEDIATE}
            run <span class="text-gray-200">IMMEDIATELY</span>
          {:else}
            run <span class="text-gray-200">LATER</span> (when it is its turn)
          {/if}
        </p>
      </div>
    </div>

    {#if showSolution}
      <!-- Trace table -->
      <div class="mb-6">
        <h2 class="text-lg font-semibold mb-2">Execution Trace</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm font-mono">
            <thead>
              <tr class="border-b border-gray-800 text-gray-400">
                <th class="px-3 py-1.5 text-right">Time</th>
                {#each result.processes as proc}
                  <th class="px-3 py-1.5 text-center">PID:{proc.pid}</th>
                {/each}
                <th class="px-3 py-1.5 text-center">CPU</th>
                <th class="px-3 py-1.5 text-center">IOs</th>
              </tr>
            </thead>
            <tbody>
              {#each result.trace as row}
                <tr class="border-b border-gray-900 hover:bg-gray-900/50">
                  <td class="px-3 py-1 text-right text-gray-400">
                    {row.time}{row.ioDone ? '*' : ' '}
                  </td>
                  {#each row.processStates as state, i}
                    <td class="px-3 py-1 text-center {stateColor(state)}">
                      {state}
                    </td>
                  {/each}
                  <td class="px-3 py-1 text-center {row.cpuBusy ? 'text-green-400' : 'text-gray-700'}">
                    {row.cpuBusy ? '1' : ''}
                  </td>
                  <td class="px-3 py-1 text-center {row.numIOs > 0 ? 'text-red-400' : 'text-gray-700'}">
                    {row.numIOs > 0 ? row.numIOs : ''}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Stats -->
      <div class="rounded bg-gray-900 border border-gray-800 p-4 text-sm font-mono">
        <p>Stats: Total Time <span class="text-gray-200">{result.stats.totalTime}</span></p>
        <p>Stats: CPU Busy <span class="text-gray-200">{result.stats.cpuBusy} ({cpuPercent(result)}%)</span></p>
        <p>Stats: IO Busy  <span class="text-gray-200">{result.stats.ioBusy} ({ioPercent(result)}%)</span></p>
      </div>
    {/if}
  {/if}
</div>
