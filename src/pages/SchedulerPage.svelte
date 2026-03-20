<script lang="ts">
  import {
    simulate,
    type SchedulerParams,
    type SchedulerResult,
    type Policy,
  } from "../lib/simulators/scheduler";

  let seed = $state(0);
  let numJobs = $state(3);
  let maxLen = $state(10);
  let policy: Policy = $state("FIFO");
  let quantum = $state(1);
  let jobList = $state("");
  let showSolution = $state(false);

  let result: SchedulerResult | null = $state(null);

  const params: SchedulerParams = $derived({
    seed,
    numJobs,
    maxLen,
    policy,
    quantum,
    jobList: jobList.trim() || undefined,
  });

  function run() {
    result = simulate(params);
    showSolution = false;
  }

  // Color palette for jobs in the Gantt chart
  const jobColors = [
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-purple-500",
    "bg-cyan-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-teal-500",
    "bg-indigo-500",
  ];

  function fmt(n: number): string {
    return n.toFixed(2);
  }

  let totalTime = $derived.by(() => {
    if (!result) return 0;
    return result.trace.reduce(
      (acc: number, e) => Math.max(acc, e.time + e.ranFor),
      0
    );
  });
</script>

<div class="max-w-5xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">CPU Scheduling</h1>
  <p class="text-gray-400 text-sm mb-6">
    Simulate FIFO, SJF, and Round Robin scheduling policies. Configure
    parameters, run the simulation, then reveal the solution to check your
    answers.
  </p>

  <!-- Parameter Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
    <label class="block">
      <span class="text-xs text-gray-400">Seed</span>
      <input
        type="number"
        bind:value={seed}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Jobs</span>
      <input
        type="number"
        min="1"
        max="20"
        bind:value={numJobs}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Max Length</span>
      <input
        type="number"
        min="1"
        bind:value={maxLen}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Policy</span>
      <select
        bind:value={policy}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none"
      >
        <option value="FIFO">FIFO</option>
        <option value="SJF">SJF</option>
        <option value="RR">RR</option>
      </select>
    </label>

    <label class="block" class:opacity-40={policy !== "RR"}>
      <span class="text-xs text-gray-400">Quantum</span>
      <input
        type="number"
        min="1"
        bind:value={quantum}
        disabled={policy !== "RR"}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Job List</span>
      <input
        type="text"
        placeholder="e.g. 5,10,3"
        bind:value={jobList}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none placeholder:text-gray-600"
      />
    </label>
  </div>

  <div class="flex gap-3 mb-6">
    <button
      onclick={run}
      class="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium
             transition-colors cursor-pointer"
    >
      Run
    </button>
    {#if result}
      <button
        onclick={() => (showSolution = !showSolution)}
        class="px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium
               transition-colors cursor-pointer"
      >
        {showSolution ? "Hide Solution" : "Show Solution"}
      </button>
    {/if}
  </div>

  {#if result}
    <!-- Job List -->
    <div class="mb-6">
      <h2 class="text-sm font-semibold text-gray-300 mb-2">Job List</h2>
      <div class="flex flex-wrap gap-2">
        {#each result.jobs as job}
          <span
            class="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-sm
                   bg-gray-800 border border-gray-700"
          >
            <span
              class="inline-block w-2.5 h-2.5 rounded-sm {jobColors[
                job.id % jobColors.length
              ]}"
            ></span>
            Job {job.id}
            <span class="text-gray-400">(length = {job.runtime})</span>
          </span>
        {/each}
      </div>
    </div>

    {#if !showSolution}
      <div class="rounded-lg bg-gray-900 border border-gray-800 p-6 text-center text-gray-400">
        <p>
          Compute the turnaround time, response time, and wait time for each
          job.
        </p>
        <p class="mt-1 text-sm">
          When you are done, click <strong>Show Solution</strong> to check your
          answers.
        </p>
      </div>
    {/if}

    {#if showSolution}
      <!-- Gantt Chart -->
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-300 mb-2">
          Execution Timeline
        </h2>
        <div
          class="relative rounded-lg bg-gray-900 border border-gray-800 p-4 overflow-x-auto"
        >
          <div class="min-w-[400px]">
            <!-- Time axis -->
            <div class="flex mb-1" style="padding-left: 60px;">
              {#each Array(Math.ceil(totalTime / Math.max(1, Math.floor(totalTime / 20))) + 1) as _, i}
                {@const tick =
                  i * Math.max(1, Math.floor(totalTime / 20))}
                {#if tick <= totalTime}
                  <div
                    class="text-[10px] text-gray-500 absolute"
                    style="left: calc(60px + {(tick / totalTime) *
                      100}% * 0.95)"
                  >
                    {tick}
                  </div>
                {/if}
              {/each}
            </div>

            <div class="mt-4">
              <!-- One row per job -->
              {#each result.jobs as job}
                <div class="flex items-center mb-1">
                  <div
                    class="w-[60px] text-xs text-gray-400 flex-shrink-0"
                  >
                    Job {job.id}
                  </div>
                  <div
                    class="relative flex-1 h-6 bg-gray-800 rounded-sm"
                  >
                    {#each result.trace.filter((e) => e.jobId === job.id) as entry}
                      <div
                        class="absolute top-0 h-full rounded-sm {jobColors[
                          job.id % jobColors.length
                        ]} opacity-85 flex items-center justify-center text-[10px] text-white font-medium"
                        style="left: {(entry.time / totalTime) *
                          100}%; width: {(entry.ranFor / totalTime) *
                          100}%;"
                      >
                        {#if entry.ranFor / totalTime > 0.04}
                          {entry.ranFor}
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <!-- Execution Trace -->
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-300 mb-2">
          Execution Trace
        </h2>
        <div
          class="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden"
        >
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-800 text-gray-400">
                <th class="text-left px-3 py-1.5 font-medium">Time</th>
                <th class="text-left px-3 py-1.5 font-medium">Job</th>
                <th class="text-left px-3 py-1.5 font-medium">Ran For</th>
                <th class="text-left px-3 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {#each result.trace as entry}
                <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td class="px-3 py-1 font-mono text-gray-300"
                    >{entry.time}</td
                  >
                  <td class="px-3 py-1">
                    <span class="inline-flex items-center gap-1">
                      <span
                        class="inline-block w-2 h-2 rounded-sm {jobColors[
                          entry.jobId % jobColors.length
                        ]}"
                      ></span>
                      Job {entry.jobId}
                    </span>
                  </td>
                  <td class="px-3 py-1 font-mono text-gray-300"
                    >{fmt(entry.ranFor)}</td
                  >
                  <td class="px-3 py-1">
                    {#if entry.done}
                      <span class="text-emerald-400"
                        >DONE at {fmt(entry.doneAt!)}</span
                      >
                    {:else}
                      <span class="text-gray-500">preempted</span>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Statistics -->
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-300 mb-2">
          Final Statistics
        </h2>
        <div
          class="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden"
        >
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-800 text-gray-400">
                <th class="text-left px-3 py-1.5 font-medium">Job</th>
                <th class="text-right px-3 py-1.5 font-medium">Response</th>
                <th class="text-right px-3 py-1.5 font-medium"
                  >Turnaround</th
                >
                <th class="text-right px-3 py-1.5 font-medium">Wait</th>
              </tr>
            </thead>
            <tbody>
              {#each result.stats as stat}
                <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td class="px-3 py-1">
                    <span class="inline-flex items-center gap-1">
                      <span
                        class="inline-block w-2 h-2 rounded-sm {jobColors[
                          stat.jobId % jobColors.length
                        ]}"
                      ></span>
                      Job {stat.jobId}
                    </span>
                  </td>
                  <td class="px-3 py-1 text-right font-mono text-gray-300"
                    >{fmt(stat.response)}</td
                  >
                  <td class="px-3 py-1 text-right font-mono text-gray-300"
                    >{fmt(stat.turnaround)}</td
                  >
                  <td class="px-3 py-1 text-right font-mono text-gray-300"
                    >{fmt(stat.wait)}</td
                  >
                </tr>
              {/each}
              <tr class="bg-gray-800/50 font-medium">
                <td class="px-3 py-1.5">Average</td>
                <td class="px-3 py-1.5 text-right font-mono"
                  >{fmt(result.avgResponse)}</td
                >
                <td class="px-3 py-1.5 text-right font-mono"
                  >{fmt(result.avgTurnaround)}</td
                >
                <td class="px-3 py-1.5 text-right font-mono"
                  >{fmt(result.avgWait)}</td
                >
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>
