import { Random } from '../random';

export interface PagingMultilevelParams {
  seed: number;
  allocated: number;   // number of virtual pages allocated (default 64)
  numAddresses: number; // number of virtual addresses to generate (default 10)
}

/** A single step in the translation walkthrough */
export interface TranslationStep {
  virtualAddr: number;
  pdeIndex: number;
  pdeAddr: number;
  pdeContents: number;
  pdeValid: boolean;
  pdePfn: number;
  // Only present when PDE is valid
  pteIndex?: number;
  pteAddr?: number;
  pteContents?: number;
  pteValid?: boolean;
  ptePfn?: number;
  // Only present when both PDE and PTE are valid
  offset?: number;
  physicalAddr?: number;
  value?: number;
  // Fault info
  fault: 'none' | 'pde' | 'pte';
}

export interface PagingMultilevelResult {
  pageSize: number;      // 32 bytes
  physPages: number;     // 128
  physMem: number;       // 4096 bytes
  vaPages: number;       // 1024
  vaSize: number;        // 32768
  pageBits: number;      // 5
  pdbr: number;          // page directory base register (page number)
  memory: number[];      // full physical memory contents
  translations: TranslationStep[];
  allocatedVPs: number[];
}

/**
 * Multi-level (two-level) page table simulator.
 *
 * Virtual address layout (15-bit virtual address space, 32KB):
 *   [PDE index: 5 bits] [PTE index: 5 bits] [Offset: 5 bits]
 *
 * Page directory and page table entries are 1 byte each:
 *   [Valid: 1 bit] [PFN: 7 bits]
 *
 * Invalid entries have value 0x7F (valid=0, pfn=127).
 */
export function simulate(params: PagingMultilevelParams): PagingMultilevelResult {
  const { seed, allocated, numAddresses } = params;
  const rng = new Random(seed);

  const pageSize = 32;
  const physPages = 128;
  const physMem = pageSize * physPages;
  const vaPages = 1024;
  const vaSize = pageSize * vaPages;
  const pageBits = 5;
  const pteSize = 1;

  const PDE_MASK = 0x7c00;
  const PDE_SHIFT = 10;
  const PTE_MASK = 0x03e0;
  const PTE_SHIFT = 5;
  const OFFSET_MASK = 0x1f;

  // Physical memory and page tracking
  const memory = new Array<number>(physMem).fill(0);
  const usedPages = new Array<boolean>(physPages).fill(false);
  let usedPagesCount = 0;

  function findFree(): number {
    if (usedPagesCount >= physPages) {
      throw new Error('Out of physical pages');
    }
    let look = Math.floor(rng.random() * physPages);
    while (usedPages[look]) {
      look = Math.floor(rng.random() * physPages);
    }
    usedPagesCount++;
    usedPages[look] = true;
    return look;
  }

  function initPageDir(whichPage: number): void {
    const whichByte = whichPage << pageBits;
    for (let i = whichByte; i < whichByte + pageSize; i++) {
      memory[i] = 0x7f;
    }
  }

  function getPageDirEntry(virtualAddr: number): { valid: boolean; ptPtr: number; pdeAddr: number } {
    const pdeBits = (virtualAddr & PDE_MASK) >> PDE_SHIFT;
    const pdeAddr = (pdbr << pageBits) | pdeBits;
    const pde = memory[pdeAddr];
    const valid = ((pde & 0x80) >> 7) === 1;
    const ptPtr = pde & 0x7f;
    return { valid, ptPtr, pdeAddr };
  }

  function getPageTableEntry(virtualAddr: number, ptePage: number): { valid: boolean; pfn: number; pteAddr: number } {
    const pteBits = (virtualAddr & PTE_MASK) >> PTE_SHIFT;
    const pteAddr = (ptePage << pageBits) | pteBits;
    const pte = memory[pteAddr];
    const valid = ((pte & 0x80) >> 7) === 1;
    const pfn = pte & 0x7f;
    return { valid, pfn, pteAddr };
  }

  function setPageDirEntry(pdeAddr: number, physicalPage: number): void {
    memory[pdeAddr] = 0x80 | physicalPage;
  }

  function setPageTableEntry(pteAddr: number, physicalPage: number): void {
    memory[pteAddr] = 0x80 | physicalPage;
  }

  function allocVirtualPage(virtualPage: number, physicalPage: number): void {
    const virtualAddr = virtualPage << pageBits;
    const { valid, ptPtr, pdeAddr } = getPageDirEntry(virtualAddr);
    let ptePage: number;
    if (!valid) {
      ptePage = findFree();
      setPageDirEntry(pdeAddr, ptePage);
      initPageDir(ptePage); // init page table page
    } else {
      ptePage = ptPtr;
    }
    const { valid: pteValid, pfn, pteAddr } = getPageTableEntry(virtualAddr, ptePage);
    setPageTableEntry(pteAddr, physicalPage);
  }

  function fillPage(whichPage: number): void {
    for (let j = 0; j < pageSize; j++) {
      memory[whichPage * pageSize + j] = Math.floor(rng.random() * 31);
    }
  }

  // Allocate process: page directory + virtual pages
  const pdbr = findFree();
  initPageDir(pdbr);

  const used: Record<number, boolean> = {};
  for (let vp = 0; vp < vaPages; vp++) {
    used[vp] = false;
  }
  const allocatedVPs: number[] = [];

  for (let i = 0; i < allocated; i++) {
    let vp = Math.floor(rng.random() * vaPages);
    while (used[vp]) {
      vp = Math.floor(rng.random() * vaPages);
    }
    used[vp] = true;
    allocatedVPs.push(vp);
    const pp = findFree();
    allocVirtualPage(vp, pp);
    fillPage(pp);
  }

  // Generate virtual addresses and translate
  const translations: TranslationStep[] = [];
  for (let i = 0; i < numAddresses; i++) {
    let vaddr: number;
    if (rng.random() * 100 > 50.0 || i >= allocatedVPs.length) {
      vaddr = Math.floor(rng.random() * 1024 * 32);
    } else {
      vaddr = (allocatedVPs[i] << 5) | Math.floor(rng.random() * 32);
    }

    const pdeBits = (vaddr & PDE_MASK) >> PDE_SHIFT;
    const pdeAddr = (pdbr << pageBits) | pdeBits;
    const pde = memory[pdeAddr];
    const pdeValid = ((pde & 0x80) >> 7) === 1;
    const pdePfn = pde & 0x7f;

    const step: TranslationStep = {
      virtualAddr: vaddr,
      pdeIndex: pdeBits,
      pdeAddr,
      pdeContents: pde,
      pdeValid,
      pdePfn,
      fault: pdeValid ? 'none' : 'pde',
    };

    if (pdeValid) {
      const pteBits = (vaddr & PTE_MASK) >> PTE_SHIFT;
      const pteAddr = (pdePfn << pageBits) | pteBits;
      const pte = memory[pteAddr];
      const pteValid = ((pte & 0x80) >> 7) === 1;
      const ptePfn = pte & 0x7f;

      step.pteIndex = pteBits;
      step.pteAddr = pteAddr;
      step.pteContents = pte;
      step.pteValid = pteValid;
      step.ptePfn = ptePfn;

      if (pteValid) {
        const offset = vaddr & OFFSET_MASK;
        const physicalAddr = (ptePfn << pageBits) | offset;
        step.offset = offset;
        step.physicalAddr = physicalAddr;
        step.value = memory[physicalAddr];
        step.fault = 'none';
      } else {
        step.fault = 'pte';
      }
    }

    translations.push(step);
  }

  return {
    pageSize,
    physPages,
    physMem,
    vaPages,
    vaSize,
    pageBits,
    pdbr,
    memory: [...memory],
    translations,
    allocatedVPs,
  };
}

/** Format a number as 0x-prefixed hex with at least the given digits. */
export function toHex(n: number, digits: number = 2): string {
  return '0x' + n.toString(16).padStart(digits, '0');
}
