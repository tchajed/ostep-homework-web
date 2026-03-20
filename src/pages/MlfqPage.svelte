<script lang="ts">
  import {
    simulateMlfq,
    defaultConfig,
    type MlfqConfig,
    type MlfqResult,
    type TraceEvent,
  } from "../lib/simulators/mlfq";

  let seed = $state(0);
  let numQueues = $state(3);
  let quantum = $state(10);
  let allotment = $state(1);
  let numJobs = $state(3);
  let maxlen = $state(100);
  let maxio = $state(10);
  let boost = $state(0);
  let ioTime = $state(5);
  let stay = $state(false);
  let iobump = $state(false);
  let jlist = $state("");
  let quantumListStr = $state("");
  let allotmentListStr = $state("");
  let showSolution = $state(false);
  let result: MlfqResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    error = null;
    try {
      const quantumList = quantumListStr.trim()
        ? quantumListStr.split(",").map((s) => parseInt(s.trim()))
        : [];
      const allotmentList = allotmentListStr.trim()
        ? allotmentListStr.split(",").map((s) => parseInt(s.trim()))
        : [];

      const config: MlfqConfig = {
        seed,
        numQueues,
        quantumList,
        allotmentList,
        quantum,
        allotment,
        numJobs,
        maxlen,
        maxio,
        boost,
        ioTime,
        stay,
        iobump,
        jlist: jlist.trim(),
      };
      result = simulateMlfq(config);
      showSolution = false;
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

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

  const jobBorderColors = [
    "border-blue-500",
    "border-emerald-500",
    "border-amber-500",
    "border-rose-500",
    "border-purple-500",
    "border-cyan-500",
    "border-orange-500",
    "border-pink-500",
    "border-teal-500",
    "border-indigo-500",
  ];

  function fmt(n: number): string {
    return n.toFixed(2);
  }

  function traceLabel(e: TraceEvent): string {
    switch (e.type) {
      case "JOB_BEGINS":
        return `JOB BEGINS by Job ${e.jobId}`;
      case "RUN":
        return `Run Job ${e.jobId} at PRIORITY ${e.priority} [ TICKS ${e.ticksLeft} ALLOT ${e.allotLeft} TIME ${e.timeLeft} (of ${e.runTime}) ]`;
      case "IO_START":
        return `IO_START by Job ${e.jobId}`;
      case "IO_DONE":
        return `IO_DONE by Job ${e.jobId}`;
      case "FINISHED":
        return `FINISHED Job ${e.jobId}`;
      case "IDLE":
        return "IDLE";
      case "BOOST":
        return `BOOST (every ${boost})`;
      default:
        return "";
    }
  }

  let totalTime: number = $derived.by(() => {
    if (!result) return 0;
    return Math.max(...result.trace.map((e: TraceEvent) => e.time)) + 1;
  });

  // Build per-queue, per-time-step state for the queue visualization
  interface QueueSnapshot {
    time: number;
    queues: number[][]; // queues[q] = list of jobIds in that queue
    event: TraceEvent;
  }
</script>

<div class="max-w-6xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Multi-Level Feedback Queue (MLFQ)</h1>
  <p class="text-gray-400 text-sm mb-6">
    Simulate the MLFQ scheduling algorithm. Configure queue levels, time quanta,
    allotments, priority boost intervals, and I/O behavior.
  </p>

  <!-- Parameter Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
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
      <span class="text-xs text-gray-400">Queues</span>
      <input
        type="number"
        min="1"
        max="10"
        bind:value={numQueues}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Quantum</span>
      <input
        type="number"
        min="1"
        bind:value={quantum}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Allotment</span>
      <input
        type="number"
        min="1"
        bind:value={allotment}
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
      <span class="text-xs text-gray-400">Max Run Length</span>
      <input
        type="number"
        min="1"
        bind:value={maxlen}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Max I/O Freq</span>
      <input
        type="number"
        min="1"
        bind:value={maxio}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Boost Interval</span>
      <input
        type="number"
        min="0"
        bind:value={boost}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">I/O Duration</span>
      <input
        type="number"
        min="1"
        bind:value={ioTime}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Job List</span>
      <input
        type="text"
        placeholder="s,r,io:s,r,io:..."
        bind:value={jlist}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none placeholder:text-gray-600"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Quantum List (-Q)</span>
      <input
        type="text"
        placeholder="e.g. 5,10,20"
        bind:value={quantumListStr}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none placeholder:text-gray-600"
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400">Allotment List (-A)</span>
      <input
        type="text"
        placeholder="e.g. 1,2,3"
        bind:value={allotmentListStr}
        class="mt-1 w-full rounded bg-gray-900 border border-gray-700 px-2 py-1 text-sm
               focus:border-blue-500 focus:outline-none placeholder:text-gray-600"
      />
    </label>
  </div>

  <!-- Boolean options -->
  <div class="flex gap-4 mb-4">
    <label class="inline-flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
      <input type="checkbox" bind:checked={stay} class="rounded bg-gray-900 border-gray-700" />
      Stay after I/O (-S)
    </label>
    <label class="inline-flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
      <input type="checkbox" bind:checked={iobump} class="rounded bg-gray-900 border-gray-700" />
      I/O Bump (-I)
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

  {#if error}
    <div class="rounded-lg bg-red-900/30 border border-red-800 p-3 text-red-300 text-sm mb-6">
      {error}
    </div>
  {/if}

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
              class="inline-block w-2.5 h-2.5 rounded-sm {jobColors[job.jobId % jobColors.length]}"
            ></span>
            Job {job.jobId}
            <span class="text-gray-400">
              (start={job.startTime}, run={job.runTime}, io={job.ioFreq})
            </span>
          </span>
        {/each}
      </div>
    </div>

    <!-- Queue Configuration -->
    <div class="mb-6">
      <h2 class="text-sm font-semibold text-gray-300 mb-2">Queue Configuration</h2>
      <div class="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-800 text-gray-400">
              <th class="text-left px-3 py-1.5 font-medium">Queue</th>
              <th class="text-right px-3 py-1.5 font-medium">Priority</th>
              <th class="text-right px-3 py-1.5 font-medium">Quantum</th>
              <th class="text-right px-3 py-1.5 font-medium">Allotment</th>
            </tr>
          </thead>
          <tbody>
            {#each Array(result.numQueues) as _, i}
              {@const q = result.numQueues - 1 - i}
              <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td class="px-3 py-1 text-gray-300">Q{q}</td>
                <td class="px-3 py-1 text-right font-mono text-gray-300">{q}</td>
                <td class="px-3 py-1 text-right font-mono text-gray-300">{result.quantumPerQueue[q]}</td>
                <td class="px-3 py-1 text-right font-mono text-gray-300">{result.allotmentPerQueue[q]}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    {#if !showSolution}
      <div class="rounded-lg bg-gray-900 border border-gray-800 p-6 text-center text-gray-400">
        <p>
          Compute the execution trace for the given workloads.
          Figure out which job runs at each time step and at which priority level.
        </p>
        <p class="mt-1 text-sm">
          When you are done, click <strong>Show Solution</strong> to check your answers.
        </p>
      </div>
    {/if}

    {#if showSolution}
      <!-- Per-Job Timeline -->
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-300 mb-2">Job Timeline</h2>
        <div class="rounded-lg bg-gray-900 border border-gray-800 p-4 overflow-x-auto">
          <div class="min-w-[500px]">
            <!-- Time axis -->
            <div class="relative h-5 mb-1" style="margin-left: 60px;">
              {#each Array(Math.min(totalTime + 1, 30)) as _, i}
                {@const tick = Math.round((i / 29) * (totalTime - 1))}
                {#if i === 0 || tick !== Math.round(((i - 1) / 29) * (totalTime - 1))}
                  <div
                    class="text-[10px] text-gray-500 absolute"
                    style="left: {(tick / Math.max(totalTime - 1, 1)) * 95}%"
                  >
                    {tick}
                  </div>
                {/if}
              {/each}
            </div>

            {#each result.jobs as job}
              {@const jobRuns = result.trace.filter(
                (e) => e.type === "RUN" && e.jobId === job.jobId
              )}
              {@const jobIOs = result.trace.filter(
                (e) => e.type === "IO_START" && e.jobId === job.jobId
              )}
              <div class="flex items-center mb-1">
                <div class="w-[60px] text-xs text-gray-400 flex-shrink-0">
                  Job {job.jobId}
                </div>
                <div class="relative flex-1 h-6 bg-gray-800 rounded-sm">
                  {#each jobRuns as ev}
                    <div
                      class="absolute top-0 h-full rounded-sm {jobColors[
                        job.jobId % jobColors.length
                      ]} opacity-85"
                      style="left: {(ev.time / Math.max(totalTime - 1, 1)) * 100}%; width: {Math.max(100 / totalTime, 1)}%;"
                      title="t={ev.time} Q{ev.priority} ticks={ev.ticksLeft}"
                    ></div>
                  {/each}
                  <!-- IO periods -->
                  {#each jobIOs as ev}
                    {#each Array(ioTime) as _, dt}
                      <div
                        class="absolute top-0 h-full rounded-sm bg-gray-600 opacity-50"
                        style="left: {((ev.time + dt) / Math.max(totalTime - 1, 1)) * 100}%; width: {Math.max(100 / totalTime, 1)}%;"
                        title="IO t={ev.time + dt}"
                      ></div>
                    {/each}
                  {/each}
                </div>
              </div>
            {/each}

            <div class="flex items-center gap-4 mt-2 ml-[60px] text-[10px] text-gray-400">
              <span class="flex items-center gap-1">
                <span class="w-3 h-3 bg-blue-500 opacity-85 rounded-sm"></span> Running
              </span>
              <span class="flex items-center gap-1">
                <span class="w-3 h-3 bg-gray-600 opacity-50 rounded-sm"></span> I/O
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Priority over time -->
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-300 mb-2">Priority Over Time</h2>
        <div class="rounded-lg bg-gray-900 border border-gray-800 p-4 overflow-x-auto">
          <div class="min-w-[500px]">
            <!-- Y-axis labels on the left -->
            <div class="flex">
              <div class="w-[60px] flex-shrink-0 flex flex-col-reverse justify-between pr-2" style="height: {result.numQueues * 28 + 8}px;">
                {#each Array(result.numQueues) as _, q}
                  <div class="text-[10px] text-gray-500 text-right">Q{q}</div>
                {/each}
              </div>
              <div class="flex-1 relative" style="height: {result.numQueues * 28 + 8}px;">
                <!-- Grid lines for each queue level -->
                {#each Array(result.numQueues) as _, q}
                  <div
                    class="absolute w-full border-t border-gray-800"
                    style="bottom: {(q / Math.max(result.numQueues - 1, 1)) * 100}%"
                  ></div>
                {/each}
                <!-- Plot job priority at each RUN event -->
                {#each result.jobs as job}
                  {@const runs = result.trace.filter(
                    (e) => e.type === "RUN" && e.jobId === job.jobId
                  )}
                  {#each runs as ev}
                    <div
                      class="absolute w-1.5 h-1.5 rounded-full {jobColors[
                        job.jobId % jobColors.length
                      ]}"
                      style="left: {(ev.time / Math.max(totalTime - 1, 1)) * 100}%; bottom: calc({(ev.priority / Math.max(result.numQueues - 1, 1)) * 100}% - 3px);"
                      title="Job {job.jobId} t={ev.time} Q{ev.priority}"
                    ></div>
                  {/each}
                {/each}
                <!-- Boost markers -->
                {#each result.trace.filter((e) => e.type === "BOOST") as ev}
                  <div
                    class="absolute w-px h-full bg-yellow-500/30"
                    style="left: {(ev.time / Math.max(totalTime - 1, 1)) * 100}%;"
                    title="BOOST at t={ev.time}"
                  ></div>
                {/each}
              </div>
            </div>
            <!-- Legend -->
            <div class="flex flex-wrap items-center gap-3 mt-2 ml-[60px] text-[10px] text-gray-400">
              {#each result.jobs as job}
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full {jobColors[job.jobId % jobColors.length]}"></span>
                  Job {job.jobId}
                </span>
              {/each}
              {#if boost > 0}
                <span class="flex items-center gap-1">
                  <span class="w-3 h-px bg-yellow-500/50"></span> Boost
                </span>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- Execution Trace -->
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-300 mb-2">Execution Trace</h2>
        <div class="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden max-h-96 overflow-y-auto">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-gray-900">
              <tr class="border-b border-gray-800 text-gray-400">
                <th class="text-left px-3 py-1.5 font-medium w-16">Time</th>
                <th class="text-left px-3 py-1.5 font-medium">Event</th>
              </tr>
            </thead>
            <tbody>
              {#each result.trace as ev}
                <tr
                  class="border-b border-gray-800/50 hover:bg-gray-800/30
                    {ev.type === 'BOOST' ? 'bg-yellow-900/10' : ''}
                    {ev.type === 'FINISHED' ? 'bg-emerald-900/10' : ''}
                    {ev.type === 'IDLE' ? 'text-gray-600' : ''}"
                >
                  <td class="px-3 py-0.5 font-mono text-gray-300 text-xs">{ev.time}</td>
                  <td class="px-3 py-0.5 text-xs">
                    {#if ev.jobId >= 0 && ev.type !== "IDLE" && ev.type !== "BOOST"}
                      <span
                        class="inline-block w-2 h-2 rounded-sm {jobColors[
                          ev.jobId % jobColors.length
                        ]} mr-1"
                      ></span>
                    {/if}
                    {traceLabel(ev)}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Statistics -->
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-300 mb-2">Final Statistics</h2>
        <div class="rounded-lg bg-gray-900 border border-gray-800 overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-800 text-gray-400">
                <th class="text-left px-3 py-1.5 font-medium">Job</th>
                <th class="text-right px-3 py-1.5 font-medium">Start</th>
                <th class="text-right px-3 py-1.5 font-medium">Response</th>
                <th class="text-right px-3 py-1.5 font-medium">Turnaround</th>
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
                  <td class="px-3 py-1 text-right font-mono text-gray-300">{stat.startTime}</td>
                  <td class="px-3 py-1 text-right font-mono text-gray-300">{stat.response}</td>
                  <td class="px-3 py-1 text-right font-mono text-gray-300">{stat.turnaround}</td>
                </tr>
              {/each}
              <tr class="bg-gray-800/50 font-medium">
                <td class="px-3 py-1.5">Average</td>
                <td class="px-3 py-1.5"></td>
                <td class="px-3 py-1.5 text-right font-mono">{fmt(result.avgResponse)}</td>
                <td class="px-3 py-1.5 text-right font-mono">{fmt(result.avgTurnaround)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>
