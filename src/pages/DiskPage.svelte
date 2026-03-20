<script lang="ts">
  import { simulateDisk, type DiskPolicy, type DiskResult, type BlockInfo } from '../lib/simulators/disk';

  // Controls
  let addr = $state("0,6,30");
  let numRequests = $state(5);
  let seed = $state(0);
  let useRandom = $state(false);
  let policy: DiskPolicy = $state("FIFO");
  let seekSpeed = $state(1);
  let rotateSpeed = $state(1);
  let skew = $state(0);
  let window = $state(-1);
  let zoning = $state("30,30,30");
  let showAnswer = $state(false);

  let result: DiskResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    try {
      error = null;
      const opts = {
        addr: useRandom ? "-1" : addr,
        addrDesc: `${numRequests},-1,0`,
        seekSpeed,
        rotateSpeed,
        policy,
        skew,
        window,
        seed,
        zoning,
      };
      result = simulateDisk(opts);
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  // Run on mount
  run();

  // Disk visualization helpers
  const CX = 180;
  const CY = 180;
  const TRACK_RADII = [130, 100, 70]; // outer, middle, inner

  function blockPos(block: BlockInfo, diskAngle: number): { x: number; y: number } {
    const r = TRACK_RADII[block.track];
    // Subtract diskAngle to show rotation; angles in the Python model go clockwise
    const a = ((block.angle - diskAngle + 180 + 360) % 360) * (Math.PI / 180);
    return {
      x: CX + r * Math.cos(a),
      y: CY + r * Math.sin(a),
    };
  }
</script>

<div class="max-w-6xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Disk Scheduling Simulator</h1>
  <p class="text-gray-400 text-sm mb-6">
    Simulates a disk with 3 tracks and configurable scheduling policies (FIFO, SSTF, SATF, BSATF).
    Based on the OSTEP <code class="text-gray-300">disk.py</code> homework.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Address mode</span>
      <select
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100"
        bind:value={useRandom}
        onchange={run}
      >
        <option value={false}>Explicit addresses</option>
        <option value={true}>Random</option>
      </select>
    </label>

    {#if useRandom}
      <label class="block">
        <span class="text-xs text-gray-400 uppercase tracking-wide">Seed</span>
        <input
          type="number" min="0"
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100"
          bind:value={seed}
          onchange={run}
        />
      </label>
      <label class="block">
        <span class="text-xs text-gray-400 uppercase tracking-wide">Num requests</span>
        <input
          type="number" min="1" max="20"
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100"
          bind:value={numRequests}
          onchange={run}
        />
      </label>
    {:else}
      <label class="block">
        <span class="text-xs text-gray-400 uppercase tracking-wide">Addresses (comma-sep)</span>
        <input
          type="text"
          class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100"
          bind:value={addr}
          onchange={run}
        />
      </label>
    {/if}

    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Policy</span>
      <select
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100"
        bind:value={policy}
        onchange={run}
      >
        <option value="FIFO">FIFO</option>
        <option value="SSTF">SSTF</option>
        <option value="SATF">SATF</option>
        <option value="BSATF">BSATF</option>
      </select>
    </label>

    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Seek speed</span>
      <input
        type="number" min="0.5" max="10" step="0.5"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100"
        bind:value={seekSpeed}
        onchange={run}
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Rotate speed</span>
      <input
        type="number" min="0.5" max="10" step="0.5"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100"
        bind:value={rotateSpeed}
        onchange={run}
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Skew (blocks)</span>
      <input
        type="number" min="0" max="11"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100"
        bind:value={skew}
        onchange={run}
      />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Sched window (-1 = all)</span>
      <input
        type="number" min="-1" max="20"
        class="mt-1 block w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100"
        bind:value={window}
        onchange={run}
      />
    </label>
  </div>

  <div class="flex gap-3 mb-6">
    <button
      class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer"
      onclick={run}
    >
      Run
    </button>
    <button
      class="px-4 py-2 rounded text-sm font-medium transition-colors cursor-pointer
        {showAnswer ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}"
      onclick={() => { showAnswer = !showAnswer; }}
    >
      {showAnswer ? 'Hide Answers' : 'Show Answers'}
    </button>
  </div>

  {#if error}
    <div class="bg-red-900/50 border border-red-700 rounded p-3 mb-4 text-sm text-red-200">{error}</div>
  {/if}

  {#if result}
    <!-- Request queue -->
    <div class="mb-6">
      <h2 class="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Request Queue</h2>
      <div class="flex flex-wrap gap-2">
        {#each result.requests as block, i}
          <div class="w-10 h-10 rounded border border-gray-600 bg-gray-800 flex items-center justify-center text-sm font-mono
            {showAnswer && result.results[i] ? '' : ''}">
            {block}
          </div>
        {/each}
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <!-- Disk visualization -->
      <div>
        <h2 class="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">Disk Layout</h2>
        <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <svg viewBox="0 0 360 360" class="w-full max-w-sm mx-auto">
            <!-- Platter -->
            <circle cx={CX} cy={CY} r="150" fill="#1f2937" stroke="#4b5563" stroke-width="1" />

            <!-- Tracks -->
            {#each TRACK_RADII as r}
              <circle cx={CX} cy={CY} {r} fill="none" stroke="#6b7280" stroke-width="1" stroke-dasharray="2,4" />
            {/each}

            <!-- Track labels -->
            <text x={CX + TRACK_RADII[0] + 8} y={CY + 4} fill="#9ca3af" font-size="10">T0</text>
            <text x={CX + TRACK_RADII[1] + 8} y={CY + 4} fill="#9ca3af" font-size="10">T1</text>
            <text x={CX + TRACK_RADII[2] + 8} y={CY + 4} fill="#9ca3af" font-size="10">T2</text>

            <!-- Spindle -->
            <circle cx={CX} cy={CY} r="4" fill="#f59e0b" stroke="#000" stroke-width="0.5" />

            <!-- Blocks -->
            {#each result.blockInfoList as block}
              {@const pos = blockPos(block, 0)}
              {@const isRequested = result.requests.includes(block.name)}
              <text
                x={pos.x}
                y={pos.y}
                text-anchor="middle"
                dominant-baseline="central"
                font-size={isRequested ? "11" : "9"}
                font-weight={isRequested ? "bold" : "normal"}
                fill={isRequested ? "#fbbf24" : "#9ca3af"}
              >
                {block.name}
              </text>
              {#if isRequested}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="10"
                  fill="none"
                  stroke="#f59e0b"
                  stroke-width="1.5"
                  opacity="0.6"
                />
              {/if}
            {/each}

            <!-- Arm indicator at track 0 top -->
            <line x1={CX} y1={CY - 155} x2={CX} y2={CY - TRACK_RADII[0] + 10} stroke="#9ca3af" stroke-width="2" />
            <rect x={CX - 8} y={CY - TRACK_RADII[0] - 6} width="16" height="12" rx="2" fill="#6b7280" stroke="#9ca3af" stroke-width="0.5" />
          </svg>
        </div>
      </div>

      <!-- Results table -->
      <div>
        <h2 class="text-sm font-semibold text-gray-300 mb-2 uppercase tracking-wide">
          {showAnswer ? 'Per-Request Timing' : 'Compute the answers below'}
        </h2>
        <div class="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-700 text-gray-400 text-xs uppercase tracking-wider">
                <th class="px-3 py-2 text-left">#</th>
                <th class="px-3 py-2 text-left">Block</th>
                <th class="px-3 py-2 text-right">Seek</th>
                <th class="px-3 py-2 text-right">Rotate</th>
                <th class="px-3 py-2 text-right">Transfer</th>
                <th class="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {#each result.results as r, i}
                <tr class="border-b border-gray-800 hover:bg-gray-800/50">
                  <td class="px-3 py-2 text-gray-500">{i + 1}</td>
                  <td class="px-3 py-2 font-mono">{r.block}</td>
                  {#if showAnswer}
                    <td class="px-3 py-2 text-right font-mono text-amber-400">{r.seekTime}</td>
                    <td class="px-3 py-2 text-right font-mono text-sky-400">{r.rotateTime}</td>
                    <td class="px-3 py-2 text-right font-mono text-green-400">{r.transferTime}</td>
                    <td class="px-3 py-2 text-right font-mono font-semibold text-gray-100">{r.totalTime}</td>
                  {:else}
                    <td class="px-3 py-2 text-right text-gray-600">?</td>
                    <td class="px-3 py-2 text-right text-gray-600">?</td>
                    <td class="px-3 py-2 text-right text-gray-600">?</td>
                    <td class="px-3 py-2 text-right text-gray-600">?</td>
                  {/if}
                </tr>
              {/each}
            </tbody>
            {#if showAnswer}
              <tfoot>
                <tr class="border-t-2 border-gray-600 font-semibold">
                  <td class="px-3 py-2" colspan="2">TOTAL</td>
                  <td class="px-3 py-2 text-right font-mono text-amber-400">{result.totalSeek}</td>
                  <td class="px-3 py-2 text-right font-mono text-sky-400">{result.totalRotate}</td>
                  <td class="px-3 py-2 text-right font-mono text-green-400">{result.totalTransfer}</td>
                  <td class="px-3 py-2 text-right font-mono text-gray-100">{result.totalTime}</td>
                </tr>
              </tfoot>
            {/if}
          </table>
        </div>

        {#if showAnswer}
          <!-- Timing bar chart -->
          <h2 class="text-sm font-semibold text-gray-300 mt-4 mb-2 uppercase tracking-wide">Time Breakdown</h2>
          <div class="bg-gray-900 border border-gray-800 rounded-lg p-4">
            {#each result.results as r, i}
              {@const maxTime = Math.max(...result.results.map(x => x.totalTime), 1)}
              <div class="mb-2">
                <div class="text-xs text-gray-400 mb-0.5 font-mono">Block {r.block}</div>
                <div class="flex h-5 rounded overflow-hidden bg-gray-800" style="width: {(r.totalTime / maxTime) * 100}%">
                  {#if r.seekTime > 0}
                    <div
                      class="bg-amber-500/80 flex items-center justify-center text-[9px] text-black font-semibold"
                      style="width: {(r.seekTime / r.totalTime) * 100}%"
                      title="Seek: {r.seekTime}"
                    >
                      {r.seekTime > 20 ? r.seekTime : ''}
                    </div>
                  {/if}
                  {#if r.rotateTime > 0}
                    <div
                      class="bg-sky-500/80 flex items-center justify-center text-[9px] text-black font-semibold"
                      style="width: {(r.rotateTime / r.totalTime) * 100}%"
                      title="Rotate: {r.rotateTime}"
                    >
                      {r.rotateTime > 20 ? r.rotateTime : ''}
                    </div>
                  {/if}
                  <div
                    class="bg-green-500/80 flex items-center justify-center text-[9px] text-black font-semibold"
                    style="width: {(r.transferTime / r.totalTime) * 100}%"
                    title="Transfer: {r.transferTime}"
                  >
                    {r.transferTime > 20 ? r.transferTime : ''}
                  </div>
                </div>
              </div>
            {/each}
            <div class="flex gap-4 mt-3 text-xs text-gray-400">
              <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-amber-500/80 inline-block"></span> Seek</span>
              <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-sky-500/80 inline-block"></span> Rotate</span>
              <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-500/80 inline-block"></span> Transfer</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
