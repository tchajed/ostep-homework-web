import { describe, it, expect } from 'vitest';
import {
  LFS,
  runSimulation,
  parseCommandList,
  parsePercentages,
  formatBlock,
  formatCommand,
  executeCommand,
  NUM_IMAP_PTRS_IN_CR,
  NUM_INODES_PER_IMAP_CHUNK,
  NUM_INODE_PTRS,
  type Block,
  type InodeBlock,
  type DirDataBlock,
  type CheckpointBlock,
  type ImapBlock,
} from './lfs';
import { Random } from '../random';

describe('LFS core', () => {
  it('initializes with 4 blocks', () => {
    const lfs = new LFS();
    expect(lfs.disk).toHaveLength(4);
    expect(lfs.disk[0].block_type).toBe('type_cp');
    expect(lfs.disk[1].block_type).toBe('type_data_dir');
    expect(lfs.disk[2].block_type).toBe('type_inode');
    expect(lfs.disk[3].block_type).toBe('type_imap');
  });

  it('initial checkpoint points to imap chunk at address 3', () => {
    const lfs = new LFS();
    const cp = lfs.disk[0] as CheckpointBlock;
    expect(cp.entries[0]).toBe(3);
    for (let i = 1; i < NUM_IMAP_PTRS_IN_CR; i++) {
      expect(cp.entries[i]).toBe(-1);
    }
  });

  it('initial root directory has . and .. entries', () => {
    const lfs = new LFS();
    const dirBlock = lfs.disk[1] as DirDataBlock;
    expect(dirBlock.entries[0]).toEqual(['.', 0]);
    expect(dirBlock.entries[1]).toEqual(['..', 0]);
  });

  it('root inode is a directory with size 1 and refs 2', () => {
    const lfs = new LFS();
    const inode = lfs.disk[2] as InodeBlock;
    expect(inode.type).toBe('dir');
    expect(inode.size).toBe(1);
    expect(inode.refs).toBe(2);
    expect(inode.pointers[0]).toBe(1);
  });

  it('creates a file and grows the disk', () => {
    const lfs = new LFS();
    const rc = lfs.createFile('/foo');
    expect(rc).toBe(0);
    // create file logs: dirblock, parent inode, new inode, imap chunk(s)
    expect(lfs.disk.length).toBeGreaterThan(4);
  });

  it('rejects creating a duplicate file', () => {
    const lfs = new LFS();
    lfs.createFile('/foo');
    const rc = lfs.createFile('/foo');
    expect(rc).toBe(-1);
  });

  it('creates a directory', () => {
    const lfs = new LFS();
    const rc = lfs.createDir('/subdir');
    expect(rc).toBe(0);
    // Should have additional blocks for dir data, parent inode update, new dir inode, imap
    expect(lfs.disk.length).toBeGreaterThan(4);
  });

  it('writes data blocks to a file', () => {
    const rng = new Random(42);
    const lfs = new LFS(false, false, 'sequential', rng);
    lfs.createFile('/foo');
    const written = lfs.fileWrite('/foo', 0, 3);
    expect(written).toBe(3);
  });

  it('write returns 0 when numBlks is 0', () => {
    const rng = new Random(42);
    const lfs = new LFS(false, false, 'sequential', rng);
    lfs.createFile('/foo');
    const written = lfs.fileWrite('/foo', 6, 0);
    expect(written).toBe(0);
  });

  it('clamps write to inode pointer limit', () => {
    const rng = new Random(42);
    const lfs = new LFS(false, false, 'sequential', rng);
    lfs.createFile('/foo');
    const written = lfs.fileWrite('/foo', 5, 10);
    expect(written).toBe(NUM_INODE_PTRS - 5);
  });

  it('deletes a file', () => {
    const lfs = new LFS();
    lfs.createFile('/foo');
    const rc = lfs.fileDelete('/foo');
    expect(rc).toBe(0);
  });

  it('delete fails for non-existent file', () => {
    const lfs = new LFS();
    const rc = lfs.fileDelete('/noexist');
    expect(rc).toBe(-1);
  });

  it('hard link increments ref count', () => {
    const lfs = new LFS();
    lfs.createFile('/foo');
    const rc = lfs.fileLink('/foo', '/bar');
    expect(rc).toBe(0);
    // After link, the inode should have refs=2
    // Find the latest inode for the file
    const inode = lfs.disk[lfs.inodeMap[1]] as InodeBlock;
    expect(inode.refs).toBe(2);
  });

  it('delete of linked file decrements ref count', () => {
    const lfs = new LFS();
    lfs.createFile('/foo');
    lfs.fileLink('/foo', '/bar');
    const rc = lfs.fileDelete('/foo');
    expect(rc).toBe(0);
    // Inode should still exist with refs=1
    expect(lfs.inodeMap[1]).not.toBe(-1);
  });

  it('delete of last link frees inode', () => {
    const lfs = new LFS();
    lfs.createFile('/foo');
    lfs.fileDelete('/foo');
    expect(lfs.inodeMap[1]).toBe(-1);
  });

  it('sync updates checkpoint region', () => {
    const lfs = new LFS(false, true); // no force checkpoints
    lfs.createFile('/foo');
    // CR should still point to old imap
    const cpBefore = lfs.disk[0] as CheckpointBlock;
    expect(cpBefore.entries[0]).toBe(3); // still old
    lfs.sync();
    const cpAfter = lfs.disk[0] as CheckpointBlock;
    expect(cpAfter.entries[0]).not.toBe(3); // updated
  });

  it('liveness marks only current blocks as live', () => {
    const lfs = new LFS();
    lfs.createFile('/foo');
    const live = lfs.determineLiveness();
    // Block 0 (checkpoint) is always live
    expect(live[0]).toBe(true);
    // Old blocks (1, 2, 3) should not be live after file creation
    // because new versions were written
    expect(live[1]).toBe(false);
    expect(live[2]).toBe(false);
    expect(live[3]).toBe(false);
  });

  it('creates files in subdirectory', () => {
    const lfs = new LFS();
    lfs.createDir('/sub');
    const rc = lfs.createFile('/sub/foo');
    expect(rc).toBe(0);
  });

  it('write fails for non-existent file', () => {
    const rng = new Random(0);
    const lfs = new LFS(false, false, 'sequential', rng);
    const rc = lfs.fileWrite('/noexist', 0, 1);
    expect(rc).toBe(-1);
  });

  it('write fails for directory', () => {
    const rng = new Random(0);
    const lfs = new LFS(false, false, 'sequential', rng);
    lfs.createDir('/sub');
    const rc = lfs.fileWrite('/sub', 0, 1);
    expect(rc).toBe(-1);
  });
});

describe('LFS with disk checkpoint region', () => {
  it('uses disk CR path when useDiskCr is true', () => {
    const lfs = new LFS(true, false);
    const rc = lfs.createFile('/foo');
    expect(rc).toBe(0);
  });

  it('stale CR causes issues with no-force and disk-cr', () => {
    const lfs = new LFS(true, true); // use disk CR, no force checkpoints
    lfs.createFile('/foo');
    // Without sync, the CR on disk is stale - the file was created but CR not updated
    // Trying to create another file should still work via stale CR
    // (the root inode address from old CR resolves to old inode)
    // This tests the "use_disk_cr" code path
  });
});

describe('LFS random allocation', () => {
  it('allocates inodes randomly', () => {
    const rng = new Random(42);
    const lfs = new LFS(false, false, 'random', rng);
    lfs.createFile('/a');
    lfs.createFile('/b');
    // With random policy, inode numbers may not be 1, 2
    const usedInodes = lfs.inodeMap
      .map((v, i) => (v !== -1 ? i : -1))
      .filter(v => v !== -1 && v !== 0);
    expect(usedInodes.length).toBe(2);
  });
});

describe('parsePercentages', () => {
  it('parses default percentages', () => {
    const p = parsePercentages('c30,w30,d10,r20,l10,s0');
    expect(p.c).toEqual([0, 0.3]);
    expect(p.w).toEqual([0.3, 0.6]);
    expect(p.d).toEqual([0.6, 0.7]);
    expect(p.r).toEqual([0.7, 0.9]);
    expect(p.l).toEqual([0.9, 1.0]);
    expect(p.s).toEqual([1.0, 1.0]);
  });

  it('rejects percentages not summing to 100', () => {
    expect(() => parsePercentages('c50,w50,d10,r0,l0,s0')).toThrow();
  });
});

describe('parseCommandList', () => {
  it('parses create command', () => {
    const cmds = parseCommandList('c,/foo');
    expect(cmds).toEqual([{ op: 'create', path: '/foo' }]);
  });

  it('parses multiple commands', () => {
    const cmds = parseCommandList('c,/foo:w,/foo,0,3:r,/foo');
    expect(cmds).toHaveLength(3);
    expect(cmds[0].op).toBe('create');
    expect(cmds[1].op).toBe('write');
    expect(cmds[2].op).toBe('delete');
  });

  it('parses link command', () => {
    const cmds = parseCommandList('l,/foo,/bar');
    expect(cmds).toEqual([{ op: 'link', src: '/foo', dst: '/bar' }]);
  });

  it('parses sync command', () => {
    const cmds = parseCommandList('s');
    expect(cmds).toEqual([{ op: 'sync' }]);
  });

  it('returns empty for empty string', () => {
    expect(parseCommandList('')).toEqual([]);
  });
});

describe('formatBlock', () => {
  it('formats checkpoint block', () => {
    const block: CheckpointBlock = {
      block_type: 'type_cp',
      entries: [3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    };
    expect(formatBlock(block)).toContain('checkpoint:');
    expect(formatBlock(block)).toContain('3');
    expect(formatBlock(block)).toContain('--');
  });

  it('formats inode block', () => {
    const block: InodeBlock = {
      block_type: 'type_inode',
      type: 'reg',
      size: 0,
      refs: 1,
      pointers: [-1, -1, -1, -1, -1, -1, -1, -1],
    };
    expect(formatBlock(block)).toContain('type:reg');
    expect(formatBlock(block)).toContain('size:0');
    expect(formatBlock(block)).toContain('refs:1');
  });

  it('formats directory data block', () => {
    const block: DirDataBlock = {
      block_type: 'type_data_dir',
      entries: [
        ['.', 0], ['..', 0], ['-', -1], ['-', -1],
        ['-', -1], ['-', -1], ['-', -1], ['-', -1],
      ],
    };
    expect(formatBlock(block)).toContain('[.,0]');
    expect(formatBlock(block)).toContain('[..,0]');
    expect(formatBlock(block)).toContain('--');
  });

  it('formats imap block', () => {
    const block: ImapBlock = {
      block_type: 'type_imap',
      entries: [2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    };
    expect(formatBlock(block)).toContain('chunk(imap):');
    expect(formatBlock(block)).toContain('2');
  });
});

describe('formatCommand', () => {
  it('formats create', () => {
    expect(formatCommand({ op: 'create', path: '/foo' })).toBe('create file /foo');
  });
  it('formats write', () => {
    expect(formatCommand({ op: 'write', path: '/foo', offset: 2, numBlks: 3 })).toBe(
      'write file  /foo offset=2 size=3',
    );
  });
  it('formats sync', () => {
    expect(formatCommand({ op: 'sync' })).toBe('sync');
  });
});

describe('runSimulation', () => {
  it('is deterministic', () => {
    const params = {
      seed: 1,
      numCommands: 3,
      percentages: 'c30,w30,d10,r20,l10,s0',
      inodePolicy: 'sequential' as const,
      useDiskCr: false,
      noForceCheckpoints: false,
      commandList: '',
    };
    const a = runSimulation(params);
    const b = runSimulation(params);
    expect(a.finalDisk).toEqual(b.finalDisk);
    expect(a.commandResults.length).toBe(b.commandResults.length);
  });

  it('runs with explicit command list', () => {
    const result = runSimulation({
      seed: 0,
      numCommands: 3,
      percentages: 'c30,w30,d10,r20,l10,s0',
      inodePolicy: 'sequential',
      useDiskCr: false,
      noForceCheckpoints: false,
      commandList: 'c,/foo:c,/bar',
    });
    expect(result.commandResults).toHaveLength(2);
    expect(result.commandResults[0].rc).toBe(0);
    expect(result.commandResults[1].rc).toBe(0);
  });

  it('produces correct initial disk', () => {
    const result = runSimulation({
      seed: 0,
      numCommands: 1,
      percentages: 'c100,w0,d0,r0,l0,s0',
      inodePolicy: 'sequential',
      useDiskCr: false,
      noForceCheckpoints: false,
      commandList: '',
    });
    expect(result.initialDisk).toHaveLength(4);
  });

  it('computes liveness correctly', () => {
    const result = runSimulation({
      seed: 0,
      numCommands: 0,
      percentages: 'c100,w0,d0,r0,l0,s0',
      inodePolicy: 'sequential',
      useDiskCr: false,
      noForceCheckpoints: false,
      commandList: 'c,/foo:c,/bar',
    });
    // Block 0 is always live
    expect(result.finalLiveness[0]).toBe(true);
    // Latest blocks should be live
    const lastIdx = result.finalDisk.length - 1;
    expect(result.finalLiveness[lastIdx]).toBe(true);
  });
});
