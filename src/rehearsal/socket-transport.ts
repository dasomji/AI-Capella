import { stateSchema, ackSchema, snapshotAckSchema, type Ack, type Command, type Envelope, type RehearsalState, type RehearsalTransport } from './contract';
/** A small socket boundary supports real Socket.IO and deterministic client tests. */
export interface PlaybackSocket {
  connected: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
  volatile: { emit(event: string, ...args: any[]): unknown };
  disconnect(): unknown;
}
/** Canonical transport only. A caller must finish applying snapshots before controls enable.
 * Each account owns its socket; dispose it on sign-out or ensemble change. */
export class SocketPlaybackTransport implements RehearsalTransport {
  private listeners = new Set<(state: RehearsalState) => void | Promise<void>>();
  private epoch = 0;
  private latest: RehearsalState | null = null;
  private applying: Promise<void> = Promise.resolve();
  private snapshotApplied = false;
  private closed = false;
  private pending = new Set<(error: Error) => void>();
  ready = false;
  constructor(private socket: PlaybackSocket, readonly ensembleId: string,
    private now: () => number,
    private onReady: (ready: boolean) => void = () => {},
    private notice: (code: string) => void = () => {}) {
    socket.on('connect', this.reconnect);
    socket.on('disconnect', this.disconnected);
    socket.on('playback:state', this.received);
  }
  private setReady(value: boolean) { this.ready = value; this.onReady(value); }
  private disconnected = () => {
    this.epoch++; this.snapshotApplied = false; this.latest = null; this.setReady(false);
    for (const reject of this.pending) reject(new Error('disconnected'));
    this.pending.clear();
  };
  private reconnect = () => {
    const epoch=this.epoch;
    void (async()=>{
      for(let attempt=0;attempt<4;attempt++){
        if(this.closed || epoch!==this.epoch || !this.socket.connected)return;
        try{await this.join();return;}catch(error){
          const code=error instanceof Error?error.message:'connecting';
          if(code!=='unavailable' || attempt===3){this.notice(code);return;}
          await new Promise(resolve=>setTimeout(resolve,100*2**attempt));
        }
      }
    })();
  };
  private received = (raw: unknown) => { void this.apply(raw).catch(() => {this.setReady(false);this.notice('invalid');}); };
  private request(event: string, input?: unknown): Promise<any> {
    if (!this.socket.connected || this.closed) return Promise.reject(new Error('disconnected'));
    const epoch = this.epoch;
    return new Promise((resolve, reject) => {
      const fail = (error: Error) => {clearTimeout(timer);this.pending.delete(fail);reject(error);};
      const timer = setTimeout(() => fail(new Error('timeout')), 5000);
      this.pending.add(fail);
      const ack = (value: unknown) => {
        clearTimeout(timer); this.pending.delete(fail);
        if (epoch !== this.epoch || this.closed) return reject(new Error('disconnected'));
        resolve(value);
      };
      // Volatile emissions are dropped by Socket.IO when unavailable, never buffered for replay.
      if (input === undefined) this.socket.volatile.emit(event, ack);
      else this.socket.volatile.emit(event, input, ack);
    });
  }
  private apply(raw: unknown): Promise<void> {
    const state = stateSchema.parse(raw), epoch = this.epoch;
    if (state.ensembleId !== this.ensembleId) return Promise.resolve();
    const result = this.applying.catch(() => {}).then(async () => {
      if (epoch !== this.epoch || this.closed || (this.latest && state.revision <= this.latest.revision)) return;
      for (const listener of this.listeners) await listener(state);
      if (epoch === this.epoch && !this.closed) this.latest = state;
    });
    this.applying = result;
    return result;
  }
  async join() {
    this.setReady(false); this.snapshotApplied = false;
    const epoch = this.epoch;
    const result = snapshotAckSchema.parse(await this.request('rehearsal:join', {ensembleId:this.ensembleId}));
    if (!('state' in result)) {this.notice(result.code);throw new Error(result.code);}
    await this.apply(result.state);
    if (epoch !== this.epoch || !this.socket.connected) throw new Error('disconnected');
    this.snapshotApplied = true; this.setReady(true);
    return this.latest!;
  }
  async snapshot(ensembleId = this.ensembleId) {
    if (ensembleId !== this.ensembleId) throw new Error('forbidden');
    this.setReady(false); this.snapshotApplied = false;
    const epoch = this.epoch;
    const result = snapshotAckSchema.parse(await this.request('rehearsal:snapshot',{ensembleId}));
    if (!('state' in result)) {this.notice(result.code);throw new Error(result.code);}
    await this.apply(result.state);
    if (epoch !== this.epoch || !this.socket.connected) throw new Error('disconnected');
    this.snapshotApplied = true; this.setReady(true);
    return this.latest!;
  }
  async command(envelope: Envelope): Promise<Ack> {
    if (!this.ready || !this.snapshotApplied || !this.socket.connected || envelope.ensembleId !== this.ensembleId) throw new Error('connecting');
    let ack: Ack | undefined;
    const epoch=this.epoch;
    for(let attempt=0;attempt<4;attempt++) {
      if(epoch!==this.epoch || !this.ready) throw new Error('disconnected');
      ack=ackSchema.parse(await this.request('rehearsal:command',envelope));
      if(ack.code!=='unavailable' || attempt===3) break;
      this.notice('unavailable');
      await new Promise(resolve=>setTimeout(resolve,100*2**attempt));
    }
    if(!ack) throw new Error('unavailable');
    if (ack.status === 'rejected') {
      this.notice(ack.code ?? 'invalid');
      if (ack.code === 'stale') { if(ack.state) await this.apply(ack.state); else await this.snapshot(); }
      if (ack.code === 'session_expired') { this.snapshotApplied=false; this.setReady(false); }
    }
    return ack;
  }
  send(command: Command) {
    if (!this.ready || !this.latest) return Promise.reject(new Error('connecting'));
    return this.command({ensembleId:this.ensembleId,commandId:crypto.randomUUID(),baseRevision:this.latest.revision,clientSentAt:this.now(),command});
  }
  subscribe(listener: (state: RehearsalState) => void | Promise<void>) {
    this.listeners.add(listener); return () => {this.listeners.delete(listener);};
  }
  async ping(): Promise<number> {
    const result = await this.request('clock:ping');
    if (!Number.isFinite(result.serverTime)) throw new Error('invalid');
    return result.serverTime;
  }
  dispose() {
    this.closed = true; this.disconnected(); this.listeners.clear();
    this.socket.off('connect',this.reconnect);this.socket.off('disconnect',this.disconnected);this.socket.off('playback:state',this.received);
    this.socket.disconnect();
  }
}
