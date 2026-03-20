<script lang="ts">
  import {
    runSimulation,
    formatBlock,
    formatCommand,
    type AllocPolicy,
    type Block,
    type CommandResult,
    type SimulationResult,
  } from '../lib/simulators/lfs';

  // Parameters
  let seed = $state(0);
  let numCommands = $state(3);
  let percentages = $state('c30,w30,d10,r20,l10,s0');
  let inodePolicy = $state<AllocPolicy>('sequential');
  let useDiskCr = $state(false);
  let noForceCheckpoints = $state(false);
  let commandList = $state('');
  let showSolution = $state(false);

  // Results
  let result: SimulationResult | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    try {
      error = null;
      result = runSimulation({
        seed,
        numCommands,
        percentages,
        inodePolicy,
        useDiskCr,
        noForceCheckpoints,
        commandList,
      });
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  // Run on mount
  run();

  function blockTypeLabel(block: Block): string {
    switch (block.block_type) {
      case 'type_cp': return 'CP';
      case 'type_data_dir': return 'DIR';
      case 'type_data': return 'DATA';
      case 'type_inode': return 'INODE';
      case 'type_imap': return 'IMAP';
    }
  }

  function blockTypeColor(block: Block): string {
    switch (block.block_type) {
      case 'type_cp': return 'text-yellow-400';
      case 'type_data_dir': return 'text-cyan-400';
      case 'type_data': return 'text-green-400';
      case 'type_inode': return 'text-purple-400';
      case 'type_imap': return 'text-orange-400';
    }
  }
</script>

<div class="max-w-6xl mx-auto">
  <h1 class="text-2xl font-bold mb-1">Log-Structured File System (LFS)</h1>
  <p class="text-gray-400 text-sm mb-6">
    Simulates a simple LFS: all writes append to a log. Shows checkpoint region, inode map chunks,
    inodes, directory data, and file data blocks. Determine which blocks are live and which are dead.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Seed</span>
      <input type="number" bind:value={seed}
        class="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm
               focus:border-blue-500 focus:outline-none" />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Num Commands</span>
      <input type="number" bind:value={numCommands} min="0" max="50"
        class="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm
               focus:border-blue-500 focus:outline-none" />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Percentages</span>
      <input type="text" bind:value={percentages}
        class="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm font-mono
               focus:border-blue-500 focus:outline-none"
        placeholder="c30,w30,d10,r20,l10,s0" />
    </label>

    <label class="block">
      <span class="text-xs text-gray-400 uppercase tracking-wide">Inode Alloc Policy</span>
      <select bind:value={inodePolicy}
        class="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm
               focus:border-blue-500 focus:outline-none">
        <option value="sequential">Sequential</option>
        <option value="random">Random</option>
      </select>
    </label>

    <label class="flex items-center gap-2 mt-4">
      <input type="checkbox" bind:checked={useDiskCr}
        class="rounded bg-gray-800 border-gray-600" />
      <span class="text-sm text-gray-300">Use disk checkpoint region</span>
    </label>

    <label class="flex items-center gap-2 mt-4">
      <input type="checkbox" bind:checked={noForceCheckpoints}
        class="rounded bg-gray-800 border-gray-600" />
      <span class="text-sm text-gray-300">No forced checkpoints</span>
    </label>

    <div class="md:col-span-2 lg:col-span-3">
      <label class="block">
        <span class="text-xs text-gray-400 uppercase tracking-wide">
          Command List (overrides random generation)
        </span>
        <input type="text" bind:value={commandList}
          class="mt-1 block w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm font-mono
                 focus:border-blue-500 focus:outline-none"
          placeholder="c,/foo:w,/foo,0,3:r,/foo" />
        <span class="text-xs text-gray-500 mt-1 block">
          Format: c,path | d,path | w,path,offset,numblks | r,path | l,src,dst | s
        </span>
      </label>
    </div>
  </div>

  <div class="flex gap-3 mb-6">
    <button onclick={run}
      class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded
             transition-colors cursor-pointer">
      Run
    </button>
    <label class="flex items-center gap-2">
      <input type="checkbox" bind:checked={showSolution}
        class="rounded bg-gray-800 border-gray-600" />
      <span class="text-sm text-gray-300">Show liveness</span>
    </label>
  </div>

  {#if error}
    <div class="bg-red-900/30 border border-red-700 rounded p-3 mb-6 text-red-300 text-sm">
      {error}
    </div>
  {/if}

  {#if result}
    <!-- Operations -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Operations</h2>
      <div class="bg-gray-900 border border-gray-800 rounded overflow-hidden">
        {#each result.commandResults as cr, i}
          <div class="px-4 py-2 border-b border-gray-800 last:border-b-0 flex items-center gap-3
                      {cr.rc === -1 ? 'opacity-60' : ''}">
            <span class="text-gray-500 text-xs w-6 text-right shrink-0">{i + 1}.</span>
            <code class="text-sm font-mono text-gray-200">{formatCommand(cr.command)}</code>
            <span class="ml-auto text-xs font-mono {cr.rc >= 0 ? 'text-green-500' : 'text-red-500'}">
              rc={cr.rc}
            </span>
            {#if cr.errors.length > 0}
              <span class="text-xs text-red-400">{cr.errors[0]}</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <!-- Initial Disk State -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Initial File System</h2>
      {@render diskTable(result.initialDisk, new Array(result.initialDisk.length).fill(true), true)}
    </section>

    <!-- Final Disk State -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Final File System</h2>
      {@render diskTable(result.finalDisk, result.finalLiveness, false)}
    </section>

    <!-- Inode Map -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Inode Map (in-memory)</h2>
      <div class="bg-gray-900 border border-gray-800 rounded p-4">
        <div class="grid grid-cols-4 sm:grid-cols-8 gap-2 font-mono text-sm">
          {#each result.lfs.inodeMap as addr, i}
            {#if addr !== -1}
              <div class="bg-gray-800 rounded px-2 py-1 text-center">
                <span class="text-gray-500">{i}</span>
                <span class="text-gray-400 mx-1">&rarr;</span>
                <span class="text-blue-400">{addr}</span>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </section>

    <!-- Checkpoint Region -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Checkpoint Region</h2>
      <div class="bg-gray-900 border border-gray-800 rounded p-4">
        <div class="grid grid-cols-4 sm:grid-cols-8 gap-2 font-mono text-sm">
          {#each result.lfs.cr as ptr, i}
            <div class="bg-gray-800 rounded px-2 py-1 text-center">
              <span class="text-gray-500 text-xs">#{i}</span>
              <span class="block {ptr !== -1 ? 'text-yellow-400' : 'text-gray-600'}">
                {ptr !== -1 ? ptr : '--'}
              </span>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <!-- Legend -->
    <section class="mb-8">
      <h2 class="text-lg font-semibold mb-3">Legend</h2>
      <div class="flex flex-wrap gap-4 text-sm">
        <span class="text-yellow-400">CP = Checkpoint</span>
        <span class="text-cyan-400">DIR = Directory data</span>
        <span class="text-green-400">DATA = File data</span>
        <span class="text-purple-400">INODE = Inode</span>
        <span class="text-orange-400">IMAP = Inode map chunk</span>
      </div>
    </section>
  {/if}
</div>

{#snippet diskTable(disk: Block[], liveness: boolean[], isInitial: boolean)}
  <div class="bg-gray-900 border border-gray-800 rounded overflow-x-auto">
    <table class="w-full text-sm font-mono">
      <thead>
        <tr class="border-b border-gray-800 text-gray-500 text-xs">
          <th class="px-3 py-2 text-left w-16">Addr</th>
          {#if showSolution || isInitial}
            <th class="px-3 py-2 text-left w-16">Live?</th>
          {/if}
          <th class="px-3 py-2 text-left w-16">Type</th>
          <th class="px-3 py-2 text-left">Contents</th>
        </tr>
      </thead>
      <tbody>
        {#each disk as block, i}
          <tr class="border-b border-gray-800/50 hover:bg-gray-800/30
                     {!liveness[i] && showSolution && !isInitial ? 'opacity-40' : ''}">
            <td class="px-3 py-1.5 text-gray-400">[{String(i).padStart(3)}]</td>
            {#if showSolution || isInitial}
              <td class="px-3 py-1.5">
                {#if liveness[i]}
                  <span class="text-green-500">live</span>
                {:else}
                  <span class="text-gray-600">dead</span>
                {/if}
              </td>
            {:else}
              <!-- hidden -->
            {/if}
            <td class="px-3 py-1.5">
              <span class={blockTypeColor(block)}>{blockTypeLabel(block)}</span>
            </td>
            <td class="px-3 py-1.5 text-gray-300 whitespace-nowrap">{formatBlock(block)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/snippet}
