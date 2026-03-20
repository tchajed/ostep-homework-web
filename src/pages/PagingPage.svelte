<script lang="ts">
  import {
    runPagingSimulation,
    validatePagingOptions,
    hex32,
    defaultPagingOptions,
    type PagingSimulation,
    type PagingOptions,
  } from '../lib/simulators/paging';

  let seed = $state(defaultPagingOptions.seed);
  let asize = $state(defaultPagingOptions.asize);
  let psize = $state(defaultPagingOptions.psize);
  let pagesize = $state(defaultPagingOptions.pagesize);
  let numAddrs = $state(defaultPagingOptions.numAddrs);
  let addresses = $state(defaultPagingOptions.addresses);
  let usedPercent = $state(defaultPagingOptions.usedPercent);
  let showAnswers = $state(false);

  let result: PagingSimulation | null = $state(null);
  let error: string | null = $state(null);

  function run() {
    const opts: PagingOptions = { seed, asize, psize, pagesize, numAddrs, addresses, usedPercent };
    const err = validatePagingOptions(opts);
    if (err) {
      error = err;
      result = null;
      return;
    }
    try {
      error = null;
      result = runPagingSimulation(opts);
    } catch (e: any) {
      error = e.message;
      result = null;
    }
  }

  // Run on mount
  run();
</script>

<div class="max-w-4xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">Paging: Linear Page Table</h1>
  <p class="text-gray-400 text-sm">
    Simulate address translation with a linear (single-level) page table.
    Each virtual address is split into a virtual page number (VPN) and an offset.
    The VPN indexes into the page table to find the physical frame number (PFN);
    the offset is appended to produce the physical address.
  </p>

  <!-- Controls -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
    <label class="flex flex-col text-sm text-gray-400">
      Seed
      <input type="number" bind:value={seed} min="0"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Addr Space Size
      <input type="text" bind:value={asize}
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full"
        placeholder="e.g. 16k" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Physical Mem Size
      <input type="text" bind:value={psize}
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full"
        placeholder="e.g. 64k" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Page Size
      <input type="text" bind:value={pagesize}
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full"
        placeholder="e.g. 4k" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      # Addresses
      <input type="number" bind:value={numAddrs} min="1" max="100"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      Addresses (-1=random)
      <input type="text" bind:value={addresses}
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full"
        placeholder="-1 or 100,200,300" />
    </label>
    <label class="flex flex-col text-sm text-gray-400">
      % Used
      <input type="number" bind:value={usedPercent} min="0" max="100"
        class="mt-1 rounded bg-gray-800 border border-gray-700 px-2 py-1 text-gray-100 w-full" />
    </label>
  </div>

  <div class="flex gap-3 items-center">
    <button
      onclick={run}
      class="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium cursor-pointer"
    >
      Generate
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
    <!-- Configuration summary -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4 space-y-1 text-sm font-mono">
      <h2 class="text-base font-semibold text-gray-200 mb-2 font-sans">Configuration</h2>
      <p><span class="text-gray-500">Address Space Size :</span> {result.addressSpaceSize} bytes ({result.vaBits} bits)</p>
      <p><span class="text-gray-500">Physical Mem Size  :</span> {result.physicalMemSize} bytes</p>
      <p><span class="text-gray-500">Page Size          :</span> {result.pageSize} bytes ({result.pageBits} bits for offset)</p>
      <p><span class="text-gray-500">Virtual Pages      :</span> {result.numVirtualPages} ({result.vpnBits} bits for VPN)</p>
      <p><span class="text-gray-500">Physical Frames    :</span> {result.numPhysicalPages}</p>
    </div>

    <!-- Page Table -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4">
      <h2 class="text-base font-semibold text-gray-200 mb-2">Page Table</h2>
      <p class="text-xs text-gray-500 mb-3">
        High-order bit is the VALID bit. If 1, the rest is the PFN. If 0, the page is not valid.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm font-mono">
          <thead>
            <tr class="text-gray-500 text-left border-b border-gray-800">
              <th class="py-1 pr-4">VPN</th>
              <th class="py-1 pr-4">Entry (hex)</th>
              <th class="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {#each result.pageTable as entry}
              <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td class="py-1.5 pr-4 text-gray-400">{entry.vpn}</td>
                <td class="py-1.5 pr-4">{hex32(entry.raw)}</td>
                <td class="py-1.5">
                  {#if entry.valid}
                    <span class="text-green-400">valid, PFN = {entry.pfn}</span>
                  {:else}
                    <span class="text-red-400">invalid</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Address Trace -->
    <div class="rounded bg-gray-900 border border-gray-800 p-4">
      <h2 class="text-base font-semibold text-gray-200 mb-3">Virtual Address Trace</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm font-mono">
          <thead>
            <tr class="text-gray-500 text-left border-b border-gray-800">
              <th class="py-1 pr-4">#</th>
              <th class="py-1 pr-4">Virtual Address</th>
              <th class="py-1">Result</th>
            </tr>
          </thead>
          <tbody>
            {#each result.translations as t, i}
              <tr class="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td class="py-1.5 pr-4 text-gray-500">VA {i}</td>
                <td class="py-1.5 pr-4">
                  {hex32(t.virtualAddress)}
                  <span class="text-gray-500">(decimal: {t.virtualAddress})</span>
                </td>
                <td class="py-1.5">
                  {#if showAnswers}
                    {#if t.valid}
                      <span class="text-green-400">
                        {hex32(t.physicalAddress)}
                        <span class="text-gray-500">(decimal: {t.physicalAddress})</span>
                        <span class="text-gray-500">[VPN {t.vpn}]</span>
                      </span>
                    {:else}
                      <span class="text-red-400">Invalid (VPN {t.vpn} not valid)</span>
                    {/if}
                  {:else}
                    <span class="text-yellow-400/70">PA or invalid address?</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Step-by-step translation explanation -->
    {#if showAnswers}
      <div class="rounded bg-gray-900 border border-gray-800 p-4">
        <h2 class="text-base font-semibold text-gray-200 mb-3">Step-by-Step Translation</h2>
        <div class="space-y-4">
          {#each result.translations as t, i}
            <div class="rounded bg-gray-800/50 border border-gray-700 p-3 text-sm font-mono space-y-1">
              <p class="font-sans font-semibold text-gray-300">VA {i}: {hex32(t.virtualAddress)} (decimal: {t.virtualAddress})</p>
              <p>
                <span class="text-gray-500">1. Virtual address in binary:</span>
                {t.virtualAddress.toString(2).padStart(result.vaBits, '0')}
              </p>
              <p>
                <span class="text-gray-500">2. VPN (top {result.vpnBits} bits):</span>
                {t.vpn}
                <span class="text-gray-500"> | Offset (bottom {result.pageBits} bits):</span>
                {t.offset}
                <span class="text-gray-500">({hex32(t.offset)})</span>
              </p>
              <p>
                <span class="text-gray-500">3. Page table[{t.vpn}] =</span>
                {hex32(result.pageTable[t.vpn].raw)}
                {#if result.pageTable[t.vpn].valid}
                  <span class="text-green-400">(valid, PFN = {result.pageTable[t.vpn].pfn})</span>
                {:else}
                  <span class="text-red-400">(invalid)</span>
                {/if}
              </p>
              {#if t.valid}
                <p>
                  <span class="text-gray-500">4. Physical address = PFN {t.pfn} &lt;&lt; {result.pageBits} | offset {t.offset} =</span>
                  <span class="text-green-400">{hex32(t.physicalAddress)} (decimal: {t.physicalAddress})</span>
                </p>
              {:else}
                <p>
                  <span class="text-red-400">4. Translation invalid -- page fault</span>
                </p>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
