import { describe, it, expect } from 'vitest';
import { LFS, formatBlock, runSimulation } from './lfs';

function formatDiskLines(disk: any[], liveness: boolean[]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < disk.length; i++) {
    const block = disk[i];
    const liveStr = liveness[i] ? 'live' : '    ';
    lines.push(`[ ${String(i).padStart(3)} ] ${liveStr} ${formatBlock(block)}`);
  }
  return lines;
}

// Expected Python outputs captured from running:
// python3 lfs.py -s <seed> -c -o -e -L "<commands>"

describe('LFS simulator Python compatibility', () => {

  it('Test 1: create, write, create, link (seed=0)', () => {
    const result = runSimulation({
      seed: 0,
      numCommands: 0,
      percentages: 'c30,w30,d10,r20,l10,s0',
      inodePolicy: 'sequential',
      useDiskCr: false,
      noForceCheckpoints: false,
      commandList: 'c,/foo:w,/foo,0,2:c,/bar:l,/foo,/baz',
    });

    // Check return codes
    expect(result.commandResults.map(r => r.rc)).toEqual([0, 2, 0, 0]);

    // Check final disk size
    expect(result.finalDisk.length).toBe(20);

    // Check specific blocks from Python output
    // Block 0: checkpoint
    expect(result.finalDisk[0]).toEqual({
      block_type: 'type_cp',
      entries: [19, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    });

    // Block 8: data block v0...
    expect(result.finalDisk[8]).toEqual({
      block_type: 'type_data',
      contents: 'v0v0v0v0v0v0v0v0v0v0v0v0v0v0v0v0',
    });

    // Block 9: data block t1...
    expect(result.finalDisk[9]).toEqual({
      block_type: 'type_data',
      contents: 't1t1t1t1t1t1t1t1t1t1t1t1t1t1t1t1',
    });

    // Block 14: type:reg size:0 refs:1
    expect(result.finalDisk[14]).toEqual({
      block_type: 'type_inode',
      type: 'reg',
      size: 0,
      refs: 1,
      pointers: [-1, -1, -1, -1, -1, -1, -1, -1],
    });

    // Block 16: dir block with foo, bar, baz
    expect(result.finalDisk[16]).toEqual({
      block_type: 'type_data_dir',
      entries: [
        ['.', 0], ['..', 0], ['foo', 1], ['bar', 2], ['baz', 1],
        ['-', -1], ['-', -1], ['-', -1],
      ],
    });

    // Block 18: inode for foo/baz with refs:2
    expect(result.finalDisk[18]).toEqual({
      block_type: 'type_inode',
      type: 'reg',
      size: 2,
      refs: 2,
      pointers: [8, 9, -1, -1, -1, -1, -1, -1],
    });

    // Block 19: imap chunk
    expect(result.finalDisk[19]).toEqual({
      block_type: 'type_imap',
      entries: [17, 18, 14, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    });

    // Check liveness for key blocks
    expect(result.finalLiveness[0]).toBe(true);  // checkpoint
    expect(result.finalLiveness[1]).toBe(false); // old dir data
    expect(result.finalLiveness[8]).toBe(true);  // data block
    expect(result.finalLiveness[14]).toBe(true); // /bar inode
    expect(result.finalLiveness[16]).toBe(true); // final dir data
    expect(result.finalLiveness[17]).toBe(true); // final dir inode
    expect(result.finalLiveness[18]).toBe(true); // final /foo inode
    expect(result.finalLiveness[19]).toBe(true); // final imap
  });

  it('Test 2: create, create, write, write, delete (seed=1)', () => {
    const result = runSimulation({
      seed: 1,
      numCommands: 0,
      percentages: 'c30,w30,d10,r20,l10,s0',
      inodePolicy: 'sequential',
      useDiskCr: false,
      noForceCheckpoints: false,
      commandList: 'c,/a:c,/b:w,/a,0,3:w,/b,2,2:r,/a',
    });

    expect(result.commandResults.map(r => r.rc)).toEqual([0, 0, 3, 2, 0]);
    expect(result.finalDisk.length).toBe(24);

    // Check checkpoint
    expect(result.finalDisk[0]).toEqual({
      block_type: 'type_cp',
      entries: [23, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    });

    // Check data blocks for write to /a (seed=1)
    expect(result.finalDisk[12]).toEqual({
      block_type: 'type_data',
      contents: 'd0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0',
    });
    expect(result.finalDisk[13]).toEqual({
      block_type: 'type_data',
      contents: 'w1w1w1w1w1w1w1w1w1w1w1w1w1w1w1w1',
    });
    expect(result.finalDisk[14]).toEqual({
      block_type: 'type_data',
      contents: 't2t2t2t2t2t2t2t2t2t2t2t2t2t2t2t2',
    });

    // Check data blocks for write to /b
    expect(result.finalDisk[17]).toEqual({
      block_type: 'type_data',
      contents: 'g0g0g0g0g0g0g0g0g0g0g0g0g0g0g0g0',
    });
    expect(result.finalDisk[18]).toEqual({
      block_type: 'type_data',
      contents: 'm1m1m1m1m1m1m1m1m1m1m1m1m1m1m1m1',
    });

    // Check final dir block (after delete of /a)
    expect(result.finalDisk[21]).toEqual({
      block_type: 'type_data_dir',
      entries: [
        ['.', 0], ['..', 0], ['-', -1], ['b', 2],
        ['-', -1], ['-', -1], ['-', -1], ['-', -1],
      ],
    });

    // Final imap
    expect(result.finalDisk[23]).toEqual({
      block_type: 'type_imap',
      entries: [22, -1, 19, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    });
  });

  it('Test 3: mkdir, create in subdir, write, sync (seed=2)', () => {
    const result = runSimulation({
      seed: 2,
      numCommands: 0,
      percentages: 'c30,w30,d10,r20,l10,s0',
      inodePolicy: 'sequential',
      useDiskCr: false,
      noForceCheckpoints: false,
      commandList: 'd,/dir1:c,/dir1/file1:w,/dir1/file1,0,1:s',
    });

    expect(result.commandResults.map(r => r.rc)).toEqual([0, 0, 1, 0]);
    expect(result.finalDisk.length).toBe(16);

    // Check checkpoint
    expect(result.finalDisk[0]).toEqual({
      block_type: 'type_cp',
      entries: [15, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    });

    // Data block for write
    expect(result.finalDisk[13]).toEqual({
      block_type: 'type_data',
      contents: 'y0y0y0y0y0y0y0y0y0y0y0y0y0y0y0y0',
    });

    // Final inode for file1
    expect(result.finalDisk[14]).toEqual({
      block_type: 'type_inode',
      type: 'reg',
      size: 1,
      refs: 1,
      pointers: [13, -1, -1, -1, -1, -1, -1, -1],
    });

    // Final imap
    expect(result.finalDisk[15]).toEqual({
      block_type: 'type_imap',
      entries: [6, 10, 14, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    });
  });

  it('Test 4: random commands with seed=5', () => {
    const result = runSimulation({
      seed: 5,
      numCommands: 5,
      percentages: 'c30,w30,d10,r20,l10,s0',
      inodePolicy: 'sequential',
      useDiskCr: false,
      noForceCheckpoints: false,
      commandList: '',
    });

    // From Python output: 5 commands generated
    expect(result.commandResults.length).toBe(5);

    // Check the generated commands match Python's
    const cmds = result.commandResults.map(r => r.command);
    expect(cmds[0]).toEqual({ op: 'mkdir', path: '/uy7' });
    expect(cmds[1]).toEqual({ op: 'create', path: '/yq9' });
    expect(cmds[2]).toEqual({ op: 'create', path: '/go5' });
    expect(cmds[3]).toEqual({ op: 'create', path: '/hx7' });
    expect(cmds[4]).toEqual({ op: 'create', path: '/uy7/dq1' });

    // All should succeed
    expect(result.commandResults.map(r => r.rc)).toEqual([0, 0, 0, 0, 0]);

    // Check final disk size
    expect(result.finalDisk.length).toBe(25);

    // Check checkpoint
    expect(result.finalDisk[0]).toEqual({
      block_type: 'type_cp',
      entries: [24, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    });

    // Check final imap
    expect(result.finalDisk[24]).toEqual({
      block_type: 'type_imap',
      entries: [18, 22, 11, 15, 19, 23, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    });

    // Check dir1 block with dq1 entry
    expect(result.finalDisk[21]).toEqual({
      block_type: 'type_data_dir',
      entries: [
        ['.', 1], ['..', 0], ['dq1', 5],
        ['-', -1], ['-', -1], ['-', -1], ['-', -1], ['-', -1],
      ],
    });
  });

  it('Test 5: use_disk_cr mode (seed=3)', () => {
    const result = runSimulation({
      seed: 3,
      numCommands: 0,
      percentages: 'c30,w30,d10,r20,l10,s0',
      inodePolicy: 'sequential',
      useDiskCr: true,
      noForceCheckpoints: false,
      commandList: 'c,/x:w,/x,0,1:c,/y:w,/y,0,1',
    });

    expect(result.commandResults.map(r => r.rc)).toEqual([0, 1, 0, 1]);
    expect(result.finalDisk.length).toBe(18);

    // Check checkpoint
    expect(result.finalDisk[0]).toEqual({
      block_type: 'type_cp',
      entries: [17, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    });

    // Data blocks
    expect(result.finalDisk[8]).toEqual({
      block_type: 'type_data',
      contents: 'g0g0g0g0g0g0g0g0g0g0g0g0g0g0g0g0',
    });
    expect(result.finalDisk[15]).toEqual({
      block_type: 'type_data',
      contents: 'o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0o0',
    });

    // Final imap
    expect(result.finalDisk[17]).toEqual({
      block_type: 'type_imap',
      entries: [12, 9, 16, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    });
  });
});
