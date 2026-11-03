import { estimateClock, type ClockSample } from './clock';
export const clientEpoch = () => performance.timeOrigin + performance.now();
/** Own with the account transport; unsuccessful calibration fails closed for shared controls. */
export class PlaybackClock {
  diagnostics: ReturnType<typeof estimateClock> = null;
  private refreshing: Promise<void> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  private previous = 0;
  private closed = false;
  constructor(private ping: () => Promise<number>, private changed: () => void = () => {}, private now = clientEpoch) {}
  get usable() {return this.diagnostics !== null && this.diagnostics.uncertaintyMs <= 100;}
  serverNow() {if (!this.usable) throw new Error('clock_unavailable'); return this.now() + this.diagnostics!.offsetMs;}
  refresh() {
    if(this.closed) return Promise.resolve();
    if(this.refreshing) return this.refreshing;
    this.refreshing = (async()=>{
      const samples: ClockSample[]=[];
      for(let i=0;i<8;i++) {
        if(this.closed)return;
        const t0=this.now();
        try{const tServer=await this.ping();samples.push({t0,tServer,t1:this.now()});}catch{}
      }
      if(this.closed)return;
      this.diagnostics=estimateClock(samples);this.changed();
    })().finally(()=>{this.refreshing=null;});
    return this.refreshing;
  }
  private wake=()=>{if(document.visibilityState==='visible')void this.refresh();};
  private online=()=>{void this.refresh();};
  start() {
    if(this.timer || this.closed)return;
    this.previous=this.now();let refreshAt=this.previous+30000;
    this.timer=setInterval(()=>{
      const now=this.now();
      if(now-this.previous>3000 || now>=refreshAt){refreshAt=now+30000;void this.refresh();}
      this.previous=now;
    },1000);
    document.addEventListener('visibilitychange',this.wake);window.addEventListener('online',this.online);
    void this.refresh();
  }
  /** Explicitly await after reconnect or AudioContext resume, before rejoining. */
  reconnect() {this.diagnostics=null;return this.refresh();}
  dispose() {this.closed=true;clearInterval(this.timer);document.removeEventListener('visibilitychange',this.wake);window.removeEventListener('online',this.online);}
}
export interface OutputClock {
  currentTime: number;
  outputLatency?: number;
  baseLatency?: number;
  getOutputTimestamp?: () => {contextTime: number;performanceTime: number};
}
/** Audible target time, including output latency. Timestamp performanceTime shares performance.now's origin. */
export function serverToAudioTime(serverTime: number, offsetMs: number, context: OutputClock,
  performanceTime = performance.now(), timeOrigin = performance.timeOrigin) {
  const target = serverTime-offsetMs-timeOrigin;
  const stamp=context.getOutputTimestamp?.();
  if(stamp && stamp.performanceTime>0 && Number.isFinite(stamp.contextTime))
    return stamp.contextTime+(target-stamp.performanceTime)/1000;
  return context.currentTime+(target-performanceTime)/1000-(context.outputLatency || context.baseLatency || 0);
}
