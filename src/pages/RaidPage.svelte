<script lang="ts">
  import {
    simulate,
    computeDiskLayout,
    defaultParams,
    type RaidParams,
    type RaidLevel,
    type Raid5Type,
    type Workload,
    type RaidResult,
    type PhysicalOp,
  } from '../lib/simulators/raid';

  let seed = $state(defaultParams.seed);
  let numDisks = $state(defaultParams.numDisks);
  let chunkSize = $state(defaultParams.chunkSize);
  let numRequests = $state(defaultParams.numRequests);
  let reqSize = $state(defaultParams.reqSize);
  let workload: Workload = $state(defaultParams.workload);
  let writeFrac = $state(defaultParams.writeFrac);
  let randRange = $state(defaultParams.randRange);
  let level: RaidLevel = $state(defaultParams.level);
  let raid5type: Raid5Type = $state(defaultParams.raid5type);

  let showAnswers = $state(false);
  let result: RaidResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    try {
      error = null;
      result = simulate({
        seed,
        numDisks,
        chunkSize,
        numRequests,
        reqSize,
        workload,
        writeFrac,
        randRange,
        level,
        raid5type,
      });
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  run();

  // Disk layout for visualization (show a few stripes)
  let layoutStripes = $derived.by(() => {
    if (!result) return [];
    return computeDiskLayout(result.params, Math.min(8, Math.ceil(24 / result.params.numDisks)));
  });

  function opsForDisk(ops: PhysicalOp[], diskIdx: number): PhysicalOp[] {
    return ops.filter(op => op.disk === diskIdx);
  }

  function formatOp(op: PhysicalOp): string {
    return `${op.type} [disk ${op.disk}, offset ${op.offset}]`;
  }

  function opColor(op: PhysicalOp): string {
    return op.type === 'read' ? 'text-green-400' : 'text-yellow-400';
  }

  // Capacity info
  let usableDisks = $derived(
    level === 0 ? numDisks :
    level === 1 ? numDisks / 2 :
    numDisks - 1 // RAID-4/5
  );
</script>

<div class="max-w-5xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">RAID</h1>
  <p class="text-gray-400 text-sm">
    Simulate RAID levels 0 (striping), 1 (mirroring), 4 (dedicated parity), and 5 (rotated parity).
    See how logical block addresses map to physical disk locations, and how reads and writes
    translate into physical I/O operations.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
    <label class="flex flex-col text-sm text-gray-400">
      RAID Level
      <select bind:value={level}
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full">
        <option value={0}>RAID-0 (Stripe)</option>
        <option value={1}>RAID-1 (Mirror)</option>
        <option value={4}>RAID-4 (Parity)</option>
        <option value={5}>RAID-5 (Rotated Parity)</option>
      </select>
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Seed
      <input type="number" bind:value={seed} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Num Disks
      <input type="number" bind:value={numDisks} min="2" max="16"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Chunk Size (blocks)
      <input type="number" bind:value={chunkSize} min="1" max="64"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Num Requests
      <input type="number" bind:value={numRequests} min="1" max="100"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Request Size (blocks)
      <input type="number" bind:value={reqSize} min="1" max="64"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Workload
      <select bind:value={workload}
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full">
        <option value="rand">Random</option>
        <option value="seq">Sequential</option>
      </select>
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Write % (0-100)
      <input type="number" bind:value={writeFrac} min="0" max="100"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    {#if workload === 'rand'}
      <label class="flex flex-col text-sm text-gray-400">
        Rand Range
        <input type="number" bind:value={randRange} min="1"
          class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
      </label>
    {/if}
    {#if level === 5}
      <label class="flex flex-col text-sm text-gray-400">
        RAID-5 Layout
        <select bind:value={raid5type}
          class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full">
          <option value="LS">Left-Symmetric</option>
          <option value="LA">Left-Asymmetric</option>
        </select>
      </label>
    {/if}
  </div>

  <div class="flex gap-3 items-center">
    <button
      onclick={run}
      class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium cursor-pointer"
    >
      Simulate
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
    <!-- RAID info summary -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-1 text-sm font-mono">
      <h2 class="text-base font-semibold text-gray-200 mb-2 font-sans">Configuration</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
        <p><span class="text-gray-500">RAID Level:</span> {level}</p>
        <p><span class="text-gray-500">Num Disks:</span> {result.params.numDisks}</p>
        <p><span class="text-gray-500">Chunk Size:</span> {result.params.chunkSize} block{result.params.chunkSize > 1 ? 's' : ''}</p>
        <p><span class="text-gray-500">Usable Capacity:</span> {usableDisks}x disk capacity</p>
        <p><span class="text-gray-500">Workload:</span> {result.params.workload}</p>
        <p><span class="text-gray-500">Write Frac:</span> {result.params.writeFrac}%</p>
      </div>
    </div>

    <!-- Disk layout visualization -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4">
      <h2 class="text-base font-semibold text-gray-200 mb-3">
        Disk Layout
        <span class="text-sm font-normal text-gray-500">(first few stripes)</span>
      </h2>
      <div class="overflow-x-auto">
        <table class="text-sm font-mono border-collapse">
          <thead>
            <tr>
              <th class="py-1 px-2 text-gray-500 text-left">Stripe</th>
              {#each Array(result.params.numDisks) as _, d}
                <th class="py-1 px-2 text-gray-500 text-center" colspan={result.params.chunkSize}>
                  Disk {d}
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each layoutStripes as row, s}
              <tr class="border-t border-gray-800/50">
                <td class="py-1 px-2 text-gray-500">{s}</td>
                {#each row as cell}
                  <td class="py-1 px-2 text-center {cell.isParity ? 'bg-purple-900/30 text-purple-300' : 'text-gray-300'}">
                    {cell.label}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if level >= 4}
        <p class="mt-2 text-xs text-gray-500">
          <span class="text-purple-300">P#</span> = parity block for stripe #
        </p>
      {/if}
    </div>

    <!-- Requests -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4">
      <h2 class="text-base font-semibold text-gray-200 mb-3">I/O Requests</h2>
      <div class="space-y-3">
        {#each result.requests as req, i}
          <div class="border border-gray-800 rounded p-3">
            <div class="flex items-center gap-3 mb-1">
              <span class="text-gray-500 text-sm font-mono">#{i}</span>
              <span class="font-mono text-sm {req.isWrite ? 'text-yellow-300' : 'text-green-300'}">
                LOGICAL {req.isWrite ? 'WRITE' : 'READ'}
              </span>
              <span class="font-mono text-sm text-gray-300">
                addr:{req.logicalAddr} size:{req.size * 4096}
              </span>
            </div>
            {#if showAnswers}
              <div class="ml-6 space-y-0.5">
                {#each req.ops as op}
                  <div class="font-mono text-xs {opColor(op)}">
                    {formatOp(op)}
                  </div>
                {/each}
              </div>
            {:else}
              <div class="ml-6 text-sm text-yellow-400/70 font-mono">
                Physical reads/writes?
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Per-disk I/O summary (when answers shown) -->
    {#if showAnswers}
      <div class="rounded bg-gray-900 border border-gray-800 p-4">
        <h2 class="text-base font-semibold text-gray-200 mb-3">Per-Disk I/O Summary</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm font-mono">
            <thead>
              <tr class="text-gray-500 text-left border-b border-gray-800">
                <th class="py-1 pr-4">Disk</th>
                <th class="py-1 pr-4">Reads</th>
                <th class="py-1 pr-4">Writes</th>
                <th class="py-1">Total I/Os</th>
              </tr>
            </thead>
            <tbody>
              {#each Array(result.params.numDisks) as _, d}
                {@const allOps = result.requests.flatMap(r => r.ops).filter(op => op.disk === d)}
                {@const reads = allOps.filter(op => op.type === 'read').length}
                {@const writes = allOps.filter(op => op.type === 'write').length}
                <tr class="border-b border-gray-800/50">
                  <td class="py-1.5 pr-4 text-gray-400">Disk {d}</td>
                  <td class="py-1.5 pr-4 text-green-400">{reads}</td>
                  <td class="py-1.5 pr-4 text-yellow-400">{writes}</td>
                  <td class="py-1.5 text-gray-300">{reads + writes}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>
