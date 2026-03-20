import { describe, it, expect } from "vitest";
import { simulateDisk } from "./disk";

describe("disk simulator", () => {
  // Tests use explicit addresses to avoid RNG mismatch between Python's
  // Mersenne Twister and our LCG-based Random class.

  it("FIFO with addresses [3,20,18,6,11] matches Python -s 1 output", () => {
    const r = simulateDisk({ addr: "3,20,18,6,11", policy: "FIFO" });
    expect(r.requests).toEqual([3, 20, 18, 6, 11]);

    expect(r.results[0]).toMatchObject({ block: 3, seekTime: 0, rotateTime: 255, transferTime: 30, totalTime: 285 });
    expect(r.results[1]).toMatchObject({ block: 20, seekTime: 40, rotateTime: 80, transferTime: 30, totalTime: 150 });
    expect(r.results[2]).toMatchObject({ block: 18, seekTime: 0, rotateTime: 270, transferTime: 30, totalTime: 300 });
    expect(r.results[3]).toMatchObject({ block: 6, seekTime: 40, rotateTime: 290, transferTime: 30, totalTime: 360 });
    expect(r.results[4]).toMatchObject({ block: 11, seekTime: 0, rotateTime: 120, transferTime: 30, totalTime: 150 });

    expect(r.totalSeek).toBe(80);
    expect(r.totalRotate).toBe(1015);
    expect(r.totalTransfer).toBe(150);
    expect(r.totalTime).toBe(1245);
  });

  it("SSTF with addresses [3,20,18,6,11] matches Python -s 1 -p SSTF output", () => {
    const r = simulateDisk({ addr: "3,20,18,6,11", policy: "SSTF" });
    expect(r.requests).toEqual([3, 20, 18, 6, 11]);

    expect(r.results[0]).toMatchObject({ block: 11, seekTime: 0, rotateTime: 135, transferTime: 30, totalTime: 165 });
    expect(r.results[1]).toMatchObject({ block: 3, seekTime: 0, rotateTime: 90, transferTime: 30, totalTime: 120 });
    expect(r.results[2]).toMatchObject({ block: 6, seekTime: 0, rotateTime: 60, transferTime: 30, totalTime: 90 });
    expect(r.results[3]).toMatchObject({ block: 18, seekTime: 40, rotateTime: 290, transferTime: 30, totalTime: 360 });
    expect(r.results[4]).toMatchObject({ block: 20, seekTime: 0, rotateTime: 30, transferTime: 30, totalTime: 60 });

    expect(r.totalSeek).toBe(40);
    expect(r.totalRotate).toBe(605);
    expect(r.totalTransfer).toBe(150);
    expect(r.totalTime).toBe(795);
  });

  it("FIFO with addresses [0,6,30] matches Python output", () => {
    const r = simulateDisk({ addr: "0,6,30", policy: "FIFO" });
    expect(r.requests).toEqual([0, 6, 30]);

    expect(r.results[0]).toMatchObject({ block: 0, seekTime: 0, rotateTime: 165, transferTime: 30, totalTime: 195 });
    expect(r.results[1]).toMatchObject({ block: 6, seekTime: 0, rotateTime: 150, transferTime: 30, totalTime: 180 });
    expect(r.results[2]).toMatchObject({ block: 30, seekTime: 80, rotateTime: 250, transferTime: 30, totalTime: 360 });

    expect(r.totalSeek).toBe(80);
    expect(r.totalRotate).toBe(565);
    expect(r.totalTransfer).toBe(90);
    expect(r.totalTime).toBe(735);
  });

  it("SATF with addresses [0,6,30] matches Python output", () => {
    const r = simulateDisk({ addr: "0,6,30", policy: "SATF" });
    expect(r.results[0]).toMatchObject({ block: 0, seekTime: 0, rotateTime: 165, transferTime: 30 });
    expect(r.results[1]).toMatchObject({ block: 6, seekTime: 0, rotateTime: 150, transferTime: 30 });
    expect(r.results[2]).toMatchObject({ block: 30, seekTime: 80, rotateTime: 250, transferTime: 30 });
    expect(r.totalTime).toBe(735);
  });

  it("skew=2 changes rotation times for inner tracks", () => {
    const r = simulateDisk({ addr: "0,6,30", skew: 2 });
    expect(r.results[0]).toMatchObject({ block: 0, seekTime: 0, rotateTime: 165, transferTime: 30 });
    expect(r.results[1]).toMatchObject({ block: 6, seekTime: 0, rotateTime: 150, transferTime: 30 });
    expect(r.results[2]).toMatchObject({ block: 30, seekTime: 80, rotateTime: 10, transferTime: 30, totalTime: 120 });
    expect(r.totalTime).toBe(495);
  });

  it("BSATF with window=3 matches Python output", () => {
    const r = simulateDisk({ addr: "3,20,18,6,11", policy: "BSATF", window: 3 });
    expect(r.requests).toEqual([3, 20, 18, 6, 11]);

    expect(r.results[0]).toMatchObject({ block: 20, seekTime: 40, rotateTime: 5, transferTime: 30, totalTime: 75 });
    expect(r.results[1]).toMatchObject({ block: 3, seekTime: 40, rotateTime: 140, transferTime: 30, totalTime: 210 });
    expect(r.results[2]).toMatchObject({ block: 18, seekTime: 40, rotateTime: 20, transferTime: 30, totalTime: 90 });
    expect(r.results[3]).toMatchObject({ block: 11, seekTime: 40, rotateTime: 80, transferTime: 30, totalTime: 150 });
    expect(r.results[4]).toMatchObject({ block: 6, seekTime: 0, rotateTime: 180, transferTime: 30, totalTime: 210 });

    expect(r.totalSeek).toBe(160);
    expect(r.totalRotate).toBe(425);
    expect(r.totalTransfer).toBe(150);
    expect(r.totalTime).toBe(735);
  });

  it("faster seek and rotation speeds", () => {
    const r = simulateDisk({ addr: "0,6,30", seekSpeed: 2, rotateSpeed: 2 });
    expect(r.results[0]).toMatchObject({ block: 0, seekTime: 0, rotateTime: 82, transferTime: 15, totalTime: 97 });
    expect(r.results[1]).toMatchObject({ block: 6, seekTime: 0, rotateTime: 75, transferTime: 15, totalTime: 90 });
    expect(r.results[2]).toMatchObject({ block: 30, seekTime: 40, rotateTime: 125, transferTime: 15, totalTime: 180 });
    expect(r.totalTime).toBe(367);
  });

  it("block layout has 36 blocks with default zoning", () => {
    const r = simulateDisk({ addr: "0" });
    expect(r.blockInfoList.length).toBe(36);
    const track0 = r.blockInfoList.filter(b => b.track === 0);
    const track1 = r.blockInfoList.filter(b => b.track === 1);
    const track2 = r.blockInfoList.filter(b => b.track === 2);
    expect(track0.length).toBe(12);
    expect(track1.length).toBe(12);
    expect(track2.length).toBe(12);
  });

  it("generates random requests when addr is -1", () => {
    const r = simulateDisk({ seed: 42, addrDesc: "3,-1,0" });
    expect(r.requests.length).toBe(3);
    // All requests should be valid block numbers
    for (const req of r.requests) {
      expect(req).toBeGreaterThanOrEqual(0);
      expect(req).toBeLessThan(36);
    }
  });
});
