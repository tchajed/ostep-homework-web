<script lang="ts">
  import {
    simulate,
    defaultParams,
    pageStateChar,
    isPageLive,
    PageState,
    type SsdParams,
    type SsdResult,
    type SsdType,
  } from '../lib/simulators/ssd';

  let seed = $state(defaultParams.seed);
  let numCmds = $state(defaultParams.numCmds);
  let opPercentages = $state(defaultParams.opPercentages);
  let skew = $state(defaultParams.skew);
  let skewStart = $state(defaultParams.skewStart);
  let readFail = $state(defaultParams.readFail);
  let cmdList = $state(defaultParams.cmdList);
  let ssdType = $state<SsdType>(defaultParams.ssdType);
  let numLogicalPages = $state(defaultParams.numLogicalPages);
  let numBlocks = $state(defaultParams.numBlocks);
  let pagesPerBlock = $state(defaultParams.pagesPerBlock);
  let highWaterMark = $state(defaultParams.highWaterMark);
  let lowWaterMark = $state(defaultParams.lowWaterMark);
  let eraseTime = $state(defaultParams.eraseTime);
  let programTime = $state(defaultParams.programTime);
  let readTime = $state(defaultParams.readTime);
  let showSolution = $state(false);

  let result: SsdResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    error = null;
    try {
      const params: SsdParams = {
        seed,
        numCmds,
        opPercentages,
        skew,
        skewStart,
        readFail,
        cmdList,
        ssdType,
        numLogicalPages,
        numBlocks,
        pagesPerBlock,
        highWaterMark,
        lowWaterMark,
        eraseTime,
        programTime,
        readTime,
      };
      result = simulate(params);
    } catch (e: any) {
      error = e.message ?? String(e);
      result = null;
    }
  }

  // Run on mount
  run();

  function stateColor(s: PageState): string {
    switch (s) {
      case PageState.Invalid: return 'text-gray-500';
      case PageState.Erased:  return 'text-yellow-400';
      case PageState.Valid:   return 'text-green-400';
    }
  }

  function ftlEntries(forwardMap: number[]): [number, number][] {
    const entries: [number, number][] = [];
    for (let i = 0; i < forwardMap.length; i++) {
      if (forwardMap[i] !== -1) {
        entries.push([i, forwardMap[i]]);
      }
    }
    return entries;
  }
</script>

<div class="max-w-6xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Flash-Based SSDs</h1>
  <p class="text-gray-400 mb-6 text-sm">
    Simulate SSD behavior with different FTL strategies: direct-mapped, log-structured, and ideal.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
    <label class="block">
      <span class="text-xs text-gray-400">Seed</span>
      <input type="number" bind:value={seed} class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">SSD Type</span>
      <select bind:value={ssdType} class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100">
        <option value="direct">Direct</option>
        <option value="log">Log</option>
        <option value="ideal">Ideal</option>
      </select>
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Num Commands</span>
      <input type="number" bind:value={numCmds} min="1" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Op Percentages (R/W/T)</span>
      <input type="text" bind:value={opPercentages} class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Logical Pages</span>
      <input type="number" bind:value={numLogicalPages} min="1" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Blocks</span>
      <input type="number" bind:value={numBlocks} min="1" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Pages/Block</span>
      <input type="number" bind:value={pagesPerBlock} min="1" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">GC High Water</span>
      <input type="number" bind:value={highWaterMark} min="1" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">GC Low Water</span>
      <input type="number" bind:value={lowWaterMark} min="1" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Erase Time (us)</span>
      <input type="number" bind:value={eraseTime} min="0" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Program Time (us)</span>
      <input type="number" bind:value={programTime} min="0" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Read Time (us)</span>
      <input type="number" bind:value={readTime} min="0" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Skew (%/%)</span>
      <input type="text" bind:value={skew} placeholder="e.g. 80/20" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Skew Start</span>
      <input type="number" bind:value={skewStart} min="0" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block">
      <span class="text-xs text-gray-400">Read Fail %</span>
      <input type="number" bind:value={readFail} min="0" max="100" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
    <label class="block col-span-2 sm:col-span-3">
      <span class="text-xs text-gray-400">Command List (overrides random)</span>
      <input type="text" bind:value={cmdList} placeholder="e.g. w0:a,w1:b,r0,t1" class="w-full mt-0.5 px-2 py-1 rounded bg-gray-800 border border-gray-700 text-sm text-gray-100" />
    </label>
  </div>

  <div class="flex gap-3 mb-6">
    <button
      onclick={run}
      class="px-4 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white cursor-pointer"
    >
      Run
    </button>
    <button
      onclick={() => showSolution = !showSolution}
      class="px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium text-gray-200 cursor-pointer"
    >
      {showSolution ? 'Hide Solution' : 'Show Solution'}
    </button>
  </div>

  {#if error}
    <div class="mb-4 p-3 rounded bg-red-900/40 border border-red-700 text-red-300 text-sm">{error}</div>
  {/if}

  {#if result}
    <!-- Commands -->
    <section class="mb-6">
      <h2 class="text-lg font-semibold mb-2">Commands</h2>
      <div class="bg-gray-900 rounded border border-gray-800 p-3 font-mono text-xs overflow-x-auto max-h-64 overflow-y-auto">
        {#each result.cmds as cmd}
          <div class="py-0.5">
            <span class="text-gray-500">cmd {String(cmd.op).padStart(3)}::</span>
            {#if cmd.type === 'write'}
              <span class="text-blue-400">write({cmd.address}, {cmd.data})</span>
              {#if showSolution}
                <span class="text-gray-400"> -&gt; </span><span class="{cmd.result === 'success' ? 'text-green-400' : 'text-red-400'}">{cmd.result}</span>
              {:else}
                <span class="text-gray-500"> -&gt; ??</span>
              {/if}
            {:else if cmd.type === 'read'}
              <span class="text-emerald-400">read({cmd.address})</span>
              {#if showSolution}
                <span class="text-gray-400"> -&gt; </span><span class="{cmd.result.startsWith('fail') ? 'text-red-400' : 'text-green-400'}">{cmd.result}</span>
              {:else}
                <span class="text-gray-500"> -&gt; ??</span>
              {/if}
            {:else}
              <span class="text-yellow-400">trim({cmd.address})</span>
              {#if showSolution}
                <span class="text-gray-400"> -&gt; </span><span class="{cmd.result === 'success' ? 'text-green-400' : 'text-red-400'}">{cmd.result}</span>
              {:else}
                <span class="text-gray-500"> -&gt; ??</span>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- Flash State Visualization -->
    {#if showSolution}
      {@const snap = result.finalSnapshot}
      {@const numPages = numBlocks * pagesPerBlock}
      <section class="mb-6">
        <h2 class="text-lg font-semibold mb-2">Flash State (Final)</h2>
        <div class="bg-gray-900 rounded border border-gray-800 p-3 font-mono text-xs overflow-x-auto">
          <!-- FTL -->
          <div class="mb-2">
            <span class="text-gray-400">FTL  </span>
            {#each [ftlEntries(snap.forwardMap)] as entries}
              {#if entries.length === 0}
                <span class="text-gray-500">(empty)</span>
              {:else}
                {#each entries as [lp, pp]}
                  <span class="text-cyan-400">{String(lp).padStart(3)}:{String(pp).padStart(3)}</span><span class="text-gray-700"> </span>
                {/each}
              {/if}
            {/each}
          </div>

          <!-- Block headers -->
          <div class="mb-1">
            <span class="text-gray-400">Block</span>
            {#each Array(numBlocks) as _, b}
              <span class="text-gray-300 ml-1">{String(b).padEnd(pagesPerBlock + 1)}</span>
            {/each}
          </div>

          <!-- State row -->
          <div>
            <span class="text-gray-400">State</span>
            {#each Array(numPages) as _, i}
              {#if i > 0 && i % pagesPerBlock === 0}<span class="text-gray-800"> </span>{/if}
              <span class="{stateColor(snap.state[i])}">{pageStateChar(snap.state[i])}</span>
            {/each}
          </div>

          <!-- Data row -->
          <div>
            <span class="text-gray-400">Data </span>
            {#each Array(numPages) as _, i}
              {#if i > 0 && i % pagesPerBlock === 0}<span class="text-gray-800"> </span>{/if}
              {#if snap.state[i] === PageState.Valid}
                <span class="text-white">{snap.data[i]}</span>
              {:else}
                <span class="text-gray-800">.</span>
              {/if}
            {/each}
          </div>

          <!-- Live row -->
          <div>
            <span class="text-gray-400">Live </span>
            {#each Array(numPages) as _, i}
              {#if i > 0 && i % pagesPerBlock === 0}<span class="text-gray-800"> </span>{/if}
              {#if isPageLive(snap, i)}
                <span class="text-green-400">+</span>
              {:else}
                <span class="text-gray-800">.</span>
              {/if}
            {/each}
          </div>
        </div>
      </section>

      <!-- GC Events -->
      {#if result.gcEvents.length > 0}
        <section class="mb-6">
          <h2 class="text-lg font-semibold mb-2">Garbage Collection Events</h2>
          <div class="bg-gray-900 rounded border border-gray-800 p-3 font-mono text-xs overflow-x-auto max-h-48 overflow-y-auto">
            {#each result.gcEvents as evt}
              <div class="py-0.5 text-orange-400">gc {evt.gcCount}:: {evt.action}</div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Wear Statistics -->
      <section class="mb-6">
        <h2 class="text-lg font-semibold mb-2">Statistics</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Per-block stats -->
          <div class="bg-gray-900 rounded border border-gray-800 p-3">
            <h3 class="text-sm font-semibold text-gray-300 mb-2">Physical Operations Per Block</h3>
            <div class="overflow-x-auto">
              <table class="text-xs font-mono w-full">
                <thead>
                  <tr class="text-gray-500">
                    <th class="text-left pr-3">Block</th>
                    {#each snap.blockStats as _, b}
                      <th class="text-right px-1">{b}</th>
                    {/each}
                    <th class="text-right pl-3">Sum</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="text-gray-400 pr-3">Erases</td>
                    {#each snap.blockStats as bs}
                      <td class="text-right px-1 text-red-300">{bs.erases}</td>
                    {/each}
                    <td class="text-right pl-3 text-gray-200">{result.physicalEraseSum}</td>
                  </tr>
                  <tr>
                    <td class="text-gray-400 pr-3">Writes</td>
                    {#each snap.blockStats as bs}
                      <td class="text-right px-1 text-blue-300">{bs.writes}</td>
                    {/each}
                    <td class="text-right pl-3 text-gray-200">{result.physicalWriteSum}</td>
                  </tr>
                  <tr>
                    <td class="text-gray-400 pr-3">Reads</td>
                    {#each snap.blockStats as bs}
                      <td class="text-right px-1 text-green-300">{bs.reads}</td>
                    {/each}
                    <td class="text-right pl-3 text-gray-200">{result.physicalReadSum}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Logical operation counts and timing -->
          <div class="bg-gray-900 rounded border border-gray-800 p-3">
            <h3 class="text-sm font-semibold text-gray-300 mb-2">Logical Operation Sums</h3>
            <div class="text-xs font-mono space-y-1">
              <div><span class="text-gray-400">Write count</span> <span class="text-gray-200">{result.logicalWriteSum}</span> <span class="text-gray-500">({result.logicalWriteFailSum} failed)</span></div>
              <div><span class="text-gray-400">Read count </span> <span class="text-gray-200">{result.logicalReadSum}</span> <span class="text-gray-500">({result.logicalReadFailSum} failed)</span></div>
              <div><span class="text-gray-400">Trim count </span> <span class="text-gray-200">{result.logicalTrimSum}</span> <span class="text-gray-500">({result.logicalTrimFailSum} failed)</span></div>
            </div>
            <h3 class="text-sm font-semibold text-gray-300 mt-3 mb-2">Times (microseconds)</h3>
            <div class="text-xs font-mono space-y-1">
              <div><span class="text-gray-400">Erase time</span> <span class="text-gray-200">{result.eraseTime.toFixed(2)}</span></div>
              <div><span class="text-gray-400">Write time</span> <span class="text-gray-200">{result.writeTime.toFixed(2)}</span></div>
              <div><span class="text-gray-400">Read time </span> <span class="text-gray-200">{result.readTimeTotal.toFixed(2)}</span></div>
              <div><span class="text-gray-400">Total time</span> <span class="font-semibold text-white">{result.totalTime.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Wear Bar Chart -->
      <section class="mb-6">
        <h2 class="text-lg font-semibold mb-2">Block Erase Wear</h2>
        <div class="bg-gray-900 rounded border border-gray-800 p-3">
          {#each [Math.max(1, ...snap.blockStats.map(b => b.erases))] as maxErases}
            <div class="flex items-end gap-1 h-24">
              {#each snap.blockStats as bs, b}
                <div class="flex-1 flex flex-col items-center">
                  <div
                    class="w-full bg-red-500/70 rounded-t transition-all"
                    style="height: {(bs.erases / maxErases) * 100}%"
                  ></div>
                  <span class="text-[10px] text-gray-500 mt-0.5">{b}</span>
                  <span class="text-[10px] text-gray-400">{bs.erases}</span>
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>
