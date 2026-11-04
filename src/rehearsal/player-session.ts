import { io } from 'socket.io-client';
import { PlaybackClock } from './client-clock';
import { SocketPlaybackTransport } from './socket-transport';
import type { Command, RehearsalState } from './contract';
/** One account/ensemble lifetime. Solo never constructs this owner. */
export class PlayerSession {
  readonly transport: SocketPlaybackTransport;
  readonly clock: PlaybackClock;
  private socket = io('/rehearsal', {autoConnect:false,forceNew:true,withCredentials:true,transports:['websocket']});
  private closed = false;
  constructor(ensembleId:string, apply:(state:RehearsalState)=>Promise<void>, ready:(value:boolean)=>void, notice:(code:string)=>void, recalibrated:()=>void=()=>{}) {
    this.transport = new SocketPlaybackTransport(this.socket,ensembleId,()=>this.clock.serverNow(),value=>ready(value && this.clock.usable),notice,async()=>{await this.clock.reconnect();if(!this.clock.usable)throw Error('clock_unavailable');});
    this.clock = new PlaybackClock(async()=>{await new Promise(resolve=>setTimeout(resolve,5));return this.transport.ping();},()=>{ready(this.transport.ready && this.clock.usable);if(this.transport.ready && this.clock.usable)recalibrated();});
    this.transport.subscribe(async state=>{
      if(!this.clock.usable) await this.clock.reconnect();
      if(!this.clock.usable) await this.clock.refresh();
      if(!this.clock.usable) throw new Error('clock_unavailable');
      if(!this.closed) await apply(state);
    });
    this.socket.connect();
    this.socket.once('connect',()=>this.clock.start());
  }
  async send(command:Command) {
    if(!this.clock.usable) return Promise.reject(new Error('connecting'));
    return this.transport.send(command);
  }
  async resume() {await this.clock.reconnect();if(!this.closed && this.clock.usable) await this.transport.snapshot();}
  dispose() {this.closed=true;this.clock.dispose();this.transport.dispose();}
}
