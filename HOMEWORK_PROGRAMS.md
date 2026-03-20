# OSTEP Homework Programs Inventory

Summary of all Python simulators in ostep-homework, organized by topic. Each is a candidate for interactive web visualization.

## CPU Scheduling & Processes

### cpu-intro/process-run.py
CPU scheduling simulator with I/O. Shows process state transitions (RUNNING, READY, BLOCKED) over time. Accepts a process list with CPU/IO burst descriptions. Outputs a tabular time-step trace.

### cpu-sched/scheduler.py
Basic scheduler: FIFO, SJF, RR. Simulates job arrivals and completions. Reports turnaround, response, and wait times. Good candidate for animated Gantt chart.

### cpu-sched-lottery/lottery.py
Lottery scheduling with ticket-based random selection. Each job holds tickets; winner runs each quantum. Shows random draws and job progress.

### cpu-sched-mlfq/mlfq.py
Multi-Level Feedback Queue. Multiple priority queues with configurable quanta, allotments, and periodic boost. Traces priority changes over time. Rich visualization potential.

### cpu-sched-multi/multi.py
Multi-CPU scheduling with cache affinity. Models cache warmup and warm rate. Traces per-CPU execution with cache state. Could show parallel CPU timelines.

### cpu-api/fork.py
Process tree via fork/exit. Builds and displays ASCII process trees. Visualization: interactive tree that grows with each fork.

### cpu-api/generator.py
Generates C code for fork/wait exercises. Less relevant for web viz — mostly a code generator.

## Virtual Memory — Address Translation

### vm-mechanism/relocation.py
Base-and-bounds translation. Given base, limit, and virtual addresses, shows valid/invalid translations. Simple but foundational — good intro visualization.

### vm-segmentation/segmentation.py
Segmentation with two segments (growing up and down). Translates virtual addresses through segment base/limit. Could show memory layout with colored segments.

### vm-paging/paging-linear-translate.py
Linear page table translation. Shows page table entries, splits virtual address into page number + offset. Could animate the lookup steps.

### vm-smalltables/paging-multilevel-translate.py
Multi-level page tables. Walks through page directory → page table → physical frame. Great for step-by-step animated walkthrough.

## Virtual Memory — Page Replacement

### vm-beyondphys-policy/paging-policy.py
Page replacement policies: FIFO, LRU, OPT, CLOCK. Given an access stream, shows cache contents and hit/miss on each access. Classic visualization candidate.

## Memory Allocation

### vm-freespace/malloc.py
Free-space management simulator. Policies: FIRST_FIT, BEST_FIT, WORST_FIT. Shows free list evolution, allocation/free operations, coalescing. Could visualize memory blocks.

## File Systems

### file-implementation/vsfs.py
Very Simple File System. Models inodes, data blocks, bitmaps across groups. Traces file create/write/read operations showing block allocation.

### file-ffs/ffs.py
Fast File System with cylinder groups. Shows block allocation policies, locality optimization. Could visualize cylinder group layouts.

### file-lfs/lfs.py
Log-Structured File System. Shows sequential writes to log, inode map updates, checkpoint regions. Could animate the log as a scrolling tape.

### file-journaling/fsck.py
File system journaling and consistency checking. Simulates crashes and recovery. Could show journal state and fsck repair steps.

### file-integrity/checksum.py
Checksum algorithms: additive, XOR, Fletcher. Computes checksums on data. Simple but could show bit-level operations.

### file-raid/raid.py
RAID simulator (levels 0, 1, 4, 5). Models striping, mirroring, parity. Shows I/O patterns across disks. Could visualize disk array layout.

### file-ssd/ssd.py
SSD simulator with FTL (direct/log mapping), garbage collection, wear leveling. Traces page writes and GC events. Could show block/page grid with erase counts.

## Disk I/O

### file-disks/disk.py
Disk scheduling: FIFO, SSTF, SATF, BSATF. Models seek, rotation, transfer. Originally has Tkinter animation — prime candidate for web port with animated spinning disk.

### file-devices/process-run.py
Variant of process-run.py focused on I/O scheduling with interrupt overhead modeling.

## Distributed Systems

### dist-afs/afs.py
AFS cache consistency simulator. Multiple clients, server callbacks, read/write sharing. Could show client/server message sequence diagrams.

## Threads & Synchronization

### threads-intro/x86.py
Simple x86-like CPU simulator. Executes assembly-like instructions, traces register and memory state. Could show register file and memory as live-updating panels.

### threads-locks/x86.py
Extended x86 simulator with mutex locks and multiple threads. Shows interleaved execution, lock contention. Could visualize thread timelines and lock ownership.

## Visualization Priority Tiers

**Tier 1 — High impact, rich interaction potential:**
- cpu-sched/scheduler.py (Gantt charts, policy comparison)
- cpu-sched-mlfq/mlfq.py (multi-queue animation)
- vm-beyondphys-policy/paging-policy.py (cache visualization)
- file-disks/disk.py (spinning disk animation — already has graphics)
- vm-paging/paging-linear-translate.py (step-by-step translation)

**Tier 2 — Good visual potential:**
- cpu-intro/process-run.py (state machine timeline)
- vm-mechanism/relocation.py (address space diagram)
- vm-freespace/malloc.py (memory block visualization)
- file-raid/raid.py (disk array layout)
- file-ssd/ssd.py (block/page grid)
- cpu-sched-lottery/lottery.py (ticket wheel)
- cpu-api/fork.py (process tree)

**Tier 3 — Useful but simpler:**
- vm-segmentation/segmentation.py
- vm-smalltables/paging-multilevel-translate.py
- file-implementation/vsfs.py
- file-ffs/ffs.py
- file-lfs/lfs.py
- file-journaling/fsck.py
- file-integrity/checksum.py
- dist-afs/afs.py
- threads-intro/x86.py
- threads-locks/x86.py
- cpu-sched-multi/multi.py

**Tier 4 — Skip or defer:**
- cpu-api/generator.py (code generator, not a simulator)
- file-disks/disk-precise.py (precision variant of disk.py)
- file-raid/raid-graphics.py (graphics variant of raid.py)
- file-devices/process-run.py (variant of process-run.py)
