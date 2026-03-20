<script lang="ts">
  import './app.css';
  import { router } from './lib/router.svelte';
  import { sections, allRoutes } from './lib/routes';
  import type { Component } from 'svelte';

  let PageComponent: Component | null = $state(null);
  let sidebarOpen = $state(false);

  $effect(() => {
    const route = allRoutes.find(r => r.path === router.current);
    if (route) {
      route.loader().then(m => { PageComponent = m.default; });
    } else {
      PageComponent = null;
    }
  });

  function nav(path: string) {
    router.navigate(path);
    sidebarOpen = false;
  }
</script>

<div class="flex h-screen bg-gray-950 text-gray-100">
  <!-- Mobile menu button -->
  <button
    class="fixed top-3 left-3 z-50 lg:hidden rounded bg-gray-800 p-2 text-gray-300"
    onclick={() => sidebarOpen = !sidebarOpen}
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
  </button>

  <!-- Sidebar -->
  <nav class="
    fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 border-r border-gray-800
    transform transition-transform lg:translate-x-0 lg:static lg:flex-shrink-0
    overflow-y-auto
    {sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
  ">
    <div class="p-4">
      <button
        class="text-lg font-bold text-white mb-4 block hover:text-blue-400 transition-colors cursor-pointer"
        onclick={() => nav('')}
      >
        OSTEP Homework
      </button>

      {#each sections as section}
        <div class="mb-4">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1 px-2">
            {section.title}
          </h3>
          {#each section.routes as route}
            <button
              class="block w-full text-left px-2 py-1 text-sm rounded transition-colors cursor-pointer
                {router.current === route.path
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}"
              onclick={() => nav(route.path)}
            >
              {route.label}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  </nav>

  <!-- Backdrop -->
  {#if sidebarOpen}
    <button
      class="fixed inset-0 z-30 bg-black/50 lg:hidden"
      onclick={() => sidebarOpen = false}
    ></button>
  {/if}

  <!-- Main content -->
  <main class="flex-1 overflow-y-auto p-6 lg:p-8">
    {#if PageComponent}
      {#key router.current}
        <PageComponent />
      {/key}
    {:else}
      <div class="max-w-3xl mx-auto">
        <h1 class="text-3xl font-bold mb-2">OSTEP Homework Simulators</h1>
        <p class="text-gray-400 mb-8">
          Interactive web versions of the
          <a href="https://github.com/remzi-arpacidusseau/ostep-homework" class="text-blue-400 hover:underline">OSTEP homework</a>
          simulators. Pick a topic from the sidebar to get started.
        </p>

        {#each sections as section}
          <div class="mb-6">
            <h2 class="text-lg font-semibold text-gray-300 mb-2">{section.title}</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {#each section.routes as route}
                <button
                  class="text-left p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-600 transition-colors cursor-pointer"
                  onclick={() => nav(route.path)}
                >
                  <span class="text-sm text-gray-200">{route.label}</span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </main>
</div>
