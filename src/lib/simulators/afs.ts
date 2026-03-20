import { Random } from '../random';

// ── Types ────────────────────────────────────────────────────────────

export interface AfsParams {
  seed: number;
  numClients: number;
  numSteps: number;
  numFiles: number;
  readRatio: number;
  schedule: string; // e.g. "0101" or "" for random
  actions: string;  // e.g. "oa1:r1:c1,oa1:w1:c1" or ""
}

export const defaultParams: AfsParams = {
  seed: 0,
  numClients: 2,
  numSteps: 2,
  numFiles: 1,
  readRatio: 0.5,
  schedule: '',
  actions: '',
};

export type MicroOp = 'open' | 'read' | 'write' | 'close';

export interface CacheEntry {
  data: number;
  dirty: boolean;
  refcnt: number;
  valid: boolean;
}

export interface LogEntry {
  clientId: number;         // which client performed the action (-1 for server-only)
  op: MicroOp | 'invalidate' | 'callback' | 'getfile' | 'putfile';
  fileName?: string;
  fd?: number;
  // For reads/writes: what value was read/written
  oldValue?: number;
  newValue?: number;
  // Snapshot of this client's cache after the action
  cacheSnapshot?: Record<string, CacheEntry>;
  // For server file events
  serverMessage?: string;
}

export interface ClientStats {
  name: string;
  reads: number;
  writes: number;
  cacheHits: number;
  cacheMisses: number;
  invalidations: number;
}

export interface AfsResult {
  params: AfsParams;
  fileNames: string[];
  initialFiles: Record<string, number>;  // file -> initial value
  finalFiles: Record<string, number>;    // file -> final value
  log: LogEntry[];
  clientStats: ClientStats[];
  serverStats: { gets: number; puts: number };
}

// ── Internal simulation classes ──────────────────────────────────────

class FileManager {
  private value = 0;
  readonly fileList: string[];

  constructor(numFiles: number) {
    this.fileList = [];
    for (let i = 0; i < numFiles; i++) {
      this.fileList.push(String.fromCharCode(97 + i)); // 'a', 'b', ...
    }
  }

  getFiles(): string[] {
    return this.fileList;
  }

  getValue(): number {
    return this.value++;
  }
}

class FileDescTable {
  private fd: Map<number, string> = new Map();

  alloc(fname: string, sfd = -1): number {
    if (sfd !== -1) {
      if (this.fd.has(sfd)) {
        throw new Error(`fd ${sfd} already in use`);
      }
      this.fd.set(sfd, fname);
      return sfd;
    }
    for (let i = 0; i < 1024; i++) {
      if (!this.fd.has(i)) {
        this.fd.set(i, fname);
        return i;
      }
    }
    return -1;
  }

  lookup(sfd: number): string {
    const f = this.fd.get(sfd);
    if (f === undefined) {
      throw new Error(`fd ${sfd} not in use`);
    }
    return f;
  }

  free(sfd: number): void {
    this.fd.delete(sfd);
  }
}

class ClientCache {
  entries: Record<string, CacheEntry> = {};
  hitcnt = 0;
  misscnt = 0;
  invalidcnt = 0;

  put(fname: string, data: number, dirty: boolean, refcnt: number): void {
    this.entries[fname] = { data, dirty, refcnt, valid: true };
  }

  update(fname: string, data: number): void {
    const e = this.entries[fname];
    this.entries[fname] = { data, dirty: true, refcnt: e.refcnt, valid: e.valid };
  }

  invalidate(fname: string): void {
    if (!(fname in this.entries)) return;
    this.invalidcnt++;
    const e = this.entries[fname];
    this.entries[fname] = { data: e.data, dirty: e.dirty, refcnt: e.refcnt, valid: false };
  }

  checkvalid(fname: string): void {
    const e = this.entries[fname];
    if (e && !e.valid && e.refcnt === 0) {
      delete this.entries[fname];
    }
  }

  checkget(fname: string): { hit: boolean; entry?: CacheEntry } {
    if (fname in this.entries) {
      this.hitcnt++;
      return { hit: true, entry: this.entries[fname] };
    }
    this.misscnt++;
    return { hit: false };
  }

  get(fname: string): CacheEntry {
    return this.entries[fname];
  }

  incref(fname: string): void {
    this.entries[fname].refcnt++;
  }

  decref(fname: string): void {
    this.entries[fname].refcnt--;
  }

  setdirty(fname: string, dirty: boolean): void {
    this.entries[fname].dirty = dirty;
  }

  setclean(fname: string): void {
    this.entries[fname].dirty = false;
  }

  setvalid(fname: string): void {
    this.entries[fname].valid = true;
  }

  isdirty(fname: string): boolean {
    return this.entries[fname].dirty;
  }

  snapshot(): Record<string, CacheEntry> {
    const snap: Record<string, CacheEntry> = {};
    for (const k of Object.keys(this.entries)) {
      const e = this.entries[k];
      snap[k] = { ...e };
    }
    return snap;
  }
}

type Action =
  | { op: 'open'; fname: string; fd: number }
  | { op: 'read'; fd: number }
  | { op: 'write'; fd: number }
  | { op: 'close'; fd: number };

interface ServerState {
  contents: Record<string, number>;
  callbackCache: Record<string, string[]>; // clientName -> list of filenames
  getcnt: number;
  putcnt: number;
}

/**
 * Run the AFS (Andrew File System) cache-consistency simulation.
 *
 * This models the whole-file caching with callbacks that AFS uses:
 * - On open(), the client fetches the file from the server if not cached (or invalid).
 * - On close(), if the file was written, the client flushes to the server.
 * - The server sends invalidation callbacks to other clients that have the file cached.
 */
export function simulate(params: AfsParams): AfsResult {
  const rng = new Random(params.seed);
  const fm = new FileManager(params.numFiles);
  const fileNames = fm.getFiles();

  // Server state
  const srv: ServerState = {
    contents: {},
    callbackCache: {},
    getcnt: 0,
    putcnt: 0,
  };

  // Initialize server files
  for (const f of fileNames) {
    srv.contents[f] = fm.getValue();
  }
  const initialFiles = { ...srv.contents };

  // Build clients
  const numClients = params.actions !== ''
    ? params.actions.split(',').length
    : params.numClients;

  interface ClientState {
    name: string;
    cid: number;
    cache: ClientCache;
    fdTable: FileDescTable;
    acts: Action[];
    acnt: number;
    done: boolean;
    readcnt: number;
    writecnt: number;
  }

  const clients: ClientState[] = [];

  if (params.actions !== '') {
    const cactions = params.actions.split(',');
    for (let i = 0; i < cactions.length; i++) {
      const cl = makeClient(i);
      parseActions(cl, cactions[i]);
      clients.push(cl);
    }
  } else {
    for (let i = 0; i < numClients; i++) {
      const cl = makeClient(i);
      generateRandomActions(cl, rng, fm, params);
      clients.push(cl);
    }
  }

  function makeClient(cid: number): ClientState {
    return {
      name: `c${cid}`,
      cid,
      cache: new ClientCache(),
      fdTable: new FileDescTable(),
      acts: [],
      acnt: 0,
      done: false,
      readcnt: 0,
      writecnt: 0,
    };
  }

  function parseActions(cl: ClientState, actionStr: string): void {
    for (const a of actionStr.split(':')) {
      const act = a[0];
      if (act === 'o') {
        const fname = a[1];
        const fd = parseInt(a[2]);
        cl.fdTable.alloc(fname, fd);
        cl.acts.push({ op: 'open', fname, fd });
      } else if (act === 'r') {
        cl.acts.push({ op: 'read', fd: parseInt(a[1]) });
      } else if (act === 'w') {
        cl.acts.push({ op: 'write', fd: parseInt(a[1]) });
      } else if (act === 'c') {
        cl.acts.push({ op: 'close', fd: parseInt(a[1]) });
      }
    }
  }

  function generateRandomActions(cl: ClientState, rng: Random, fm: FileManager, params: AfsParams): void {
    for (let i = 0; i < params.numSteps; i++) {
      const fname = fileNames[Math.floor(rng.random() * fileNames.length)];
      const r = rng.random();
      const fd = cl.fdTable.alloc(fname);
      if (fd < 0) throw new Error('Ran out of file descriptors');

      cl.acts.push({ op: 'open', fname, fd });
      if (r < params.readRatio) {
        cl.acts.push({ op: 'read', fd });
      } else {
        cl.acts.push({ op: 'write', fd });
      }
      cl.acts.push({ op: 'close', fd });
    }
  }

  // Initialize server callback tracking
  for (const cl of clients) {
    srv.callbackCache[cl.name] = [];
  }

  // ── Server helpers ──

  function serverGet(clientName: string, fname: string): number {
    srv.getcnt++;
    if (!srv.callbackCache[clientName].includes(fname)) {
      srv.callbackCache[clientName].push(fname);
    }
    return srv.contents[fname];
  }

  function serverPut(clientName: string, fname: string, value: number, log: LogEntry[]): void {
    srv.putcnt++;
    srv.contents[fname] = value;

    log.push({
      clientId: -1,
      op: 'putfile',
      fileName: fname,
      newValue: value,
      serverMessage: `putfile:${fname} c:${clientName} [${value}]`,
    });

    // Callbacks
    for (const cl of clients) {
      if (srv.callbackCache[cl.name].includes(fname) && cl.name !== clientName) {
        log.push({
          clientId: cl.cid,
          op: 'callback',
          fileName: fname,
          serverMessage: `callback: c:${cl.name} file:${fname}`,
        });
        cl.cache.invalidate(fname);
        log.push({
          clientId: cl.cid,
          op: 'invalidate',
          fileName: fname,
          cacheSnapshot: cl.cache.snapshot(),
        });
      }
    }
  }

  // ── Client step helper ──

  function clientGetFile(cl: ClientState, fname: string, log: LogEntry[]): void {
    const { hit, entry } = cl.cache.checkget(fname);
    if (hit && entry!.valid) {
      // Use cached copy
    } else {
      const data = serverGet(cl.name, fname);
      log.push({
        clientId: -1,
        op: 'getfile',
        fileName: fname,
        newValue: data,
        serverMessage: `getfile:${fname} c:${cl.name} [${data}]`,
      });
      cl.cache.put(fname, data, false, 0);
    }
    cl.cache.incref(fname);
  }

  function clientPutFile(cl: ClientState, fname: string, value: number, log: LogEntry[]): void {
    serverPut(cl.name, fname, value, log);
    cl.cache.setclean(fname);
    cl.cache.setvalid(fname);
  }

  function clientStep(cl: ClientState, log: LogEntry[]): number {
    if (cl.done) return -1;
    if (cl.acnt >= cl.acts.length) {
      cl.done = true;
      return 0;
    }

    const action = cl.acts[cl.acnt];

    if (action.op === 'open') {
      clientGetFile(cl, action.fname, log);
      log.push({
        clientId: cl.cid,
        op: 'open',
        fileName: action.fname,
        fd: action.fd,
        cacheSnapshot: cl.cache.snapshot(),
      });
    } else if (action.op === 'read') {
      const fname = cl.fdTable.lookup(action.fd);
      cl.readcnt++;
      const entry = cl.cache.get(fname);
      log.push({
        clientId: cl.cid,
        op: 'read',
        fd: action.fd,
        fileName: fname,
        newValue: entry.data,
        cacheSnapshot: cl.cache.snapshot(),
      });
    } else if (action.op === 'write') {
      const fname = cl.fdTable.lookup(action.fd);
      cl.writecnt++;
      const entry = cl.cache.get(fname);
      const oldVal = entry.data;
      const newVal = fm.getValue();
      cl.cache.update(fname, newVal);
      log.push({
        clientId: cl.cid,
        op: 'write',
        fd: action.fd,
        fileName: fname,
        oldValue: oldVal,
        newValue: newVal,
        cacheSnapshot: cl.cache.snapshot(),
      });
    } else if (action.op === 'close') {
      const fname = cl.fdTable.lookup(action.fd);
      const entry = cl.cache.get(fname);
      log.push({
        clientId: cl.cid,
        op: 'close',
        fd: action.fd,
        fileName: fname,
        cacheSnapshot: undefined, // will be set after flush
      });
      if (cl.cache.isdirty(fname)) {
        clientPutFile(cl, fname, entry.data, log);
      }
      cl.cache.decref(fname);
      cl.cache.checkvalid(fname);
      // Set the cache snapshot on the close entry (the last one with op='close' for this client)
      // Find the close entry we just pushed and update it
      for (let i = log.length - 1; i >= 0; i--) {
        if (log[i].clientId === cl.cid && log[i].op === 'close' && log[i].fd === action.fd && !log[i].cacheSnapshot) {
          log[i].cacheSnapshot = cl.cache.snapshot();
          break;
        }
      }
    }

    cl.acnt++;
    return 1;
  }

  // ── Main loop ──

  const log: LogEntry[] = [];

  // Validate schedule
  if (params.schedule !== '') {
    for (let i = 0; i < numClients; i++) {
      if (!params.schedule.includes(String(i))) {
        throw new Error(`Client ${i} not in schedule "${params.schedule}", which would never terminate`);
      }
    }
  }

  let schedCurr = 0;
  let numRunning = clients.length;

  while (numRunning > 0) {
    let c: ClientState;
    if (params.schedule === '') {
      c = clients[Math.floor(rng.random() * clients.length)];
    } else {
      const idx = parseInt(params.schedule[schedCurr]);
      c = clients[idx];
      schedCurr = (schedCurr + 1) % params.schedule.length;
    }
    const rc = clientStep(c, log);
    if (rc === 0) {
      numRunning--;
    }
  }

  const finalFiles = { ...srv.contents };

  const clientStats: ClientStats[] = clients.map(cl => ({
    name: cl.name,
    reads: cl.readcnt,
    writes: cl.writecnt,
    cacheHits: cl.cache.hitcnt,
    cacheMisses: cl.cache.misscnt,
    invalidations: cl.cache.invalidcnt,
  }));

  return {
    params: { ...params, numClients },
    fileNames,
    initialFiles,
    finalFiles,
    log,
    clientStats,
    serverStats: { gets: srv.getcnt, puts: srv.putcnt },
  };
}
