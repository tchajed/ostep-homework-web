<script lang="ts">
  import { simulate, defaultParams, type LotteryParams, type StepResult, type Job } from '../lib/simulators/lottery';

  let seed = $state(defaultParams.seed);
  let jobs = $state(defaultParams.jobs);
  let jlist = $state(defaultParams.jlist);
  let maxlen = $state(defaultParams.maxlen);
  let maxticket = $state(defaultParams.maxticket);
  let quantum = $state(defaultParams.quantum);
  let showSolution = $state(false);

  let params = $derived<LotteryParams>({ seed, jobs, jlist, maxlen, maxticket, quantum });
  let result = $derived(simulate(params));

  // For step-through mode
  let currentStep = $state(0);
  let stepping = $state(false);

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
    if (currentStep < result.steps.length) {
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
    // Access params to track
    void params;
    resetStepping();
  });

  const jobColors = [
    'text-blue-400',
    'text-green-400',
    'text-yellow-400',
    'text-pink-400',
    'text-purple-400',
    'text-cyan-400',
    'text-orange-400',
    'text-red-400',
  ];

  const jobBgColors = [
    'bg-blue-400/10',
    'bg-green-400/10',
    'bg-yellow-400/10',
    'bg-pink-400/10',
    'bg-purple-400/10',
    'bg-cyan-400/10',
    'bg-orange-400/10',
    'bg-red-400/10',
  ];

  function jobColor(id: number): string {
    return jobColors[id % jobColors.length];
  }

  function jobBgColor(id: number): string {
    return jobBgColors[id % jobBgColors.length];
  }
</script>

<div class="max-w-5xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Lottery Scheduling Simulator</h1>
  <p class="text-gray-400 mb-6 text-sm">
    Simulates lottery scheduling where each job holds tickets and a random drawing determines which job runs next.
  </p>

  <!-- Parameters -->
  <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
    <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Parameters</h2>
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <label class="block">
        <span class="text-xs text-gray-400">Seed</span>
        <input type="number" bind:value={seed} min={0}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Jobs</span>
        <input type="number" bind:value={jobs} min={1} max={8}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Max Length</span>
        <input type="number" bind:value={maxlen} min={1}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Max Tickets</span>
        <input type="number" bind:value={maxticket} min={1}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400">Quantum</span>
        <input type="number" bind:value={quantum} min={1}
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none" />
      </label>
      <label class="block col-span-2 sm:col-span-3 lg:col-span-1">
        <span class="text-xs text-gray-400">Job List (runtime:tickets,...)</span>
        <input type="text" bind:value={jlist} placeholder="e.g. 10:100,20:50"
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-2 py-1.5 text-sm text-gray-100 placeholder-gray-600 focus:border-blue-500 focus:outline-none" />
      </label>
    </div>
  </div>

  <!-- Job List -->
  <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
    <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Job List</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {#each result.jobs as job}
        <div class="flex items-center gap-3 rounded px-3 py-2 {jobBgColor(job.id)} border border-gray-800">
          <span class="font-mono text-sm font-bold {jobColor(job.id)}">Job {job.id}</span>
          <span class="text-xs text-gray-400">length = {job.length}</span>
          <span class="text-xs text-gray-400">tickets = {job.tickets}</span>
        </div>
      {/each}
    </div>
    <div class="mt-2 text-xs text-gray-500">
      Total tickets: {result.jobs.reduce((s, j) => s + j.tickets, 0)} |
      Total runtime: {result.jobs.reduce((s, j) => s + j.length, 0)}
    </div>
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
      <button onclick={nextStep} disabled={currentStep >= result.steps.length}
        class="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
        Next
      </button>
      <span class="text-sm text-gray-400 self-center">
        Step {currentStep} / {result.steps.length}
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

  <!-- Random Numbers (no solution mode) -->
  {#if !showSolution && !stepping}
    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mb-6">
      <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
        Random Numbers (at most {result.randomNumbers.length})
      </h2>
      <div class="font-mono text-sm text-gray-300 space-y-0.5 max-h-64 overflow-y-auto">
        {#each result.randomNumbers as num}
          <div>Random {num}</div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Solution / Step-through -->
  {#if showSolution || stepping}
    {@const visibleSteps = showSolution ? result.steps : result.steps.slice(0, currentStep)}
    <div class="space-y-1">
      {#each visibleSteps as step, i}
        <div class="bg-gray-900 rounded border border-gray-800 px-4 py-2">
          <!-- Draw info -->
          <div class="text-sm font-mono mb-1">
            <span class="text-gray-400">Random</span>
            <span class="text-gray-200">{step.randomValue}</span>
            <span class="text-gray-500">-&gt;</span>
            <span class="text-gray-400">Winning ticket</span>
            <span class="text-yellow-400">{step.winningTicket}</span>
            <span class="text-gray-500">(of {step.totalTickets})</span>
            <span class="text-gray-500">-&gt;</span>
            <span class="text-gray-400">Run</span>
            <span class="{jobColor(step.winnerId)} font-bold">{step.winnerId}</span>
          </div>

          <!-- Job states -->
          <div class="flex flex-wrap gap-1.5 text-xs font-mono">
            {#each step.jobStates as js}
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded
                {js.id === step.winnerId ? 'bg-yellow-400/15 border border-yellow-500/30' : 'bg-gray-800 border border-gray-700'}">
                <span class={js.id === step.winnerId ? 'text-yellow-400' : 'text-gray-500'}>
                  {js.id === step.winnerId ? '*' : '\u00A0'}
                </span>
                <span class="{jobColor(js.id)}">job:{js.id}</span>
                <span class="text-gray-400">left:{js.timeLeft}</span>
                <span class="text-gray-400">tix:{js.done ? '---' : js.tickets}</span>
              </span>
            {/each}
          </div>

          <!-- Completion -->
          {#if step.completedJobId !== null}
            <div class="mt-1 text-sm font-bold {jobColor(step.completedJobId)}">
              --&gt; JOB {step.completedJobId} DONE at time {step.clock}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Summary -->
    {#if showSolution || currentStep === result.steps.length}
      <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mt-4">
        <h2 class="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Summary</h2>
        <div class="text-sm text-gray-300 space-y-1">
          {#each result.jobs as job}
            {@const doneStep = result.steps.find(s => s.completedJobId === job.id)}
            <div>
              <span class="{jobColor(job.id)} font-mono font-bold">Job {job.id}</span>
              <span class="text-gray-400">
                finished at time {doneStep?.clock ?? '?'}
                (response time: {(doneStep?.clock ?? 0)}, turnaround: {(doneStep?.clock ?? 0)})
              </span>
            </div>
          {/each}
          <div class="text-gray-400 mt-1">
            Total time: {result.steps[result.steps.length - 1]?.clock ?? 0}
          </div>
        </div>
      </div>
    {/if}
  {/if}

  <!-- Ticket visualization -->
  {#if result.jobs.length > 0}
    <div class="bg-gray-900 rounded-lg border border-gray-800 p-4 mt-6">
      <h2 class="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">Ticket Distribution</h2>
      {#each [result.jobs.reduce((s, j) => s + j.tickets, 0)] as totalTickets}
      <div class="flex rounded overflow-hidden h-6">
        {#each result.jobs as job}
          {@const pct = (job.tickets / totalTickets) * 100}
          <div
            class="flex items-center justify-center text-xs font-mono font-bold {jobColor(job.id)} {jobBgColor(job.id)} border-r border-gray-700 last:border-r-0"
            style="width: {pct}%"
            title="Job {job.id}: {job.tickets} tickets ({pct.toFixed(1)}%)"
          >
            {#if pct > 8}
              {job.id}
            {/if}
          </div>
        {/each}
      </div>
      <div class="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
        {#each result.jobs as job}
          <span>
            <span class="{jobColor(job.id)} font-bold">Job {job.id}</span>: {job.tickets} tickets
            ({((job.tickets / totalTickets) * 100).toFixed(1)}%)
          </span>
        {/each}
      </div>
      {/each}
    </div>
  {/if}
</div>
