import { Random } from "../random";

// Scheduling policies
export type DiskPolicy = "FIFO" | "SSTF" | "SATF" | "BSATF";

const MAXTRACKS = 1000;

// States a request goes through
const STATE_NULL = 0;
const STATE_SEEK = 1;
const STATE_ROTATE = 2;
const STATE_XFER = 3;
const STATE_DONE = 4;

export interface BlockInfo {
  track: number;
  angle: number;
  name: number;
}

export interface RequestResult {
  block: number;
  seekTime: number;
  rotateTime: number;
  transferTime: number;
  totalTime: number;
}

export interface DiskResult {
  requests: number[];
  results: RequestResult[];
  totalSeek: number;
  totalRotate: number;
  totalTransfer: number;
  totalTime: number;
  blockInfoList: BlockInfo[];
  blockToTrackMap: Map<number, number>;
  blockToAngleMap: Map<number, number>;
}

export interface DiskOptions {
  addr?: string;
  addrDesc?: string;
  seekSpeed?: number;
  rotateSpeed?: number;
  policy?: DiskPolicy;
  skew?: number;
  window?: number;
  seed?: number;
  zoning?: string;
}

export function simulateDisk(opts: DiskOptions = {}): DiskResult {
  const addr = opts.addr ?? "-1";
  const addrDesc = opts.addrDesc ?? "5,-1,0";
  const seekSpeed = opts.seekSpeed ?? 1;
  const rotateSpeed = opts.rotateSpeed ?? 1;
  const policy = opts.policy ?? "FIFO";
  const skew = opts.skew ?? 0;
  const window = opts.window ?? -1;
  const seed = opts.seed ?? 0;
  const zoning = opts.zoning ?? "30,30,30";

  // Build block layout
  const blockInfoList: BlockInfo[] = [];
  const blockToTrackMap = new Map<number, number>();
  const blockToAngleMap = new Map<number, number>();
  const tracksBeginEnd = new Map<number, [number, number]>();
  const blockAngleOffset: number[] = [];

  const zones = zoning.split(",");
  for (let i = 0; i < zones.length; i++) {
    blockAngleOffset.push(Math.floor(parseInt(zones[i]) / 2));
  }

  // Track width constant (matches Python)
  const trackWidth = 40;
  const armSpeedBase = seekSpeed;

  // Outer track (track 0)
  let track = 0;
  let angleOffset = 2 * blockAngleOffset[track];
  let block = 0;
  for (let angle = 0; angle < 360; angle += angleOffset) {
    block = Math.floor(angle / angleOffset);
    blockToTrackMap.set(block, track);
    blockToAngleMap.set(block, angle);
    blockInfoList.push({ track, angle, name: block });
  }
  tracksBeginEnd.set(track, [0, block]);
  let pblock = block + 1;

  // Middle track (track 1)
  track = 1;
  let trackSkew = skew;
  angleOffset = 2 * blockAngleOffset[track];
  for (let angle = 0; angle < 360; angle += angleOffset) {
    block = Math.floor(angle / angleOffset) + pblock;
    blockToTrackMap.set(block, track);
    blockToAngleMap.set(block, angle + angleOffset * trackSkew);
    blockInfoList.push({ track, angle: angle + angleOffset * trackSkew, name: block });
  }
  tracksBeginEnd.set(track, [pblock, block]);
  pblock = block + 1;

  // Inner track (track 2)
  track = 2;
  trackSkew = 2 * skew;
  angleOffset = 2 * blockAngleOffset[track];
  for (let angle = 0; angle < 360; angle += angleOffset) {
    block = Math.floor(angle / angleOffset) + pblock;
    blockToTrackMap.set(block, track);
    blockToAngleMap.set(block, angle + angleOffset * trackSkew);
    blockInfoList.push({ track, angle: angle + angleOffset * trackSkew, name: block });
  }
  tracksBeginEnd.set(track, [pblock, block]);
  const maxBlock = pblock;

  // Adjust angles to starting position (add 180, mod 360)
  for (const [k, v] of blockToAngleMap) {
    blockToAngleMap.set(k, (v + 180) % 360);
  }

  // Generate requests
  const rng = new Random(seed);
  const requests = makeRequests(addr, addrDesc, maxBlock, rng);

  // Validate seek speed
  if (seekSpeed > 1 && trackWidth % seekSpeed !== 0) {
    throw new Error(
      `Seek speed (${seekSpeed}) must divide evenly into track width (${trackWidth})`
    );
  }
  if (seekSpeed < 1) {
    const x = trackWidth / seekSpeed;
    const y = Math.floor(trackWidth / seekSpeed);
    if (x !== y) {
      throw new Error(
        `Seek speed (${seekSpeed}) must divide evenly into track width (${trackWidth})`
      );
    }
  }

  // Now simulate
  const requestQueue: Array<[number, number]> = requests.map((b, i) => [b, i]);
  const requestState: number[] = requests.map(() => STATE_NULL);

  let armTrack = 0;
  let angle = 0.0;
  let timer = 0;
  let requestCount = 0;

  let currentBlock = -1;
  let currentIndex = -1;
  let state = STATE_NULL;

  let seekBegin = 0;
  let rotBegin = 0;
  let xferBegin = 0;

  let seekTotal = 0;
  let rotTotal = 0;
  let xferTotal = 0;

  // Scheduling window state
  let currWindow = window;
  const fairWindow = policy === "BSATF" && window !== -1 ? window : -1;

  // Arm seek state
  let armTarget = 0;
  let armX1 = 0; // we track position for seek completion
  let armTargetX1 = 0;
  let armSpeed = 0;

  // tracks positions (matching Python logic)
  const tracks: Record<number, number> = {};
  tracks[0] = 140;
  tracks[1] = tracks[0] - trackWidth;
  tracks[2] = tracks[1] - trackWidth;
  const spindleX = 250; // width/2

  // Initialize arm position
  armX1 = spindleX - tracks[0] - trackWidth / 2.0;

  const results: RequestResult[] = [];

  function radiallyCloseTo(a1: number, a2: number): boolean {
    const v = Math.abs(a1 - a2);
    return v < rotateSpeed;
  }

  function getWindow(): number {
    if (currWindow <= -1) {
      return requestQueue.length;
    }
    if (fairWindow !== -1) {
      if (requestCount > 0 && requestCount % fairWindow === 0) {
        currWindow = currWindow + fairWindow;
      }
      return currWindow;
    }
    return currWindow;
  }

  function updateWindow(): void {
    if (fairWindow === -1 && currWindow > 0 && currWindow < requestQueue.length) {
      currWindow += 1;
    }
  }

  function doSATF(
    rList: Array<[number, number]>
  ): [number, number] {
    let minBlock = -1;
    let minIndex = -1;
    let minEst = -1;

    for (const [blk, idx] of rList) {
      if (requestState[idx] === STATE_DONE) continue;

      const trk = blockToTrackMap.get(blk)!;
      const blkAngle = blockToAngleMap.get(blk)!;

      // estimate seek time
      const dist = Math.abs(armTrack - trk);
      const seekEst = (trackWidth / armSpeedBase) * dist;

      // estimate rotate time
      const ao = blockAngleOffset[trk];
      let angleAtArrival = angle + seekEst * rotateSpeed;
      while (angleAtArrival > 360.0) angleAtArrival -= 360.0;

      let rotDist = (blkAngle - ao) - angleAtArrival;
      while (rotDist > 360.0) rotDist -= 360.0;
      while (rotDist < 0.0) rotDist += 360.0;
      const rotEst = rotDist / rotateSpeed;

      // transfer
      const xferEst = (ao * 2.0) / rotateSpeed;

      const totalEst = seekEst + rotEst + xferEst;

      if (minEst === -1 || totalEst < minEst) {
        minEst = totalEst;
        minBlock = blk;
        minIndex = idx;
      }
    }

    return [minBlock, minIndex];
  }

  function doSSTF(
    rList: Array<[number, number]>
  ): Array<[number, number]> {
    let minDist = MAXTRACKS;
    let trackList: Array<[number, number]> = [];

    for (const [blk, idx] of rList) {
      if (requestState[idx] === STATE_DONE) continue;
      const trk = blockToTrackMap.get(blk)!;
      const dist = Math.abs(armTrack - trk);
      if (dist < minDist) {
        trackList = [[blk, idx]];
        minDist = dist;
      } else if (dist === minDist) {
        trackList.push([blk, idx]);
      }
    }
    return trackList;
  }

  function planSeek(trk: number): void {
    seekBegin = timer;
    state = STATE_SEEK;
    requestState[currentIndex] = STATE_SEEK;

    if (trk === armTrack) {
      rotBegin = timer;
      state = STATE_ROTATE;
      requestState[currentIndex] = STATE_ROTATE;
      return;
    }

    armTarget = trk;
    armTargetX1 = spindleX - tracks[trk] - trackWidth / 2.0;
    if (trk >= armTrack) {
      armSpeed = armSpeedBase;
    } else {
      armSpeed = -armSpeedBase;
    }
  }

  function getNextIO(): boolean {
    if (requestCount === requestQueue.length) {
      return true; // done
    }

    if (policy === "FIFO") {
      [currentBlock, currentIndex] = requestQueue[requestCount];
      doSATF(requestQueue.slice(requestCount, requestCount + 1));
    } else if (policy === "SATF" || policy === "BSATF") {
      let endIndex = getWindow();
      if (endIndex > requestQueue.length) endIndex = requestQueue.length;
      [currentBlock, currentIndex] = doSATF(requestQueue.slice(0, endIndex));
    } else if (policy === "SSTF") {
      const trackList = doSSTF(requestQueue.slice(0, getWindow()));
      [currentBlock, currentIndex] = doSATF(trackList);
    }

    planSeek(blockToTrackMap.get(currentBlock)!);
    return false;
  }

  function doneWithSeek(): boolean {
    armX1 += armSpeed;
    if (
      (armSpeed > 0 && armX1 >= armTargetX1) ||
      (armSpeed < 0 && armX1 <= armTargetX1)
    ) {
      armTrack = armTarget;
      return true;
    }
    return false;
  }

  function doneWithRotation(): boolean {
    const ao = blockAngleOffset[armTrack];
    const target = (blockToAngleMap.get(currentBlock)! - ao + 360) % 360;
    return radiallyCloseTo(angle, target);
  }

  function doneWithTransfer(): boolean {
    const ao = blockAngleOffset[armTrack];
    const target = (blockToAngleMap.get(currentBlock)! + ao) % 360;
    return radiallyCloseTo(angle, target);
  }

  function doRequestStats(): void {
    const seekTime = rotBegin - seekBegin;
    const rotTime = xferBegin - rotBegin;
    const xferTime = timer - xferBegin;
    const totalTime = timer - seekBegin;

    results.push({
      block: currentBlock,
      seekTime,
      rotateTime: rotTime,
      transferTime: xferTime,
      totalTime,
    });

    seekTotal += seekTime;
    rotTotal += rotTime;
    xferTotal += xferTime;
  }

  // Main simulation loop
  let done = getNextIO();

  while (!done) {
    timer += 1;

    // Rotate the disk
    angle = angle + rotateSpeed;
    if (angle >= 360.0) {
      angle = 0.0;
    }

    // Seek
    if (state === STATE_SEEK) {
      if (doneWithSeek()) {
        rotBegin = timer;
        state = STATE_ROTATE;
        requestState[currentIndex] = STATE_ROTATE;
      }
    }

    // Rotate
    if (state === STATE_ROTATE) {
      if (doneWithRotation()) {
        xferBegin = timer;
        state = STATE_XFER;
        requestState[currentIndex] = STATE_XFER;
      }
    }

    // Transfer
    if (state === STATE_XFER) {
      if (doneWithTransfer()) {
        doRequestStats();
        state = STATE_DONE;
        requestState[currentIndex] = STATE_DONE;
        requestCount += 1;
        updateWindow();

        const prevBlock = currentBlock;
        done = getNextIO();
        if (!done) {
          const nextBlock = currentBlock;
          if (
            blockToTrackMap.get(prevBlock) === blockToTrackMap.get(nextBlock)
          ) {
            const [begin, end] = tracksBeginEnd.get(armTrack)!;
            if (
              (prevBlock === end && nextBlock === begin) ||
              prevBlock + 1 === nextBlock
            ) {
              // Stay in transfer mode for sequential access
              seekBegin = timer;
              rotBegin = timer;
              xferBegin = timer;
              state = STATE_XFER;
              requestState[currentIndex] = STATE_XFER;
            }
          }
        }
      }
    }
  }

  return {
    requests,
    results,
    totalSeek: seekTotal,
    totalRotate: rotTotal,
    totalTransfer: xferTotal,
    totalTime: timer,
    blockInfoList,
    blockToTrackMap,
    blockToAngleMap,
  };
}

function makeRequests(
  addr: string,
  addrDesc: string,
  maxBlock: number,
  rng: Random
): number[] {
  if (addr === "-1") {
    const desc = addrDesc.split(",");
    const numRequests = parseInt(desc[0]);
    let maxRequest = parseInt(desc[1]);
    const minRequest = parseInt(desc[2]);
    if (maxRequest === -1) maxRequest = maxBlock;

    const tmpList: number[] = [];
    for (let i = 0; i < numRequests; i++) {
      tmpList.push(Math.floor(rng.random() * maxRequest) + minRequest);
    }
    return tmpList;
  } else {
    return addr.split(",").map((x) => parseInt(x));
  }
}
