<script lang="ts">
  import {
    simulate,
    parseCommands,
    defaultParams,
    bitmapChar,
    isFree,
    presets,
    type FfsParams,
    type FfsState,
    type FileOp,
  } from '../lib/simulators/ffs';

  let numGroups = $state(defaultParams.numGroups);
  let blocksPerGroup = $state(defaultParams.blocksPerGroup);
  let inodesPerGroup = $state(defaultParams.inodesPerGroup);
  let largeFileException = $state(defaultParams.largeFileException);
  let spreadInodes = $state(defaultParams.spreadInodes);
  let contigAllocationPolicy = $state(defaultParams.contigAllocationPolicy);
  let spreadDataBlocks = $state(defaultParams.spreadDataBlocks);
  let allocateFaraway = $state(defaultParams.allocateFaraway);

  let commandText = $state(presets[0].commands);
  let showAnswers = $state(false);
  let showSpans = $state(false);

  let result: FfsState | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    try {
      error = null;
      const ops = parseCommands(commandText);
      const params: FfsParams = {
        numGroups,
        blocksPerGroup,
        inodesPerGroup,
        largeFileException,
        spreadInodes,
        contigAllocationPolicy,
        spreadDataBlocks,
        allocateFaraway,
      };
      result = simulate(params, ops);
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  function loadPreset(idx: number) {
    commandText = presets[idx].commands;
    run();
  }

  // Run on mount
  run();

  // Color palette for symbols (cycling through distinct colors)
  const symbolColors = [
    'text-blue-400', 'text-green-400', 'text-yellow-400', 'text-pink-400',
    'text-purple-400', 'text-cyan-400', 'text-orange-400', 'text-red-400',
    'text-lime-400', 'text-emerald-400', 'text-indigo-400', 'text-rose-400',
    'text-teal-400', 'text-amber-400', 'text-fuchsia-400', 'text-sky-400',
  ];

  function symbolColor(sym: string): string {
    if (sym === '-' || sym === '?') return 'text-gray-600';
    const code = sym.charCodeAt(0);
    return symbolColors[code % symbolColors.length];
  }
</script>

<div class="max-w-6xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">Fast File System (FFS)</h1>
  <p class="text-gray-400 text-sm">
    Explore the Berkeley Fast File System allocation policies. FFS uses cylinder groups
    to keep related data close together on disk. Directory inodes are spread across groups,
    while file inodes and data blocks are placed near their parent directory.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
    <label class="flex flex-col text-sm text-gray-400">
      Groups
      <input type="number" bind:value={numGroups} min="1" max="50"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Blocks/Group
      <input type="number" bind:value={blocksPerGroup} min="1" max="100"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Inodes/Group
      <input type="number" bind:value={inodesPerGroup} min="1" max="50"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Large File Exception
      <input type="number" bind:value={largeFileException} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Contig Alloc Policy
      <input type="number" bind:value={contigAllocationPolicy} min="1"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Allocate Faraway
      <input type="number" bind:value={allocateFaraway} min="1"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer mt-5">
      <input type="checkbox" bind:checked={spreadInodes}
        class="rounded bg-gray-800 border-gray-600" />
      Spread Inodes
    </label>
    <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer mt-5">
      <input type="checkbox" bind:checked={spreadDataBlocks}
        class="rounded bg-gray-800 border-gray-600" />
      Spread Data Blocks
    </label>
  </div>

  <!-- Command input -->
  <div class="space-y-2">
    <div class="flex items-center gap-3">
      <span class="text-sm text-gray-400 font-medium">Commands</span>
      <select
        aria-label="Load preset commands"
        onchange={(e) => {
          const idx = parseInt((e.target as HTMLSelectElement).value);
          if (!isNaN(idx)) loadPreset(idx);
        }}
        class="text-sm rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-300"
      >
        <option value="">Load preset...</option>
        {#each presets as preset, i}
          <option value={i}>{preset.name}</option>
        {/each}
      </select>
    </div>
    <textarea
      bind:value={commandText}
      rows="8"
      class="w-full rounded bg-gray-800 border border-gray-700 px-3 py-2 text-gray-100 text-sm font-mono resize-y"
      placeholder="dir /a&#10;file /a/b 3&#10;delete /a/b"
    ></textarea>
    <p class="text-xs text-gray-500">
      Commands: <code class="text-gray-400">dir /path</code>,
      <code class="text-gray-400">file /path size</code>,
      <code class="text-gray-400">delete /path</code>
    </p>
  </div>

  <div class="flex gap-3 items-center flex-wrap">
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
    <label class="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
      <input type="checkbox" bind:checked={showSpans}
        class="rounded bg-gray-800 border-gray-600" />
      Show Spans
    </label>
  </div>

  {#if error}
    <div class="rounded bg-red-900/40 border border-red-700 p-3 text-red-300 text-sm">
      {error}
    </div>
  {/if}

  {#if result}
    <!-- Operation Log -->
    {#if result.opResults.length > 0}
      <div class="rounded bg-gray-900 border border-gray-800 p-4">
        <h2 class="text-base font-semibold text-gray-200 mb-2">Operations</h2>
        <div class="space-y-0.5 text-sm font-mono">
          {#each result.opResults as r}
            <div class="flex gap-2">
              <span class="text-gray-400">
                {r.op.kind} {r.op.path}{r.op.size != null ? ` [size:${r.op.size}]` : ''}
              </span>
              <span>-&gt;</span>
              {#if r.success}
                <span class="text-green-400">success</span>
              {:else}
                <span class="text-red-400">failed{r.message ? `: ${r.message}` : ''}</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Summary -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-1 text-sm font-mono">
      <h2 class="text-base font-semibold text-gray-200 mb-2 font-sans">File System Summary</h2>
      <p><span class="text-gray-500">Groups:</span> {result.params.numGroups}</p>
      <p><span class="text-gray-500">Inodes/group:</span> {result.params.inodesPerGroup}</p>
      <p><span class="text-gray-500">Blocks/group:</span> {result.params.blocksPerGroup}</p>
      <p>
        <span class="text-gray-500">Free data blocks:</span>
        {showAnswers ? result.totalDataFree : '?'}
        <span class="text-gray-500">(of {result.params.numGroups * result.params.blocksPerGroup})</span>
      </p>
      <p>
        <span class="text-gray-500">Free inodes:</span>
        {showAnswers ? result.totalInodesFree : '?'}
        <span class="text-gray-500">(of {result.params.numGroups * result.params.inodesPerGroup})</span>
      </p>
    </div>

    <!-- Group Layout -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4">
      <h2 class="text-base font-semibold text-gray-200 mb-3">Group Layout</h2>
      <div class="overflow-x-auto">
        <table class="text-sm font-mono">
          <thead>
            <tr class="text-gray-500">
              <th class="pr-3 text-right">Group</th>
              <th class="pr-3 text-left">Inodes</th>
              <th class="text-left">Data Blocks</th>
            </tr>
          </thead>
          <tbody>
            {#each result.groups as group, gi}
              <tr class="hover:bg-gray-800/30">
                <td class="pr-3 text-right text-gray-500">{gi}</td>
                <td class="pr-3 whitespace-nowrap">
                  {#if showAnswers}
                    {#each group.inodeBitmap as entry}
                      <span class={symbolColor(bitmapChar(entry, result.symbolMap))}>{bitmapChar(entry, result.symbolMap)}</span>
                    {/each}
                  {:else}
                    {#each group.inodeBitmap as _}
                      <span class="text-yellow-400/70">?</span>
                    {/each}
                  {/if}
                </td>
                <td class="whitespace-nowrap">
                  {#if showAnswers}
                    {#each group.dataBitmap as entry, di}
                      {#if di > 0 && di % 10 === 0}<span class="text-gray-700"> </span>{/if}<span class={symbolColor(bitmapChar(entry, result.symbolMap))}>{bitmapChar(entry, result.symbolMap)}</span>
                    {/each}
                  {:else}
                    {#each group.dataBitmap as _, di}
                      {#if di > 0 && di % 10 === 0}<span class="text-gray-700"> </span>{/if}<span class="text-yellow-400/70">?</span>
                    {/each}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Symbol Map / File Details -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4">
      <h2 class="text-base font-semibold text-gray-200 mb-3">File Details</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm font-mono">
          <thead>
            <tr class="text-gray-500 text-left border-b border-gray-800">
              <th class="py-1 pr-4">Symbol</th>
              <th class="py-1 pr-4">Inode#</th>
              <th class="py-1 pr-4">Filename</th>
              <th class="py-1 pr-4">Type</th>
              <th class="py-1">Block Addresses</th>
            </tr>
          </thead>
          <tbody>
            {#each result.symbolEntries as entry}
              <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td class="py-1 pr-4">
                  <span class={symbolColor(entry.symbol)}>{entry.symbol}</span>
                </td>
                <td class="py-1 pr-4">{showAnswers ? entry.inodeNumber : '?'}</td>
                <td class="py-1 pr-4 text-gray-300">{entry.filename}</td>
                <td class="py-1 pr-4 text-gray-400">{entry.fileType}</td>
                <td class="py-1 text-gray-400">
                  {#if showAnswers}
                    {entry.blockAddresses.join(' ')}
                  {:else}
                    ?
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Spans -->
    {#if showSpans}
      <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-4">
        <h2 class="text-base font-semibold text-gray-200 mb-3">Spans</h2>

        {#if result.fileSpans.length > 0}
          <div>
            <h3 class="text-sm font-semibold text-gray-300 mb-1">File Spans</h3>
            <div class="text-sm font-mono space-y-0.5">
              {#each result.fileSpans as fs}
                <div>
                  <span class="text-gray-400">file: {fs.path.padEnd(12)}</span>
                  <span class="text-gray-500">filespan:</span>
                  {#if showAnswers}
                    <span class="text-gray-200">{fs.span}</span>
                  {:else}
                    <span class="text-yellow-400/70">?</span>
                  {/if}
                </div>
              {/each}
              {#if result.fileSpanAvg != null}
                <div class="border-t border-gray-800 pt-1 mt-1">
                  <span class="text-gray-400">{''.padEnd(18)}avg filespan:</span>
                  {#if showAnswers}
                    <span class="text-gray-200">{result.fileSpanAvg.toFixed(2)}</span>
                  {:else}
                    <span class="text-yellow-400/70">?</span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}

        {#if result.dirSpans.length > 0}
          <div>
            <h3 class="text-sm font-semibold text-gray-300 mb-1">Directory Spans</h3>
            <div class="text-sm font-mono space-y-0.5">
              {#each result.dirSpans as ds}
                <div>
                  <span class="text-gray-400">dir:  {ds.path.padEnd(12)}</span>
                  <span class="text-gray-500">dirspan:</span>
                  {#if showAnswers}
                    <span class="text-gray-200">{ds.span}</span>
                  {:else}
                    <span class="text-yellow-400/70">?</span>
                  {/if}
                </div>
              {/each}
              {#if result.dirSpanAvg != null}
                <div class="border-t border-gray-800 pt-1 mt-1">
                  <span class="text-gray-400">{''.padEnd(19)}avg dirspan:</span>
                  {#if showAnswers}
                    <span class="text-gray-200">{result.dirSpanAvg.toFixed(2)}</span>
                  {:else}
                    <span class="text-yellow-400/70">?</span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
