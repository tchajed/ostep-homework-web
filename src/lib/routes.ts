export interface RouteEntry {
  path: string;
  label: string;
  loader: () => Promise<{ default: any }>;
}

export interface RouteSection {
  title: string;
  routes: RouteEntry[];
}

export const sections: RouteSection[] = [
  {
    title: 'CPU Virtualization',
    routes: [
      { path: 'process-run', label: 'Process Execution', loader: () => import('../pages/ProcessRunPage.svelte') },
      { path: 'scheduler', label: 'CPU Scheduling', loader: () => import('../pages/SchedulerPage.svelte') },
      { path: 'lottery', label: 'Lottery Scheduling', loader: () => import('../pages/LotteryPage.svelte') },
      { path: 'mlfq', label: 'MLFQ', loader: () => import('../pages/MlfqPage.svelte') },
      { path: 'multi-cpu', label: 'Multi-CPU Scheduling', loader: () => import('../pages/MultiCpuPage.svelte') },
      { path: 'fork', label: 'Process API (fork)', loader: () => import('../pages/ForkPage.svelte') },
    ],
  },
  {
    title: 'Memory Virtualization',
    routes: [
      { path: 'relocation', label: 'Base & Bounds', loader: () => import('../pages/RelocationPage.svelte') },
      { path: 'segmentation', label: 'Segmentation', loader: () => import('../pages/SegmentationPage.svelte') },
      { path: 'paging', label: 'Paging (Linear)', loader: () => import('../pages/PagingPage.svelte') },
      { path: 'paging-multilevel', label: 'Paging (Multi-level)', loader: () => import('../pages/PagingMultilevelPage.svelte') },
      { path: 'paging-policy', label: 'Page Replacement', loader: () => import('../pages/PagingPolicyPage.svelte') },
      { path: 'malloc', label: 'Free-Space Management', loader: () => import('../pages/MallocPage.svelte') },
    ],
  },
  {
    title: 'Persistence',
    routes: [
      { path: 'disk', label: 'Disk Scheduling', loader: () => import('../pages/DiskPage.svelte') },
      { path: 'raid', label: 'RAID', loader: () => import('../pages/RaidPage.svelte') },
      { path: 'ssd', label: 'Flash-Based SSDs', loader: () => import('../pages/SsdPage.svelte') },
      { path: 'vsfs', label: 'File System (vsfs)', loader: () => import('../pages/VsfsPage.svelte') },
      { path: 'ffs', label: 'Fast File System', loader: () => import('../pages/FfsPage.svelte') },
      { path: 'lfs', label: 'Log-Structured FS', loader: () => import('../pages/LfsPage.svelte') },
      { path: 'fsck', label: 'Journaling & fsck', loader: () => import('../pages/FsckPage.svelte') },
      { path: 'checksum', label: 'Data Integrity', loader: () => import('../pages/ChecksumPage.svelte') },
    ],
  },
  {
    title: 'Concurrency',
    routes: [
      { path: 'x86-intro', label: 'Threads Intro (x86)', loader: () => import('../pages/X86IntroPage.svelte') },
      { path: 'x86-locks', label: 'Locks (x86)', loader: () => import('../pages/X86LocksPage.svelte') },
    ],
  },
  {
    title: 'Distributed Systems',
    routes: [
      { path: 'afs', label: 'AFS', loader: () => import('../pages/AfsPage.svelte') },
    ],
  },
];

export const allRoutes: RouteEntry[] = sections.flatMap(s => s.routes);
